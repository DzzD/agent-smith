import { AgentAgent } from '../../../src/app/db/models/AgentAgent.js';
import { parseOptions, requiredOption } from './AgentCommandUtils.js';

export class AgentUpdateCommand
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

      if (options['new-uid'] != null)
      {
        agent.uid = String(options['new-uid']).trim();
      }

      if (options.name != null)
      {
        agent.name = String(options.name);
      }

      await agent.save();
      console.log(`Agent updated: ${agent.uid} (${agent.uuid})`);
    }
    finally
    {
      agent.close();
    }
  }
}