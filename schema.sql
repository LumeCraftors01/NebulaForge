-- ============================================================
--  RedGalaxy Studio / NebulaForge Studio — D1 schema
--  Run once per database:
--    wrangler d1 execute studio_wiki_db --remote --file=./schema.sql
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
--  Accounts + sessions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'head_admin', 'admin', 'member')),
  prefers_desktop INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier    TEXT NOT NULL,
  ip            TEXT NOT NULL,
  succeeded     INTEGER NOT NULL DEFAULT 0,
  attempted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup
  ON login_attempts(identifier, attempted_at);

-- ------------------------------------------------------------
--  Games + wiki data
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  tagline     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  category    TEXT NOT NULL
                CHECK (category IN ('common', 'rare', 'legendary', 'mythic', 'godly', 'limited')),
  name        TEXT NOT NULL,
  area        TEXT,
  base_cost   REAL NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_units_game ON units(game_id, category, sort_order);

CREATE TABLE IF NOT EXISTS shop_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id       INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  base_rarity   TEXT NOT NULL,
  base_cost     REAL NOT NULL DEFAULT 0,
  base_income   REAL NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_shop_items_game ON shop_items(game_id, sort_order);

-- ------------------------------------------------------------
--  Staff roster (shown in the sidebar)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role_label  TEXT NOT NULL,   -- e.g. "Owner", "Head Admin", "Admin"
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------
--  Site-wide config (socials, download link) — simple key/value
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO site_config (key, value) VALUES
  ('social_facebook', ''),
  ('social_tiktok',   ''),
  ('social_youtube',  ''),
  ('download_url',    ''),
  ('download_label',  'Latest APK Release');
