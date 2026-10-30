import { DbQueryObject } from '../DbQueryObject.js';
import { AgentEvent } from '../models/AgentEvent.js';

export class DbQueryAgentEventSemanticSearch extends DbQueryObject
{
  constructor(connectionUid = 'default')
  {
    super('agent_smith', connectionUid);

    this._query = `
      SELECT
        to_jsonb(event) - 'embedding' AS event,
        1 - (event.embedding <=> $1::vector) AS score
      FROM event
      WHERE event.stream_uuid = $2
        AND event.embedding_model = $3
        AND event.embedding IS NOT NULL
    `;

    this.addDbObject(AgentEvent, 'event', 'event');
  }
}
