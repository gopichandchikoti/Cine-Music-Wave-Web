# Cine Music Wave Mobile: implementation handoff

Updated October 24, 2026. Execution specification for a NEW agent. This guide's author changed documentation only: no folder rename, mobile scaffold, Git operation, SDK/emulator installation or device installation was performed.

## Current delivery: offline testing with Skip Login

Latest requirement: implement the mobile app OFFLINE ONLY for this delivery. Authentication, hosted services, remote PC media and synchronization are future enhancements in [FUTURE_ONLINE_BACKEND_PLAN.md](FUTURE_ONLINE_BACKEND_PLAN.md). No backend setup or successful server login is an acceptance prerequisite.

On the native login/welcome page, put an accessible button labeled **Skip Login** at the bottom, with supporting text **Continue offline as Chendu**. It must remain reachable with the keyboard open and on small screens. It must work without filling fields, credentials, network connectivity or a running PC. Any currently unavailable sign-in/register action must be disabled or explain that online sign-in is planned; do not show fake successful authentication. Do not start an authentication/config/session request just to render this screen.

One tap selects or creates a stable device-local profile (for example ID local-test-chendu, display name Chendu) and immediately opens the normal home with only Watch and Music. Start on Watch for a new profile, then remember the selected mode. Identify the profile as Local/offline; the requested personal name is allowed ONLY for this test profile, not product/repository branding. Returning launches may restore this selected local profile and saved mode. Provide a Return to login/Switch profile action that clears the active selection and stops playback without deleting media or saved collections; no server logout request is required.

This is local profile selection, not authentication: create no remote account, password, token, cookie, server role, entitlement or PC database row. Model local-profile state separately from server-authenticated state. Do not set authenticated=true as a shortcut into remote routes. The profile can use accessible DEVICE media only; it has no privileged access to PC films or private app folders. Existing web/server authentication stays unchanged and protected. Keep a future real-account identity distinct; no automatic merge/upload of Chendu's local state.

After navigation to Home, show a clear Grant media access/Add files flow. Skip Login never skips OS permissions. Android discovers actual permitted MediaStore audio/video; iOS uses selected Files/folders or explicitly supported local library access. Read local tags/artwork and group by the existing rules, with Unknown/fallback artwork where data is missing. No demo catalog masquerading as scanned device files and no assumption that the PC library exists on a phone. Emulator test media must be copied into shared storage and indexed as specified below.

Store catalog, playlists, likes, queue and progress in app-private device SQLite scoped to the local profile. Use bundled assets and local metadata/artwork/lyrics. No server requests, streaming, metadata downloads, analytics or uploads are needed in this mode. Radio/mix/recommendation behavior may use the current LOCAL catalog/history; any feature that truly needs an online source must be marked deferred in FEATURE_PARITY.md, not silently fetched or faked. Unsupported codecs and non-downloaded cloud files need an honest unavailable state. Do not change/delete originals on scanning, profile exit or application-state reset.

Required tests in addition to the existing native matrix:

- Fresh install of a bundled APK, Metro stopped, backend stopped/unreachable and network disabled: the login page loads; Skip Login is available and opens Home in one tap without login errors.
- Chendu is shown as a local profile, while app branding remains Cine Music Wave. Entering local mode performs no authentication/API request and changes no server database. Native backend/auth clients must not be initialized by this flow; observe/test that boundary.
- Permission denial/revocation/partial grants remain enforced after skipping login. Scan only actual accessible files and handle an empty device honestly.
- Seeded real shared-media fixtures are indexed, categorized and played, with advancing time and usable controls. Persist likes/playlists/queue/progress/mode/profile across relaunch.
- Return to login stops playback without deleting originals or saved local state; Skip Login restores the same local profile rather than duplicating it.
- Remove only a verified test file/revoke its permission; show unavailable state. No PC catalog, network fallback or unauthorized files appear.
- Validate iOS local import/playback on the signed iPhone when available; retain the documented signing blocker if not. Neither platform's offline work waits for online account implementation.

## Objective and required inputs

Build the complete React Native Android/iOS Cine Music Wave app with native screens and media playback, only Watch and Music, and the existing product's behavior/design. No React Native WebView containing the website. Finish Android installation, launch and real local-media tests in ONE emulator. Prepare iOS functionality and install/test a signed iPhone build when build/signing access is available.

