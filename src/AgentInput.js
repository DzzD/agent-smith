/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentUtils } from './AgentUtils.js';

export class AgentInput
{
  constructor({ source })
  {
    this.source = source;
    this.agent = null;
    this.streamIds = new Set();
  }

  addStream(streamId)
  {
    this.streamIds.add(streamId);
    return this;
  }

  removeStream(streamId)
  {
    this.streamIds.delete(streamId);
    return this;
  }

  hasStream(streamId)
  {
    return this.streamIds.has(streamId);
  }

  buildStreamPrompt(streamId)
  {
    return [
      '<current_stream>',
      `  <channel>${AgentUtils.escapeXmlText(this.source)}</channel>`,
      `  <stream_id>${AgentUtils.escapeXmlText(streamId)}</stream_id>`,
      '</current_stream>',
    ].join('\n');
  }

  async startTask(streamId)
  {
    console.log(`Starting task for stream ID ${streamId}`);
  }

  async startSubTask(streamId, label, taskUid = '')
  {
    console.log(`Subtask start for stream ID ${streamId} [${taskUid || 'no-task-uid'}]: ${label || ''}`);
  }

  async endSubTask(streamId, taskUid = '', status = 'success', cost = null)
  {
    const costLabel = cost == null ? '' : `, cost: ${cost}`;
    console.log(`Subtask end for stream ID ${streamId} [${taskUid || 'no-task-uid'}]: ${status || 'success'}${costLabel}`);
  }

  async endTask(streamId)
  {
    console.log(`End task for stream ID ${streamId}`);
  }

  async pushEvent(event)
  {
    if (!event?.streamId)
    {
      throw new Error('streamId is required');
    }

    const pushedEvent = await this.agent.eventManager.push({
      source: this.source,
      ...event,
    });

    const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

    if (tempFileManager)
    {
      await tempFileManager.attachFilesToEvent(pushedEvent, { agentInput: this });
    }

    return pushedEvent;
  }

  async answer(streamId, message)
  {
    throw new Error('answer() not implemented');
  }

  async getStreamUsers(streamId)
  {
    return {};
  }

}
