import { AgentAgent } from '../../../src/app/db/models/AgentAgent.js';
import { parseOptions, requiredOption } from './AgentCommandUtils.js';

export class AgentShowCommand
{
  async run(argv)
  {
    const options = parseOptions(argv);
    const uid = requiredOption(options, 'uid');
    const agent = new AgentAgent();

    try
    {
      await agent.search('"uid" = $1', [uid], { limit: 1 });

      if (!(await agent.next()))
      {
        throw new Error(`Agent not found: ${uid}`);
      }

      console.log(JSON.stringify({ uuid: agent.uuid, uid: agent.uid, name: agent.name, createdAt: agent.createdAt, updatedAt: agent.updatedAt }, null, 2));
    }
    finally
    {
      agent.close();
    }
  }
}