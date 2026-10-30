BEGIN;

CREATE TABLE memory_file
(
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_uuid UUID NOT NULL REFERENCES memory(uuid) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime_type TEXT,
    data BYTEA NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX memory_file_memory_uuid_idx ON memory_file(memory_uuid);
CREATE TRIGGER memory_file_set_updated_at BEFORE UPDATE ON memory_file FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;