# Local operations

Run pnpm dev:local for web 4040/API 4041. Listeners default to loopback. Stop the terminal process to stop both children; this session also starts a hidden development process with output in dev.log/dev.err.log.

Configuration is server-only in .env: PERSONAL_DB_PATH points to the existing SQLite file, WATCH_MEDIA_DIR to authorized media, WATCH_ALLOWED_DRIVE defaults to G, and WATCH_CATALOG_DIR optionally selects a separate cache. Do not point the new catalog at the original app's live cache. FFMPEG_PATH can reference the existing local FFmpeg installation; binaries are not bundled.

Back up the shared database using SQLite's online backup API, including all entertainment tables. Do not copy a live main database file alone while WAL writes are active. Restore-test backups before relying on them. Keep media backups independent of generated caches.

For production, run pnpm build, configure a durable single-instance SQLite deployment, AUTH_ALLOW_PERSISTENT_SQLITE=true, AUTH_PUBLIC_ORIGIN with HTTPS, and a stable server-only AUTH_SESSION_SECRET. Configure trusted proxy IPs explicitly when using a reverse proxy. pnpm serve uses port 4040 by default. Development listeners are not public hosting.

Email and OAuth require their own provider setup and exact callbacks for this app's origin. They have not been validated against live providers in this extraction. The copied AUTH_SETUP.md and AUTH_VALIDATION.md describe upstream behavior; see VALIDATION.md for this app's evidence.

The app adds only entertainment-prefixed tables to the shared database. Uninstalling the new app does not require changing Study source or its tables. Before removing entertainment tables, take a backup and explicitly confirm that entertainment account data is no longer wanted.

## Putting Cine Music Wave Web on the internet from this PC (2026-10-26)

This uses a Cloudflare quick tunnel: the PC makes an outbound connection to Cloudflare, so no router change, certificate or account is needed. It is the "own PC plus Cloudflare Tunnel" option in Study Library's `DEPLOYMENT_GUIDE.md`.

