# Cine Music Wave validation

Completed October 23, 2026 (America/Chicago). New web app: http://localhost:4040; original comparison: http://localhost:4444. Both returned HTTP 200 from /api/health after completion.

## Final results

| Check | Result |
| --- | --- |
| pnpm typecheck | Passed; final pnpm build also runs client/server type checking |
| pnpm lint | Passed, no warnings; validation/lint.log |
| pnpm build | Passed; final output in validation/build.log |
| pnpm test:auth | 20 passed, 0 failed |
| pnpm test:watch | 43 passed, 0 failed |
| pnpm test:music | 37 passed, 0 failed |
| pnpm test:build | 3 passed, 0 failed |
| pnpm test:e2e | 2 passed, 0 failed, 0 skipped; Chrome headless |

The authentication/media logs are validation/test-auth.log, test-watch.log and test-music.log. The browser machine-readable report is validation/playwright-results.json; open validation/playwright-report/index.html for the HTML report. Reports/screenshots are local and ignored by Git because they can include private media. No test passwords are hard-coded.

## Live parity and behavior

- Compared the original and new app catalogs: identical IDs for 289 Watch catalog titles and 197 Music tracks. The Watch catalog contract includes album records; the Watch UI filters albums out as before.
- Verified only Watch and Music mode controls exist in the new app. Authenticated Study document, Markdown and Learning API requests return 404.
- Created real temporary accounts through the rendered signup form. Exercised login/logout, saved Watch list/progress, Music likes, playlist creation/rename and persistence after signing in again.
- Verified a second account cannot see another account's progress, likes or playlists, and cannot delete its playlist. The original application has an independent account/table namespace.
- Played an actual local video and observed advancing media time, then sought to 40 seconds. Played an actual local song through the Music UI and observed the existing audio engine advancing while unpaused.
- Verified the glass backdrop filter is applied to Watch mode controls.
- Checked desktop 1440x1000 and phone/tablet widths 320, 390 and 768, with no page horizontal overflow. Checked reduced-motion preference.
- Ran a touch-enabled mobile Chrome context at 390x844 and landscape 844x390. Tapped mode controls and opened/closed the account profile dialog. Inspected saved desktop, phone and landscape screenshots.
- Recorded zero browser page errors in the desktop/parity playback run.
- Migration-isolation coverage creates an existing identity schema and proves its table definitions and rows are unchanged after the entertainment migration.

## Screenshots

Baseline/current comparisons: baseline-watch-desktop.png vs watch-desktop.png; baseline-music-desktop.png vs music-desktop.png. Other captures: watch-player-desktop.png; music-320.png, music-390.png, music-768.png; watch-320.png, watch-390.png, watch-768.png; login-phone.png; music-touch-phone.png, music-touch-landscape.png and watch-touch-landscape.png. All are under validation/.

The intended differences are entertainment branding, two mode controls, Watch glass buttons and the account-menu stacking correction. Existing media colors, layouts and player implementations were retained.

## Issues found and resolved

- The initial extraction omitted system-folder scan exclusions and found Recycle Bin videos. Restored the original exclusions before the final identical-catalog check.
- Music's main panel intercepted clicks on its account menu. Raised the header stacking order and validated logout and touch profile controls.
- An inherited bundle test assumed quoted HTML attributes. Updated it to parse the generated HTML and verify the actual language attribute, retaining its metadata and bundle-budget assertions.
- Updated inherited cookie-name test expectations to the isolated app cookies. Playwright selectors observe accessible labels, including Close profile, and instrument the existing detached Audio objects only within the test context.

## Themes and the new Music screens, 2026-10-26

Run on the dev server (4040) in Edge through Playwright, with throw-away accounts that were deleted by the same scripts afterwards.

