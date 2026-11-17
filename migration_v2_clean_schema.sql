-- ==============================================================================
-- FRONTIER AI — D1 MIGRATION V2: Clean Auth Schema & Indexes
-- Optional: Run this in Cloudflare D1 Console (Workers & Pages > D1 > frontier-production-db > Console)
-- (The application also includes defensive runtime fallbacks so it works even before this is run)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS members_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_numeric_id INTEGER,
  handle TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  team_track TEXT NOT NULL,
  email TEXT,
  google_sub TEXT,
  is_host INTEGER DEFAULT 0,
  is_allowed INTEGER DEFAULT 1
);

INSERT OR IGNORE INTO members_v2 (id, github_numeric_id, handle, name, role, team_track, email, google_sub, is_host, is_allowed)
SELECT id, github_numeric_id, handle, name, role, team_track, email, google_sub, is_host, is_allowed FROM members;

DROP TABLE members;
ALTER TABLE members_v2 RENAME TO members;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_google_sub ON members (google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email ON members (email) WHERE email IS NOT NULL;
