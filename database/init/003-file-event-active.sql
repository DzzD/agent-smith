DO $$
BEGIN
    IF to_regclass('public.temp_file') IS NOT NULL AND to_regclass('public.file') IS NULL THEN
        ALTER TABLE temp_file RENAME TO file;
    END IF;
END;
$$;

ALTER TABLE file ADD COLUMN IF NOT EXISTS event_uuid UUID REFERENCES event(uuid);
ALTER TABLE file ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
    IF EXISTS
    (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'event'
          AND column_name = 'context_active'
    ) THEN
        ALTER TABLE event RENAME COLUMN context_active TO active;
    END IF;
END;
$$;

ALTER INDEX IF EXISTS temp_file_agent_uuid_idx RENAME TO file_agent_uuid_idx;
ALTER INDEX IF EXISTS temp_file_stream_uuid_idx RENAME TO file_stream_uuid_idx;
ALTER INDEX IF EXISTS temp_file_global_name_uidx RENAME TO file_global_name_uidx;
ALTER INDEX IF EXISTS temp_file_stream_name_uidx RENAME TO file_stream_name_uidx;
ALTER INDEX IF EXISTS event_stream_context_sequence_idx RENAME TO event_stream_active_sequence_idx;

DROP INDEX IF EXISTS file_agent_uuid_idx;
DROP INDEX IF EXISTS file_stream_uuid_idx;
DROP INDEX IF EXISTS file_global_name_uidx;
DROP INDEX IF EXISTS file_stream_name_uidx;
DROP INDEX IF EXISTS event_stream_active_sequence_idx;

CREATE INDEX file_agent_uuid_idx ON file(agent_uuid);
CREATE INDEX file_stream_uuid_idx ON file(stream_uuid);
CREATE INDEX file_event_uuid_idx ON file(event_uuid);
CREATE UNIQUE INDEX file_global_name_uidx ON file(agent_uuid, name) WHERE stream_uuid IS NULL;
CREATE UNIQUE INDEX file_stream_name_uidx ON file(stream_uuid, name) WHERE stream_uuid IS NOT NULL;
CREATE INDEX event_stream_active_sequence_idx ON event(stream_uuid, active, sequence);

DROP TRIGGER IF EXISTS temp_file_set_updated_at ON file;
CREATE TRIGGER file_set_updated_at BEFORE UPDATE ON file FOR EACH ROW EXECUTE FUNCTION set_updated_at();