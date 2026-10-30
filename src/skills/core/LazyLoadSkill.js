/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class LazyLoadSkill extends AgentSkill
{
  processToolData(toolName)
  {
    return toolName !== 'load_skill';
  }

  constructor()
  {
    super();

    this.description = 'Loads a skill full content into conversation history. A loadOnDemand skill tools are enabled only while this load result remains in context.';

    this.tools = [
      {
        type: 'function',
        name: 'load_skill',
        description: 'Loads a skill by name and returns its full content.',
        parameters: {
          type: 'object',
          properties: {
            skillName: {
              type: 'string',
              description: 'Exact name of the skill to activate.',
            },
          },
          required: ['skillName'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
Rules:
- Use load_skill when a required skill is not loaded yet.
- Use the exact skill name shown in the skills list.
`;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      load_skill: '🧩 loading skill',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'load_skill':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.skillName, 64);
        break;
      }

      default:
      {
        break;
      }
    }

    if (!toolArgsReadable)
    {
      return toolNameReadable;
    }

    return `${toolNameReadable} ${toolArgsReadable}`;
  }

  async load_skill(args, context = {})
  {
    const skill = this.agent.skills.get(args.skillName);
    const conversationMessages = await this.agent.buildStreamEventsPrompt(context.streamId, context.agentInput);
    const loadedSkillNames = this.agent.getLoadedSkillNames({
      streamId: context.streamId,
      conversationMessages,
    });
    const alreadyLoaded = skill.isLoaded(loadedSkillNames, context.streamId);

    if (!alreadyLoaded)
    {
      await skill.load(context);
    }

    const streamTools = skill.getTools(context.streamId);

    const toolsEnabled = Array.isArray(streamTools)
      ? streamTools
        .map((tool) => typeof tool?.name === 'string' ? tool.name.trim() : '')
        .filter(Boolean)
      : [];

    const skillContentXml = skill.buildSkillNode({
      loadOnDemand: true,
      includeFullContent: true,
      streamId: context.streamId,
    }).trim();

    return {
      skillName: skill.name,
      status: alreadyLoaded ? 'already_loaded' : 'loaded',
      content: skillContentXml,
      toolsEnabled,
    };
  }
}