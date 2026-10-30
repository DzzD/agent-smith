/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';

export class AgentScratchpadSkill extends AgentSkill
{
	constructor()
	{
		super();

    this.description = 'Provides a persistent scratchpad for working notes, plans, reminders, and useful context across conversation turns and tasks.';

		this.tools = [
			{
				type: 'function',
				name: 'scratchpad_write',
        description: [
          'Write or update the agent working scratchpad.',
          'Use it like a persistent notebook or draft area.',
          'Record anything useful to remember later, such as plans, decisions, constraints, progress, unresolved items, participant-specific information, preferences, or relevant facts.',
          'It may also be used to plan and track multi-step tasks.',
          'The scratchpad is not limited to the current task and may contain notes about several concurrent or suspended tasks.',
          'Keep notes concise, structured, and associated with the correct person or context.',
          'Write a complete replacement note while preserving still-relevant information.',
          'Remove obsolete, redundant, or no-longer-useful information.',
          'The scratchpad persists only through conversation history and is not stored or injected separately.',
        ].join(' '),
				parameters: {
					type: 'object',
					properties: {
						content: {
							type: 'string',
							description: 'Complete current working memory containing information worth preserving for possible later use.',
						},
					},
					required: ['content'],
					additionalProperties: false,
				},
			},
		];
	}

  get usage()
  {
    return `
  - Use scratchpad_write as a persistent working notebook and draft area.
  - Use it to remember useful information or to plan and track work.
  - Notes may span multiple tasks, conversation turns, and participants.
  - Preserve useful context, decisions, constraints, plans, progress, unresolved items, and other information worth keeping.
  - Keep people, tasks, and contexts clearly identified when needed.
  - Write the complete current scratchpad, not partial diffs.
  - Preserve still-relevant notes when updating it.
  - Remove obsolete, redundant, or unimportant information.
  - Do not use it for trivial details unlikely to matter later.
  - The scratchpad persists only through conversation history.
    `.trim();
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      scratchpad_write: '📝 updating scratchpad',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'scratchpad_write':
      {
        toolArgsReadable = '';
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

    return `${toolNameReadable} (${toolArgsReadable})`;
  }

  async scratchpad_write(args = {}, context = {})
  {
    void args;
    void context;

    return true;
  }
}