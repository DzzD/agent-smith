import { DbQueryObject } from '../DbQueryObject.js';
import { AgentMemory } from '../models/AgentMemory.js';

export class DbQueryAgentMemories extends DbQueryObject
{
  constructor(connectionUid = 'default')
  {
    super('agent_smith', connectionUid);

    this._query = `
      WITH compatible_memory AS MATERIALIZED
      (
        SELECT *
        FROM memory
        WHERE agent_uuid = $2
          AND embedding_model = $4
          AND (stream_uuid IS NULL OR stream_uuid = $3)
      )
      SELECT
        to_jsonb(compatible_memory) - 'key_embedding' - 'value_embedding' AS memory,
        1 - (key_embedding <=> $1::vector) AS key_similarity,
        1 - (value_embedding <=> $1::vector) AS value_similarity,
        GREATEST(1 - (key_embedding <=> $1::vector), (1 - (value_embedding <=> $1::vector)) * 0.85) AS score
      FROM compatible_memory
    `;

    this.addDbObject(AgentMemory, 'memory', 'memory');
  }
}