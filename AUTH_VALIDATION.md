# Cine Music Wave authentication validation

See VALIDATION.md for the final local run. Copied security fixtures cover hashing, session rotation/revocation, CSRF/origin checks, profile ownership, recovery tokens, provider response validation and login races. The extraction adds a migration-isolation test verifying existing identity tables and rows remain unchanged.

Playwright exercises real local signup, login/logout, separate-account data isolation, saved media state and touch account controls. It uses temporary accounts with random passwords, then deletes those accounts. No default credentials are provided.

Live OAuth consent, email delivery, multi-replica identity, public HTTPS deployment and native Android/iOS wrappers have not been validated.
