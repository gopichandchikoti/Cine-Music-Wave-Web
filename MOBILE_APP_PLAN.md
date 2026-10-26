# Cine Music Wave: Android and iOS implementation plan

Planning date: October 24, 2026. Status: proposed architecture, not implemented. The goal is the same Watch/Music product on web and phones, with authorized on-device media discovery, organization and playback.

## Current delivery scope (latest requirement)

The mobile implementation is offline only for now: bottom-of-login Skip Login selects persistent local profile Chendu and opens Home without backend/authentication. Use actual permitted device media and local SQLite state. This does not create a server account or bypass OS permissions. Connected authentication/hosting is future work in [FUTURE_ONLINE_BACKEND_PLAN.md](FUTURE_ONLINE_BACKEND_PLAN.md). Follow [MOBILE_REPLICATION_GUIDE.md](MOBILE_REPLICATION_GUIDE.md) for full execution/acceptance requirements; do not modify the Web app login.

## Recommendation and tradeoff

For a device-media player intended to grow with reliable offline/background playback, use one React Native mobile app for Android and iOS, sharing pure TypeScript business logic, contracts, design tokens and test fixtures with the current web app. Render native mobile screens and use native platform media services. Do not rebuild categorization, queue rules and product behavior independently.

React Native uses native components rather than the browser DOM. Existing CSS, HTML audio/video elements and browser-specific hooks do not become native screens unchanged. Recreate the current design on mobile; equivalent appearance and behavior is the target, with necessary permission and system-player differences. This costs more UI work than a hybrid app. React Native still requires some Android/iOS-specific code.

If an unchanged HTML/CSS UI and minimum duplicate UI maintenance are the overriding requirements, use Capacitor with bundled web assets plus native media plugins instead. This is a legitimate production architecture, but it retains a WebView. A React Native shell containing only a WebView adds another framework without removing the web dependency. A WebView with comprehensive native adapters can support local media; merely loading localhost:4040 or a hosted URL cannot provide the requested device scanner and background player.

| Option | UI reuse | Device media work | Fit |
| --- | --- | --- | --- |
| Hosted web page in a basic WebView | High | Missing unless native bridge is added | Useful for a server-library viewer, insufficient as the proposed local player |
| Capacitor plus native plugins | Very high | Native discovery, permission and playback adapters still required | Best if exact web UI reuse is the priority |
| React Native plus shared core | Shared rules/design; mobile screens rebuilt | Native adapters plus native UI | Recommended for local-first media and no WebView requirement |

This recommendation is a product/engineering judgment, not a claim that native rendering alone guarantees performance or store approval.

## What device discovery can actually do

### Android

After an explanation and permission grant, query MediaStore.Audio and MediaStore.Video for accessible indexed shared media. Use the required permissions for the device/target Android version: READ_MEDIA_AUDIO and READ_MEDIA_VIDEO on applicable modern versions; older-version handling must be explicit. Support denied, revoked and limited visual-media access. Video-library access may require Google Play policy review; do not assume full-library access will be granted.

