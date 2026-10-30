/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentInput } from '../AgentInput.js';

export class WhatsAppInput extends AgentInput
{
  constructor({ whatsAppClient })
  {
    super({ source: 'whatsapp' });
    this.whatsAppClient = whatsAppClient;
    this.messageQueues = new Map();
  }

  async start()
  {
    this.whatsAppClient.onMessage((message) =>
    {
      this.onMessage(message).catch((error) =>
      {
        console.error('[WhatsAppInput] Message enqueue error:', error);
      });
    });

    await this.whatsAppClient.start();
  }

  async onMessage(message)
  {
    console.dir(message);
    const streamId = message.from;
    let streamQueue = this.messageQueues.get(streamId);

    if (!streamQueue)
    {
      streamQueue = { queue: [], isProcessing: false };
      this.messageQueues.set(streamId, streamQueue);
    }

    streamQueue.queue.push(message);

    return this.processMessageQueue(streamId);
  }

  async processMessageQueue(streamId)
  {
    const streamQueue = this.messageQueues.get(streamId);

    if (streamQueue.isProcessing)
    {
      return;
    }

    streamQueue.isProcessing = true;

    try
    {
      while (streamQueue.queue.length > 0)
      {
        const message = streamQueue.queue.shift();
        await this.handleMessage(message);
      }
    }
    finally
    {
      streamQueue.isProcessing = false;

      if (streamQueue.queue.length === 0)
      {
        this.messageQueues.delete(streamId);
        return;
      }

      await this.processMessageQueue(streamId);
    }
  }

  async handleMessage(message)
  {
    if (message.type !== 'text')
    {
      return;
    }

    const streamId = message.from;

    await this.pushEvent({
      type: 'input_message',
      streamId,
      senderId: message.from,
      senderName: message.senderName,
      channel: 'whatsapp',
      messageId: message.messageId,
      parentMessageId: null,
      timestamp: message.timestamp,
      dataType: 'text',
      data: message.text,
    });

    this.agent.onInput({
      agentInput: this,
      streamId,
    });
  }

  async startTask(streamId)
  {
  }

  async endTask(streamId)
  {
  }

  async answer(streamId, message)
  {
    await this.whatsAppClient.sendMessage(streamId, message);

    await this.pushEvent({
      type: 'output_message',
      streamId,
      senderId: 'assistant',
      senderName: this.agent?.name || 'assistant',
      dataType: 'text',
      data: message,
      prompt: '',
    });
  }
}