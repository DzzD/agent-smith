/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from 'agent-smith';
import { MatrixInput } from 'agent-smith/inputs/MatrixInput';
import { MatrixSkill } from 'agent-smith/skills/ext/MatrixSkill';
import { HttpSkill } from 'agent-smith/skills/ext/HttpSkill';
import { KrokiDiagramSkill } from 'agent-smith/skills/beta/KrokiDiagramSkill';
import { TempFileManagerSkill } from 'agent-smith/skills/core/TempFileManagerSkill';
import { MemorySkill } from 'agent-smith/skills/core/MemorySkill';
import { BraveSearchSkill } from 'agent-smith/skills/beta/BraveSearchSkill';
import { OpenApiPdfSkill } from 'agent-smith/skills/beta/OpenApiPdfSkill';
import { ZipSkill } from 'agent-smith/skills/beta/ZipSkill';
import { AgentScratchpadSkill } from 'agent-smith/skills/core/AgentScratchpadSkill';
import { LazyLoadSkill } from 'agent-smith/skills/core/LazyLoadSkill';
import { OpenAIClientSkill } from 'agent-smith/skills/beta/OpenAIClientSkill';
import { OpenAiEmbeddingSkill } from 'agent-smith/skills/beta/OpenAiEmbeddingSkill';
import { MatrixClient } from 'agent-smith/net/client/MatrixClient';
import { JavaScriptSandboxSkill } from 'agent-smith/skills/beta/JavaScriptSandboxSkill';
import { DbManager } from '../../src/app/db/DbManager.js';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const assetsDirectory = path.resolve(dirname, '../assets');
const sandboxJavascriptDirectory = fileURLToPath(new URL('../../SandboxJavascript/', import.meta.url));

const sharedEnvPath = fileURLToPath(new URL('../.env', import.meta.url));
const localEnvPath = fileURLToPath(new URL('./.env', import.meta.url));

if (fs.existsSync(sharedEnvPath))
{
  dotenv.config({ path: sharedEnvPath });
}

if (fs.existsSync(localEnvPath))
{
  dotenv.config({ path: localEnvPath, override: true });
}

export class AgentSmith extends Agent
{
  get profilePrompt()
  {
    return `
      <agent_profile>
        You are Agent Smith, an event-driven AI assistant for the Laboratoire Numérique.
        You behave like a real human teammate working with a small laboratory team.

        Context:
        - You interact with users through external communication tools such as Matrix, email, WhatsApp, and other messaging tools.
        - You may receive incoming events from different tools and must use the appropriate tool to reply.
        - Users never see plain assistant messages. Every user-facing reply, question, progress update, or delivery must go through the tool that matches the active channel.

        Your role:
        - Help users clearly and efficiently.
        - Stay factual and never invent information.

        Communication rules:
        - Always write user-facing messages in French.
        - Address a single user with "tu" and never "vous".
        - Do not greet the same person again in the same conversation unless there is a clear reason.
        - After the first message, continue naturally without greeting again.
      </agent_profile>
    `;
  }

  constructor()
  {
    const env = process.env;
    super({
      agentUid: 'smith',
      name: 'Agent Smith',
      openAIUrl: env.AGENT_OPENAI_URL,
      openAIKey: env.AGENT_OPENAI_KEY,
      openAIModel: env.AGENT_OPENAI_MODEL,
      openAIStream: env.AGENT_OPENAI_STREAM === 'true',
      embeddingUrl: env.SKILL_EMBEDDING_OPENAI_URL,
      embeddingKey: env.SKILL_EMBEDDING_OPENAI_KEY,
      embeddingModel: env.SKILL_EMBEDDING_OPENAI_MODEL,
      maxContextSize: env.AGENT_OPENAI_MAX_CONTEXT_LENGTH,
    });

    DbManager.addDatabase({
      name: env.AGENT_PG_DB,
      host: env.AGENT_PG_HOST,
      port: Number(env.AGENT_PG_PORT),
      database: env.AGENT_PG_DB,
      user: env.AGENT_PG_USER,
      password: env.AGENT_PG_PASSWORD,
      poolSize: Number(env.AGENT_PG_POOL_SIZE),
    });
    
    const matrixClient = new MatrixClient({
      matrixServerUrl: env.MATRIX_HOMESERVER_URL,
      username: env.MATRIX_USERNAME,
      password: env.MATRIX_PASSWORD,
      accessToken: env.MATRIX_ACCESS_TOKEN,
      deviceId: env.MATRIX_DEVICE_ID,
      storagePath: path.resolve(dirname, env.MATRIX_STORAGE_PATH),
    });


    this.registerInput(new MatrixInput({ matrixClient }));

    /* Register MatrixSkill */
    this.registerSkill(new MatrixSkill({ matrixClient }));

    this.registerSkill(new LazyLoadSkill());

    this.registerSkill(new AgentScratchpadSkill());


    const tempFileManager = new TempFileManagerSkill();
    this.registerSkill(tempFileManager);
    this.registerSkill(new MemorySkill({
      url: env.SKILL_EMBEDDING_OPENAI_URL,
      apiKey: env.SKILL_EMBEDDING_OPENAI_KEY,
      model: env.SKILL_EMBEDDING_OPENAI_MODEL ?? 'text-embedding-3-small',
    }));
    this.registerSkill(new JavaScriptSandboxSkill({ sandboxJavascriptDirectory }), { loadOnDemand: true });
    this.registerSkill(new OpenAiEmbeddingSkill({
      url: env.SKILL_EMBEDDING_OPENAI_URL,
      apiKey: env.SKILL_EMBEDDING_OPENAI_KEY,
      model: env.SKILL_EMBEDDING_OPENAI_MODEL ?? 'text-embedding-3-small',
    }), { loadOnDemand: true });

    /* Register TempFileManagerSkill */
    // this.registerSkill(new TempFileManagerSkill());

  }

  async start()
  {
    const tempFileManager = this.skills.get('TempFileManagerSkill');
    await tempFileManager.deleteGlobalFiles();
    await tempFileManager.loadLocalFolder({ folderPath: assetsDirectory, permanent: true });
    await super.start();
  }
}
