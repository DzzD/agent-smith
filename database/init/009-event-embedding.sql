BEGIN;

ALTER TABLE event
    ADD COLUMN IF NOT EXISTS embedding vector,
    ADD COLUMN IF NOT EXISTS embedding_model TEXT;

CREATE INDEX IF NOT EXISTS event_stream_embedding_model_idx
    ON event(stream_uuid, embedding_model)
    WHERE embedding IS NOT NULL;

COMMIT;
