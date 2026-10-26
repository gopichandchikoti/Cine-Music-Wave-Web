# Future enhancement: online backend, real accounts and remote media

Planning only, October 24, 2026. NOT required for the current offline mobile delivery. No hosting, authentication code, deployment, database migration or account setup was performed by this document. Implement and validate the local Skip Login/Chendu experience first; keep this roadmap separate from current acceptance gates.

## Can Android and iPhone log in?

Yes. Authentication does not have to happen through a browser. A native app sends an HTTPS request to an account API; the server authenticates/authorizes it and accesses its server-side database. The phone must never open the PC's SQLite database over the network. Existing web identity is entertainment-prefixed tables inside a shared local SQLite file, and only the SQLite identity adapter is currently implemented.

The future app needs the real networking/session/auth integration; network reachability alone does not implement login. Until that work exists, Skip Login selects a device-local profile only and grants no remote privileges. Keep local-profile and authenticated-account states separate, and never turn the test profile into a hard-coded server credential or authorization bypass.

## Local development connectivity before public hosting

For an Android emulator, 10.0.2.2 is the standard alias for the host computer's loopback. For this project's current API, an example direct base URL is http://10.0.2.2:4041. Alternatively, an explicit adb reverse mapping can map a device port to a host service. These are networking options, not proof that existing account origin/cookie policies will accept a native client. [Android emulator networking](https://developer.android.com/studio/run/emulator-networking-address).

For a personal phone, localhost means the phone. Use a deliberately configured reachable development endpoint: a trusted LAN address with controlled host binding/firewall, a private tunnel/VPN or an approved HTTPS development tunnel. An iPhone does not use the Android emulator's 10.0.2.2 alias. The current app binds to loopback; do not make it public merely to test login. Keep the database private behind the API.

Inspect current AUTH_PUBLIC_ORIGIN, CSRF/origin enforcement, cookie handling and native HTTP/media-stack behavior before testing. The browser contract includes origin/CSRF requirements; do not solve a native login failure by disabling them globally. Define/test a secure native-client contract or a controlled debug-only configuration when necessary, preserving existing browser security and account isolation. Authentication mechanisms and CORS/origin policies are separate concerns; CORS is not authorization.