This guide plus the FULL current web source is the implementation source of truth. MIGRATION_SUMMARY.md and MOBILE_APP_PLAN.md explain intent but cannot recreate the application alone. The new agent needs filesystem access to existing source, including uncommitted/untracked feature files. Do not assume Git HEAD contains everything or invent missing features from screenshots.

Read in order:

1. This guide and MOBILE_AGENTS_TEMPLATE.md.
2. Original Study-entertain-library/AGENTS.md; current web FEATURE_LOG.md and system_design.md.
3. Web MIGRATION_SUMMARY.md, MOBILE_APP_PLAN.md, VALIDATION.md, AUTH_SETUP.md and LICENSE_REVIEW.md.
4. Current feature implementations, callers and tests mapped below.
5. Study-entertain-library/replication_guide.md and CHAT_BOOTSTRAP.md for reconstruction workflow background. Optional legacy bundles include replication_source_web.md and REPLICATION_SOURCE_ANDROID.md. They reconstruct an older Study/WebView app: do not unpack them over the new native project or inherit obsolete ports, toolchains, LIBRARY_URL, Study routes or WebView architecture. Filenames are case-correct; system_design.md is the current architecture file.

Latest user requirements below supersede the older plan's in-web mobile/ workspace suggestion.

## Names and folder operations

Parent: E:\New repos for portfolio

Current state:

~~~text
Study-entertain-library\    original application; preserve files
cine-music-wave\            current entertainment web project
~~~

Requested final local folder/display names:

~~~text
Study-entertain-library\    unchanged
Cine Music Wave Web\        rename current cine-music-wave folder
Cine Music Wave Mobile\     NEW standalone React Native project
~~~

Both installed apps and the website display Cine Music Wave. Web/Mobile distinguish repositories only. Remote-safe slugs: cine-music-wave-web and cine-music-wave-mobile. Do not add the owner's personal name to product/repository branding. The explicit offline test profile display name Chendu is the sole requested exception. Internal native identifiers must be valid identifiers, such as CineMusicWave; package.json can use cine-music-wave-mobile. Select/record valid Android/iOS application IDs without claiming registration/availability.

The IMPLEMENTING agent may create Mobile and perform the requested Web-folder rename. Inspect paths first. Preserve all existing/untracked files and any Git metadata the owner has since created. If a destination exists, inspect/continue it without overwriting. Leave Git initialization/remotes to the owner unless separately authorized.

Before renaming Web, identify and stop ONLY its development processes. Verify absolute source/destination within the named parent; use native file operations with literal paths. Restart web 4040/API 4041 from the renamed folder, verify health and correct only path-dependent references. Preserve secrets/database location and do not print .env. Do not modify or stop unrelated Study work. Quote paths with spaces; document any proven build-tool path limitation and a safe build-staging solution while retaining canonical folders.

## Source inventory and behavior map

Create Mobile SOURCE_REFERENCE.md: actual source root, revision if available, relevant working-tree hashes, selected dependency/tool versions. Exclude secrets/private filenames. Inventory current screens/controls before coding. Use the running Web UI and screenshots when available; historical web tests do not prove native correctness.

Paths below are relative to the entertainment Web project:

| Responsibility | Inspect |
| --- | --- |
| Shell/accounts | src/App.tsx; src/AppRoot.tsx; src/api.ts; src/features/auth/ |
| Music behavior | src/features/music/musicTypes.ts; musicModel.ts; queue.ts; musicNav.ts; MusicProvider.tsx; engine.ts |
| Music screens | src/features/music/MusicView.tsx; HomePage.tsx; SearchPage.tsx; LibraryPage.tsx; DetailPages.tsx; NowPlaying.tsx; PlayerBar.tsx; MenuLayer.tsx |
| Watch behavior/player | src/features/watch/watchTypes.ts; watchModel.ts; WatchView.tsx; Player.tsx; TitleDialog.tsx; captions.ts; picture.ts; soundCheck.ts |
| Metadata/grouping | server/music/metadata.ts; server/watch/filename.ts; server/watch/catalog.ts |
| Remote contracts | src/features/music/musicApi.ts; src/features/watch/watchApi.ts; server/music/routes.ts; server/watch/routes.ts; server/auth/ |
| Visual reference/copy | src/Music.css; src/Watch.css; src/Glass.css; src/Entertainment.css; src/content.model.json |
| Fixtures/evidence | tests/music/; tests/watch/; tests/auth/; tests/e2e/parity.spec.ts; VALIDATION.md |
| Provenance | LICENSE_REVIEW.md; THIRD_PARTY_NOTICES.txt |

