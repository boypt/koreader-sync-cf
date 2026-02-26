CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  username TEXT,
  document TEXT,
  progress TEXT,
  percentage REAL,
  device TEXT,
  device_id TEXT,
  timestamp INTEGER,
  PRIMARY KEY (username, document),
  FOREIGN KEY (username) REFERENCES users(username)
);
