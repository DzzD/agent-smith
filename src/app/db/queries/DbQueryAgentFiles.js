import { DbQueryObject } from '../DbQueryObject.js';
import { AgentFile } from '../models/AgentFile.js';

export class DbQueryAgentFiles extends DbQueryObject
{
  constructor(connectionUid = 'default')
  {
    super('agent_smith', connectionUid);

    this._query = `
      SELECT
        to_jsonb(file) - 'data' AS file,
        file.agent_uuid AS agent_uuid,
        file.stream_uuid AS stream_uuid,
        file.active AS active,
        file.name AS name,
        octet_length(file.data) AS size
      FROM file
    `;

    this.addDbObject(AgentFile, 'file', 'file');
  }

  async next()
  {
    const row = await super.next();
    this.size = row ? Number(this.getFieldValue('size') ?? 0) : 0;
    return row;
  }
}