HTMLAudioElement, CSS/DOM hooks, localStorage, Node fs, Express, node:sqlite and FFmpeg subprocesses are not native implementations. Port their behavior behind adapters. Desktop G: confinement does not belong in phone discovery.

## Architecture and coding standards

Use React Native + strict TypeScript and a custom development build. Expo development-build/prebuild is acceptable with required Kotlin/Swift integrations; plain React Native is acceptable when justified. Expo is not a WebView. Expo Go alone cannot validate custom scanner/background modules. Check maintained library capabilities/licenses, verify compatibility and pin resolved versions. Do not drop features because a convenience package lacks them.

Create an ACTUAL mobile-root AGENTS.md from MOBILE_AGENTS_TEMPLATE.md; a template in Web is not automatically applied to its sibling. Create README.md, FEATURE_LOG.md, system_design.md, OPERATIONS.md, SOURCE_REFERENCE.md, FEATURE_PARITY.md, VALIDATION.md, ANDROID_SETUP.md and IOS_SETUP.md. Use pnpm and verified configured scripts. Keep pure rules, native scanning/playback/storage, UI, accounts and optional sync separated.

Suggested layout: src/core, src/features/music, watch and auth, src/platform adapters and src/design tokens, plus native modules in toolchain-supported locations. Mobile must build without runtime imports or node_modules from ../Cine Music Wave Web. Initially vendor audited pure logic with provenance and matching fixtures; use a properly versioned shared package later if warranted. Do not restructure the working Web app into a monorepo.

Define typed MediaSource (permissions/enumeration/changes), CatalogRepository, PlaybackEngine, optional AccountService and future SyncService. Validate/bound all metadata, picker/provider/bridge input and parsing. Parameterize SQL. Preserve explicit loading/empty/denied/limited/unavailable/error/success states, accessibility and reduced motion. Avoid any, unsafe casts, unhandled promises, debug logs, dead controls and suppression-only fixes.

## Functional scope

Android: query accessible MediaStore.Audio/Video with version-appropriate permissions, including applicable mounted shared volumes. Support denial/revocation/partial access and selected-file/folder fallback. No unrestricted all-files workaround or private-app directory scan.

iOS: Files imports/user-selected folders with supported security-scoped access restoration. Optional authorized Music-library and Photos-video sources are separate. No whole-iPhone scan; cloud files may be unavailable offline and protected subscription downloads are not ordinary media files.

Read tags/artwork/duration, then reuse existing normalization and filename grouping. Keep Unknown when metadata cannot justify album/artist/genre/language/cast/episode inference. Batch scanning, show progress/cancel, cache metadata and reconcile changed/deleted files. Generate device/source-scoped IDs. Never modify original files/tags as an indexing side effect.

FEATURE_PARITY.md must inventory EVERY actual web capability, with native implementation/tests or explicit platform limitation. Include Watch sections/search/details/list/progress/resume, Music home/search/library/albums/artists/likes/playlists/queue/Now Playing, and easy-to-miss shuffle/repeat, queue reorder/play-next, radio/mixes/autoplay, sleep timer, crossfade, lyrics, subtitles/audio tracks, fullscreen/orientation and picture/sound controls. Do not silently omit features, ship fake controls or claim desktop FFmpeg fallback works natively.

Use native playback: Android Media3/media session/service and iOS AVPlayer/AVAudioSession with supported background audio/remote commands. Handle lock-screen, Bluetooth, audio focus/interruption and headset removal. Document codec limitations and honest errors. Local media must work offline without the PC; final acceptance requires an APK with bundled JavaScript, not only a Metro-dependent debug client.

Recreate existing colors, two modes, hierarchy/cards and glass aesthetic in native components. Support safe areas, touch, accessibility, reduced motion, landscape/tablets. Equivalent behavior is required; OS permission flows and native text rendering will differ.

Current scope is the device-local Chendu profile and storage described above. Do not implement connected account/session/streaming adapters as a requirement for this delivery or bypass current server authorization. API-backed login, secure remote sessions and online data contracts belong to FUTURE_ONLINE_BACKEND_PLAN.md. Phones never open the PC's database directly, and no secrets belong in the app.

## Android tooling WITHOUT Android Studio

Do not install Android Studio, its IDE, a Samsung desktop suite or unrelated emulators. Discover/reuse installed compatible Node/pnpm/JDK/Android tools first. Requirements come from the chosen pinned React Native/Expo/Gradle combination, not old replication bundles.

