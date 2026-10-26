# Authentication setup

Cine Music Wave uses the copied account system with scrypt password hashing, server-side sessions, CSRF protection, login limits, account profiles, password changes and account deletion/export.

The configured local identity store is SQLite. PERSONAL_DB_PATH points to the same file as Study Library, but every new table/index has an entertainment_ prefix. Credentials and sessions are independent. No Study account is imported or modified. The session cookie is cine_music_wave_account; CSRF and OAuth cookies use the same app prefix.

Use Create an account on http://localhost:4040. The local .env has AUTH_MODE=accounts, AUTH_PUBLIC_ORIGIN=http://localhost:4040 and a generated server-only AUTH_SESSION_SECRET. Never print or commit that secret. The browser uses only same-origin /api requests.

Live email is unavailable until RESEND_API_KEY and AUTH_EMAIL_FROM are configured. Password recovery and email verification are honestly marked unavailable without delivery. Do not assume OAuth works until registering separate provider callbacks under /api/auth/oauth/PROVIDER/callback for this app's configured origin and setting the matching provider environment variables. Production requires HTTPS, a stable secret, AUTH_SIGNUP_ENABLED=true when public signup is intended, and explicit persistent single-instance SQLite acknowledgement. A PostgreSQL/Supabase identity adapter has not been added.

See VALIDATION.md for actual tests and limits.