1. `pnpm build` (the launcher serves the `dist` folder).
2. `powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1`. It starts `cloudflared`, learns the address, starts the production server on `127.0.0.1:4046` with that address as `AUTH_PUBLIC_ORIGIN`, waits until both answer, and prints the address. Closing the window or pressing Ctrl+C takes it offline.
3. `cloudflared.exe` is kept at `E:\New repos for portfolio\Study-entertain-library\.tools\cloudflared\` (version 2026.10.4, SHA-256 checked against the value GitHub publishes for that release). Pass `-Cloudflared <path>` to use another copy.

What the launcher sets for that run only (it never edits `.env`): `ENTERTAINMENT_SERVER_HOST=127.0.0.1` (nothing else on your network can reach the server), `AUTH_PUBLIC_ORIGIN=<tunnel address>`, `AUTH_ALLOW_PERSISTENT_SQLITE=true` (the only identity store installed is one SQLite file on this PC), `AUTH_TRUST_PROXY=loopback` (the tunnel connects from this PC), and `AUTH_SIGNUP_ENABLED=false`. With sign-up closed, only accounts that already exist can sign in, and the media on `WATCH_MEDIA_DIR` is served only to them. Pass `-AllowSignup` only if you want strangers to create accounts and play your media.

Limits to know before sharing the address:

- A quick tunnel gets a new random address every time and has no uptime guarantee. The first minutes after it starts, the name may not resolve yet (DNS can take a few minutes, and this PC may cache the failure for longer). For a fixed address create a named tunnel on your own domain (`DEPLOYMENT_GUIDE.md` steps 6 and 7). That needs your Cloudflare login and a domain.
- The site is up only while this PC is on, awake and online.
- Cloudflare's published terms limit serving video through its network on non-video plans, and it is unclear whether that covers tunnel traffic. A heavy video stream could be throttled or blocked. Tailscale Funnel or a small VPS are the alternatives.
- Serve only media you own or are licensed to share.
- Sign-in emails (verification, password reset) are not configured: set `RESEND_API_KEY` and `AUTH_EMAIL_FROM` (see `AUTH_SETUP.md`) in the launcher's environment or `.env` to enable them.
- The sign-in screen still shows "Create an account" while registration is closed; the server refuses a sign-up with "New account registration is closed."
- Logs of the last run are in `validation\hosting\`; the tunnel log contains the public address.

## Security hardening update (2026-10-26)

- **Limits an operator may notice.** Saving (playback positions, likes, playlists) is limited to 240 writes a minute per address and `POST /api/watch/rescan` to 6 a minute. Reading and streaming are not counted. A script that goes over gets `429` with `Retry-After`. Behind the Cloudflare tunnel `AUTH_TRUST_PROXY=loopback` (set by `host-public.ps1`) makes these limits count the real visitor and not the tunnel.
- **Catalog problems are in the log.** If `catalog.json` cannot be read, the browser is told only that the catalog could not be read. The reason is on the server's error output as `Watch catalog problem: ...` (or `Music catalog problem: ...`).
- **Passwords.** New passwords are refused when they are repeated characters, counting or keyboard runs, a well-known phrase, or contain the person's own username or email name. There is no breached-password lookup.
- **Tunnel logs** in `validation\hosting\` are ignored by git; they hold the temporary public address.
- `WATCH_ENCODER` (`x264` default, `amf` for AMD hardware) is listed in `.env.example`.
- Evidence and what was not verified: `VALIDATION.md`, "Security hardening - 2026-10-26".

## Deployment actions: Vercel web client (2026-10-28)

The repository-root vercel.json explicitly runs pnpm build and publishes dist,
where Webpack creates index.html. Use the Other framework preset, the repository
root as Root Directory, and Node.js 24.x (22.5 or newer is required). The checked-in
configuration overrides the build/output settings; public contains only source
assets and is not the application output. Do not select Next.js or publish the
repository root. No new secret or database setting is required for this static build.

The ordered routes apply production browser headers, block source maps before
static-file lookup, serve real assets, and then send browser navigation to
index.html. Missing API routes and assets remain 404 instead of receiving HTML.
The shell is no-cache; hashed assets are immutable. Keep the map refusal ahead of
the filesystem handler: Webpack emits hidden maps into dist. No .env, local
catalog, database or media belongs in this deployment.

This configuration deploys the web client only. It does not run pnpm serve or
server/index.ts. With no backend, the existing app reports that the account
service could not be reached; Privacy and Terms remain public client routes.
The owner confirmed on 2026-10-28 that no hosted backend exists. Accounts,
playlists and streaming are not ready merely because Vercel reports Ready.

For the complete current app, use a persistent single-instance Node service
with its own private durable SQLite file and authorised media available to that
server, following the production prerequisites above. Vercel Functions have a
read-only filesystem and temporary scratch space, so the present SQLite/media
server is not deployed there unchanged. A cloud server cannot read this PC's
G: drive. Choosing/creating paid hosting, copying media, migrating the shared
Study database and changing registration remain owner decisions.

If retaining Vercel for the client, add a same-origin /api reverse proxy to the
selected HTTPS backend before the SPA fallback, and validate the exact public
origin, trusted proxy chain, secure cookies, CSRF marker and request body limits.
Leave API_ORIGIN unset for that topology. Direct cross-origin API_ORIGIN needs
separate CORS/cookie/CSP work and is not enabled by this fix. Do not relax origin
or session checks to make a split deployment work.

Release: publish the reviewed configuration, redeploy the latest main commit,
and verify /, /watch, /music, /privacy, /terms, one real asset and a blocked map.
Verify /api/health and real sign-in/media separately after hosting the backend.
Rollback: promote the previous deployment in Vercel; no database migration is
part of this change. The previous deployment is known to return 404 at /.

References: [Vercel build settings](https://vercel.com/docs/builds/configure-a-build),
[route configuration](https://vercel.com/docs/project-configuration/vercel-json),
and [function filesystem limits](https://vercel.com/docs/functions/runtimes).
