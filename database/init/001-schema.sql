CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE agent
(
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE channel
(
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stream
(
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES agent(uuid),
    channel_uuid UUID NOT NULL REFERENCES channel(uuid),
    stream_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_uuid, channel_uuid, stream_id)
);

CREATE TABLE event
(
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_uuid UUID NOT NULL REFERENCES stream(uuid),
    sequence BIGINT GENERATED ALWAYS AS IDENTITY,
    type TEXT NOT NULL,
    data JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE file
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

CREATE INDEX stream_agent_uuid_idx ON stream(agent_uuid);
CREATE INDEX stream_channel_uuid_idx ON stream(channel_uuid);
CREATE INDEX event_stream_active_sequence_idx ON event(stream_uuid, active, sequence);
CREATE INDEX file_agent_uuid_idx ON file(agent_uuid);
CREATE INDEX file_stream_uuid_idx ON file(stream_uuid);
CREATE INDEX file_event_uuid_idx ON file(event_uuid);
CREATE UNIQUE INDEX file_global_name_uidx ON file(agent_uuid, name) WHERE stream_uuid IS NULL;
CREATE UNIQUE INDEX file_stream_name_uidx ON file(stream_uuid, name) WHERE stream_uuid IS NOT NULL;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_set_updated_at BEFORE UPDATE ON agent FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER channel_set_updated_at BEFORE UPDATE ON channel FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER stream_set_updated_at BEFORE UPDATE ON stream FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_set_updated_at BEFORE UPDATE ON event FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER file_set_updated_at BEFORE UPDATE ON file FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO channel (uid, name) VALUES
    ('matrix', 'Matrix'),
    ('webchat', 'WebChat'),
    ('whatsapp', 'WhatsApp');