An emulator is not self-contained. Install only missing official SDK management tools, platform-tools/adb, emulator, ONE suitable system image, selected compile SDK/build-tools and native build components actually required by the project. Use official downloads, verify published integrity information where provided and record versions/locations/disk requirements. Check hardware acceleration before large downloads. Enabling Windows virtualization or rebooting is a separate system action requiring applicable authorization.

At research time Android docs mark sdkmanager/avdmanager deprecated in favor of Android CLI android sdk / android emulator. Use installed --help and current official syntax; compatible existing legacy tools may be reused. Do not hard-code nonexistent image/API/profile IDs.

Create ONE AVD named CineMusicWave_TestPhone. Prefer an available Pixel 10/Pixel 10 XL family profile. List real profiles/images first; if absent, use a supported Pixel/generic large-phone profile, record the substitution/screen characteristics and continue. A renamed generic AVD is not validated Pixel hardware; an AOSP emulator does not reproduce Samsung S25 Ultra/One UI. Do not download unofficial Samsung images or block completion on a marketing model.

Record selected API, architecture, image package and profile. Use a host-compatible accelerated image. Preserve normal AVD data between runs; do not wipe media/state without cause. The emulator is the visible interactive helper the owner requested; run background build/Metro helpers hidden.

Example stable diagnostics/installation commands, adapted to discovered paths, serial and generated artifact:

~~~powershell
emulator -accel-check
emulator -list-avds
emulator -avd CineMusicWave_TestPhone
adb devices
adb -s <actual-serial> wait-for-device
adb -s <actual-serial> shell getprop sys.boot_completed
adb -s <actual-serial> reverse tcp:8081 tcp:8081
adb -s <actual-serial> install -r "<actual-APK-path>"
~~~

Use the toolchain's actual build/run commands/activity IDs. Emulator localhost is not the PC; connected-mode tests need the appropriate host alias or explicit adb reverse mappings. Do not casually expose the Web server to the network.

## Seed actual local media and prove OS discovery

The owner authorizes copying a SMALL sample of existing owner-authorized audio into the emulator. Resolve configured media sources without printing secrets. Do not copy the entire G: drive. Select a few small representative songs (album/artist tags, missing tags, Unicode name if available). Keep an ignored local fixture manifest with source hashes and sanitized destinations; no private media/source paths in Git, public screenshots or cloud build uploads.

Push to shared media storage so tests exercise the real OS scanner, not prefilled app rows:

~~~powershell
adb -s <actual-serial> shell mkdir -p /sdcard/Music/CineMusicWaveTests
adb -s <actual-serial> push "<authorized-source-song>" /sdcard/Music/CineMusicWaveTests/wave-sample-01.mp3
~~~

adb push alone does not prove indexing. Request MediaStore indexing through a supported media scan, such as a narrowly scoped MediaScannerConnection call used by the test import flow, or a verified system scan mechanism. Confirm actual media records before testing categorization. Do not insert fake catalog data or substitute private app imports for this shared-library test.

Add a SMALL authorized video or generated synthetic video for Watch; do not copy a multi-gigabyte film just to test launch. Add lyrics/caption fixtures for relevant checks. Preserve source files. Remove only verified emulator test copies if cleanup is needed.

## Execution sequence and acceptance gates

1. Inventory sources/features; establish naming, tooling versions and mobile AGENTS.md. Safely rename/restart Web and verify 4040/4041 without changing Study.
2. Prove native Android media discovery/background playback and iOS picker/playback adapter capability before building every screen. Do not stop after this spike.
3. Implement portable rules/fixtures, local SQLite, permissions, Skip Login/local profile, full offline feature screens and native playback adapters. Defer connected accounts to the future online plan. Maintain FEATURE_PARITY.md throughout.
4. Build an actual Android APK, boot the ONE AVD, install/launch, seed media and test the real product. Fix failures and rerun affected checks.
5. Prepare iOS source/signing/install instructions and execute the iPhone route when access permits. Finish independent Android work even if signing/Mac access is blocked.
6. Deliver artifacts, working emulator, reproducible commands, reports, docs and exact remaining limitations.

A scaffold, successful compilation, mocked catalog, Metro landing screen or screenshot of Home is not completion. Use a configured native UI automation runner suitable for the chosen stack (for example Maestro/Appium or supported platform tooling). Do not invent script names. Web Playwright/shared fixtures help with parity but cannot prove native permissions, MediaStore, background playback or lifecycle.

Mandatory Android evidence:

