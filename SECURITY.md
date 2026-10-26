# Security policy

## Reporting a vulnerability

Please report a security problem privately to the repository owner. If this project is put on GitHub, use **Report a
vulnerability** under the Security tab; otherwise contact the owner directly. Do not post details publicly until the problem is
fixed. Say what you found, how to reproduce it, and what it lets someone do.

Only the current version of the code is supported.

## What this project protects

Cine Music Wave Web keeps entertainment accounts and password hashes, each account's likes, playlists, progress and play history,
and gives signed-in accounts read-only access to the owner's video and music files. It can be published from the owner's PC
through a Cloudflare quick tunnel (`scripts\host-public.ps1`). The session signing secret lives in `.env`, which is never
committed.

## What is in place

The controls are written in [`AGENTS.md`](AGENTS.md) (Section 3, SEC-01 to SEC-52) and described in
[`system_design.md`](system_design.md) ("Security model"). In short: scrypt password hashing with a policy; server-side sessions
that are `HttpOnly` and `Secure` in production; a CSRF token and exact `Origin` check on every write; one closed CORS policy;
media addressed by catalog id and never by path, confined to one drive; errors that never show paths; rate limits on the API,
sign-in, saving and rescans; a loopback-only listener behind the tunnel with registration closed. The evidence is in
[`SECURITY_VALIDATION.md`](SECURITY_VALIDATION.md) and `VALIDATION.md`.

## How to check it yourself

```
pnpm check
pnpm test:security && pnpm test:server && pnpm test:auth && pnpm test:watch && pnpm test:music
pnpm build && pnpm test:build
pnpm audit:standards
pnpm deps:audit
```

Never run an automated attack tool (such as Strix) against anything but your own running copy with throw-away data and the
owner's permission.

## Known limits

No automated penetration test has been run. This app's database setting currently points at the Study Library's SQLite file, so one
file holds both apps' accounts; giving it its own file is the safer setting and is the owner's decision. Diagnostics are visible
to every signed-in account. There is no breached-password lookup. The full list is in `SECURITY_VALIDATION.md`.
