BEGIN;

UPDATE memory
SET agent_uuid = stream.agent_uuid
FROM stream
WHERE memory.stream_uuid = stream.uuid;

ALTER TABLE memory ALTER COLUMN stream_uuid DROP NOT NULL;

CREATE INDEX IF NOT EXISTS memory_agent_uuid_idx ON memory(agent_uuid);
CREATE INDEX IF NOT EXISTS memory_agent_embedding_model_idx ON memory(agent_uuid, embedding_model);
CREATE INDEX IF NOT EXISTS memory_agent_stream_embedding_model_idx ON memory(agent_uuid, stream_uuid, embedding_model);

COMMIT;