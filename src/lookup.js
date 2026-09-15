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

module.exports = {
  getProfile,
  getLevelComments,
  getProfileComments,
  getUserCommentHistory,
  getAllUserComments,
  findLevelComment,
  findProfileComment,
  getHistoricalCommentDate,
  lookupCompletionDate
};
