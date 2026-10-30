BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS memory;

CREATE TABLE memory
(
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_uuid UUID NOT NULL REFERENCES agent(uuid),
    stream_uuid UUID NOT NULL REFERENCES stream(uuid),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    key_embedding vector NOT NULL,
    value_embedding vector NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX memory_agent_stream_embedding_model_idx ON memory(agent_uuid, stream_uuid, embedding_model);
CREATE TRIGGER memory_set_updated_at BEFORE UPDATE ON memory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;