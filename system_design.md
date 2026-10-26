# Cine Music Wave architecture

React 19 + TypeScript + Webpack client -> same-origin /api -> Express + SQLite accounts + confined media files.

Watch and Music feature screens, media planning/streaming, subtitles, catalog parsing, Music engine and user stores are copied from the source working tree. The new App shell mounts only Watch and Music. Study, Markdown, Learning and upload endpoints are absent.

The existing SQLite database is shared by file path only. All new application tables and indexes have the entertainment_ prefix. Foreign keys remain within that namespace. New accounts do not inherit original credentials, progress or playlists. Existing Study tables are untouched by the new migrations. Separate cine_music_wave_* cookies prevent localhost port cookie collisions. Local storage is also namespaced.

No Supabase/PostgreSQL identity writer has been introduced. OAuth/email adapters remain present but are disabled unless explicitly configured for this app's origin. Credentials never enter browser bundles. Media root confinement, server authorization, CSRF checks, bounded requests and byte-range playback remain in place.

Media is shared read-only at the source location. Only this project's catalog/cache receives generated output. All new visual effects are original CSS added to existing controls. The browser app is responsive; native WebView integration remains future work.

## Proposed mobile direction (2026-10-24)

For the proposed local-device media product, prefer one React Native mobile app with shared pure TypeScript rules and native discovery/playback adapters. Native screens require a separate rendering implementation; Capacitor with native plugins is the alternative when exact web UI reuse is the primary requirement. iOS discovery is picker/library scoped, not a whole-device scan. See [MOBILE_APP_PLAN.md](MOBILE_APP_PLAN.md). No mobile architecture has been implemented by this documentation change.

## Mobile repository decision update (2026-10-24)

The owner requires separate sibling Web and Mobile projects, superseding the earlier in-Web workspace proposal. See MOBILE_REPLICATION_GUIDE.md for canonical folder names, independent source reuse, emulator-first Android validation and signed-iPhone options. Display branding remains Cine Music Wave. Current web paths remain unchanged until the future execution task.

## Current mobile delivery scope update (2026-10-24)

Mobile is offline-only for now. A bottom-of-login Skip Login action selects stable device-local profile Chendu, then opens Watch/Music Home with normal OS media permissions and device-local persistence. It creates no remote identity/session and does not weaken Web/server authorization. Connected accounts/hosting/sync are separate future work in FUTURE_ONLINE_BACKEND_PLAN.md; no backend is required for current native acceptance.

## Mobile execution update (2026-10-25)

The canonical local Web folder is now Cine Music Wave Web. A separate Cine Music Wave Mobile sibling is under implementation. Web authentication and ports remain unchanged. Native validation and incomplete features are tracked independently in the Mobile repository; do not infer native completion from the earlier Web migration.

## Design record and motion (2026-10-26)

This is the design record that `AGENTS.md` (UI-01) requires. The design was approved by the owner and is frozen; the mobile app
copies it value for value, so a change here usually needs the same change in `mobile apps/Cine Music Wave Mobile`.

- **Audience and voice.** One person watching and listening to their own, licensed media on a home PC and on a phone. Plain,
  active-verb copy; every string lives in `src/content.model.json`.
- **Palette.** Three palettes. The sign-in screen and profile menu use the dark paper palette (paper `#111917`, raised `#182321`,
  ink `#ebefe5`, muted `#91a19a`, accent `#ef825a`, teal `#6bb7a4`). **Music** is dark with colour: background `#090a10`, ink
  `#f6f6fb`, accent `#ff5c8a`, with a backdrop that takes its colour from the cover. **Watch** is every shade of green: background
  `#03110a`, ink `#ecfdf3`, muted `#9bc4ad`, accent `#34e58a`. Liquid glass (`themes/glass.css`) blurs what is behind a pane and
  adds a rim and a corner glow.
- **Measured contrast (WCAG ratios, computed from those tokens on 2026-10-26).** Music: ink on background 18.4, muted 7.7,
  accent 6.7, dark ink on the accent 6.6. Watch: ink 18.3, muted 10.0, accent 11.7, dark ink on the accent 10.2. Sign-in screen
  (same tokens as the dark theme of Study Library): ink 15.3, muted 6.6, accent 6.8. All meet 4.5 for text.
- **Type.** DM Sans (variable) for the interface and DM Mono for small labels, both self-hosted from `@fontsource` packages; the sign-in
  brand name falls back to Georgia. (`@fontsource-variable/fraunces` is installed, and the mobile app uses Fraunces for that name; the
  web CSS does not reference it.)
- **Icons.** lucide, imported only through `src/components/icons.tsx`.
- **Motion.** The same three springs as Study Library and the mobile app (UI-21): `snappy` 0.32 s and 0.86, `smooth` 0.50 s and
  1.00, `bouncy` 0.45 s and 0.70, with mass 1. `pnpm motion:generate` writes them as CSS `linear()` easings into
  `src/themes/motion.css` (with a `cubic-bezier` fallback). Menus, dialogs, the full-screen player and panels leave through
  `src/components/Presence.tsx` (mounted and `inert` until the exit ends); tab groups share a highlight from
  `src/hooks/useSlidingIndicator.ts`; reduced motion removes travel and scale.
