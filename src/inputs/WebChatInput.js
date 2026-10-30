/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentInput } from '../AgentInput.js';
import { AgentUtils } from '../AgentUtils.js';

export class WebChatInput extends AgentInput
{
  constructor({ webChatClient })
  {
    super({ source: 'webchat' });
    this.webChatClient = webChatClient;
    this.messageQueues = new Map();
    this.recentMessageKeysByStream = new Map();
    this.inputDedupTtlMs = 2 * 60 * 1000;
    this.inputDedupMaxEntriesPerStream = 200;
  }

  async start()
  {
    this.webChatClient.onMessage((message) =>
    {
      this.onMessage(message).catch((error) =>
      {
        console.error('[WebChatInput] Message enqueue error:', error);
      });
    });

    await this.webChatClient.start();
  }

  async onMessage(message)
  {
    const streamId = typeof message?.streamId === 'string' ? message.streamId.trim() : '';

    if (!streamId)
    {
      this.#logInput('input_drop_invalid_stream', {
        reason: 'missing_stream_id',
      });
      return;
    }

    const dedupKey = this.#createMessageDedupKey(message);

    if (this.#isDuplicateInput(streamId, dedupKey))
    {
      this.#logInput('input_dedup_drop', {
        streamId,
        dedupKey,
        eventType: this.#getInputEventType(message),
        messageId: this.#getInputMessageId(message),
      });
      return;
    }

    let streamQueue = this.messageQueues.get(streamId);

    if (!streamQueue)
    {
      streamQueue = { queue: [], isProcessing: false };
      this.messageQueues.set(streamId, streamQueue);
    }

    streamQueue.queue.push(message);

    this.#logInput('input_enqueue', {
      streamId,
      eventType: this.#getInputEventType(message),
      messageId: this.#getInputMessageId(message),
      queueLength: streamQueue.queue.length,
      isProcessing: streamQueue.isProcessing,
    });

    return this.processMessageQueue(streamId);
  }

  async processMessageQueue(streamId)
  {
    const streamQueue = this.messageQueues.get(streamId);

    if (!streamQueue)
    {
      return;
    }

    if (streamQueue.isProcessing)
    {
      this.#logInput('input_queue_busy', {
        streamId,
        queueLength: streamQueue.queue.length,
      });
      return;
    }

    streamQueue.isProcessing = true;

    this.#logInput('input_queue_start', {
      streamId,
      queueLength: streamQueue.queue.length,
    });

    try
    {
      while (streamQueue.queue.length > 0)
      {
        const message = streamQueue.queue.shift();
        this.#logInput('input_dequeue', {
          streamId,
          eventType: this.#getInputEventType(message),
          messageId: this.#getInputMessageId(message),
          queueLength: streamQueue.queue.length,
        });
        await this.handleMessage(message);
      }
    }
    finally
    {
      streamQueue.isProcessing = false;

      if (streamQueue.queue.length === 0)
      {
        this.messageQueues.delete(streamId);
        this.#logInput('input_queue_empty', {
          streamId,
        });
        return;
      }

      this.#logInput('input_queue_restart', {
        streamId,
        queueLength: streamQueue.queue.length,
      });

      await this.processMessageQueue(streamId);
    }
  }

  async handleMessage(message)
  {
    const currentUserId = await this.webChatClient.userId;

    if (message.userId === currentUserId)
    {
      return;
    }

//     console.dir(message);console.log(this.webChatClient?.userId)
//     const currentUserId = typeof this.webChatClient?.userId === 'string'
//       ? this.webChatClient.userId.trim()
//       : '';
//     const senderId = typeof message?.userId === 'string' ? message.userId.trim() : '';
// console.log(currentUserId);
// console.log(senderId);
// console.log("senderId == currentUserId" +  (senderId == currentUserId));

//     if (currentUserId && senderId && senderId === currentUserId)
//     {
//       this.#logInput('input_drop_self_sender', {
//         streamId: message?.streamId,
//         eventType: this.#getInputEventType(message),
//         messageId: this.#getInputMessageId(message),
//         senderId,
//       });
//       return;
//     }

    this.#logInput('input_handle_start', {
      streamId: message?.streamId,
      eventType: this.#getInputEventType(message),
      messageId: this.#getInputMessageId(message),
    });

    if (message.eventType === 'reaction')
    {
      await this.handleReaction(message);
      this.#logInput('input_handle_done', {
        streamId: message?.streamId,
        eventType: 'reaction',
        messageId: this.#getInputMessageId(message),
      });
      return;
    }

    const attachments = await this.#storeIncomingAttachments(message);

    const parentMessageId = typeof message.parentMessageId === 'string' && message.parentMessageId.trim()
      ? message.parentMessageId.trim()
      : null;

    await this.pushEvent({
      type: 'input_message',
      streamId: message.streamId,
      senderId: message.userId,
      senderName: message.userName,
      channel: 'webchat',
      messageId: message.messageId,
      parentMessageId,
      timestamp: message.timestamp,
      dataType: 'text',
      data: message.message,
    });

    for (const attachment of attachments)
    {
      const attachmentType = this.#getAttachmentEventType(attachment.mimeType);
      const attachmentDataType = this.#getAttachmentDataType(attachment.mimeType);

      await this.pushEvent({
        type: attachmentType,
        streamId: message.streamId,
        senderId: message.userId,
        senderName: message.userName,
        channel: 'webchat',
        messageId: message.messageId,
        parentMessageId,
        timestamp: message.timestamp,
        dataType: attachmentDataType,
        data: {
          tempFileName: attachment.tempFileName,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          channel: 'webchat',
          messageId: message.messageId,
          parentMessageId,
          timestamp: message.timestamp,
        },
      });
    }

    this.agent.onInput({
      agentInput: this,
      streamId: message.streamId,
    });

    this.#logInput('input_on_input_called', {
      streamId: message.streamId,
      eventType: 'message',
      messageId: message.messageId ?? null,
    });

    this.#logInput('input_handle_done', {
      streamId: message?.streamId,
      eventType: 'message',
      messageId: this.#getInputMessageId(message),
      attachmentCount: attachments.length,
    });
  }

  async handleReaction(message)
  {
    const reactionKey = typeof message.reactionKey === 'string' ? message.reactionKey.trim() : '';

    if (!reactionKey)
    {
      return;
    }

    await this.pushEvent({
      type: 'input_reaction',
      streamId: message.streamId,
      senderId: message.userId,
      senderName: message.userName,
      channel: 'webchat',
      messageId: message.eventId,
      parentMessageId: message.relatedTo ?? null,
      timestamp: message.timestamp,
      dataType: 'reaction',
      data: {
        reactionKey,
      },
    });

    this.agent.onInput({
      agentInput: this,
      streamId: message.streamId,
    });

    this.#logInput('input_on_input_called', {
      streamId: message.streamId,
      eventType: 'reaction',
      messageId: message.eventId ?? null,
      relatedTo: message.relatedTo ?? null,
    });
  }

  async startTask(streamId)
  {
    await this.webChatClient.sendTypingStart(streamId, 3000);
  }

  async startSubTask(streamId, label, taskUid = '')
  {
    await this.webChatClient.sendTypingSubTask(streamId, {
      label: label || '',
      taskUid,
      action: 'subtask_start',
    });
  }

  async endSubTask(streamId, taskUid = '', status = 'success', cost = null)
  {
    await this.webChatClient.sendTypingSubTask(streamId, {
      taskUid,
      status,
      cost,
      action: 'subtask_end',
    });
  }

  async endTask(streamId)
  {
    await this.webChatClient.sendTypingStop(streamId);
  }

  async answer(streamId, message)
  {
    await this.webChatClient.sendMessage(streamId, message, 'html');

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

  async #storeIncomingAttachments(message)
  {
    const files = Array.isArray(message?.files) ? message.files : [];
    const streamId = String(message?.streamId ?? '').trim();
    const messageId = String(message?.messageId ?? '').trim();

    if (!files.length)
    {
      return [];
    }

    const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

    if (!tempFileManager)
    {
      throw new Error('TempFileManagerSkill is required to handle WebChat attachments.');
    }

    const storedFiles = [];

    for (const fileEntry of files)
    {
      const dataBase64 = String(fileEntry?.dataBase64 ?? '').trim();
      const href = String(fileEntry?.href ?? fileEntry?.src ?? '').trim();
      const fallbackName = `webchat-file-${Date.now()}.bin`;
      const requestedName = String(fileEntry?.fileName ?? '').trim() || fallbackName;
      const sanitizedName = AgentUtils.sanitizeFileName(requestedName);
      const mimeType = String(fileEntry?.mimeType ?? '').trim() || 'application/octet-stream';

      let binary = null;
      let resolvedMimeType = mimeType;
      let resolvedFileName = sanitizedName;

      if (dataBase64)
      {
        binary = Buffer.from(dataBase64, 'base64');
      }
      else if (href)
      {
        const downloaded = await this.webChatClient.downloadAttachment(fileEntry);
        binary = downloaded.buffer;
        resolvedMimeType = String(downloaded.mimeType ?? '').trim() || mimeType;
        resolvedFileName = AgentUtils.sanitizeFileName(downloaded.fileName || sanitizedName);
      }
      else
      {
        continue;
      }

      const attachmentType = resolvedMimeType.toLowerCase().startsWith('image/')
        ? 'image'
        : resolvedMimeType.toLowerCase().startsWith('audio/')
          ? 'audio'
          : 'file';
      const extension = AgentUtils.getExtensionFromMimeType(resolvedMimeType, attachmentType);
      const tempFileName = AgentUtils.buildTempAttachmentPath({
        source: 'webchat',
        streamId,
        messageId,
        fileName: resolvedFileName,
        extension,
        fallbackType: attachmentType,
      });

      await tempFileManager.temp_file_remove({ tempFileName }, { agentInput: this, streamId: message.streamId }).catch(() => {});
      await tempFileManager.temp_file_create({
        tempFileName,
        mimeType: resolvedMimeType,
      }, { agentInput: this, streamId: message.streamId });

      if (AgentUtils.isTextMimeType(resolvedMimeType))
      {
        await tempFileManager.temp_file_insert({
          tempFileName,
          content: binary.toString('utf8'),
          startLine: null,
        }, { agentInput: this, streamId: message.streamId });
      }
      else
      {
        await tempFileManager.appendBuffer({
          tempFileName,
          data: binary,
        }, { agentInput: this, streamId: message.streamId });
      }

      storedFiles.push({
        tempFileName,
        fileName: resolvedFileName,
        mimeType: resolvedMimeType,
        size: binary.length,
        href: href || null,
      });
    }

    return storedFiles;
  }

  #getAttachmentEventType(mimeType)
  {
    const normalizedMimeType = String(mimeType ?? '').trim().toLowerCase();

    if (normalizedMimeType.startsWith('audio/'))
    {
      return 'input_audio';
    }

    if (normalizedMimeType.startsWith('image/'))
    {
      return 'input_image';
    }

    return 'input_file';
  }

  #getAttachmentDataType(mimeType)
  {
    const normalizedMimeType = String(mimeType ?? '').trim().toLowerCase();

    if (normalizedMimeType.startsWith('audio/'))
    {
      return 'audio';
    }

    if (normalizedMimeType.startsWith('image/'))
    {
      return 'image';
    }

    return 'file';
  }

  #isDuplicateInput(streamId, dedupKey)
  {
    const nowMs = Date.now();
    let streamDedupMap = this.recentMessageKeysByStream.get(streamId);

    if (!streamDedupMap)
    {
      streamDedupMap = new Map();
      this.recentMessageKeysByStream.set(streamId, streamDedupMap);
    }

    this.#cleanupStreamDedupMap(streamId, streamDedupMap, nowMs);

    if (streamDedupMap.has(dedupKey))
    {
      return true;
    }

    streamDedupMap.set(dedupKey, nowMs);
    return false;
  }

  #cleanupStreamDedupMap(streamId, streamDedupMap, nowMs)
  {
    for (const [key, storedAtMs] of streamDedupMap.entries())
    {
      if (nowMs - storedAtMs > this.inputDedupTtlMs)
      {
        streamDedupMap.delete(key);
      }
    }

    if (streamDedupMap.size <= this.inputDedupMaxEntriesPerStream)
    {
      return;
    }

    const entriesToDeleteCount = streamDedupMap.size - this.inputDedupMaxEntriesPerStream;
    let deletedCount = 0;

    for (const key of streamDedupMap.keys())
    {
      streamDedupMap.delete(key);
      deletedCount += 1;

      if (deletedCount >= entriesToDeleteCount)
      {
        break;
      }
    }

    if (streamDedupMap.size === 0)
    {
      this.recentMessageKeysByStream.delete(streamId);
    }
  }

  #createMessageDedupKey(message)
  {
    const eventType = this.#getInputEventType(message);

    if (eventType === 'reaction')
    {
      const eventId = this.#normalizeOptionalString(message?.eventId) || this.#normalizeOptionalString(message?.messageId) || 'none';
      const relatedTo = this.#normalizeOptionalString(message?.relatedTo) || 'none';
      const reactionKey = this.#normalizeOptionalString(message?.reactionKey) || 'none';
      const action = this.#normalizeOptionalString(message?.action) || 'add';
      return `${eventType}|${eventId}|${relatedTo}|${reactionKey}|${action}`;
    }

    const messageId = this.#normalizeOptionalString(message?.messageId);

    if (messageId)
    {
      return `${eventType}|${messageId}`;
    }

    const userId = this.#normalizeOptionalString(message?.userId) || 'none';
    const timestamp = this.#normalizeOptionalString(message?.timestamp) || 'none';
    const text = this.#normalizeOptionalString(message?.message) || 'none';
    const parentMessageId = this.#normalizeOptionalString(message?.parentMessageId) || 'none';
    const attachmentSignature = this.#createAttachmentSignature(message?.files);

    return `${eventType}|${userId}|${timestamp}|${parentMessageId}|${text}|${attachmentSignature}`;
  }

  #createAttachmentSignature(files)
  {
    if (!Array.isArray(files) || files.length === 0)
    {
      return 'files:none';
    }

    const chunks = files.map((file) =>
    {
      const fileName = this.#normalizeOptionalString(file?.fileName) || 'unknown';
      const mimeType = this.#normalizeOptionalString(file?.mimeType) || 'application/octet-stream';
      const dataLength = String(file?.dataBase64 ?? '').length;
      const href = this.#normalizeOptionalString(file?.href) || this.#normalizeOptionalString(file?.src) || 'none';
      return `${fileName}:${mimeType}:${dataLength}:${href}`;
    });

    return `files:${chunks.join(',')}`;
  }

  #getInputEventType(message)
  {
    return message?.eventType === 'reaction' ? 'reaction' : 'message';
  }

  #getInputMessageId(message)
  {
    if (message?.eventType === 'reaction')
    {
      return this.#normalizeOptionalString(message?.eventId) || null;
    }

    return this.#normalizeOptionalString(message?.messageId) || null;
  }

  #normalizeOptionalString(value)
  {
    return typeof value === 'string' ? value.trim() : '';
  }

  #logInput(phase, details = {})
  {
    void phase;
    void details;
  }

  #formatLogValue(value)
  {
    if (typeof value === 'string')
    {
      const normalizedValue = value.trim();
      return normalizedValue.includes(' ') ? JSON.stringify(normalizedValue) : normalizedValue;
    }

    if (value === null)
    {
      return 'null';
    }

    if (typeof value === 'number' || typeof value === 'boolean')
    {
      return String(value);
    }

    return JSON.stringify(value);
  }
}