Android does not expose every private app folder. Supplement MediaStore with user-selected files/folders through the Storage Access Framework, retaining URI grants where supported. Use content URIs rather than assuming filesystem paths. Exclude ringtone/notification/system collections by default and offer an inclusion preference. Do not request unrestricted all-files access for routine media playback. [Android shared-media documentation](https://developer.android.com/training/data-storage/shared/media).

### iOS

There is no permission that authorizes a recursive scan of the entire iPhone. The initial flow must offer Files imports or user-selected directories. Access outside the app container is granted through system pickers and security-scoped URLs; retain access using supported bookmarks and recover gracefully from stale/revoked access. Some providers or cloud files require download or re-selection. A folder grant is not access to unrelated folders. [Apple directory access](https://developer.apple.com/documentation/uikit/providing-access-to-directories).

Treat optional Music-library integration and optional Photos-video access as separate permission-backed sources. They do not expose every downloaded file. Distinguish local playable files from unavailable/cloud/protected media; do not promise Spotify/Apple Music subscription downloads can be scanned as ordinary files. [Apple media asset URLs](https://developer.apple.com/documentation/mediaplayer/mpmediaitem/asseturl), [protected assets](https://developer.apple.com/documentation/mediaplayer/mpmediaitem/hasprotectedasset).

Consequently, the shared promise is: organize and play media the operating system has allowed the app to access. The discovery onboarding must differ by platform.

## Target structure and reuse (updated October 24, 2026)

The latest user request supersedes the earlier in-web mobile/ workspace proposal. Create a separate sibling folder Cine Music Wave Mobile. Rename existing cine-music-wave to Cine Music Wave Web during the future implementation task. Installed app/display name remains Cine Music Wave. Remote-safe slugs are cine-music-wave-mobile and cine-music-wave-web. No rename or scaffold was performed in this documentation update.

Mobile must build independently. Reuse audited pure TypeScript logic through provenance-recorded copies initially or an explicitly versioned package later; never import runtime files/node_modules from sibling Web. Recreate native rendering/discovery/playback adapters rather than copying browser/Node code unchanged. Preserve the working web structure and Study repository.

The complete execution specification, source map, standards, emulator setup, fixture tests and iPhone signing options are in [MOBILE_REPLICATION_GUIDE.md](MOBILE_REPLICATION_GUIDE.md). Its latest requirements supersede earlier milestones here. First Android validation uses an emulator because the owner currently has an iPhone, not a physical Android test device. Track hardware-only checks as explicit later gaps rather than blocking Android delivery.

## Delivery phases and acceptance gates

### 1. Prove device discovery and playback first

Build a small native integration spike before copying all screens. On the requested Android emulator (physical-Android follow-up is optional hardware validation): request access, enumerate accessible songs/videos, extract metadata/artwork and play both. On one real iPhone: select/import files or a folder, restore permitted access after relaunch and play both. Test locked-screen audio and offline startup.

Gate: demonstrate accessible local media on both platforms without the PC server. Select maintained, compatible and appropriately licensed React Native media modules only after testing local URIs, seeking, playlists, events and background behavior. Use custom Kotlin/Swift adapters if essential capabilities are missing. Do not install a generic file library and assume it supplies MediaStore or iOS library access.

### 2. Extract the shared catalog rules

Define one normalized record: source type, device/source identity, provider locator, display title, artists, album/movie/series, season/episode, duration, artwork reference, format, availability and timestamps. Keep locators private and separate from user-facing labels. Use composite device/source IDs; the existing desktop path-derived IDs must not collide with phone files. Optional content matching can come later without hashing every large video at launch.

Read embedded tags where available, then apply the same filename/grouping fallbacks as the web app. Preserve an Unknown grouping when tags are absent; genre/language/cast cannot always be inferred accurately from a filename. Scan incrementally in batches, cache thumbnails/metadata, expose progress/cancel and reconcile moves/removals. Avoid heavy work on the UI thread or full rescans on every launch.

Gate: shared fixtures produce equivalent group/search/queue results on web and mobile; large libraries remain usable while indexing.

### 3. Add phone-local persistence and permissions UX

Use app-private SQLite for the phone catalog, playlists, likes and playback state. Persist granted source handles/bookmarks where supported; never treat a remembered path as renewed permission. Keep an explicit rescan/reconnect action and empty/denied/limited/unavailable states. Files remain in place where possible; import copies only when required or explicitly chosen.

Proposed local-first behavior: local discovery and playback work without internet or a PC, with account sign-in reserved for remote features/sync. This requires a deliberate product change from the current account-gated web shell; it is not existing functionality. Local device access is governed by OS permission, while remote API access still requires server authorization.

Gate: airplane-mode startup, persistence after restart and permission revocation all behave correctly without deleting original media.

### 4. Implement the native playback engine

Use Android Media3 with a media session/service for audio background playback and controls. Use iOS AVPlayer/AVAudioSession with supported background audio and Now Playing/remote commands. React Native controls the same queue through typed playback events. Configure system audio focus, interruptions, headset disconnects, Bluetooth and lock-screen actions. [Android background playback](https://developer.android.com/media/media3/session/background-playback), [Apple audio sessions](https://developer.apple.com/documentation/avfaudio/avaudiosession).

Port progress, resume, shuffle/repeat and Music/Watch mutual playback behavior. Add fullscreen/orientation, subtitles and applicable audio-track controls. A phone player does not inherit the desktop FFmpeg fallback: unsupported formats need a clear unavailable state or an explicitly connected server conversion path. Do not bundle a codec/transcoding stack without evaluating build maintenance, size, battery and licensing. Local-only playback must not silently become dependent on the PC.

Gate: playback survives screen lock and normal backgrounding, controls stay synchronized, seeking/resume works and unsupported media fails clearly. Do not promise playback after the user force-stops the app.

### 5. Recreate the current screens and visual system

Implement Watch home/sections/search/details/player and Music home/search/library/album/artist/playlist/queue/Now Playing with native components. Reuse colors and layout rules through tokens; reproduce glass styling with supported native effects and readable fallbacks. Maintain touch targets, accessibility, safe areas, reduced motion and tablet/landscape behavior.

Use paired web/mobile screenshots and a feature checklist for every screen. DOM/CSS and native text/layout rendering will differ; exact pixel equality across devices is not a realistic acceptance condition. Treat performance-heavy effects as optional enhancement.

Gate: equivalent navigation and product behavior, with documented platform-only discovery steps. A shared core prevents duplicated business rules, but two rendering layers still need tests and coordinated changes.

### 6. Defer online accounts and server-library access

No hosted backend or server login is required for the current mobile delivery. Implement Skip Login/local Chendu profile, offline OS-approved discovery and playback first. Connected accounts, remote streaming and optional synchronization are future enhancements described in [FUTURE_ONLINE_BACKEND_PLAN.md](FUTURE_ONLINE_BACKEND_PLAN.md); do not implement or test them as a completion gate now.

### 7. Validate parity on real devices

Keep current Playwright/web checks. Add shared-core unit fixtures and native device automation (select a suitable tool after the spike). Browser tests alone cannot prove native permissions, OS background audio or lifecycle behavior.

Cover fresh install, permission denial/revocation, partial access, empty library, large library, duplicate/missing tags, deleted/moved files, SD-card changes on applicable Android devices, iOS picker/bookmark restoration, cloud files offline, airplane mode, screen lock, interruptions, Bluetooth, seeking, subtitles, orientation, local-profile exit/re-entry and process relaunch. Connected-account changes are future online validation. Benchmark indexing on actual device fixtures rather than declaring an unmeasured performance target.

Current delivery gate: the bundled Android APK passes the requested emulator matrix, including Skip Login and offline playback. Run signed physical-iPhone checks when provisioning is available; otherwise document the exact external blocker without delaying independent Android work. Later physical-device/release validation covers signed internal/TestFlight builds and hardware-only checks. Document unsupported codecs/features.

### 8. Release and maintain one product

Build/install an Android development APK first; use signed release artifacts for distribution. iOS native builds require Xcode on macOS, locally or on a macOS build service, plus appropriate signing/device provisioning. The current Windows workstation alone does not compile the iOS native target. [React Native iOS device setup](https://reactnative.dev/docs/next/running-on-device.html).

Keep common feature rules in shared packages and run web/mobile parity checks on changes. Maintain separate platform release artifacts and permission/privacy declarations. Audit the selected mobile packages, codecs, artwork/fonts and media provenance before distribution; the web dependency inventory does not cover libraries not yet selected.

## First implementation milestone

Start with the discovery/playback spike for Android and iOS, then continue through the complete offline implementation and Android emulator acceptance in MOBILE_REPLICATION_GUIDE.md. Do not stop at a spike. Begin with the shared record contract and a minimal permission/import screen. Resolve real-device access and background-playback uncertainty before investing in full visual recreation. Proceed to shared-core extraction and screen parity once that gate passes. No fixed delivery estimate is asserted before the spike identifies library, codec and hardware constraints.
