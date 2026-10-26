# Cine Music Wave

A local-first personal cinema and music app, extracted from Study Library. Only Watch and Music are available. Git has deliberately not been initialized.

## Run locally

Requires Node.js 22.5+ and pnpm 11. Run `pnpm install`, then `pnpm dev:local`.

- Web: http://localhost:4040
- API: http://localhost:4041 (the browser uses same-origin /api)
- Original application: http://localhost:4444, unchanged

The local .env has already been configured. Never commit it. For a fresh checkout, copy .env.example to .env and supply a server-only session secret, media folder and database path.

Create your entertainment account with Create an account. Entertainment accounts are independent of Study accounts. The local setup uses the existing SQLite database file, with entertainment_ tables for accounts, sessions, preferences, Watch progress and Music collections. No original table is renamed or repurposed. Passwords use the copied scrypt hashing implementation; only hashes are stored.

Media stays in its existing location on G:. The new app has its own catalog and generated artwork under data/watch-catalog. The copied catalog preserves stable title/file IDs. Media files are not copied or altered.

## The whole design, from idea to a live website

[docs/DESIGN_TO_PRODUCTION.md](docs/DESIGN_TO_PRODUCTION.md) explains the architecture, the decisions behind it, how to deploy and run it for months, the portfolio plan, and the next steps.

## Put it online from this PC

Run `pnpm build`, then `powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1`. It starts a Cloudflare quick tunnel and the production server and prints a public address. Registration stays closed, so only existing accounts can sign in. See OPERATIONS.md for the limits.

## Validation

See VALIDATION.md. Commands: pnpm typecheck, pnpm lint, pnpm build, pnpm test:auth, pnpm test:watch, pnpm test:music, pnpm test:build, pnpm test:e2e.

The Playwright parity suite needs both apps running and authorized local video/audio fixtures. It creates temporary accounts, compares catalogs, exercises real playback, saves screenshots and deletes its temporary accounts. Its HTML report is under validation/playwright-report.

## Mobile wrapper readiness

Responsive layouts target narrow phones, tablets and desktop. Safe-area padding, native touch scrolling, reduced motion and existing touch player controls are retained. A future WebView wrapper should load the deployed HTTPS origin, preserve cookies and local storage, support media playback/fullscreen and permit only trusted navigation. No native wrapper is included or claimed tested here.

See OPERATIONS.md for configuration and THIRD_PARTY_NOTICES.txt for retained runtime dependency notices.

## Migration record and mobile roadmap

See [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) for the extraction record and [MOBILE_APP_PLAN.md](MOBILE_APP_PLAN.md) for the Android/iOS architecture comparison and phased plan. Mobile functionality remains proposed.

## Mobile implementation handoff

The mobile app now exists as the sibling project `mobile apps/Cine Music Wave Mobile`. Its hand-off is [MOBILE_REPLICATION_GUIDE.md](MOBILE_REPLICATION_GUIDE.md); the original agent prompts are kept for history in [docs/legacy/](docs/legacy/). Both projects follow their own [AGENTS.md](AGENTS.md), which share one universal standard.

## Current mobile scope and later online work

The current mobile handoff requires an offline-only Skip Login flow using local profile Chendu and permitted on-device media. See [MOBILE_REPLICATION_GUIDE.md](MOBILE_REPLICATION_GUIDE.md). Hosted backend, real native login and optional synchronization/remote playback are deferred to [FUTURE_ONLINE_BACKEND_PLAN.md](FUTURE_ONLINE_BACKEND_PLAN.md). These are documentation requirements, not implemented mobile features or changes to Web authentication.

## Security

The security policy is [`SECURITY.md`](SECURITY.md), the design record is the "Security model" in [`system_design.md`](system_design.md), and the evidence is [`SECURITY_VALIDATION.md`](SECURITY_VALIDATION.md). The rules every change must meet are in [`AGENTS.md`](AGENTS.md) (Section 3, SEC-01 to SEC-52; Section 13 for audits).

```powershell
pnpm check                      # typecheck, lint, format
pnpm test:security              # attack tests against the running app (also test:server, test:auth)
pnpm audit:standards            # secrets, unsafe APIs, missing timeouts, error echoes, docs, .gitignore
pnpm deps:audit                 # advisories for production dependencies
```

Before publishing from this PC, read the "Database file" note in `AGENTS.md` Part 2: this app currently shares the Study Library's SQLite file.

## Publication rules

Maintainer feature logs stay local and are excluded from source control. Do not
force-add or publish them. Enable the repository's push guard after cloning:

```sh
git config core.hooksPath .githooks
```

Run `node --test scripts/publish-guard.checks.mjs` to verify the guard. It checks
the complete history being pushed, including files deleted by later commits.