Use HTTPS for sensitive traffic. Android cleartext rules and iOS transport security can restrict HTTP. Any unavoidable local HTTP allowance must be narrowly scoped to the development build/host; never ship a blanket cleartext allowance or disable certificate verification. [Android network security](https://developer.android.com/privacy-and-security/security-config), [Express TLS guidance](https://expressjs.com/advanced/best-practice-security/).

## Future hosted topology

~~~text
Web browser / native Android / native iOS
                   |
                HTTPS API
                   |
         +---------+---------+
         |                   |
 private identity/state   authorized server media
 database                  filesystem/object storage
~~~

Prefer the existing same-origin /api shape for Web, with native clients using that HTTPS API's configured base URL. The public API is the sole access boundary; the database, raw storage volumes and PC shares are not exposed. Choose hosting according to persistence, media size, conversion workload and backups rather than assuming a free ephemeral server can host the current PC library.

An online account backend is useful for login, profile management, server libraries and optional sync. It is not needed for offline playback of files already accessible on the phone. Hosting an API does not automatically upload phone files, keep a PC awake or make the G: drive accessible from a cloud host.

## Implementation phases when this enhancement is approved

### 1. Define the online product boundary

Decide whether the first online version provides account/profile only, metadata/progress sync, remote playback of the owner's server library, or explicit user media upload. Keep Device and Server library sources distinct. A playlist reference synced to another device does not mean that device has its media file.

Inventory implemented auth/profile endpoints and native requirements using Web AUTH_SETUP.md, AUTH_VALIDATION.md, server/auth and media route contracts. Do not claim email/OAuth/cross-device progress already works. Record an architecture decision and feature matrix before choosing new services.

### 2. Select deployment and durable storage

A small/private deployment may retain a persistent SINGLE-INSTANCE SQLite identity server with the existing explicit production acknowledgement. Its database must live on a durable writable volume with tested SQLite-consistent backups, not a temporary build filesystem. Keep one selected API writer; never mount one SQLite file across unrelated cloud services or share it directly with phones. The existing Study/entertainment shared-file arrangement is a local deployment choice; any split/export requires an approved migration and rollback plan.

For multi-instance or larger hosted operation, design/implement a PostgreSQL identity repository and migrations, including entertainment identities/sessions/state and compatibility tests. A Supabase/PostgreSQL identity adapter is not presently installed. Do not set an unsupported environment mode and assume it works. Do not introduce a second active identity authority without account-linking/migration design.

Keep media bytes in authorized server storage/private object storage, with metadata in the database. Existing media routes are filesystem-oriented. Remote object storage integration, expiring access and streaming behavior need implementation/testing; copying a service key into the mobile app is never an adapter. Windows G: confinement remains a Windows server boundary; do not copy Windows paths blindly into Linux hosting.

### 3. Configure the actual HTTPS service

Build the existing API/web artifacts using the repository's real scripts. Configure server-only secrets, canonical HTTPS origin, signup policy, trusted proxy IPs and secure session behavior. Configure one domain/origin and TLS termination before testing real credentials. Keep secrets in the deployment's protected configuration, not Git, URLs, client assets or logs. Never bundle the current .env or PC database into Android/iOS builds.

Use OPERATIONS.md for current production prerequisites and SQLite acknowledgement. Add service health/restart/log retention, database/media backup and restore verification. Plan range-based streaming, disk capacity and any FFmpeg conversion resources only if remote playback is in scope. Test codec/container compatibility on target devices rather than assuming desktop conversion behavior is free or identical on phones.

### 4. Implement real native authentication

Implement register/login/logout, session restoration/expiry, profile ownership, password/reset behavior where supported, account deletion/export and multi-account state cleanup against the selected API contract. Choose/test secure session transport: preserve correct cookie-jar/CSRF behavior if reusing sessions, or deliberately implement a documented native token/refresh contract with revocation and focused security tests. Do not assume bearer-token endpoints exist.

Store only the appropriate device-held secrets using Keychain/Keystore; do not store plaintext passwords. Verify that native media requests carry the right authorized session without exposing credentials in stream URLs. Keep browser session protections, generic credential errors, rate limits and server ownership checks. Configure live email/OAuth only with registered provider callbacks/sender credentials and test them as separate capabilities.

Keep Chendu's local test profile local. On first real sign-in, ask explicitly whether to retain local-only state or import supported collections into the real account. Do not silently create an online Chendu identity, upload filenames/artwork, merge accounts or transfer local entitlements. Local mode never authenticates a remote request.

### 5. Add opt-in sync or remote media only when requested

Namespace file references by source/device/account. Define conflicts, retries, idempotency, deletion semantics and unavailable-file states. Keep local playback functional when remote services are down. Metadata sync is not a media upload feature; any upload needs explicit selection, authorization, size limits and storage policy.

For owner-server streaming, the server/media storage must be reachable and online. For cloud hosting, lawful media must be staged in private hosted storage explicitly; existing PC files do not appear automatically. Preserve authorization, byte ranges, progress ownership and clear codec/error states. Never expose the whole G: drive or an unauthenticated static directory.

### 6. Validate and release the online version

Run native tests against a dedicated test environment and account/fixture set. Cover login/session rotation, invalid/expired/revoked sessions, unauthorized cross-account data, CSRF/origin behavior for applicable clients, logout-all, API downtime, device reconnection, protected media ranges and local-mode isolation. Test physical iPhone/Android network access and the actual native player authorization flow. Verify secrets are absent from bundles/logs and restore backups before relying on them.

Record exact commands/results, deployed environment, database/storage choices, tested limits, migrations and rollback/recovery instructions. Deployment/provider account actions, costs and app distribution follow explicit owner approval; this planning document performs none of them. Keep the current offline build working during the enhancement.

## Definition of future completion

A reachable HTTPS API, supported durable identity store, tested native account/session flow, unchanged server authorization, separately validated optional sync/streaming, tested backup/restore and an explicit local-to-account policy. An API URL in configuration or an open login screen alone is not completion.

## Current handoff link

For today's implementation requirements use [MOBILE_REPLICATION_GUIDE.md](MOBILE_REPLICATION_GUIDE.md), [MOBILE_AGENT_PROMPT.md](docs/legacy/MOBILE_AGENT_PROMPT.md) and [MOBILE_AGENTS_TEMPLATE.md](docs/legacy/MOBILE_AGENTS_TEMPLATE.md). Their offline-only acceptance gates take precedence until online enhancement is explicitly started.
