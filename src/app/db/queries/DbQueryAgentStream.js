import { DbQueryObject } from '../DbQueryObject.js';
import { AgentStream } from '../models/AgentStream.js';

export class DbQueryAgentStream extends DbQueryObject
{
  constructor(connectionUid = 'default')
  {
    super('agent_smith', connectionUid);

    this._query = `
      SELECT
        to_jsonb(stream) AS stream,
        agent.uid AS agent_uid,
        channel.uid AS channel_uid,
        stream.stream_id AS stream_id
      FROM stream
      INNER JOIN agent ON agent.uuid = stream.agent_uuid
      INNER JOIN channel ON channel.uuid = stream.channel_uuid
    `;

    this.addDbObject(AgentStream, 'stream', 'stream');
  }
}