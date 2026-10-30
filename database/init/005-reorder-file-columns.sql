BEGIN;

CREATE TABLE file_reordered
(
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES agent(uuid),
    stream_uuid UUID REFERENCES stream(uuid),
    event_uuid UUID REFERENCES event(uuid),
    name TEXT NOT NULL,
    mime_type TEXT,
    data BYTEA,
    description TEXT,
    owner TEXT,
    permanent BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO file_reordered
(
    uuid,
    agent_uuid,
    stream_uuid,
    event_uuid,
    name,
    mime_type,
    data,
    description,
    owner,
    permanent,
    active,
    created_at,
    updated_at
)
SELECT
    uuid,
    agent_uuid,
    stream_uuid,
    event_uuid,
    name,
    mime_type,
    data,
    description,
    owner,
    permanent,
    active,
    created_at,
    updated_at
FROM file;

DROP TABLE file;
ALTER TABLE file_reordered RENAME TO file;

CREATE INDEX file_agent_uuid_idx ON file(agent_uuid);
CREATE INDEX file_stream_uuid_idx ON file(stream_uuid);
CREATE INDEX file_event_uuid_idx ON file(event_uuid);
CREATE UNIQUE INDEX file_global_name_uidx ON file(agent_uuid, name) WHERE stream_uuid IS NULL;
CREATE UNIQUE INDEX file_stream_name_uidx ON file(stream_uuid, name) WHERE stream_uuid IS NOT NULL;
CREATE TRIGGER file_set_updated_at BEFORE UPDATE ON file FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;