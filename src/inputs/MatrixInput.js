/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentUtils } from '../AgentUtils.js';
import { AgentInput } from '../AgentInput.js';

export class MatrixInput extends AgentInput
{
  constructor({ matrixClient })
  {
    super({ source: 'matrix' });
    this.matrixClient = matrixClient;
    this.messageQueues = new Map();
  }

  async start()
  {
    await this.matrixClient.connect();
    this.matrixClient.onMessage((message) =>
    {
      this.onMessage(message).catch((error) =>
      {
        console.error('[MatrixInput] Message enqueue error:', error);
      });
    });
  }

  async startTask(streamId)
  {
    await this.matrixClient.sendTypingStart(streamId);
  }

  async endTask(streamId)
  {
    await this.matrixClient.sendTypingStop(streamId);
  }

  async getStreamUsers(streamId)
  {
    const users = await this.matrixClient.listRoomUsers(streamId);

    return users.reduce((acc, user) =>
    {
      const userId = typeof user?.userId === 'string' ? user.userId.trim() : '';
      const userName = typeof user?.name === 'string' ? user.name.trim() : '';

      if (!userId || !userName)
      {
        return acc;
      }

      acc[userName] = userId;
      return acc;
    }, {});
  }

  async onMessage(message)
  {
    const roomId = message.roomId;
    let roomQueue = this.messageQueues.get(roomId);

    if (!roomQueue)
    {
      roomQueue = { queue: [], isProcessing: false };
      this.messageQueues.set(roomId, roomQueue);
    }

    roomQueue.queue.push(message);

    return this.processRoomQueue(roomId);
  }

  async processRoomQueue(roomId)
  {
    const roomQueue = this.messageQueues.get(roomId);

    if (roomQueue.isProcessing)
    {
      return;
    }

    roomQueue.isProcessing = true;

    try
    {
      while (roomQueue.queue.length > 0)
      {
        const message = roomQueue.queue.shift();
        await this.handleMessage(message);
      }
    }
    finally
    {
      roomQueue.isProcessing = false;

      if (roomQueue.queue.length === 0)
      {
        this.messageQueues.delete(roomId);
        return;
      }

      await this.processRoomQueue(roomId);
    }
  }