| Check | Result |
| --- | --- |
| `tsc -b`, `tsc -p tsconfig.server.json`, `oxlint .`, `biome format .` | all exit 0 |
| `pnpm test:music` | 41 pass (37 earlier, plus 4 in `tests/music/theme.test.ts`: dark values pinned, WCAG AA of light Music and light Watch, Watch pictures keep the dark palette) |
| `pnpm test:watch`, `test:auth`, `test:motion`, `test:server`, `test:security` | 43, 20, 6, 11 and 11 pass |
| Production bundle (webpack `--mode production`, built into a scratch folder so `dist/` was not touched) | initial scripts 223,157 bytes (budget 250,000); largest chunk 203,076 bytes (budget 250,000) |
| Theme switch | account menu "Light mode" sets `data-theme=light` and the stored value; Music then reads `--m-bg #f4f4f8`; a reload keeps light; the menu then offers "Dark mode" and switches back |
| Dock | the button announces a menu (`aria-haspopup`, `aria-expanded`); the menu opens with focus inside; Escape closes it and returns focus; a press outside closes it; controls are 56 px |
| Library | six section tabs with "All" selected and 44 px or larger; choosing "Albums & films" shows its grid |
| Sizes | 320, 390, 768, 1024 and 1440 px, dark and light: no horizontal overflow; singer pages use the hero layout up to 860 px and the earlier header above |
| Reduced motion | the dock menu's animation duration computes to about 0 |
| Playback | a real Watch video played in light and in dark (`currentTime` advancing, `readyState` 4, no page errors); a song started from Music showed in the dock pill |
| Page errors | none in any run |

Screenshots (git-ignored; they show the owner's media) are in the scratchpad of the session, not in this folder. Limits: Edge only (no Firefox, no Safari, no touch emulation for the new screens), the light theme was not run through the Playwright parity suite (`pnpm test:e2e` was not rerun), and the full-screen player was not opened in the light theme.

## Cleanup and limits

All temporary accounts from successful and interrupted runs were removed. validation/test-account-cleanup.json records zero remaining test accounts in both account namespaces. The original repository's source files were not changed. The shared SQLite file gained entertainment-prefixed tables as intended; baseline smoke tests temporarily exercised signup/deletion in the original app.

No Git initialization, commit, remote creation, domain registration or deployment was performed. Both development apps remain running locally. Restart the new app with pnpm dev:local from its folder if needed.

Live OAuth consent and email delivery require provider configuration and were not exercised. Firefox, Safari/iOS, physical mobile devices, native WebView wrappers, production HTTPS and every media file/codec combination were not tested. Real browser playback covered representative local video/audio; model/security tests provide additional behavior coverage. Screenshots were inspected visually, not subjected to an exact pixel-diff threshold because branding, mode controls and glass styling intentionally differ.

Runtime dependency metadata covers 74 packages with MIT, ISC or BSD-3-Clause declarations. Retained notices are in THIRD_PARTY_NOTICES.txt; see LICENSE_REVIEW.md for asset/tool limits. No media rights, domain availability or complete commercial legal clearance is claimed.

## Security hardening - 2026-10-26

Evidence for the security pass (details in `FEATURE_LOG.md` and, for the shared code, `Study-entertain-library\SECURITY_VALIDATION.md`).

| Check | Result |
| --- | --- |
| Secret search, working tree (no git here) | Only the ignored `.env` matched; its `AUTH_SESSION_SECRET` is 66 bytes. The `dev.log` and `dev.err.log` files in the root hold no cookies, tokens or passwords. |
| `pnpm audit --prod` | No known vulnerabilities |
| `pnpm typecheck`, `lint`, `format:check` | Passed, no warnings |
| `pnpm test:auth` / `server` / `security` | 20 / 11 / 17 passed (6 new attack tests: password rules, rescan budget, write budget, export isolation, catalog error masking, encoder setting) |
| `pnpm test:watch` / `music` / `motion` | 43 / 41 / 6 passed |
| `pnpm build`, `pnpm test:build` | Passed; 6 build tests; initial scripts within the 250 KB budget |
| `pnpm audit:standards` | 0 errors, 7 warnings that were already there |
| Mutation check | Removing the rescan budget, the write budget, the catalog message masking or the password rules each made its test fail |

Public hosting (`scripts\host-public.ps1`) was reviewed, not re-run: it binds `127.0.0.1`, keeps registration closed unless `-AllowSignup` is passed, passes production settings as process variables, and trusts only the loopback proxy, so the real client address reaches the rate limits. It still serves your media to every signed-in account; serve only media you own or are licensed to share.

Not verified: the Playwright suite (`pnpm test:e2e`), a real browser pass over the changed routes, the live tunnel, and Strix.
