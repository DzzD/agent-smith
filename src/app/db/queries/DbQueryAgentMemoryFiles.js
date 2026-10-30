import { DbQueryObject } from '../DbQueryObject.js';
import { AgentMemoryFile } from '../models/AgentMemoryFile.js';

export class DbQueryAgentMemoryFiles extends DbQueryObject
{
  constructor(connectionUid = 'default')
  {
    super('agent_smith', connectionUid);

    this._query = `
      SELECT
        to_jsonb(memory_file) - 'data' AS memory_file,
        memory_file.memory_uuid AS memory_uuid,
        octet_length(memory_file.data) AS size
      FROM memory_file
    `;

    this.addDbObject(AgentMemoryFile, 'memoryFile', 'memory_file');
  }

  async next()
  {
    const row = await super.next();
    this.size = row ? Number(this.getFieldValue('size') ?? 0) : 0;
    return row;
  }
}
