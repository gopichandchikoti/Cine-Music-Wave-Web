# Security validation - 2026-10-26

What was reviewed in Cine Music Wave Web, what was found, what was changed, how each change was proved, and what is still open. It
shares much of its server code with the Study Library; the detail of the shared fixes is in
`Study-entertain-library\SECURITY_VALIDATION.md` (S-numbers below). This is a list of what was checked and what happened, not a
promise that the app cannot be broken.

## Method

The server, configuration, scripts, database schema and hosting script were read first. The trust boundaries are: browser to
server, account to account, server to the media folder, and the public tunnel address to the server. Each confirmed weakness got
the smallest fix and a regression test that fails without it; each new control was removed once and its test failed (TEST-14),
then the code was restored. Secrets were searched by pattern in the working tree (this folder has no git history); values were
never printed. This is not an entropy scanner.

## Results at a glance

| Check | Result |
| --- | --- |
| Secrets in the working tree | Only the ignored `.env` matched; its `AUTH_SESSION_SECRET` is 66 bytes. `dev.log` and `dev.err.log` hold no cookies, tokens or passwords. |
| `pnpm audit --prod` | No known vulnerabilities |
| `pnpm typecheck`, `lint`, `format:check` | Pass, no warnings |
| Tests | 138 pass: auth 20, server 11, security 17 (6 new), watch 43, music 41, motion 6 |
| `pnpm build`, `pnpm test:build` | Pass; 6 build tests; initial scripts within the 250 KB budget |
| `pnpm audit:standards` | 0 errors; warnings are the missing documents this change then added |
| Strix | **Not run** |

## Findings and fixes

| ID | Severity | Finding and evidence | Fix | Proof |
| --- | --- | --- | --- | --- |
| W1 | Medium | Saving (progress, likes, playlists) and `POST /api/watch/rescan` (walks the whole media folder) had only the 2000-a-minute flood guard (S7). | 240 writes a minute per address on Watch and Music; 6 rescans a minute; reads and streams are not counted. | `tests/security/hardening.test.ts`: rescan budget, write budget and "reading is not throttled" |
| W2 | Low | An unreadable `catalog.json` was reported with the parser or file-system message, which names local paths (S8). | Generic reply with a request id; the reason is logged. | catalog test: no folder, file name or parser text in the body |
| W3 | Low | The password rule was length only (S12). | Refuses repeated characters, runs, well-known phrases and the person's own name or e-mail. | password test (also checks the username case) |
| W4 | Low | `WATCH_ENCODER` was read inside the stream code (ARCH-10). | Read once in `config/`. | config test |
| W5 | Info | The SQLite file had default permissions (S14). | Owner-only on POSIX; no effect on Windows. | by inspection |
| W6 | Info | `.gitignore` did not cover the tunnel logs and address in `validation/hosting/`, scratch files or `.mcp.json`. | Added, with `strix_runs/`. | audit check GIT-01 |
| W7 | Info (open) | `.env` points `PERSONAL_DB_PATH` at the Study Library's SQLite file: one file holds both apps' accounts. | Not changed (see below). | read from `.env` (name and path only) |

## Checked and found sound

Scrypt hashing, hashed server-side sessions, rotation on sign-in, CSRF token plus `Origin` on every account write, one closed CORS
policy, no account-existence leak at sign-in, a cross-account playlist attack test (IDOR; progress and likes isolation was checked in the earlier browser validation), ids from the URL looked up in the
catalog and never used as paths (traversal tests), media confined to one drive with real paths resolved, static serving that
never reaches dotfiles, source or source maps, an account export that already included every Watch and Music table, and the
public hosting script (loopback listener, registration closed, production settings passed as process variables, loopback proxy
trust). No advisory in production dependencies.

## Not fixed, and why

1. **Shared database file (SEC-45).** Giving this app its own file (remove `PERSONAL_DB_PATH`; the default is
   `data/cine-music-wave.sqlite`) limits what a flaw here could reach, but its accounts would have to be created again. Your decision.
2. **Diagnostics** (`/api/watch/diagnostics`: ffmpeg version, skipped folders, unreadable file names) are visible to every signed-in
   account. Acceptable for trusted accounts; restrict if sign-up is ever opened (SEC-52).
3. **`style-src 'unsafe-inline'`** stays in the CSP because the approved design uses inline styles.
4. **No breached-password lookup** (it needs an outside service).
5. **The tunnel serves your media to every signed-in account.** Serve only media you own or may share.

## Deployment actions

None are required: no new setting is mandatory. To apply this version to a running public host, rebuild (`pnpm build`) and restart
`scripts\host-public.ps1`.

## Not covered

Strix; the Playwright suite (`pnpm test:e2e`) after these changes; a browser pass over the changed routes; the live tunnel; a load
test; Safari and Firefox.

## How to re-run

```
pnpm check && pnpm test:security && pnpm test:server && pnpm test:auth && pnpm test:watch && pnpm test:music
pnpm build && pnpm test:build && pnpm audit:standards && pnpm deps:audit
```
