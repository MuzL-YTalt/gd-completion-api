const GDBROWSER_BASE = "https://gdbrowser.com/api";
const GDHISTORY_BASE = "https://history.geometrydash.eu/api/v1";

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

function matchesUser(comment, user) {
  if (!user) return false;
  if (user.accountId != null && String(comment.accountID) === String(user.accountId)) return true;
  if (user.playerId != null && String(comment.playerID) === String(user.playerId)) return true;
  if (user.username) return String(comment.username).toLowerCase() === String(user.username).toLowerCase();
  return false;
}

async function getProfile(accountId) {
  return getJson(`${GDBROWSER_BASE}/profile/${encodeURIComponent(accountId)}`);
}

/** Search GDBrowser, restricted at the API level to Extreme Demons. */
async function searchLevels(levelName) {
  const query = String(levelName || "").trim();
  if (!query) throw new Error("Level name is required.");

  const all = [];
  for (let page = 1; ; page += 1) {
    const url = `${GDBROWSER_BASE}/search/${encodeURIComponent(query)}?diff=-2&demonFilter=5&count=500&page=${page}`;
    const data = await getJson(url);
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 500) break;
  }
  return all;
}

function normaliseLevel(level) {
  return {
    levelId: level.id != null ? String(level.id) : level.levelID != null ? String(level.levelID) : null,
    name: level.name || level.levelName || "",
    creator: level.author || level.creator || level.username || "",
    difficulty: level.difficulty || "",
    platformer: level.platformer === true
  };
}

/**
 * Resolve an exact-name match from CURRENT Extreme Demons only.
 * Classic and Platformer Extreme Demons are both retained.
 */
async function resolveLevel({ levelName, levelId = null, creator = null }) {
  const requestedName = String(levelName || "").trim();
  if (!requestedName) throw new Error("Level name is required.");

  const searched = (await searchLevels(requestedName))
    .map(normaliseLevel)
    .filter(level => level.levelId && level.name.toLowerCase() === requestedName.toLowerCase());

  if (levelId != null && String(levelId).trim() !== "") {
    const id = String(levelId).trim();
    const byId = searched.find(level => level.levelId === id);
    if (!byId) {
      throw new Error(`Level ID ${id} was not found among current Extreme Demons with level name "${requestedName}".`);
    }
    return { status: "resolved", level: byId, candidates: searched };
  }

  if (searched.length === 0) return { status: "not_found", level: null, candidates: [] };
  if (searched.length === 1) return { status: "resolved", level: searched[0], candidates: searched };

  if (creator != null && String(creator).trim() !== "") {
    const requestedCreator = String(creator).trim().toLowerCase();
    const byCreator = searched.filter(level => level.creator.toLowerCase() === requestedCreator);
    if (byCreator.length === 1) return { status: "resolved", level: byCreator[0], candidates: searched };
  }

  return {
    status: "needs_disambiguation",
    level: null,
    candidates: searched.map(level => ({
      levelId: level.levelId,
      name: level.name,
      creator: level.creator,
      difficulty: level.difficulty,
      platformer: level.platformer
    }))
  };
}

async function getProfileComments(accountId, page = 0, count = 100) {
  return getJson(`${GDBROWSER_BASE}/comments/${encodeURIComponent(accountId)}?type=profile&page=${page}&count=${count}`);
}

async function getUserCommentHistory(playerId, page = 0, count = 100) {
  return getJson(`${GDBROWSER_BASE}/comments/${encodeURIComponent(playerId)}?type=commentHistory&page=${page}&count=${count}`);
}

async function findUserCommentByLevelId(accountId, levelId) {
  const targetLevelId = String(levelId);
  const profile = await getProfile(accountId);
  if (!profile || profile.playerID == null) throw new Error(`Could not resolve Player ID for account ${accountId}.`);

  for (let page = 0; ; page += 1) {
    const comments = await getUserCommentHistory(profile.playerID, page, 100);
    if (!Array.isArray(comments) || comments.length === 0) return null;

    const match = comments.find(comment =>
      matchesUser(comment, {
        accountId: profile.accountID,
        playerId: profile.playerID,
        username: profile.username
      }) && comment.levelID != null && String(comment.levelID) === targetLevelId
    );

    if (match) return match;
    if (comments.length < 100) return null;
  }
}

async function getAllUserComments(accountId) {
  const profile = await getProfile(accountId);
  if (!profile || profile.playerID == null) throw new Error(`Could not resolve Player ID for account ${accountId}.`);

  const all = [];
  const user = { accountId: profile.accountID, playerId: profile.playerID, username: profile.username };

  for (let page = 0; ; page += 1) {
    const comments = await getUserCommentHistory(profile.playerID, page, 100);
    if (!Array.isArray(comments) || comments.length === 0) break;
    for (const comment of comments) if (matchesUser(comment, user) && comment.levelID != null) all.push(comment);
    if (comments.length < 100) break;
  }
  return all;
}

async function getHistoricalCommentDate(levelId, commentId) {
  const url = `${GDHISTORY_BASE}/date/comment/${encodeURIComponent(levelId)}/${encodeURIComponent(commentId)}/level/`;
  const data = await getJson(url);
  if (typeof data === "string") return data;
  if (data && typeof data === "object") return data.date || data.datetime || data.timestamp || data.closest || null;
  return null;
}

async function lookupCompletionDate({ accountId, levelId }) {
  const userComment = await findUserCommentByLevelId(accountId, levelId);
  if (!userComment) return { source: null, commentId: null, date: null, comment: null };

  let historicalDate = null;
  try {
    historicalDate = await getHistoricalCommentDate(levelId, userComment.ID);
  } catch (error) {}

  return {
    source: historicalDate ? "gdhistory" : "gdbrowser",
    commentId: userComment.ID,
    date: historicalDate || userComment.date || null,
    comment: userComment.content || ""
  };
}

async function lookupCompletion({ levelName, levelId = null, creator = null, accountId }) {
  const resolution = await resolveLevel({ levelName, levelId, creator });
  if (resolution.status !== "resolved") {
    return { status: resolution.status, level: null, candidates: resolution.candidates };
  }

  const level = resolution.level;
  const completion = await lookupCompletionDate({ accountId, levelId: level.levelId });
  return {
    status: completion.commentId ? "resolved" : "level_resolved_comment_not_found",
    level,
    candidates: resolution.candidates,
    completion
  };
}

module.exports = {
  getProfile,
  searchLevels,
  resolveLevel,
  getProfileComments,
  getUserCommentHistory,
  findUserCommentByLevelId,
  getAllUserComments,
  getHistoricalCommentDate,
  lookupCompletionDate,
  lookupCompletion
};
