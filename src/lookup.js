const GDBROWSER_BASE = "https://gdbrowser.com/api";

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

async function getProfile(accountId) {
  return getJson(
    `${GDBROWSER_BASE}/profile/${encodeURIComponent(accountId)}`
  );
}

async function searchLevels(levelName) {
  const query = String(levelName || "").trim();

  if (!query) {
    throw new Error("Level name is required.");
  }

  const all = [];

  for (let page = 0; ; page += 1) {
    const url =
      `${GDBROWSER_BASE}/search/${encodeURIComponent(query)}` +
      `?diff=-2&demonFilter=5&count=500&page=${page}`;

    const data = await getJson(url);

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    all.push(...data);

    if (data.length < 500) {
      break;
    }
  }

  return all;
}

function normaliseLevel(level) {
  return {
    levelId:
      level.id != null
        ? String(level.id)
        : level.levelID != null
          ? String(level.levelID)
          : null,
    name: level.name || level.levelName || "",
    creator: level.author || level.creator || level.username || "",
    difficulty: level.difficulty || "",
    platformer: level.platformer === true
  };
}

function isExtremeDemon(level) {
  const difficulty = String(level.difficulty || "")
    .trim()
    .toLowerCase();

  return (
    difficulty === "extreme" ||
    difficulty === "extreme demon" ||
    difficulty.indexOf("extreme demon") !== -1
  );
}

async function getLevelById(levelId) {
  const id = String(levelId || "").trim();

  if (!id) {
    return null;
  }

  const data = await getJson(
    `${GDBROWSER_BASE}/level/${encodeURIComponent(id)}`
  );

  if (!data || Array.isArray(data)) {
    return null;
  }

  return normaliseLevel(data);
}

/**
 * Resolve a level for the spreadsheet.
 *
 * - Explicit Level ID is treated as the stable identity.
 * - When an ID is supplied, the level does not need to be a
 *   current Extreme Demon.
 * - Name-only searches are restricted to current Extreme Demons.
 * - Exact duplicate names remain ambiguous unless Creator or
 *   Level ID disambiguates them.
 */
async function resolveLevel({ levelName, levelId = null, creator = null }) {
  const requestedName = String(levelName || "").trim();
  const requestedId = String(levelId || "").trim();
  const requestedCreator = String(creator || "").trim();

  if (!requestedName && !requestedId) {
    return {
      status: "empty",
      level: null,
      candidates: []
    };
  }

  if (requestedId) {
    const level = await getLevelById(requestedId);

    if (!level) {
      return {
        status: "invalid_id",
        level: null,
        candidates: []
      };
    }

    if (
      requestedName &&
      level.name.trim().toLowerCase() !== requestedName.toLowerCase()
    ) {
      return {
        status: "invalid_id",
        level: null,
        candidates: [level]
      };
    }

    return {
      status: "resolved",
      level,
      candidates: [level]
    };
  }

  const nameLower = requestedName.toLowerCase();

  const matches = (await searchLevels(requestedName))
    .map(normaliseLevel)
    .filter(level =>
      level.levelId &&
      level.name.trim().toLowerCase() === nameLower &&
      isExtremeDemon(level)
    );

  const unique = [];
  const seen = new Set();

  for (const level of matches) {
    if (seen.has(level.levelId)) {
      continue;
    }
    seen.add(level.levelId);
    unique.push(level);
  }

  if (unique.length === 0) {
    return {
      status: "not_found",
      level: null,
      candidates: []
    };
  }

  if (unique.length === 1) {
    return {
      status: "resolved",
      level: unique[0],
      candidates: unique
    };
  }

  if (requestedCreator) {
    const creatorLower = requestedCreator.toLowerCase();
    const creatorMatches = unique.filter(level =>
      level.creator.trim().toLowerCase() === creatorLower
    );

    if (creatorMatches.length === 1) {
      return {
        status: "resolved",
        level: creatorMatches[0],
        candidates: unique
      };
    }
  }

  return {
    status: "needs_disambiguation",
    level: null,
    candidates: unique
  };
}

module.exports = {
  getProfile,
  getLevelById,
  searchLevels,
  resolveLevel
};
