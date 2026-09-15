# Geometry Dash Completion API

GitHub-only backend for the Geometry Dash completion spreadsheet.

## Current data sources

- **GDBrowser**: level metadata, level comments, and profile/account comments.
- **GDHistory**: historical comment-date lookup where its database contains an estimate.
- **Official Geometry Dash comment data**: the raw comment response contains a timestamp field used by BetterInfo, but GDBrowser currently exposes only a relative date. Exact timestamp extraction remains an open investigation.

## Completion-date strategy

For a completion row, the intended lookup order is:

1. Find the user's comment on the level through GDBrowser.
2. Pass the comment ID to GDHistory for a historical date when available.
3. If no historical date exists, use the GDBrowser relative date as a fallback.
4. Investigate a direct/raw Geometry Dash response path for exact timestamps.

Profile/account comments can be queried separately when a level comment is not available.

## Important architecture note

GitHub Pages is static, and GitHub Actions is not a permanent HTTP server. Therefore the repository is currently being used as the processing/test layer rather than pretending that a GitHub repository can expose a dynamic API endpoint by itself. A hosted runtime will only be introduced if the final spreadsheet integration genuinely requires one.
