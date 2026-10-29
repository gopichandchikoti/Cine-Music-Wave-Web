# AGENTS.md

This is the single source of truth for every coding agent that works in this repository (Codex, Claude Code, GitHub
Copilot, Cursor and others). Every other agent file (`CLAUDE.md`, `.github/copilot-instructions.md`,
`.github/agents/*.agent.md`, `.codex/agents/*.toml`, Cursor rules) only points here. Change the rules in this file,
never in a copy.

## How to use this file

- **Part 1 is the universal standard.** It is identical in every repository of the portfolio. To start a new app, create
  an empty repository, copy this file into it, keep Part 1 unchanged, replace Part 2 with the new project's facts, and
  tell the agent to follow Section 10 ("Bootstrapping a new app"). Nothing else needs to be pasted.
- **Part 2 describes this project.** It is the only part that may name files, ports, products or owners.
- Rule words: **MUST** and **MUST NOT** are mandatory, **SHOULD** needs a written reason to skip. Every rule has an ID
  (SEC-07, PERF-12) so reviews and commit messages can cite it.
- Order of authority: the owner's current instruction, then Part 2, then Part 1, then older documents. If a rule here
  conflicts with the owner's instruction, follow the instruction and say which rule was set aside.
- **An approved design is never restyled to satisfy this file** (UI-01). The standard decides how new work is built and
  how existing work is audited; it does not give an agent permission to redesign something the owner has approved.
- **Security is built in from the first commit, not added afterwards.** A new app follows Section 10, which pulls in
  Section 3 (SEC-01 to SEC-52) and proves it with Section 7 (attack tests and the mutation check, TEST-14). An existing app
  is reviewed with Section 13. Section 12 says what must be true before any work is called done. Section 14 holds the
  working notes that saved time. Every lesson from an audit is written into Part 1, so the next app starts with it.
- **The other agent files name these sections and nothing else.** `CLAUDE.md`, `.github/copilot-instructions.md`,
  `.github/agents/*.agent.md`, `.codex/agents/*.toml` and Cursor rules tell their tool to read this file and list the
  mandatory checkpoints by ID (Sections 3, 10, 12, 13). They restate no rule (Section 11).

---

# Part 1: Universal standard

## 1. Working protocol (PRC)

- PRC-01 Read before writing. Open the nearest implementation, its callers, its tests and the project documents named in
  Part 2. Current source and `package.json` scripts beat any older document.
- PRC-02 Plan first for anything larger than one file: state the goal, the files that change, the checks that prove it,
  and what is out of scope. Then work in small steps and run the narrowest check after each one.
- PRC-03 Ask only when blocked by a decision that belongs to the owner (a destructive action, an approved design, a
  credential, a cost). Otherwise choose the conventional option, say so in one line, and continue.
- PRC-04 Never claim a check passed unless it ran in this session. Report failures with their output. Name every check
  that could not run (missing credentials, missing device, missing tool) instead of implying success.
- PRC-05 Do not commit, push, reset, discard, overwrite or delete work you did not create. Never run a destructive command
  without looking at its target first. Never wipe a shared emulator, database or media folder.
- PRC-06 Do not install tools, change system settings or send source code to an outside service without the owner's
  go-ahead. Sending content to an external service publishes it.
- PRC-07 Keep a local change log entry for every feature, fix, refactor, configuration or documentation change (Section 8).
  Feature logs are local-only: ignore them and never stage, commit or push them. Public README files must not link to them.
- PRC-08 Finish what you start: no placeholder code, no half-wired feature, no TODO left as the deliverable.
- PRC-09 Never print, log, commit or paste a secret value. To inspect `.env`, a config or a log, show names and lengths
  only and mask values. A secret that was found is reported by path and rotated, never quoted.
- PRC-10 A check that finds nothing proves nothing until it has found something. Give every scan, search or audit script a
  positive control (a known sample it must report, a deliberate violation it must catch) before trusting a zero.