  async handleMessage(message)
  {
    // console.dir(message);
    const currentUserId = await this.matrixClient.getUserId();

    if (message.sender === currentUserId)
    {
      return;
    }

    if (message.eventType === 'reaction')
    {
      const streamId = message.roomId;
      const messageId = message.eventId ?? message.event_id ?? null;
      const parentMessageId = message.relatedEventId ?? null;
      const timestamp = typeof message.timestamp === 'string' && message.timestamp.trim()
        ? message.timestamp.trim()
        : new Date().toISOString();
      const senderId = message.sender ?? 'unknown';
      const senderName = this.#extractSenderName(senderId);
      const reactionKey = typeof message.reactionKey === 'string' ? message.reactionKey.trim() : '';

      await this.pushEvent({
        type: 'input_reaction',
        streamId,
        senderId,
        senderName,
        channel: 'matrix',
        messageId,
        parentMessageId,
        timestamp,
        dataType: 'reaction',
        data: {
          channel: 'matrix',
          messageId,
          parentMessageId,
          timestamp,
          reactionKey,
        },
      });

      this.agent.onInput({
        agentInput: this,
        streamId,
      });

      return;
    }

    const content = message.content ?? {};
    const msgtype = content.msgtype ?? message.msgtype;
    const body = content.body ?? message.body ?? '';
    const streamId = message.roomId;
    const messageId = message.eventId ?? message.event_id ?? null;
    const parentMessageId = content?.['m.relates_to']?.['m.in_reply_to']?.event_id
      ?? content?.['m.relates_to']?.event_id
      ?? null;
    const timestamp = typeof message.timestamp === 'string' && message.timestamp.trim()
      ? message.timestamp.trim()
      : new Date().toISOString();
    const senderId = message.sender ?? 'unknown';
    const senderName = this.#extractSenderName(senderId);

    const mimeType =
      content['org.matrix.msc1767.file']?.mimetype
      ?? content.info?.mimetype
      ?? message.info?.mimetype
      ?? null;

    const isImage = msgtype === 'm.image' || mimeType?.startsWith('image/');
    const isAudio = msgtype === 'm.audio' || mimeType?.startsWith('audio/');
    const isFile = msgtype === 'm.file';

    let dataType = 'text';
    let eventType = 'message';
    let data = body;

    if (isImage)
    {
      dataType = 'image';
      eventType = 'image';
    }
    else if (isAudio)
    {
      dataType = 'audio';
      eventType = 'audio';
    }
    else if (isFile)
    {
      dataType = 'file';
      eventType = 'file';
    }

    if (isImage || isAudio || isFile)
    {
      const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

      if (!tempFileManager)
      {
        throw new Error('TempFileManagerSkill is required to handle Matrix files.');
      }

      const file =
        message.file
        ?? content.file
        ?? content['org.matrix.msc1767.file']?.file;
      const ref = this.matrixClient.extractFileRef(content);

      const downloaded = await this.matrixClient.downloadFile(file);

      const resolvedMimeType =
        mimeType
        ?? downloaded.contentType
        ?? downloaded.mimeType
        ?? (isImage ? 'image/png' : isAudio ? 'audio/mpeg' : 'application/octet-stream');

      const extension = AgentUtils.getExtensionFromMimeType(resolvedMimeType, dataType);

      const originalName =
        content['org.matrix.msc1767.file']?.name
        ?? message.filename
        ?? body
        ?? `${dataType}-${Date.now()}.${extension}`;
      const tempFileName = AgentUtils.buildTempAttachmentPath({
        source: 'matrix',
        streamId,
        messageId,
        fileName: originalName,
        extension,
        fallbackType: dataType,
      });

      await tempFileManager.temp_file_remove({ tempFileName }, { agentInput: this, streamId }).catch(() => {});

      await tempFileManager.temp_file_create({
        tempFileName,
        mimeType: resolvedMimeType,
      }, { agentInput: this, streamId });

      const isTextMimeType = AgentUtils.isTextMimeType(resolvedMimeType);
      const writeEncoding = isTextMimeType ? 'utf8' : 'base64';
      const writeContent = isTextMimeType
        ? Buffer.from(downloaded.base64, 'base64').toString('utf8')
        : downloaded.base64;
      const resolvedSize = Number.isFinite(downloaded.size)
        ? downloaded.size
        : Buffer.from(downloaded.base64, 'base64').length;

      if (writeEncoding === 'utf8')
      {
        await tempFileManager.temp_file_insert({
          tempFileName,
          content: writeContent,
          startLine: null,
        }, { agentInput: this, streamId });
      }
      else
      {
        await tempFileManager.appendBuffer({
          tempFileName,
          data: Buffer.from(writeContent, 'base64'),
        }, { agentInput: this, streamId });
      }

      data = {
        tempFileName,
        fileName: originalName,
        mimeType: resolvedMimeType,
        size: resolvedSize,
        ref,
        body: body || null,
        channel: 'matrix',
        messageId,
        parentMessageId,
        timestamp,
        eventId: message.eventId ?? message.event_id ?? null,
      };
    }

    await this.pushEvent({
      type: `input_${eventType}`,
      streamId,
      senderId,
      senderName,
      channel: 'matrix',
      messageId,
      parentMessageId,
      timestamp,
      dataType,
      data,
    });

    this.agent.onInput({
      agentInput: this,
      streamId,
    });
  }

  async answer(streamId, message)
  {
    await this.matrixClient.sendMessage(streamId, message, true);

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

  #extractSenderName(senderId)
  {
    const localPart = String(senderId || '')
      .replace(/^@/, '')
      .split(':')[0];

    const base = localPart.split('-')[0];
    const words = base.split('.').filter(Boolean);

    return words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') || 'Unknown';
  }

}
