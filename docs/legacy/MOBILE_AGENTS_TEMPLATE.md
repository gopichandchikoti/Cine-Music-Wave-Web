# Mobile AGENTS.md template

Documentation only. The implementing agent must copy/adapt the instructions below into an ACTUAL AGENTS.md in Cine Music Wave Mobile. A template stored in Web is not automatically loaded for a sibling repository.

---

# Cine Music Wave Mobile repository instructions

Standalone React Native Android/iOS product. Repository/folder includes Mobile; installed app name is Cine Music Wave. Sibling Cine Music Wave Web is the source/reference product. Preserve the separate Study-entertain-library project.

## Required context

Read supplied MOBILE_REPLICATION_GUIDE.md, SOURCE_REFERENCE.md, FEATURE_PARITY.md, system_design.md and FEATURE_LOG.md before substantial work. Copy the handoff into docs/ during setup. Inspect implementations/callers before editing. Current source and configured scripts take precedence over legacy Study bundles. No WebView wrapper or Study/Markdown/Learning routes.

## Current offline testing scope

Implement a bottom-of-login Skip Login button with Continue offline as Chendu. Select a stable device-local profile and navigate directly to Watch/Music Home without credentials, backend/API calls or server-side account creation. Restore profile/mode/state after relaunch; Return to login stops playback without deleting files or collections. Local-profile state is not server authentication; never forge authenticated=true or grant remote access. Chendu is only the explicit test profile name; branding stays Cine Music Wave. Enforce all OS permissions after skipping login. Use actual local device media with app-private metadata/state; no remote PC catalog, silent fetches, uploads or analytics. Remote auth/hosting/sync are deferred to FUTURE_ONLINE_BACKEND_PLAN.md. Preserve existing Web/server authorization unchanged.

## Implementation

- Use pnpm and strict TypeScript. Avoid any, unsafe casts, unhandled promises, debug logs, suppression-only fixes, dead/mock product controls and invented gates. Pin a supported Node/JDK/SDK/native dependency combination.
- Separate portable media rules, UI, native discovery/playback/storage, remote accounts and optional sync. Expose small typed native interfaces. Validate/bound metadata, picker/provider/bridge data, filenames, lyrics/subtitles and parsing. Use parameterized SQL.
- Android uses permitted MediaStore/content URIs and selected sources. iOS uses authorized pickers/libraries/security-scoped access. Never promise whole-iPhone/private-folder scanning or DRM bypass. Desktop G: rules do not apply to mobile discovery.
- Keep local playback usable offline in a bundled build without PC/Metro. Use app-private mobile SQLite; never copy PC identity databases/.env into apps. Keep secrets out of bundles/logs/URLs; preserve remote server authorization and account isolation. Do not invent implemented OAuth/email/sync/token contracts.
- Preserve Watch/Music features, established visual design, queue/progress/playlist semantics and account-state cleanup. Provide loading/empty/denied/limited/unavailable/error/success states, safe areas, touch accessibility, reduced motion and landscape/tablets.
- Add dependencies only when needed; check maintenance/native compatibility/licenses and preserve notices. No private media/artwork/signing keys in Git or remote builds. Explicitly document codec/library choices and limitations.
- Do not overwrite unrelated changes, reset/discard, wipe AVDs, initialize remotes or publish without authorization. Document native-generation workflows so prebuild cannot erase custom integrations.
- Do not install Android Studio. Reuse/install only required official CLI SDK/build components and one emulator/image through permissions. Do not pretend a generic AVD validates Samsung/Pixel-specific hardware behavior.

## Validation and documentation

Use real configured scripts. Run focused unit/type/lint/native checks and record commands/exit codes. Native permission/scanning/background/lifecycle behavior requires native emulator/device tests; historical web Playwright totals are not proof.

Before Android completion, cold-launch the bundled APK with backend/Metro stopped and network disabled, prove Skip Login enters Home as local Chendu without auth/API requests, then seed small authorized shared-media fixtures, prove actual OS discovery and advancing playback, exercise permission/persistence/unavailable states, and demonstrate offline playback with bundled JavaScript and Metro stopped. Save screenshots/reports/artifact paths and reproducible setup/fixture commands. Keep fixture provenance/private paths ignored.

Record iOS signing/Mac prerequisites and perform physical-iPhone checks when available. Never label unexecuted tests passed. Complete independent Android work when iOS access is blocked; distinguish platforms in status.

Update FEATURE_LOG.md for every feature/fix/refactor/configuration/documentation change. Decisions belong in system_design.md, operations in OPERATIONS.md and evidence/limits in VALIDATION.md. Keep FEATURE_PARITY.md current so no web capability silently disappears. Add the actual package/native commands to README.md after configuring them; no imaginary formatter/coverage/Sonar/CodeQL gates.
