CREATE TABLE IF NOT EXISTS database_metadata
(
    code TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO database_metadata (code, value)
VALUES ('version_db', '10')
ON CONFLICT (code) DO UPDATE SET value = EXCLUDED.value;