const GDBROWSER_BASE = "https://gdbrowser.com/api";
const GDHISTORY_BASE = "https://history.geometrydash.eu/api/v1";

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

function matchesUser(comment, user) {
  if (!user) return false;

  if (user.accountId != null && String(comment.accountID) === String(user.accountId)) {
    return true;
  }

  if (user.playerId != null && String(comment.playerID) === String(user.playerId)) {
    return true;
  }

  if (user.username) {
    return String(comment.username).toLowerCase() === String(user.username).toLowerCase();
  }

  return false;
}

async function getProfile(accountId) {
  return getJson(`${GDBROWSER_BASE}/profile/${encodeURIComponent(accountId)}`);
}

async function searchLevels(levelName) {
  const query = String(levelName || "").trim();
  if (!query) throw new Error("Level name is required.");

  const data = await getJson(`${GDBROWSER_BASE}/search/${encodeURIComponent(query)}`);
  return Array.isArray(data) ? data : [];
}

function normaliseLevel(level) {
  return {
    levelId: level.id != null ? String(level.id) : level.levelID != null ? String(level.levelID) : null,
    name: level.name || level.levelName || "",
    creator: level.author || level.creator || level.username || "",
    difficulty: level.difficulty || ""
  };
}

function isExtremeDemon(level) {
  const difficulty = String(level.difficulty || "").toLowerCase();
  return difficulty.includes("extreme") || difficulty === "extreme demon";
}

/**
 * Resolves a level from the name entered in the spreadsheet.
 *
 * Rules:
 * - Search by exact level name first.
 * - If exactly one Extreme Demon matches, select it automatically.
 * - If multiple Extreme Demons share the name, require either levelId or creator.
 * - A supplied levelId always takes priority because it uniquely identifies a level.
 * - A supplied creator may disambiguate the name; if it still matches multiple levels,
 *   the caller must provide the level ID instead of guessing.
 */
async function resolveLevel({ levelName, levelId = null, creator = null }) {
  const requestedName = String(levelName || "").trim();
  if (!requestedName) throw new Error("Level name is required.");

  const searched = (await searchLevels(requestedName)).map(normaliseLevel).filter(level =>
    level.levelId && level.name.toLowerCase() === requestedName.toLowerCase()
  );

  const extremeLevels = searched.filter(isExtremeDemon);
  const candidates = extremeLevels.length > 0 ? extremeLevels : searched;

  if (levelId != null && String(levelId).trim() !== "") {
    const id = String(levelId).trim();
    const byId = candidates.find(level => level.levelId === id) || searched.find(level => level.levelId === id);
    if (!byId) {
      throw new Error(`Level ID ${id} was not found for level name "${requestedName}".`);
    }
    return { status: "resolved", level: byId, candidates };
  }

  if (candidates.length === 0) {
    return { status: "not_found", level: null, candidates: [] };
  }

  if (candidates.length === 1) {
    return { status: "resolved", level: candidates[0], candidates };
  }

  if (creator != null && String(creator).trim() !== "") {
    const requestedCreator = String(creator).trim().toLowerCase();
    const byCreator = candidates.filter(level => level.creator.toLowerCase() === requestedCreator);

    if (byCreator.length === 1) {
      return { status: "resolved", level: byCreator[0], candidates };
    }
  }

  return {
    status: "needs_disambiguation",
    level: null,
    candidates: candidates.map(level => ({
      levelId: level.levelId,
      name: level.name,
      creator: level.creator,
      difficulty: level.difficulty
    }))
  };
}

async function getLevelComments(levelId, page = 0, count = 100) {
  const url = `${GDBROWSER_BASE}/comments/${encodeURIComponent(levelId)}?page=${page}&count=${count}`;
  return getJson(url);
}

async function getProfileComments(accountId, page = 0, count = 100) {
  const url = `${GDBROWSER_BASE}/comments/${encodeURIComponent(accountId)}?type=profile&page=${page}&count=${count}`;
  return getJson(url);
}

async function getUserCommentHistory(playerId, page = 0, count = 100) {
  const url = `${GDBROWSER_BASE}/comments/${encodeURIComponent(playerId)}?type=commentHistory&page=${page}&count=${count}`;
  return getJson(url);
}

async function findLevelComment(levelId, user, maxPages = 100) {
  for (let page = 0; page < maxPages; page += 1) {
    const comments = await getLevelComments(levelId, page, 100);

    if (!Array.isArray(comments) || comments.length === 0) return null;

    const match = comments.find(comment => matchesUser(comment, user));
    if (match) return match;

    if (comments.length < 100) return null;
  }

  return null;
}

async function findProfileComment(accountId, user, maxPages = 100) {
  for (let page = 0; page < maxPages; page += 1) {
    const comments = await getProfileComments(accountId, page, 100);

    if (!Array.isArray(comments) || comments.length === 0) return null;

    const match = comments.find(comment => matchesUser(comment, user));
    if (match) return match;

    if (comments.length < 100) return null;
  }

  return null;
}

// GDBrowser's commentHistory endpoint expects the player's Player ID,
// while the public profile can be found using the registered Account ID.
// This helper accepts the Account ID and resolves the Player ID first.
async function getAllUserComments(accountId, maxPages = 100) {
  const profile = await getProfile(accountId);

  if (!profile || profile.playerID == null) {
    throw new Error(`Could not resolve Player ID for account ${accountId}.`);
  }

  const all = [];
  const user = {
    accountId: profile.accountID,
    playerId: profile.playerID,
    username: profile.username
  };

  for (let page = 0; page < maxPages; page += 1) {
    const comments = await getUserCommentHistory(profile.playerID, page, 100);

    if (!Array.isArray(comments) || comments.length === 0) break;

    for (const comment of comments) {
      if (matchesUser(comment, user) && comment.levelID != null) {
        all.push(comment);
      }
    }

    if (comments.length < 100) break;
  }

  return all;
}

async function getHistoricalCommentDate(levelId, commentId) {
  const url = `${GDHISTORY_BASE}/date/comment/${encodeURIComponent(levelId)}/${encodeURIComponent(commentId)}/level/`;
  const data = await getJson(url);

  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    return data.date || data.datetime || data.timestamp || data.closest || null;
  }

  return null;
}

async function lookupCompletionDate({ levelId, user }) {
  const levelComment = await findLevelComment(levelId, user);

  if (levelComment) {
    let historicalDate = null;

    try {
      historicalDate = await getHistoricalCommentDate(levelId, levelComment.ID);
    } catch (error) {
      // Keep GDBrowser's relative date as a fallback if GDHistory has no entry.
    }

    return {
      source: historicalDate ? "gdhistory" : "gdbrowser",
      commentId: levelComment.ID,
      date: historicalDate || levelComment.date || null,
      comment: levelComment.content || ""
    };
  }

  return {
    source: null,
    commentId: null,
    date: null,
    comment: null
  };
}

/**
 * Complete the level-identification part of a spreadsheet lookup.
 * This deliberately resolves the level BEFORE searching for the user's comment.
 */
async function lookupCompletion({ levelName, levelId = null, creator = null, user }) {
  const resolution = await resolveLevel({ levelName, levelId, creator });

  if (resolution.status !== "resolved") {
    return {
      status: resolution.status,
      level: null,
      candidates: resolution.candidates
    };
  }

  const level = resolution.level;
  const completion = await lookupCompletionDate({ levelId: level.levelId, user });

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
  getLevelComments,
  getProfileComments,
  getUserCommentHistory,
  getAllUserComments,
  findLevelComment,
  findProfileComment,
  getHistoricalCommentDate,
  lookupCompletionDate,
  lookupCompletion
};
