import { DbQueryObject } from '../DbQueryObject.js';
import { AgentFile } from '../models/AgentFile.js';

export class DbQueryAgentFileContent extends DbQueryObject
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
        file.data AS file_data
      FROM file
    `;

    this.addDbObject(AgentFile, 'file', 'file');
  }

  async next()
  {
    const row = await super.next();

    if (row)
    {
      this.file.data = this.getFieldValue('file_data');
      this.file.__data = this.file.data;
    }

    return row;
  }
}