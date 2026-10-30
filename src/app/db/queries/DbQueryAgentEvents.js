import { DbQueryObject } from '../DbQueryObject.js';
import { AgentEvent } from '../models/AgentEvent.js';

export class DbQueryAgentEvents extends DbQueryObject
{
  constructor(connectionUid = 'default')
  {
    super('agent_smith', connectionUid);

    this._query = `
      SELECT
        to_jsonb(event) AS event,
        event.uuid AS uuid,
        event.stream_uuid AS stream_uuid,
        event.type AS type,
        event.active AS active,
        event.sequence AS sequence
      FROM event
    `;

    this.addDbObject(AgentEvent, 'event', 'event');
  }
}