| Check | Required result |
| --- | --- |
| Install/launch | App displays Cine Music Wave; bottom Skip Login opens Home as local Chendu without server/credentials; only Watch/Music modes |
| Permission lifecycle | Explain/deny/allow/revoke/limited states and rescan/reconnect work |
| Shared discovery | Pushed songs appear through actual indexed media records with correct tag/fallback grouping |
| Playback | Tap discovered song; native time advances; pause/resume/seek/next/previous and queue settings work |
| Persistence | Likes/playlist create/rename/edit and progress survive restart; missing files remain honest |
| Product parity | Each inventoried web feature has a working native equivalent/test or an explicit supported-platform limitation |
| Watch | Real small video, seek/resume, fullscreen/landscape and supported captions/audio controls |
| Background | Lock/background audio continues; system controls and supported interruption tests work |
| Offline | APK bundles JavaScript; stop Metro AND backend, disable network, cold-launch, Skip Login and verify discovery/playback with no API/auth request |
| Unavailable files | Revoke access/remove only test copies; app handles it without damaging other media |
| Visual/native checks | Phone/landscape screenshots, touch/accessibility/reduced motion and relevant crash logs inspected |
| Tool checks | Actual configured type/lint/unit/native checks pass; logs show versions/exit codes and fixture counts |

Save APK path, signing status, native automation sources, screenshots/reports and repeatable fixture/clean-install procedure. Keep sensitive artifacts ignored. Do not publish release keys. Physical Bluetooth/hardware checks that an emulator cannot reproduce must be labeled pending, not passed. Historical web test counts cannot be reused as mobile evidence.

## Installing on the owner's iPhone

An iPhone connected to Windows does not compile/sign this custom native app. Android APKs and unsigned IPAs do not install as iOS apps. Choose a supported route:

- Mac + Xcode: install native dependencies, build/sign with the owner's Apple account/team, connect/trust the iPhone, enable Developer Mode when required and run on the selected device. Eligible personal-team local testing has limits; paid membership is needed for some capabilities/distribution. Record actual signing constraints.
- Windows development + macOS cloud build: use a compatible custom React Native/Expo development-build workflow and an authorized macOS build service. The documented EAS physical-device route requires active paid Apple Developer Program membership plus device registration/provisioning. Install the correctly signed registered-device build using its supported link, or use the separate proper TestFlight upload/distribution process. No owner passwords/private signing keys in chat or Git.

Expo Go can preview supported JavaScript screens but cannot prove custom native scanners/background modules. Do not substitute it for this app. Cloud accounts/signing can require owner access, approval or costs; document the exact blocker while finishing independent Android work. Once installed, test real iPhone Files import/access restoration, offline files, screen-lock audio and interruptions. Simulators do not replace physical-iPhone evidence.

## Completion deliverables and boundaries

Deliver standalone Mobile source/lockfile, actual root AGENTS.md, SOURCE_REFERENCE.md, FEATURE_PARITY.md, operating docs, native modules/configuration, working Android APK installed in the single emulator, seeded-media evidence and restart/test commands. Deliver iOS source/build configuration and actual install/test evidence OR exact external signing/Mac blocker. Restore the renamed Web app on 4040; preserve Study source/data.

Do not initialize Git/remotes, publish apps, upload private media, overwrite credentials, wipe user data or change system virtualization without applicable authorization. Proceed with authorized implementation/tests and necessary Android tooling through the environment's approval mechanism. Complete unaffected work before reporting an external blocker. Never describe Android completion as full iOS validation.

## Official references checked October 24, 2026

- [SDK management / CLI transition](https://developer.android.com/tools/sdkmanager)
- [AVD management / CLI transition](https://developer.android.com/tools/avdmanager)
- [Emulator launch](https://developer.android.com/studio/run/emulator-commandline)
- [Hardware acceleration](https://developer.android.com/studio/run/emulator-acceleration)
- [Android media access](https://developer.android.com/training/data-storage/shared/media)
- [Android background media](https://developer.android.com/media/media3/session/background-playback)
- [React Native modules](https://reactnative.dev/docs/turbo-native-modules-introduction)
- [Expo custom development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo physical iOS signing/build](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/)
- [Apple account/device testing](https://developer.apple.com/help/account/basics/about-your-developer-account/)
- [iOS directory access](https://developer.apple.com/documentation/uikit/providing-access-to-directories)

Recheck versions/compatibility/setup syntax at implementation time. A dated handoff is not a requirement to install obsolete tools.
