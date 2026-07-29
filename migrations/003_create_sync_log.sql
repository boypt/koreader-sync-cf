CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  document TEXT NOT NULL,
  progress TEXT,
  percentage REAL,
  device TEXT,
  device_id TEXT,
  timestamp INTEGER,
  filename TEXT,
  title TEXT,
  authors TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (username) REFERENCES users(username)
);
CREATE INDEX IF NOT EXISTS idx_sync_log_username ON sync_log(username);
CREATE INDEX IF NOT EXISTS idx_sync_log_document ON sync_log(document);
CREATE INDEX IF NOT EXISTS idx_sync_log_created_at ON sync_log(created_at);