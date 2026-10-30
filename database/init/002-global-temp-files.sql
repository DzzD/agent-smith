DO $$
BEGIN
    IF to_regclass('public.temp_file') IS NOT NULL THEN
        ALTER TABLE temp_file ADD COLUMN IF NOT EXISTS agent_uuid UUID REFERENCES agent(uuid);

        UPDATE temp_file
        SET agent_uuid = stream.agent_uuid
        FROM stream
        WHERE temp_file.stream_uuid = stream.uuid
          AND temp_file.agent_uuid IS NULL;

        DELETE FROM temp_file
        USING stream
        WHERE temp_file.stream_uuid = stream.uuid
          AND stream.stream_id = '__global__'
          AND temp_file.uuid NOT IN
          (
              SELECT DISTINCT ON (stream.agent_uuid, temp_file.name) temp_file.uuid
              FROM temp_file
              INNER JOIN stream ON stream.uuid = temp_file.stream_uuid
              WHERE stream.stream_id = '__global__'
              ORDER BY stream.agent_uuid, temp_file.name, temp_file.updated_at DESC, temp_file.uuid
          );

        ALTER TABLE temp_file ALTER COLUMN stream_uuid DROP NOT NULL;

        UPDATE temp_file
        SET stream_uuid = NULL
        FROM stream
        WHERE temp_file.stream_uuid = stream.uuid
          AND stream.stream_id = '__global__';

        ALTER TABLE temp_file ALTER COLUMN agent_uuid SET NOT NULL;
        ALTER TABLE temp_file DROP CONSTRAINT IF EXISTS temp_file_stream_uuid_name_key;

        CREATE INDEX IF NOT EXISTS temp_file_agent_uuid_idx ON temp_file(agent_uuid);
        CREATE UNIQUE INDEX IF NOT EXISTS temp_file_global_name_uidx ON temp_file(agent_uuid, name) WHERE stream_uuid IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS temp_file_stream_name_uidx ON temp_file(stream_uuid, name) WHERE stream_uuid IS NOT NULL;

        DELETE FROM stream
        WHERE stream_id = '__global__'
          AND NOT EXISTS (SELECT 1 FROM event WHERE event.stream_uuid = stream.uuid)
          AND NOT EXISTS (SELECT 1 FROM temp_file WHERE temp_file.stream_uuid = stream.uuid);
    END IF;
END;
$$;