- PRC-11 A claim about the code, in a document, a screen or a reply ("hashed", "encrypted", "private", "offline", "nothing
  leaves the device", "no mistakes"), is verified against the code and the built artefact, and the wrong side is
  corrected. Never promise that a system cannot be broken: state what was checked, what happened and what was not covered.
- PRC-12 A change that makes production start-up or deployment stricter (a new required variable, a stronger secret rule, a
  renamed cookie) is a deployment action: write it in `OPERATIONS.md` and in the report before it is deployed (ARCH-23).

## 2. Design standard (UI)

### 2.1 The design record

- UI-01 Every app has a written design record in `system_design.md`: audience, palette tokens with measured contrast,
  type pairing, spacing and radius scale, motion rules, icon set and voice. Build from the record, not from defaults.
  If a design is approved, it is frozen: new work follows it, audits report against it, nobody restyles it unasked.
- UI-02 All colour, radius, shadow, spacing and motion values come from tokens (CSS custom properties or a theme file).
  A hard-coded value in a component is a defect.
- UI-03 Provide a light and a dark theme from the same tokens, unless the design record says the product is one theme.

### 2.2 The thirty tells of a generated site

A page looks generated when it shows these patterns by default. For new work an agent MUST avoid each one unless the
design record chooses it on purpose and says why. For existing work an agent MUST report the ones present and MUST NOT
remove an approved one on its own (UI-01). `pnpm audit:standards` lists the ones it can detect.

| # | Tell | Instead |
|---|------|---------|
| 1 | Harsh or multi-stop decorative gradients | Flat surfaces; a gradient only to keep text legible over an image |
| 2 | Lucide icons as the unconsidered default | One icon family chosen in the design record, imported from one module |
| 3 | Pure white page background | A tinted neutral from the tokens |
| 4 | Rainbow colouring | One primary, one accent, neutrals; status colours only for status |
| 5 | Soft drop shadows on every card | Borders and spacing; shadow only on floating layers |
| 6 | Three feature cards in a row | A list, a table, or the real product on screen |
| 7 | Emoji as icons or bullets | Real icons or none |
| 8 | Liquid-glass panels as decoration | Glass only where the design record specifies it |
| 9 | Em dashes in copy | Commas, colons, full stops |
| 10 | Inter, Geist or Space Grotesk by default | A deliberate pairing, self-hosted |
| 11 | A coloured stripe on one edge of a card | A full border or a background tint |
| 12 | Invented testimonials, logos or statistics | Real data or nothing |
| 13 | Bento grids | A layout that follows the content |
| 14 | A fake terminal window as decoration | The real output, or nothing |
| 15 | "It's not X, it's Y" copy | State what the thing does |
| 16 | Check-mark bullets for every list | Plain list markers |
| 17 | Three pricing tiers by reflex | Only if the product sells tiers |
| 18 | No real product demo | Show the actual app, with real states |
| 19 | One very large corner radius everywhere | A small radius scale (control, panel, dialog) |
| 20 | Purple on black as the identity | A palette drawn from the product's subject |
| 21 | No skeleton or loading structure | A placeholder shaped like the content, plus an announced status |
| 22 | Radial glowing orbs | Nothing, or a real image |
| 23 | Dot or line grids behind everything | A plain background |
| 24 | Sparkle icons for anything "smart" | A plain icon that names the action |
| 25 | Animated arrows on every button | Text, with motion only for state change |
| 26 | No terms of use | A real page, linked from sign-in and the footer |
| 27 | No privacy policy | A real page that matches what the code stores |
| 28 | Hover lift and tilt on everything | Colour or border change on hover; spring motion for layout change (2.4) |
| 29 | Neon accent colours | Accents that pass contrast on both themes |
| 30 | Generic pastel palettes | Tokens chosen for the subject and checked for contrast |

### 2.3 Honesty and content

- UI-10 Show the real product: real data, real empty states, real errors. No lorem ipsum, no invented figures, no
  placeholder logos. Demo content is labelled as demo content.
- UI-11 Copy states what a control does or what a page holds. It uses sentence case, active verbs and no slogans.
  Every user-visible string lives in the content model (`src/content.model.json` or equivalent), not in components.
- UI-12 Every app that has accounts, uploads, analytics or third-party calls ships a Privacy page and a Terms page that
  are accurate to the code (what is stored, where, for how long, who receives it). They are public routes, linked from the
  sign-in screen and from a footer. Adding links to an approved screen MUST NOT change its layout (put them inline in an
  existing line). A lawyer should review the text before a public launch.
- UI-13 Loading, empty, error, offline, unauthorised and success states exist for every data view. A loading state has
  structure (skeleton or outline) and one polite status announcement.
- UI-14 Security statements on screen are true. Copy never says "hashed", "encrypted", "private" or "offline" unless the
  code and the built artefact do it (PRC-11), and a control that cannot work says so instead of looking available (a
  sign-in form on an app with no accounts is disabled and explains why). Correcting such a sentence does not restyle.

### 2.4 Motion: Apple-style springs

Motion explains a change of state. It is never decoration. Layout changes (a tab indicator moving, a sheet opening, a
panel minimising, a menu appearing, a dialog closing) use springs, not fixed-duration curves.

- UI-20 Model: a damped spring with mass 1. Parameters follow Apple's: `response` (seconds, the perceived duration) and
  `dampingFraction` (1 is critically damped with no overshoot, below 1 overshoots). Physical values are
  `stiffness = (2π / response)²` and `damping = 4π × dampingFraction / response`. SwiftUI's `duration` and `bounce` map
  to `response = duration` and `dampingFraction = 1 - bounce`.
- UI-21 Three named springs cover everything. Do not invent a fourth without a design-record entry.

  | Name | response | dampingFraction | Use |
  |------|----------|-----------------|-----|
  | snappy | 0.32 s | 0.86 | Tab indicators, toggles, small state changes |
  | smooth | 0.50 s | 1.00 | Sheets, page and mode changes, minimise and expand (no overshoot) |
  | bouncy | 0.45 s | 0.70 | Menus, popovers and dialogs appearing |

- UI-22 Web: generate the curve from the spring equation and write it as a CSS `linear()` easing in `themes/motion.css`,
  with the settling time as the duration. Animate `transform` and `opacity` only. Provide a `cubic-bezier` fallback with
  `@supports not`. Native: use the platform spring (`withSpring` in Reanimated with `mass: 1` and the damping and
  stiffness above, SwiftUI `.spring`, Compose `spring`).
- UI-23 Closing and minimising are animated too: keep the element mounted until its exit finishes (a presence hook), and
  start the exit from the current state so an interrupted open reverses smoothly. A gesture that drags an element hands
  its release velocity to the spring.
- UI-24 `prefers-reduced-motion: reduce` removes spring travel and scale; opacity may still change within 120 ms.
  Animation never blocks input, never delays content, and never runs on a hidden tab.

### 2.5 Accessibility and responsive behaviour

- UI-30 Meet WCAG 2.2 AA: text contrast 4.5:1 (3:1 for large text and UI parts), visible focus on every control, no
  information carried by colour alone, labels for every input and icon button, a skip link, one `main` landmark.
- UI-31 Full keyboard operation with logical focus order; dialogs trap and restore focus; Escape closes layers.
- UI-32 Touch targets are at least 40 px (44 px on mobile). The layout works from 320 px wide to 2560 px wide, in
  portrait and landscape, with zoom to 200% and with browser text size increased.
- UI-33 Respect `prefers-color-scheme`, `prefers-reduced-motion` and `prefers-contrast`. Use logical CSS properties so
  right-to-left languages need no rewrite.
- UI-34 Images and media declare dimensions (no layout shift), have text alternatives, and use modern formats.

## 3. Security standard (SEC)

Treat the network, the filesystem, uploads, Markdown, provider responses and every request field as untrusted. These are
the minimum checks for every app, and an agent building a new app MUST build all of them in from the first commit (Section
10), not add them after a review. Each row names how it is proved. SEC-01 to SEC-22 are the base checks; SEC-23 to SEC-52
(Section 3.1) are controls that real audits found missing, so they are written as requirements to build, each with the
attack test that proves it. A row that does not apply to an app (no uploads, no mobile) is marked "not applicable" with
the reason in the design record, never silently skipped.

| ID | Requirement | Proof |
|----|-------------|-------|
| SEC-01 | No API keys, tokens, passwords or private keys in source, bundles, URLs, logs, screenshots or docs. Client code holds none. | Secret scan of tracked files; bundle grep |
| SEC-02 | Environment variables are parsed once, validated at start-up, and fail fast with a clear error. `.env` is ignored; `.env.example` lists every name with no value. | Config test; `git ls-files` shows no `.env` |
| SEC-03 | Admin and owner routes check the role on the server for every request. | Test with a normal user token |
| SEC-04 | Authentication: passwords hashed with scrypt, argon2id or bcrypt and a per-user salt; constant-time comparison; sessions are random, stored only as hashes, HttpOnly, Secure in production, SameSite set deliberately, idle and absolute expiry, revocable. | Auth tests; cookie header test |
| SEC-05 | Access control is object-level: every read or write of a record checks that the caller owns it or may see it (no IDOR). Hidden buttons are not access control. | Cross-account tests |
| SEC-06 | All input is validated at the boundary with a schema (type, length, range, format, allow-list). Unknown fields are rejected or ignored on purpose. | Validator tests with hostile input |
| SEC-07 | Output is encoded for its context. Never render untrusted HTML. Markdown goes through a sanitiser. No `dangerouslySetInnerHTML`, `eval`, `new Function`, or string-built SQL, shell or regex. | Lint rule; audit script |
| SEC-08 | Rate limits on every route, tighter on sign-in, sign-up, reset, upload and any expensive scan or export. Limits answer 429 with `Retry-After`. Memory use of the limiter is bounded. | Limiter tests |
| SEC-09 | Public API routes list their allowed methods, require the right content type, cap body size, and return the stable error body in 5.4. | Route tests |
| SEC-10 | CORS is closed by default (same origin). When a separate API origin is needed, allow one explicit origin, never `*` with credentials, and add `Vary: Origin`. | Header test |
| SEC-11 | Every response carries: `Content-Security-Policy` (no `unsafe-eval`, no wildcard sources in production), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, framing control, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. Production adds HSTS (one year) and redirects or refuses plain HTTP. | Header test against the running server |
| SEC-12 | Debug mode is off in production: no stack traces, SQL, paths or provider errors in responses; source maps are not served; verbose logging is off. | Error-handler test; `NODE_ENV` test |
| SEC-13 | Dependencies are current and audited: `pnpm audit --prod` shows no high or critical finding; a patched version is installed or an override is added with the advisory ID. Lockfiles are committed. | `pnpm deps:audit` |
| SEC-14 | Unused packages are removed. A package is added only when the platform does not already provide the feature. | Audit script (unused dependencies) |
| SEC-15 | Nothing private is exposed by the web root: only the build output is served; dotfiles, `.git`, `node_modules`, data folders, logs and backups are never reachable; temp and scratch files are not committed. | Static-server test; `git ls-files` review |
| SEC-16 | Databases use parameterised queries, least-privilege accounts, constraints and migrations. Service-role keys stay on the server. Large binaries live in object storage, not in rows. | Code review; schema check |
| SEC-17 | Paths from users are resolved and confined to their root after following links; absolute paths, `..`, encoded traversal, NUL bytes and hidden folders are refused. Archive entries cannot escape their folder. | Traversal tests |
| SEC-18 | Uploads are staged, size-limited, extension- and type-checked, stored under random names outside the web root, and committed only after the owner approves. Active documents (SVG, HTML, XML) are served sandboxed. | Upload tests |
| SEC-19 | Secrets are scanned in the working tree and in git history before every release. Anything found is rotated, not just deleted. | Secret-scan output in the validation doc |
| SEC-20 | Outbound requests use an allow-list, a timeout and a size cap (no open proxy, no SSRF). Webhooks and callbacks verify a signature or a state value. | Tests with internal addresses |
| SEC-21 | Account deletion and data export exist when accounts exist. Audit events record what happened, never the secret. | Account tests |
| SEC-22 | A security review is run on every release: the full audit (Section 7), the attack tests, and an optional autonomous pentest (7.4). Findings are fixed or written down with an owner and a date. | `VALIDATION.md` entry |

### 3.1 Controls learned from audits (build these in; each has an attack test)

| ID | Requirement | Proof |
|----|-------------|-------|
| SEC-23 | **Production fails fast.** The process refuses to start when an access password, a signing secret, the public origin or a provider key is missing, too short (secrets: 32 bytes or more), not `https` (origins), or equal to another secret. A production service MUST NOT start open to everyone because a variable is missing. Outside production a missing signing secret may be generated per process. | One config test per rule |
| SEC-24 | **A signing key is never a password.** Cookies, tokens and sessions are signed with their own random secret, never with the access password: anyone who sees one signed cookie could otherwise test password guesses offline. | Config test: the password as secret is refused in production |
| SEC-25 | **Secrets stay out of output.** Inspect `.env`, configs and logs by names and lengths only (PRC-09). Configured secrets are blanked from every log line before it is written and never appear in a reply. | Test: a provider error that contains the key leaves no key in the body or in captured stderr |
| SEC-26 | **Cookie-authenticated writes check where they came from.** `Origin` must equal the one configured origin exactly (no look-alike hosts) and a custom marker header (`X-Requested-With: <App>`) must be present, in addition to any CSRF token. This matters most when the cookie is `SameSite=None` (web page and API on different sites), because form and multipart POSTs are simple requests with no preflight. Token-only routes (a sync webhook) are exempt and need their own token and limit. | Attack test: no Origin, other origin, look-alike origin, no marker, DELETE, login CSRF |
| SEC-27 | **CORS allows one origin.** It answers `Vary: Origin`, sends no CORS headers to any other origin, refuses its preflight, and its allowed-headers list contains every header the real client sends (a missing header silently blocks every write in a browser). The wildcard is never used with credentials. | Test: preflight with the client's real header list; a foreign origin gets nothing |
| SEC-28 | **Cookies are deliberate.** `HttpOnly`; `Secure` and the `__Host-` prefix in production; `SameSite` chosen on purpose and documented (`Lax` when web and API share one registrable domain; `None` only for a real split, knowing browsers restrict third-party cookies); exactly one cookie of a name or none (cookie tossing); expiry enforced on the server; a signed cookie that cannot be revoked lives 7 days or less and the docs say how to end all sessions (rotate the secret). | Cookie-header test; forged, duplicated and expired cookie tests |
| SEC-29 | **Proxy hops are configured.** Behind a reverse proxy, tunnel or platform router, set how many hops to trust so limits and logs see the real client. Never `trust proxy = true`. Without it every visitor shares the proxy's address, so ten failed sign-ins lock everyone out. | Test with `X-Forwarded-For`: two clients, two budgets |
| SEC-30 | **Files are served by what their extension says.** The content type comes from the extension, never from the type stored with the object or claimed by the uploader (a `.txt` stored as `text/html` would run as a page on your origin). Add `nosniff`; serve SVG, HTML, XML and every active document under a `sandbox` Content-Security-Policy; let only the web origin frame a file. | Test: a `.txt` stored as `text/html` is served `text/plain`; active documents carry `sandbox` |
| SEC-31 | **Check what a file is, not only what it is called.** Before staging, the first bytes must match the extension (PDF, images, ZIP-based formats; text has no NUL bytes). A refusal writes nothing. | One test per type, including HTML named `.pdf` |
| SEC-32 | **Staging is bounded.** A per-account (or total) cap on waiting uploads, checked before the body is received; a lifetime of 24 hours or less after which an item is deleted and cannot be committed; a sweep of orphaned files; a cap on simultaneous uploads (they sit in memory while checked); a size limit. | Quota, expiry, sweep and concurrency tests |
| SEC-33 | **Destinations are validated twice.** Lexically (one safe segment: no separators, `..`, leading dot, control characters, `:` stream names) and after links are resolved (the created folder's real path stays inside the root). A place the app hides when reading (its own folder, `node_modules`, hidden folders) cannot be written to either. | Tests: ignored folder, stream name, symlink or junction out of the root with nothing written outside |
| SEC-34 | **Path helpers test whole segments.** `path.normalize` leaves a lone `..` and a trailing `/`; a key that is `..`, ends in `/`, starts with `/` or holds NUL is refused. Object-storage keys follow the same rule. | Unit test with exactly those inputs |
| SEC-35 | **Generated documents do not carry raw HTML from user text.** Markdown turned into EPUB, PDF or e-mail writes raw HTML tokens as escaped text. | Test with `<script>` in a note |
| SEC-36 | **Private replies stay private.** Authenticated JSON is `Cache-Control: no-store`; authenticated files are `private`. A stored object's own cache policy (`public, max-age`) is never forwarded. | Test: a stored `public` policy does not reach the reply |
| SEC-37 | **One error body.** `{ code, message, requestId }` everywhere (ARCH-21), with `X-Request-Id`. Messages are fixed strings: never `error.message`, a file name, a path, provider or SQL text, or user input. A domain error carries its own safe message and status; anything else becomes the generic 500 and is logged with the request id. Operating-system failures (`ENOSPC`, `EACCES`) are server errors, not user errors. Rate-limit, CSRF and auth refusals use the same body. | Tests: failing disk, provider error, malformed JSON, oversized body |
| SEC-38 | **Logs are for operators, never for secrets.** Redact configured secrets (SEC-25); log no cookies, tokens, passwords, request bodies or raw provider responses. | Capture stderr in the error test |
| SEC-39 | **Health and diagnostics reveal nothing to visitors.** The probe answers `ok`, the service name and whether sign-in is required: no bucket, backend, version or path. | Test the exact body |
| SEC-40 | **Rate limits have three layers.** The whole API per client (a flood guard); a tight budget on sign-in, sign-up, reset, uploads, exports and every route that walks the disk or calls a provider (rescan, sync, ebooks); and a write budget on saving routes that does not count reads or streams. Memory is bounded (capacity, oldest evicted). Every refusal is 429 with `Retry-After`, `RateLimit-*` and the standard body. | Limiter unit tests and one over-budget test per tight route |
| SEC-41 | **Bodies are as small as the route allows.** The JSON limit is the largest legitimate body (64 KB for an API with no large JSON; more only where documented, with the reason). Bodies are parsed after the cheap checks (origin, rate limit). | Test for 413 |
| SEC-42 | **Every outbound request has a timeout for the headers** (`AbortController`); a large download that follows is not cut short. Hosts are allow-listed, redirects to unexpected hosts are refused, provider JSON has a size cap. | `audit:standards` lists bare `fetch(` calls in server code |
| SEC-43 | **Passwords have a policy beyond length.** Refuse repeated characters, counting and keyboard runs, a list of well-known phrases and the person's own username or email name. A breached-password lookup (k-anonymity) is offered when an outside call is acceptable; when it is not used, the docs say so. | Policy tests |
| SEC-44 | **Export and deletion cover everything an account owns.** Every table keyed by the account (profile, settings, sessions, uploads, history, playlists, progress), only that account's rows, no hashes or tokens. Adding a table updates export, deletion, tests and the privacy copy in the same change. | Export test with two accounts |
| SEC-45 | **A database file is private.** Owner-only on POSIX (file 0600, folder 0700), never inside the web root or a shared folder. An app exposed to the internet has its own database file, so a flaw in it cannot reach another app's accounts. | Inspection; Part 2 names each app's file |
| SEC-46 | **Hosted databases are closed by default.** Row-level security on every table, no public policy on tables only the server uses, private buckets, the service-role key on the server only. | Schema review |
| SEC-47 | **Advisories are judged by reachability.** Audit production dependencies and ask of each finding whether it ships. A build-tool advisory (CLI, bundler) with no patch is recorded with its dependency path and evidence that the package is absent from the shipped bundle (search the built output for its names, with a positive control, PRC-10). Never force an override that breaks the toolchain; never silence one without a reason, an owner and a date. | `VALIDATION.md` entry |
| SEC-48 | **Secrets are searched in history, not only the tree.** Search every revision for token formats, private-key headers and `KEY=value` assignments; name the patterns; say it is not an entropy scanner; print paths, never values. | Scan output in `SECURITY_VALIDATION.md` |
| SEC-49 | **Android is configured for privacy.** `allowBackup=false` unless backup was reviewed; the release build has no `INTERNET` permission unless the app talks to a server; only the permissions used, and the sensitive ones blocked; exported components limited to the launcher and system-protected receivers; deep-link schemes documented and the app ignores what a link carries; a release signed with a private keystore (never the public debug key) before an APK is shared; keystores outside the repository. | Read the **built** APK's merged manifest (`aapt2 dump permissions`, `aapt2 dump xmltree`), not the source config; a config test guards the settings |
| SEC-50 | **A native module takes only what it needs.** It accepts the schemes it uses and a `file:` address only inside its own cache folder (links and `..` resolved first), bounds its inputs, and never writes to originals. | Source test plus an on-device check that the legitimate path still works |
| SEC-51 | **"Offline" is proved, not stated.** An app that says it never uses the network has no network code in its source, no embedded addresses, no analytics or networking dependency, and no network permission in the release build. | Source test and the built manifest |
| SEC-52 | **Shared data and operator information have a decided owner.** When accounts share one library, who may add or change shared content (a role, or closed sign-up) and who may see operator information (diagnostics, scan results, versions) is a recorded decision in the design record, not an accident of having no check. | Design record entry; test for each role |

## 4. Performance standard (PERF)

### 4.1 Budgets

- PERF-01 Core Web Vitals at the 75th percentile: LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less. Measure in a
  real browser on a throttled profile (4x CPU slowdown, fast 3G) and record the numbers.
- PERF-02 Initial JavaScript on the first route is 250 KB or less (before compression); every other route is loaded on
  demand. Each chunk is 250 KB or less. A test fails the build when a budget is passed.
- PERF-03 No request chain longer than three on the first screen; no render-blocking third-party resource.

### 4.2 Techniques (all of them, not a menu)

| ID | Technique | Rule |
|----|-----------|------|
| PERF-10 | Code splitting | Split by route and by heavy feature (editor, player, charts). Lazy-load below the fold. |
| PERF-11 | Lazy loading | `loading="lazy"` and `decoding="async"` on images and iframes that start off screen; the largest visible image gets `fetchpriority="high"`. |
| PERF-12 | Image handling | Compress at build time, ship AVIF or WebP with fallbacks, serve responsive sizes with `srcset`, always set width and height. |
| PERF-13 | Virtualised lists | Lists that can pass about 200 rows are virtualised or use `content-visibility: auto`; never render thousands of live nodes. |
| PERF-14 | Browser APIs | `IntersectionObserver` for reveal and prefetch, `ResizeObserver` for layout, passive listeners, `requestIdleCallback` for non-urgent work. |
| PERF-15 | Priority hints | `preload` the first font and the first route chunk, `preconnect` to the one API origin, `prefetch` the likely next route. Nothing else. |
| PERF-16 | Cache busting | Content-hashed file names; hashed assets are `immutable` for one year; the HTML shell is `no-cache` so a deploy is seen at once. |
| PERF-17 | Compression | Brotli and gzip for text; precompress at build time and serve the twin; compress API JSON on the fly with a size threshold. Never compress range responses. |
| PERF-18 | Conditional requests | ETag on cacheable API responses and static files; the server answers 304. The ETag covers what the reader sees, not a timestamp. |
| PERF-19 | Connection reuse | Keep-alive and HTTP/2 or HTTP/3 at the edge; one origin for assets; no domain sharding. |
| PERF-20 | Scripts | `defer` every script; no inline blocking script; third-party scripts load after interaction or not at all. |
| PERF-21 | Styles | Component-based CSS next to each component; global tokens and base in a `themes` folder; responsive rules in their own file (`Name.responsive.css`) or a clearly marked block at the end. Extracted CSS files in production, not injected by script. Critical background colour set before first paint. |
| PERF-22 | Dead code | Tree-shake, remove unused exports, files, CSS and dependencies; the audit script reports them. |
| PERF-23 | Client data cache | Server data is cached on the client with request de-duplication and stale-while-revalidate (TanStack Query, or the shared helper in the project). Mutations invalidate the cache. A last-known copy shows at once while a fresh one loads. |
| PERF-24 | State | Keep state where it is used; lift only when two siblings need it. Use a store library only for state shared across distant parts. Memoise by measurement, not by habit. |
| PERF-25 | Fonts | Self-host variable WOFF2 subsets, `font-display: swap`, preload the first-screen faces, size-adjusted fallback to avoid layout shift. |
| PERF-26 | CDN and service worker | Put static assets behind a CDN when there is a public deployment. Add a service worker only with a written caching strategy, a versioned cache, an update prompt and a kill switch; never by default. |
| PERF-27 | Server | Stream large files with ranges, bound memory, avoid synchronous filesystem calls on request paths, share in-flight identical scans, shut down gracefully. |
| PERF-28 | Build first, tune later | Ship a correct, measured baseline first. Optimise what a measurement shows. Record before and after numbers in the change log. |

## 5. Architecture and structure (ARCH)

### 5.1 Frontend layout (React, any bundler)

```
frontend/
  src/
    @types/        ambient declarations and shared domain types
    api/           client, one module per backend area, index re-export
    assets/        fonts and images that are imported
    components/    shared presentational components (each with its own CSS)
    features/      one folder per product area; owns its components, hooks, state and CSS
    hooks/         shared hooks
    pages/         route-level screens
    routes/        route table, navigation, guards
    templates/     layout shells shared by pages
    themes/        tokens, base, motion, prose
    utils/         pure helpers (no React, no I/O)
    validators/    input rules shared by forms
    App.tsx  main.tsx  content.model.json
  index.html  package.json  biome.json  tsconfig*.json  README.md  .env.example  .gitignore
```

- ARCH-01 Dependencies point inward: `pages` use `features` and `components`; `features` use `components`, `hooks`, `api`,
  `utils`; `utils` use nothing. A feature never imports another feature's internals; share through `components` or `api`.
- ARCH-02 Server state lives behind `api/` modules and a cache; components never call `fetch` directly.
- ARCH-03 Each address is a route (`/study`, `/privacy`). Navigation uses the History API; refresh, Back and shared links
  work. Unknown addresses show a not-found page.
- ARCH-04 A file has one reason to change. Split a component or hook when it passes about 250 lines, a function when it
  passes about 50, or when its control flow is hard to follow. Do not split to satisfy a number.

### 5.2 Backend layout (Node, Express or similar)

```
backend/
  src/
    @types/        shared types
    config/        environment parsing and constants
    controllers/   HTTP in, HTTP out: parse, call a service, shape the response
    helpers/       small pure functions
    middlewares/   security headers, rate limit, request id, compression, errors
    models/        data access (repositories) and row types
    routes/        route tables that wire controllers and middleware
    services/      business rules; no HTTP types
    validators/    request schemas
    server.ts      builds the app; index.ts starts it
  package.json  biome.json  tsconfig.json  README.md  .env.example  .gitignore
```

- ARCH-10 Controllers do not hold business rules; services do not know about requests; models do not know about HTTP.
  Configuration is read once in `config/` and passed in; `process.env` is not read anywhere else.
- ARCH-11 `createApp(config)` returns the application without listening, so tests can start it on a random port. A
  `close()` releases databases. The entry point listens and handles `SIGINT` and `SIGTERM`.
- ARCH-12 A bounded product area with its own data (auth, media, learning) may be a feature module with the same inner
  layers (`routes`, `service`, `repository`, `validation`) instead of being spread across the top-level folders.
- ARCH-13 Outside systems (object storage, a hosted database, e-mail, the clock) are interfaces handed to
  `createApp(config, { storage, catalog, now })`. Tests start the real app against in-memory stand-ins, so every control
  can be proved without a network. A service that can only be started against the real provider is not finished. A
  hosted API is a first-class app: it has its own `createApp`, config rules, attack tests and README, not a script.

### 5.3 Mobile layout (React Native with Expo)

`src/core` (portable rules, no native imports), `src/data` (SQLite, repositories), `src/platform` (native adapters),
`src/design` (tokens and controls), `src/features` (screens), `modules/` and `plugins/` for custom native code. Generated
`android/` and `ios/` folders are never edited by hand. Permissions are declared once, requested when needed, and the
app works with every denied permission. Native security settings (SEC-49, SEC-50) live in `app.json`, config plugins and
the module sources, never in the generated folders. `.gitignore` anchors the generated folders (`/android/`, `/ios/`):
a bare `android/` also hides the app's own `modules/*/android` sources, and a clone could not then build (GIT-07).

### 5.4 API contract

- ARCH-20 REST with JSON. Plural nouns, stable paths, correct verbs and status codes. A contract change updates the client
  adapter, every implementation, the docs and the tests in the same change.
- ARCH-21 One error body everywhere: `{ code, message, requestId }`. `400` invalid input, `401` unauthenticated, `403`
  forbidden, `404` missing, `409` conflict, `413` too large, `415` unsupported type, `429` rate limited, `503`
  dependency down, `500` anything else with a generic message. The `X-Request-Id` header repeats the id.
- ARCH-22 Lists are paginated or bounded. Writes are idempotent or protected by a token. Long jobs are queued, not run in
  a request.
- ARCH-23 A contract change updates every copy of the contract in one change: the client adapter, each server that
  implements it (a local server and a hosted API), the allowed CORS headers, the docs and the tests. A stricter production
  start-up is a breaking deployment change (PRC-12): list the new required settings, the sessions that end and the
  rollback in `OPERATIONS.md` under "Deployment actions" before it ships.
- ARCH-24 A sibling or fork shares its bugs. When a fix lands in one copy (a hosted API and its local twin, a web app and
  the app it was forked from), search the others for the same defect, port the fix with its test, and keep files the repo
  declares shared byte-identical (AUD-09).

## 6. Code quality (CODE)

- CODE-01 TypeScript with `strict`. No `any`, no unchecked casts, no `@ts-ignore`, no lint suppression to hide a finding.
  A narrow suppression needs a comment with the reason and a change-log entry.
- CODE-02 One formatter (Biome) and one linter (oxlint or Biome) configured in the repository, both run in `pnpm check`.
  Warnings are defects. Format every file you create or touch.
- CODE-03 Names say what a thing is. Functions are small and return early. No nested ternaries, no more than three levels
  of nesting, no unexplained magic numbers (name them), no commented-out code, no debug logging, no empty `catch`.
- CODE-04 Comments explain why, not what. Public functions and non-obvious modules carry a short doc comment.
- CODE-05 Errors are typed, handled once at a boundary, and never swallowed. User-facing messages are plain language.
- CODE-06 Add a dependency only when needed; read its licence and maintenance state; pin exact versions for native or
  security-sensitive packages; record the licence notice. Remove what stops being used.
- CODE-07 Data is migrated by versioned, reversible migrations. Never edit a deployed migration.
- CODE-08 Time, randomness and the network are injected so tests can control them.
- CODE-09 Accessibility and security fixes are not optional refactors: make them when you touch the code.
- CODE-10 Errors have two kinds. A domain error (typed, with a status and a message safe to show) is thrown for a
  request the caller can fix; everything else is rethrown to the one error handler (SEC-37). No `catch` echoes a caught
  error's message into a reply.
- CODE-11 One source of truth for tables of facts: extensions, MIME types, limits, budgets and thresholds are named
  constants in one module, never copied into three files (a copy drifts, and the copy that drifts is the vulnerable one).
- CODE-12 Tests are code. The formatter, the linter (warnings are defects), `strict` types and the naming rules apply to
  them, and a test file is formatted and linted in the change that adds it.

## 7. Testing and verification (TEST)

### 7.1 What must exist

- TEST-01 Unit tests for pure logic; component tests for forms and states; API tests that start the real app and call it
  over HTTP; build tests for budgets and output; end-to-end checks for the main journeys.
- TEST-02 Every bug fix adds a test that fails without the fix.
- TEST-03 Security tests (7.3) run in the normal test command, not only before a release.

### 7.2 Commands every repository defines

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (or the named `test:*` scripts, including
`pnpm test:security` for the attack tests of 7.3), `pnpm build`, `pnpm deps:audit`, `pnpm audit:standards`. A README lists
them. If a command does not exist yet, create it; do not invent a result. A package with its own server (a hosted API) has
the same commands in its own folder.

`pnpm audit:standards` is a script in the repository (`scripts/audit-standards.mjs`, no dependencies, exit code 1 on an
error) that MUST at least do the following, and its header comment lists what it does so the document never promises more
than the code does:

- **Errors:** tracked secrets (token formats, private keys), tracked env files, databases and keystores; debug code
  (`console.log`, `debugger`); `eval`, `new Function`, `dangerouslySetInnerHTML`, `innerHTML =`; type escapes (`any`,
  `@ts-ignore`); wildcard CORS; third-party asset origins; a reply that echoes a raw error message (SEC-37); `trust proxy`
  set to `true` (SEC-29); a `Content-Type` taken from a stored or upstream object (SEC-30); a value for a secret-named
  variable in `.env.example` (SEC-02); Android `allowBackup` left on (SEC-49); and a failing **positive control** for its own
  secret patterns (PRC-10).
- **Warnings:** scratch and log files tracked; files over 400 lines; declared dependencies never imported; no privacy
  page; outbound `fetch` without a timeout (SEC-42); `process.env` read outside config (ARCH-10); `express.json()` without a
  limit (SEC-41); focused or skipped tests; a missing required document (`README.md`, `system_design.md`,
  `OPERATIONS.md`, `SECURITY.md`, `SECURITY_VALIDATION.md`, a validation record, `.env.example`); a
  `.gitignore` without `.env`, `node_modules`, `strix_runs` (and `*.sqlite` for a server, `*.keystore` for Android); Android
  `INTERNET` kept in a build with no network code, no blocked permissions; a native module accepting `file:` addresses
  without confining them (SEC-50).
- **Notices:** the design tells of 2.2, security claims in copy to verify (PRC-11), deep-link schemes.
- Its own checks are proved: before the first scan release, plant one violation of each rule, see each reported, and remove
  it (PRC-10, TEST-14).

### 7.3 Attack tests

Run these against a started app with throw-away data: unauthenticated access to every protected route; one account reading
or changing another account's records; path traversal and encoded traversal on every path parameter; oversized and
malformed bodies; wrong content types; repeated sign-in failures; CSRF without the token; hostile Markdown and filenames;
missing security headers; verbose errors; directory listing; source maps; rate-limit exhaustion; and a forged session.

Add the cases that audits found missing (each maps to a SEC row, and a new app writes them with the feature, not later):

- **Requests:** no `Origin`, another origin, a look-alike origin (`https://app.example.com.evil.example`), no app marker, a
  `DELETE` from another origin, login CSRF (SEC-26); a preflight with the client's real header list and one from a foreign
  origin (SEC-27); two clients behind one proxy get two budgets (SEC-29); a forged, truncated, duplicated, expired and
  future-dated cookie (SEC-28); an oversized and a malformed JSON body (SEC-41).
- **Files:** a `.txt` stored as `text/html` is served as `text/plain`, active documents carry `sandbox`, a stored `public`
  cache policy does not reach the reply (SEC-30, SEC-36); HTML named `.pdf`, `.png` or `.epub`, and binary named `.txt`
  (SEC-31); the staging cap, per-account isolation of that cap, expiry and sweep (SEC-32); a destination in an ignored
  folder, with a stream name, and through a link out of the root, with a check that nothing was written outside (SEC-33);
  `..`, `a/../..`, `./`, a leading `/`, NUL and an encoded variant of each, for every path parameter (SEC-34); a
  hidden folder's file is never readable.
- **Errors and logs:** a failing disk (`EEXIST` or `ENOSPC`) answers 500 with a code and a request id and no path; a
  provider error that contains the service key leaves it out of the body and out of captured stderr (SEC-25, SEC-37,
  SEC-38); the health body is exactly the documented one (SEC-39).
- **Limits:** one over-budget test for every tight route (sign-in, uploads, rescan, sync, ebooks, saving) and a test that
  reading is not counted against the write budget (SEC-40).
- **Accounts and config:** weak, repeated, sequential, common and own-name passwords refused (SEC-43); an export with two
  accounts holds one account's rows and no hashes (SEC-44); production start-up refuses each missing or weak setting, and the
  password as a signing secret (SEC-23, SEC-24).

### 7.4 Autonomous penetration testing

The open-source agent **Strix** (`usestrix/strix`) attacks a running app in a Docker sandbox and reports proven findings.
Use it on your own apps only, with the owner's written go-ahead, because it needs Docker and an LLM API key and sends
target content to that provider.

1. Start the app locally with throw-away data and a throw-away account.
2. `curl -sSL https://strix.ai/install | bash` (read the script first), then
   `export STRIX_LLM="<provider/model>"` and `export LLM_API_KEY="<key>"`.
3. `strix --target ./<app-folder>` for a white-box run, or `strix --target http://localhost:<port>` for a black-box run.
4. Read `strix_runs/<run>`; fix confirmed findings; add an attack test for each; rerun. Keep `strix_runs/` out of git.

If Docker or a key is missing, say so, run 7.3 instead, and record that Strix did not run.

### 7.5 Browser and device proof

- TEST-10 UI work is verified in a real browser at 320, 390, 768, 1024 and 1440 px, in light and dark, with the keyboard,
  and with reduced motion on. Save screenshots. When a design is approved, compare against the approved screenshots and
  report the pixel difference; an unexplained difference is a regression.
- TEST-11 Media features are proved by playing real media and reading the playback state, not by a clean build.
- TEST-12 Mobile features run on an emulator or device from a release build with the development server stopped.
- TEST-13 Do not run two browser test scripts at once on the same debugging port. Delete the accounts a test created.

### 7.6 Proving a control

- TEST-14 **Break it on purpose.** For every new security control, remove it once (comment the guard out, flip the
  condition, copy the file first), run only its test (`--test-name-pattern`), and confirm the test fails; then restore the
  file byte for byte and run the full suite again. A test that passes with the control removed proves nothing. Record
  that this was done in the change log.
- TEST-15 Tests start the real app (`createApp`) on a random port with in-memory stand-ins for every outside system
  (ARCH-13). They never call a real provider and never touch the owner's real database or media folder. Say in
  `VALIDATION.md` what stand-ins cannot prove (real provider traffic, a real browser's PDF viewer, a real proxy).
- TEST-16 Every test client gets its own client address (`X-Forwarded-For` with a trusted loopback proxy), so one test's
  requests do not use up another's rate limit; limiter tests use an injected clock, never `sleep`.
- TEST-17 Packaging claims are proved on the built artefact: the merged Android manifest, the production bundle, the
  response headers of the built server. A configuration file says what was asked, not what was built.
- TEST-18 A live smoke test against a running local app creates throw-away accounts, deletes them in a `finally`, and the
  agent then counts the leftovers (zero) in the real database, read-only.
- TEST-19 Capture stderr (and restore it in `finally`) when a test needs to prove what a log did or did not contain.

## 8. Documentation (DOC)

Every repository keeps, current: `README.md` (what it is, commands, ports), `system_design.md` (architecture, decisions,
design record), `OPERATIONS.md`
(deploy, backup, monitoring, deployment actions), `VALIDATION.md` (evidence and known limits), `SECURITY.md` (the security
policy), `SECURITY_VALIDATION.md` (the security evidence), `.env.example`, and licence notices for bundled third-party
assets. Docs never promise what the code does not do (PRC-11). Do not paste secrets or private paths.

- DOC-01 `SECURITY.md` says what the app protects, which controls exist (one paragraph that cites SEC IDs and restates no
  rule), how to report a vulnerability through a private channel the owner names (never a public issue with details),
  which versions are supported, how to run the security checks, and the known limits. It is the file a repository host
  shows in its security tab.
- DOC-02 `SECURITY_VALIDATION.md` is the evidence file, dated, and updated by every audit and every security change: the
  method; results at a glance; a findings table (ID, severity, finding and evidence, fix, proof); what was checked and
  found sound; what was not fixed and why; deployment actions still required; what was not covered; how to re-run. A
  sibling app keeps its own and may point to the other's for shared code.
- DOC-03 `OPERATIONS.md` has a "Deployment actions" section for everything that must be set or done before a version is
  deployed (PRC-12): new required settings and their rules, sessions that end, a rollback.
- DOC-04 A hosted service's README lists its required production settings and says that it refuses to start without them.
  `.env.example` lists every name with no value and marks which are required in production.
- DOC-05 Part 2 states, per app: its database file and what shares it, how it is exposed (ports, a tunnel, a platform),
  what it shares with sibling apps, who may write shared data (SEC-52), the signing state of a mobile build, and the
  decisions still waiting for the owner.

The maintainer keeps `FEATURE_LOG.md` locally, with one dated entry per change. It is ignored and never committed or pushed.
A fresh clone need not contain it; create it locally when needed. Public documents must not link to this local record.

## 9. Git and secrets hygiene (GIT)

- GIT-01 `.gitignore` covers `.env*` (except the example), build output, logs, databases, keystores, caches, local
  tooling and media. Scratch and audit files go in a scratch folder outside the repository or under an ignored path.
- GIT-02 Never commit a secret, a database, private media, personal data or a local feature log. If one is committed, rotate it.
- GIT-03 Commits are small and describe the change in the imperative. Do not commit unless asked. End commit messages
  with the attribution line the environment requires.
- GIT-04 Never rewrite shared history or force-push without an explicit request.
- GIT-05 `.gitignore` also covers scratch files (`.tmp-*`), local tool config (`.mcp.json`), tunnel and hosting logs,
  `strix_runs/`, APKs and screenshots that can show private content, and local databases (`*.sqlite`, `*.db`).
- GIT-06 An audit does not commit, stage, unstage or delete. Tracked scratch files that the agent did not create are listed
  in the report with the command that would remove them (`git rm --cached`); the owner decides.
- GIT-07 Ignore patterns that name a directory are anchored (`/android/`, `/ios/`, `/data/`) unless they are meant to
  match at every depth. After editing `.gitignore`, run `git ls-files --others --ignored --exclude-standard -- <each source
  folder>` and expect nothing: a bare `android/` once hid an app's own native module, so the repository could not be
  cloned and built, and the audit could not see the file it was meant to check.

## 10. Bootstrapping a new app (NEW)

1. Create the repository and copy this file in. Replace Part 2 with: purpose, users, the first three journeys, the data
   it stores, the ports it uses, whether it needs accounts, where it will be hosted (local, a tunnel, a platform), and
   who may change shared data (SEC-52).
2. Write the design record in `system_design.md` (UI-01) before any component. Choose tokens, fonts, icons, radius scale,
   motion springs and voice. Measure contrast. In the same file write the trust boundaries (browser to server, server to
   provider, upload to storage, account to account), the roles, and what is stored for how long.
3. Scaffold the structure in Section 5, `package.json` with the commands in 7.2 (including `test:security`), `tsconfig`,
   `biome.json`, `.oxlintrc.json`, `scripts/audit-standards.mjs` as specified in 7.2, `.gitignore` (GIT-05, GIT-07),
   `.env.example`, `README.md`, `SECURITY.md`, `SECURITY_VALIDATION.md`, `OPERATIONS.md`, `VALIDATION.md`, `FEATURE_LOG.md`,
   and the pointer agent files of Section 11.
4. Build the backend skeleton first, with every control of Section 3 that the app needs, each with its attack test and a
   mutation check (TEST-14) in the same step: `config` that fails fast (SEC-23, SEC-24); `createApp(config, deps)` with
   in-memory stand-ins (ARCH-13); request id, security headers, HTTPS rule, proxy hops (SEC-29); the origin and marker
   guard, CORS and cookies (SEC-26 to SEC-28); the three rate-limit layers and body limits (SEC-40, SEC-41); the outbound
   timeout helper (SEC-42); the error handler with redaction (SEC-37, SEC-38); a minimal health route (SEC-39); password
   hashing with the policy (SEC-43); export and deletion (SEC-44); a private database file (SEC-45); compression; static
   serving with cache policy; graceful shutdown. If the app has uploads or stored files, SEC-30 to SEC-36 come before the
   first upload route, not after it. A mobile app takes SEC-49 to SEC-51 at its first prebuild.
5. Build the frontend shell: routes, theme tokens, motion tokens, self-hosted fonts, the API client with cache, the
   privacy and terms pages (accurate to the code, UI-12, UI-14), the not-found page, loading and error states, the skip
   link. The client sends the marker header and every header CORS allows (SEC-26, SEC-27).
6. Build features one journey at a time. After each: typecheck, lint, tests, a browser check, a change-log entry. A feature
   that adds a table or a file area also updates export and deletion (SEC-44), the limits (SEC-40) and the privacy copy.
7. Run the full gate: all commands in 7.2, the attack tests of 7.3, the mutation check, a production build, the budgets,
   screenshots, built-artefact checks (TEST-17), the secret scan of the tree and of history (SEC-48), the dependency
   audit with reachability (SEC-47), and `audit:standards` with its own positive controls. Fill `VALIDATION.md` and
   `SECURITY_VALIDATION.md`. Offer the Strix run (7.4).
8. Report in the order of AUD-10: what was built, what was verified (with counts), what could not be verified, the
   deployment actions, and what needs the owner's decision.

## 11. Agent files

- The root `AGENTS.md` is the only place rules are written. Other agent files (GitHub Copilot instructions, Codex agent
  definitions, `CLAUDE.md`, Cursor rules) are one-paragraph pointers that name this file and add nothing.
- A project-specific agent definition may restrict tools or set a role, but it must not restate or relax a rule.
- When a rule changes, change it here once and update the portfolio's other repositories to the same Part 1. A script
  can splice it (everything before `# Part 2`), and `diff` of that region between repositories must be empty.
- Every pointer file says the same four things and no more, so an agent that reads only its own tool's file still reaches
  the checkpoints: (1) read `AGENTS.md` at the repository root before any change and follow it; (2) a new app is built by
  Section 10 with all of Section 3 built in from the first commit; an existing app is audited by Section 13; (3) work is
  done only when Section 12 is met; (4) read `system_design.md` and `FEATURE_LOG.md` first, keep an approved design
  unchanged, and report which checks ran and which could not. A new repository gets `CLAUDE.md` (the single line
  `@AGENTS.md`), `.github/copilot-instructions.md`, `.github/agents/<name>.agent.md` and `.codex/agents/<name>.toml`.

## 12. Definition of done

A change is done when: it does what was asked and nothing else; the approved design is unchanged unless the owner asked;
typecheck, lint, format, tests and build pass (or the exception is stated); the security rows that the change touches are
proved; the budgets hold; a browser or device check was run for UI changes; the change log, design record and any
affected docs are updated; and the final report lists what was and was not verified.

For a change that touches security (a route, a cookie, a header, a file, a limit, an account, a dependency, a native
setting) these are also true, and the report says so:

- Each new or changed control has an attack test that fails without it (TEST-14), and `audit:standards` still passes.
- No secret was printed, logged or committed (PRC-09), and no document or screen claims what the code does not do (PRC-11).
- Anything that makes production start-up or deployment stricter is in `OPERATIONS.md` under "Deployment actions" (PRC-12).
- `SECURITY_VALIDATION.md` and the change log are updated; sibling copies of the code were searched and fixed (ARCH-24).
- Findings that were not fixed are written down with a reason and an owner, never dropped.

## 13. Auditing an existing app (AUD)

Use this when the owner asks to harden, review or audit an app (the usual wording is: hide keys, check environment
variables, protect admin routes, authentication and access control, sanitise input and stop XSS, rate limits, API and CORS,
security headers, debug off, dependencies, remove what is not needed, exposed files, database and password hashing, secrets
in git history, a full audit). The goal is to reduce the real attack surface and to **show that the important controls
work**, not to make the code look secure.

- AUD-01 **Understand first.** List the entry points, trust boundaries, assets (data, secrets, media), roles, stores and
  outbound calls, and how the app is deployed (local, a public tunnel, a platform). Rank every later finding for that real
  deployment: open sign-up, a public address or a shared library changes the severity.
- AUD-02 **Baseline.** Run the repository's own gates before changing anything and note what already fails.
- AUD-03 **Secrets.** Search the working tree and every revision of history (SEC-48), by names and lengths only (PRC-09);
  confirm `.env` is ignored and untracked and examples hold no values. A found secret is rotated, not just deleted.
- AUD-04 **Dependencies.** Audit production dependencies and judge each advisory by reachability (SEC-47); update what has a
  patch; record the rest with evidence, an owner and a date. Remove what is unused (SEC-14).
- AUD-05 **Walk every area by reading the code, not the docs:** configuration and fail-fast rules; authentication and
  password handling; sessions and cookies; CSRF and CORS; authorisation and object-level access, including database roles;
  input validation and injection; output encoding and XSS (including generated documents); uploads, downloads and paths;
  API contract, methods, content types and limits; rate limits and business logic (quotas, state, expiry, concurrency,
  anything that lets one account harm another or the host); cryptography; headers and CSP; errors and logging; build and
  deploy settings; exposed files and `.gitignore`; sibling copies; mobile and native (manifest, storage, intents, signing);
  and unnecessary attack surface (routes, permissions, dependencies, debug endpoints, diagnostics).
- AUD-06 **Think like an attacker, then like a defender.** What can be observed, which assumption can be abused, how do
  weaknesses chain, what is the realistic impact? Then the smallest mitigation that removes it. Prefer a finding you can
  demonstrate with a request or a test to a suspicion.
- AUD-07 **Fix only confirmed issues.** No restyle, no refactor for taste, no new feature. Keep contracts whole (ARCH-23).
  Where the code has no testable shape (a script, a global singleton), give it one (ARCH-13) so the fix can be proved.
- AUD-08 **Record each finding:** ID, severity (High, Medium, Low, Info: the effect if exploited in the real deployment),
  evidence (file and line, or the request), impact, fix, verification (the test or built-artefact check). A finding is
  fixed only when a test that fails without the fix passes with it (TEST-14).
- AUD-09 **Check the siblings.** Search every other copy of the code for the same defect (ARCH-24), port the fix and its
  test, and re-run their gates. Sibling apps often share a database file, an auth module or an environment: check that too (SEC-45).
- AUD-10 **Report in this order:** confirmed issues by priority; fixes made; tests passed or failed (with counts); unresolved
  risks and why; deployment actions still required (PRC-12); what was not verified (PRC-04). Never write "secure" or "no
  mistakes"; write what was checked and what happened (PRC-11).
- AUD-11 **Write it down** in `SECURITY_VALIDATION.md` (DOC-02), the change log, `OPERATIONS.md` (deployment actions),
  `SECURITY.md` and the README commands, and make `audit:standards` detect the rule so it cannot regress (7.2).
- AUD-12 **Offer Strix** (7.4). Do not run it without the owner's written go-ahead; say plainly that it did not run.
- AUD-13 **Correct your own record.** Re-read the document against what was run; fix a wrong count, an unproved claim or an
  exploit that was only "not refused" (say "was not refused", not "was exploitable") before reporting.

## 14. Field notes (things that cost time)

- Run `biome format --write` two or three times until `format:check` is stable. Format new and touched files, tests included.
- To mutation-check: copy the file, flip one guard with `sed -i`, run `node --test --test-name-pattern=<name> <file>`, restore
  the copy, repeat for the next control, then run the whole suite once. A shell script that patches a file with nested
  quotes fails silently; write a patch script to a file or use the editor tool, and check that the change applied.
- When a test stubs `globalThis.fetch`, keep the real one and use it for the test's own client, and restore it in `finally`.
- An upload route's budget is tight on purpose (SEC-40): give each upload test its own client address (TEST-16).
- A probe that plants a violation or creates a folder in the repository is removed in the same command, and `git status`
  is read afterwards for anything left behind.
- Expect a native build after a manifest change to regenerate the whole native project and take minutes. Install without
  wiping data, then check both the running app and the merged manifest (TEST-17).
- A Windows PowerShell 5.1 terminal has no `Encoding.Latin1` (use `GetEncoding(28591)`) and prints a "NativeCommandError"
  wrapper for a native command that wrote to stderr even when it succeeded: judge by exit code and output, and put
  multi-line or quote-heavy scripts in a file.
- Tools that ask a question in a terminal with no input (a package manager purge prompt) are never answered "yes" for the
  owner: call the tool binaries directly, as Part 2 says.
- One shared settings file can point two apps at one database (SEC-45), and a bare directory name in `.gitignore` can hide
  source (GIT-07): read both when reviewing.
- A scan that prints zero is suspect until a known sample shows up in it (PRC-10), and a decoder that does not exist fails
  quietly in some shells: check the positive control after every change to a scan.

---

---

# Part 2: Cine Music Wave Web (this repository)

## Project at a glance

Cine Music Wave Web is a local-first personal cinema and music app extracted from Study Library: a React 19 and TypeScript
client, a Webpack 5 build, and a Node/Express server. Only **Watch** (local authorised video) and **Music** (local authorised
audio) exist. It has its own entertainment accounts, independent of Study accounts. The owner approved the current visual design
(dark liquid glass, DM Sans, DM Mono, Fraunces). It is frozen: do not restyle it (UI-01). New motion follows 2.4.

**Owner-approved addition (2026-10-26).** On the owner's request the app also has a light theme for Music and Watch (the
`data-theme` attribute on `<html>`, chosen from the account menu or Settings), and at phone width (860 px and below) a floating dock,
full-bleed singer and album pages and a Library overview. The dark theme itself did not change; `tests/music/theme.test.ts` pins it.
The light colours live in `Music.light.css` and `Watch.light.css`, the new screens in `Music.screens.css`; never edit the dark rules
to make the light theme work. See `system_design.md`.

This repository is the visual and behavioural source for the mobile app in `mobile apps/Cine Music Wave Mobile`. A change to a
screen here usually needs the same change there; say so in the report. (The 2026-10-26 redesign was made on the mobile app first
and ported here; both now match.)

- `src/` client: `@types`, `api`, `assets`, `components`, `features` (`auth`, `music`, `watch`, `shell`), `hooks`, `pages`,
  `routes`, `themes`, `utils`. `AppRoot.tsx` and `App.tsx` own session, theme and address; `content.model.json` holds all copy.
- `server/` backend: `config`, `middlewares`, `routes`, plus feature modules `auth`, `music`, `watch`. `app.ts` builds the app and
  returns `{ app, close }`, `index.ts` starts it.
- `scripts/` (dev launcher, precompression, standards audit, motion generator, webpack plugins), `tests/`, `validation/` (generated
  reports, ignored), `data/` (local catalog and artwork, ignored).

Read `system_design.md` and `FEATURE_LOG.md` before substantial work. Use `OPERATIONS.md` for configuration, `AUTH_SETUP.md` and
`AUTH_VALIDATION.md` for identity, `VALIDATION.md` for evidence, and `FUTURE_ONLINE_BACKEND_PLAN.md` before any hosting change.

## Rules specific to this project

- Web is served on port 4040 and the API on 4041 (`pnpm dev:local`). The browser uses same-origin `/api`. Never start it on 4444 or
  4445, which belong to Study Library.
- Media stays where it is. `WATCH_MEDIA_DIR` must be on `WATCH_ALLOWED_DRIVE` (G: on this machine) or every media route answers
  403. Media files are never copied, altered or committed. The catalog and generated artwork live under `data/` and are rebuilt
  from the media.
- Video and audio bytes only travel on their own routes (`/api/watch/*`, `/api/music/*`). Ids from the URL are looked up in the
  catalog, never used as paths.
- Accounts are entertainment accounts only (`entertainment_` tables in the shared SQLite file). Never rename or repurpose a Study
  table. Passwords are scrypt hashes; sessions are server-side; cookies are `cine_music_wave_account` and `cine_music_wave_csrf`.
- Keep licensed or owner-authorised media only. No DRM bypass, no scraping, no redistribution without rights.
- Do not claim hosted authentication, OAuth or email works: only local accounts are implemented and recorded in
  `AUTH_VALIDATION.md`. Playwright totals in `VALIDATION.md` need both apps running and real media fixtures.
- Do not touch `.env`, `data/`, `dist/`, `validation/` or `THIRD_PARTY_NOTICES.txt` unless asked. Keep existing Git history and remotes unchanged; do not initialise or reconfigure Git.

## Commands

Requirements: Node.js 22.5+ and pnpm 11. Do not run install commands unless dependencies must change.

| Command | Purpose |
|---------|---------|
| `pnpm dev:local` | Web on 4040 and API on 4041 |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check` | Static checks (`check` runs all three) |
| `pnpm test:auth`, `test:watch`, `test:music`, `test:motion`, `test:server`, `test:security` | Unit, API, motion and attack tests |
| `pnpm build` | Typecheck, production bundle, brotli and gzip twins |
| `pnpm test:build` | Build output, budgets, fonts, precompression (run after `pnpm build`) |
| `pnpm test:e2e` | Playwright parity suite; needs both apps, real media and temporary accounts |
| `pnpm deps:audit`, `pnpm audit:standards` | Dependency advisories and the standards audit |
| `pnpm motion:generate` | Regenerate the spring easings in `src/themes/motion.css` |

There is no Sonar or CodeQL gate in this checkout; never say one ran. Strix (7.4) has not been run.

## Security state and open decisions (DOC-05)

- **Evidence:** `SECURITY_VALIDATION.md` (findings, fixes, proof, limits), `VALIDATION.md` ("Security hardening - 2026-10-26"),
  policy in `SECURITY.md`. Attack tests are in `tests/security`; `pnpm test:security` runs them.
- **Shared code.** These server files are the same as Study Library's and are kept in step: `middlewares/*`, `watch/*`,
  `music/routes.ts`, `auth/{validation,password,rate-limit,security-headers,sessions}.ts` (table and cookie names differ) and
  `scripts/audit-standards.mjs`. A fix in one repository is ported to the other with its test (ARCH-24). Study's
  `SECURITY_VALIDATION.md` has the detail of the shared fixes.
- **Exposure.** `scripts\host-public.ps1` publishes the production build through a Cloudflare quick tunnel. It binds
  `127.0.0.1`, keeps registration closed unless `-AllowSignup` is passed, passes production settings as process variables and
  sets `AUTH_TRUST_PROXY=loopback` so rate limits count the real visitor (SEC-29). Its logs and the temporary address are in
  `validation/hosting/` (ignored). It serves media to every signed-in account: serve only media you own or may share.
- **Database file (open decision, SEC-45).** `.env` sets `PERSONAL_DB_PATH` to Study Library's SQLite file, so one file holds both
  apps' accounts and password hashes (separate tables). This is the app that is exposed to the internet, so the safer
  setting is its own file (remove `PERSONAL_DB_PATH`; the default is `data/cine-music-wave.sqlite`), at the cost of creating
  its accounts again. Do not change it unasked.
- **Not done:** Strix; the Playwright suite after the 2026-10-26 hardening; a check of the public tunnel.

## Project agents

`CLAUDE.md`, `.github/copilot-instructions.md`, `.github/agents/cine-music-wave-web.agent.md` and
`.codex/agents/cine-music-wave-web.toml` only point here (Section 11); they restate no rule. The mobile hand-off documents
(`MOBILE_AGENTS_TEMPLATE.md`, `MOBILE_AGENT_PROMPT.md`) were absorbed into the mobile repository's own `AGENTS.md` and live in
`docs/legacy/`.