- **Structure.** `src` is `@types`, `api`, `components`, `features` (`auth`, `music`, `watch`, `shell`), `hooks`, `pages`, `routes`,
  `themes`, `utils`. `server` is `app.ts`, `index.ts`, `config`, `middlewares`, `routes` and the `auth`, `music` and `watch`
  feature modules. Watch, Music, `/privacy`, `/terms` and not-found are routes on the History API.
- **Design tells present in the approved design** (reported by `pnpm audit:standards`, not removed): gradients, soft shadows,
  many glass panels, a lucide icon set and no skeleton component.

## Themes and the new Music screens (2026-10-26)

The owner asked for a dark and light switch for Music and Watch and for new Music screens, made first on the mobile app and then
ported here. The dark theme is unchanged.

- **Theme.** `App.tsx` keeps the theme (`dark` by default), reads and writes it in browser storage (`cine-music-wave:theme`) and sets
  `data-theme` on `<html>` before paint (`useLayoutEffect`). The account menu has a one-click "Light mode" / "Dark mode" item and
  Settings, Theme sets the same value. The existing sign-in, profile and dialog styles already had a light paper palette under
  `:root`, so they follow it too.
- **Light CSS.** `Music.light.css` and `Watch.light.css` only change colours, under `:root[data-theme='light']`; the dark files are
  untouched. Light Music: page `#f4f4f8`, ink `#14151f`, accent `#d6215d`. Light Watch: page `#eef5f0`, ink `#0b2417`, accent
  `#0b7a42`. Measured contrast on the page (WCAG): Music ink 16.6, muted 5.6, accent 4.5, text on the accent 4.8; Watch ink 14.8,
  muted 5.9, accent 4.9, text on the accent 5.4, warning 5.0. `tests/music/theme.test.ts` reads the stylesheets and fails below AA,
  and pins the dark values. Pictures stay dark in both themes: Watch's poster cards, title page, pop-up card and player re-assert the
  dark `--w-*` palette; the full-screen music player follows the theme (pale and artwork-tinted in light).
- **Phone dock (860 px and below).** `PhoneDock.tsx`: a 56 px round glass button for Home and Your Library (a menu grows out of it;
  Escape and a press outside close it; focus moves into it and back), the mini player as a pill (`MiniPlayer` in `PlayerBar.tsx`) and
  a round Search button. It replaces the bottom tab bar and the old floating mini player. The wide layout is unchanged.
- **Hero pages (phone widths).** `Hero.tsx` and `HeroPages.tsx`: the singer and album pages run the cover edge to edge, fade it into a
  page tinted with the cover's dominant colour (`useDominantColor`, `color-mix` in CSS at 32% dark and 20% light), and pin dark glass
  back and "…" buttons. The "…" menu also offers Start radio (`MenuSource.radio`). The singer page's star saves the singer's radio.
- **Library.** `SectionPills.tsx` (the highlight slides on the snappy spring through `useSlidingIndicator`) and an **All** overview of
  shelves (Playlists, Recently added, On repeat, Singers) whose titles open the full section. `Shelf` can hide its arrows and make its
  title a button; `TrackColumns` and `TrackRow` take `subtitle`, `divider`, `flush` and `peek`.
- **Not done.** Music Moments (needs accounts and a server). Favourite artist, download and add-to-library buttons (no such stores).
  Following the browser's `prefers-color-scheme` (the choice is manual). Hero pages on wide screens.


## Security model

Added 2026-10-26. The rules are in `AGENTS.md` (Section 3, SEC-01 to SEC-52); this is the design record. Evidence is in `SECURITY_VALIDATION.md`.

**Assets.** Entertainment accounts and password hashes, per-account likes, playlists, progress and play history, and access to the owner's media folder (read-only, never copied). **Exposure.** Local by default; `scripts\host-public.ps1` publishes the production build through a Cloudflare quick tunnel, bound to `127.0.0.1`, with registration closed.

| Boundary | What crosses it | Controls |
| --- | --- | --- |
| Browser to server | Cookie, CSRF token, request fields | Scrypt with a password policy (SEC-43); server-side sessions stored as hashes, `HttpOnly`, `__Host-` and `Secure` in production (SEC-28); CSRF token plus exact `Origin` (SEC-26); one error body with no internals (SEC-37); whole-API, sign-in and saving/rescan rate limits (SEC-40); the headers and CSP of SEC-11; the proxy hop is trusted only as loopback (SEC-29) |
| Account to account | Playlist and progress ids | Lookups by id and owner; cross-account attack tests; an export holds one account's rows (SEC-44) |
| Server to media | Ids from the URL | Ids are looked up in the catalog, never used as paths; media must be on `WATCH_ALLOWED_DRIVE`; real paths are resolved and confined; unreadable-catalog errors stay in the log |
| Public address to server | Everything above, from the internet | Registration closed unless `-AllowSignup`; production settings passed as process variables and never written to `.env`; media only to signed-in accounts |

**Decisions and limits.** Accounts are local (no OAuth or e-mail delivery is claimed). Web's `.env` points at Study Library's SQLite file, so one file holds both apps' accounts (open decision, SEC-45). Diagnostics are visible to every signed-in account. `style-src 'unsafe-inline'` stays in the CSP because of the approved design. No breached-password lookup. See `SECURITY_VALIDATION.md` for the rest.
