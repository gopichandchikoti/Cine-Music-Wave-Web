PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS entertainment_auth_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS entertainment_users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 username TEXT NOT NULL COLLATE NOCASE UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
 phone_number TEXT, avatar_path TEXT, avatar_blob BLOB, password_hash TEXT,
 email_verified_at TEXT, disabled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS entertainment_auth_identities (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 provider TEXT NOT NULL, provider_subject TEXT NOT NULL, provider_email TEXT, created_at TEXT NOT NULL,
 UNIQUE(provider,provider_subject), UNIQUE(user_id,provider)
);
CREATE TABLE IF NOT EXISTS entertainment_auth_sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL, revoked_at INTEGER, reauthenticated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS entertainment_auth_tokens (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('email_verify','password_reset')), token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL, consumed_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS entertainment_auth_settings (
 user_id TEXT PRIMARY KEY REFERENCES entertainment_users(id) ON DELETE CASCADE,
 theme TEXT NOT NULL DEFAULT 'dark', reading_scale TEXT NOT NULL DEFAULT 'standard'
);
CREATE TABLE IF NOT EXISTS entertainment_auth_audit (
 id TEXT PRIMARY KEY, user_id TEXT REFERENCES entertainment_users(id) ON DELETE SET NULL,
 event TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS entertainment_auth_sessions_user_idx ON entertainment_auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS entertainment_auth_sessions_expiry_idx ON entertainment_auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS entertainment_auth_tokens_user_idx ON entertainment_auth_tokens(user_id,purpose);
CREATE INDEX IF NOT EXISTS entertainment_auth_tokens_expiry_idx ON entertainment_auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS entertainment_auth_audit_time_idx ON entertainment_auth_audit(created_at);
CREATE TABLE IF NOT EXISTS entertainment_watch_progress (
 user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 file_id TEXT NOT NULL, title_id TEXT NOT NULL,
 position REAL NOT NULL, duration REAL NOT NULL, completed INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
 PRIMARY KEY (user_id, file_id)
);
CREATE INDEX IF NOT EXISTS entertainment_watch_progress_recent_idx ON entertainment_watch_progress(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS entertainment_watch_list (
 user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 title_id TEXT NOT NULL, added_at TEXT NOT NULL,
 PRIMARY KEY (user_id, title_id)
);
INSERT OR IGNORE INTO entertainment_auth_migrations VALUES(1,unixepoch()*1000);
CREATE TABLE IF NOT EXISTS entertainment_music_likes (
 user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 track_id TEXT NOT NULL, liked_at TEXT NOT NULL,
 PRIMARY KEY (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS entertainment_music_likes_recent_idx ON entertainment_music_likes(user_id, liked_at DESC);
CREATE TABLE IF NOT EXISTS entertainment_music_plays (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 track_id TEXT NOT NULL, played_at TEXT NOT NULL, seconds REAL NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS entertainment_music_plays_user_idx ON entertainment_music_plays(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS entertainment_music_plays_track_idx ON entertainment_music_plays(track_id);
CREATE TABLE IF NOT EXISTS entertainment_music_playlists (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entertainment_music_playlists_user_idx ON entertainment_music_playlists(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS entertainment_music_playlist_tracks (
 playlist_id TEXT NOT NULL REFERENCES entertainment_music_playlists(id) ON DELETE CASCADE,
 position INTEGER NOT NULL, track_id TEXT NOT NULL, added_at TEXT NOT NULL,
 PRIMARY KEY (playlist_id, position)
);
CREATE TABLE IF NOT EXISTS entertainment_music_radios (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES entertainment_users(id) ON DELETE CASCADE,
 seed_kind TEXT NOT NULL, seed_value TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entertainment_music_radios_user_idx ON entertainment_music_radios(user_id, created_at DESC);
