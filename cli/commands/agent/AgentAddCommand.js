import { AgentAgent } from '../../../src/app/db/models/AgentAgent.js';
import { parseOptions, requiredOption } from './AgentCommandUtils.js';

export class AgentAddCommand
{
  async run(argv)
  {
    const options = parseOptions(argv);
    const agent = new AgentAgent();
    agent.uid = requiredOption(options, 'uid');
    agent.name = options.name == null ? null : String(options.name);
    await agent.save(true);
    console.log(`Agent added: ${agent.uid} (${agent.uuid})`);
  }
}