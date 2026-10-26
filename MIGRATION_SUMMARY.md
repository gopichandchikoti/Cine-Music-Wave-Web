# Cine Music Wave migration record

Documented October 24, 2026. Implementation and automated evidence were recorded October 23, 2026, America/Chicago. The owner subsequently reported that the migrated app works as expected.

## Result and boundaries

Created the sibling project cine-music-wave beside Study-entertain-library. The app name is Cine Music Wave. Git initialization and remote creation were intentionally left to the owner; creating the project folder did not initialize a Git repository. No personal name was added to the product branding.

The original repository's source files were not edited or removed. The new app contains Watch and Music, without Study, Markdown, Learning, course generation, document uploads or their endpoints. Existing working-tree feature code, including relevant untracked files, was copied rather than extracting only committed code.

## What was retained

- Watch catalog, search, browsing, title details, lists, playback planning, streaming/ranges, progress, media artwork and subtitle support implementations.
- Music library, search/filtering, albums/artists, queue, likes, playlists, listening state, radio/mix logic and playback engine implementations.
- Account registration, sign-in/out, profile/settings, password hashing, sessions, CSRF protections, account export/deletion and optional provider/email adapters.
- Existing colors, visual language, responsive screen implementations, reduced-motion support and smooth scrolling.

These are retained implementations, not a claim that every codec, provider or device has been live-tested.

## What changed

| Area | New app behavior |
| --- | --- |
| Shell | Only Watch and Music mode controls; entertainment branding |
| Development | Web 4040, API 4041, same-origin /api proxy |
| Accounts | Independent entertainment accounts in the existing local SQLite file |
| Database | entertainment_ tables and indexes; existing tables are not renamed or reused |
| Browser state | Distinct session/CSRF/OAuth cookie names and local-storage namespace |
| Media | Existing authorized media location; separate generated catalog/cache |
| Watch controls | Original CSS glass treatment, keyboard focus and fallback styling |
| Mobile | Safe-area adjustments and responsive/touch validation |
| Music account menu | Header stacking corrected so content cannot block menu actions |
| Dependencies | Removed document-specific packages; added Playwright as a development dependency |

Media binaries and original database files were not copied into the project. A catalog snapshot preserved stable media IDs; subsequent generated artifacts belong to the new project. Local secrets/configuration are ignored by Git.

## Database clarification

The shared database file was intentionally changed by adding entertainment-prefixed tables. Source-code preservation does not mean the database stayed byte-for-byte unchanged. New accounts do not automatically inherit Study credentials, playlists or progress. The namespaces share a file, not an identity realm. Passwords are stored as hashes, not plaintext.

Temporary accounts exercised both apps during comparison. Successful-run accounts and three accounts left by a timed-out run were removed; validation/test-account-cleanup.json records zero remaining test accounts in both namespaces.

## Evidence

The final recorded checks passed: client/server type checking, lint without warnings, production build, 20 authentication tests, 43 Watch tests, 37 Music tests, three build checks and two Playwright scenarios. The browser comparison matched 289 catalog title IDs and 197 track IDs. Watch filters album records out of its visible movie/series catalog as before.

Playwright exercised representative real video/audio playback, video seeking, signup/login/logout, playlist and like persistence, progress/list saving, account isolation, desktop/phone widths, touch profile controls and landscape layouts. Screenshots were inspected. See [VALIDATION.md](VALIDATION.md) for logs, exact coverage and limitations.

Issues resolved during verification included omitted Recycle Bin exclusions, an overlapping Music account menu, remaining Study-oriented login copy and brittle inherited HTML test assumptions.

## Current setup and remaining scope

Use pnpm dev:local from this project to start web 4040/API 4041. See [README.md](README.md), [AUTH_SETUP.md](AUTH_SETUP.md), [OPERATIONS.md](OPERATIONS.md) and [system_design.md](system_design.md).

The previous completion check found both apps running; that is historical evidence, not a guarantee that a process remains running after a restart. OAuth/email live providers, native mobile apps, public hosting, cross-device progress and every media format remain outside the completed migration. Runtime notices and asset/tool limits are recorded in [LICENSE_REVIEW.md](LICENSE_REVIEW.md).

The proposed mobile work is described separately in [MOBILE_APP_PLAN.md](MOBILE_APP_PLAN.md). No Android/iOS project or mobile dependency is created by this documentation update.
