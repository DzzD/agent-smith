/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class WhatsAppSkill extends AgentSkill
{
  processToolData(toolName)
  {
    return toolName !== 'send_whatsapp_message';
  }

  get keepToolCallsOnCompression()
  {
    return true;
  }

  constructor({ whatsAppClient })
  {
    super();
    this.whatsAppClient = whatsAppClient;

    this.description = 'Provides functions to send text messages via WhatsApp.';

    this.tools = [
      {
        type: 'function',
        name: 'send_whatsapp_message',
        allowRepeat: true,
        description: 'Send a plain text message to a WhatsApp recipient.',
        parameters: {
          type: 'object',
          properties: {
            recipientId: {
              type: 'string',
              description: 'WhatsApp recipient phone number. Use the current streamId for the active conversation.',
            },
            message: {
              type: 'string',
              description: 'Plain text WhatsApp message.',
            },
          },
          required: ['recipientId', 'message'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
    send_whatsapp_message :
    - Default tool for textual answers sent through WhatsApp.
    - Use recipientId from the current WhatsApp streamId.
    - Send plain text only.
    - Never use HTML.
    - Never use Markdown formatting.
    - Keep messages readable and reasonably short.
    - WhatsApp formatting features are intentionally not supported in this first version.
    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      send_whatsapp_message: '📨 sending WhatsApp message',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'send_whatsapp_message':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.recipientId, 64);
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

  async send_whatsapp_message(args = {}, context = {})
  {
    const recipientId = args.recipientId;
    const message = args.message;

    const sendResult = await this.whatsAppClient.sendMessage(recipientId, message);
    const messageId = this.whatsAppClient.extractMessageId(sendResult);

    return {
      ok: true,
      status: 'message_delivered',
      recipient: recipientId,
      ...(messageId ? { messageId } : {}),
    };
  }
}