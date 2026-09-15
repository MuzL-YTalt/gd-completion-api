# Geometry Dash Level Lookup API

GitHub repository for the Geometry Dash completion spreadsheet's level-lookup tooling.

## Current purpose

The project provides a small Node.js lookup layer around GDBrowser for:

- level metadata
- exact level-name searches
- current Extreme Demon filtering
- Level ID lookups
- creator-based disambiguation

## Level resolution rules

1. An explicit Level ID is treated as the stable level identity.
2. If a Level ID is supplied, the level does not need to be a current Extreme Demon.
3. Name-only searches are restricted to current Extreme Demons.
4. Exact duplicate names remain ambiguous unless the creator uniquely identifies one.
5. Level ID takes priority over name-based matching.

## Completion dates

Completion dates are intentionally **not handled by this repository**.

The spreadsheet stores the completion date as a manual field. This avoids confusing a level's historical upload date, a comment date, or a locally recorded completion date with the player's actual completion date.

## GitHub Actions

The remaining workflow is a manual level-lookup test. GitHub Actions is used for testing the lookup code, not as a permanent API server.

The spreadsheet itself can call public services directly with Google Apps Script's `UrlFetchApp` service.
