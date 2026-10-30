import { AgentAgent } from '../../../src/app/db/models/AgentAgent.js';

export class AgentListCommand
{
  async run()
  {
    const agents = new AgentAgent();

    try
    {
      await agents.search(null, [], { order: '"uid" ASC' });

      while (await agents.next())
      {
        console.log(`${agents.uid}\t${agents.uuid}\t${agents.name ?? ''}`);
      }
    }
    finally
    {
      agents.close();
    }
  }
}