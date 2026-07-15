CREATE TABLE forecast_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_date TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  max_temp_c REAL NOT NULL,
  min_temp_c REAL NOT NULL,
  most_likely_high_c REAL,
  most_likely_low_c REAL,
  weather_type_text TEXT
);

CREATE INDEX idx_forecast_snapshots_target_date
  ON forecast_snapshots (target_date, fetched_at);

CREATE TABLE actuals (
  target_date TEXT PRIMARY KEY,
  observed_max_c REAL NOT NULL,
  observed_min_c REAL NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE poller_health (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TEXT
);

INSERT INTO poller_health (id, consecutive_failures) VALUES (1, 0);
