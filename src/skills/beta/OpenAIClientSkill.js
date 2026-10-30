/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { Agent } from '../../Agent.js';
import { AgentUtils } from '../../AgentUtils.js';
import { OpenAIClient } from '../../net/client/openai/OpenAIClient.js';
import { OpenAIChatCompletion } from '../../net/client/openai/OpenAIChatCompletion.js';
import { OpenAIResponse } from '../../net/client/openai/OpenAIResponse.js';
import { OpenAIImageGenerate } from '../../net/client/openai/OpenAIImageGenerate.js';
import { OpenAIImageEdit } from '../../net/client/openai/OpenAIImageEdit.js';
import { OpenAIAudioSpeech } from '../../net/client/openai/OpenAIAudioSpeech.js';
import { OpenAITranscribe } from '../../net/client/openai/OpenAITranscribe.js';
import { OpenAIEmbedding } from '../../net/client/openai/OpenAIEmbedding.js';

const OPEN_AI_ENDPOINTS = {
  chatCompletion: 'chatCompletion',
  response: 'response',
  imageGenerate: 'imageGenerate',
  imageEdit: 'imageEdit',
  audioSpeech: 'audioSpeech',
  audioTranscription: 'audioTranscription',
  embedding: 'embedding',
};

const OPEN_AI_ENDPOINT_NAMES = Object.values(OPEN_AI_ENDPOINTS);

export class OpenAIClientSkill extends AgentSkill
{
  constructor()
  {
    super();

    this.defaultRequestTimeoutMs = 120000;
    this.requestTimeoutMsMin = 1000;
    this.requestTimeoutMsMax = 1800000;

    this.chatCompletionFactory = OpenAIChatCompletion;
    this.responseFactory = OpenAIResponse;
    this.imageGenerateFactory = OpenAIImageGenerate;
    this.imageEditFactory = OpenAIImageEdit;
    this.audioSpeechFactory = OpenAIAudioSpeech;
    this.audioTranscriptionFactory = OpenAITranscribe;
    this.embeddingFactory = OpenAIEmbedding;

    this.servers = new Map();
    this.servers.set(Agent.GLOBAL_STREAM_ID, new Map());

this.description = `
Provides access to OpenAI-compatible AI servers and models.
Use it to discover available models, run chat or vision completions, generate embeddings, generate or edit images, synthesize speech, and transcribe audio.
Supports multiple servers with per-server and per-model configuration.`
.trim();

    this.tools = [
      {
        type: 'function',
        name: 'open_ai_register_server',
        description: 'Registers or updates a server configuration used by OpenAI-compatible endpoints.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'Server key used as public model name prefix.',
            },
            url: {
              type: 'string',
              description: 'Base API URL for this server.',
            },
            apiKey: {
              type: 'string',
              description: 'API key used for this server.',
            },
            description: {
              type: ['string', 'null'],
              description: 'Optional server description.',
            },
            config: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional endpoint configs keyed by endpoint name.',
            },
          },
          required: ['server', 'url', 'apiKey'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_register_model',
        description: 'Registers or replaces one model configuration by public name server-modelId.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'Server key used to build public model name.',
            },
            modelId: {
              type: 'string',
              description: 'Provider model identifier sent to remote API.',
            },
            description: {
              type: ['string', 'null'],
              description: 'Optional model description.',
            },
            endpoints: {
              type: ['array', 'null'],
              items: {
                type: 'string',
                enum: OPEN_AI_ENDPOINT_NAMES,
              },
              description: 'Optional list of enabled endpoints for this model.',
            },
            config: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional endpoint configs overriding server defaults for this model.',
            },
          },
          required: ['server', 'modelId'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_load_server_models',
        description: 'Loads and registers models from server /models endpoint.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'Server key where models are loaded from.',
            },
            url: {
              type: ['string', 'null'],
              description: 'Optional server URL override when server does not exist yet.',
            },
            apiKey: {
              type: ['string', 'null'],
              description: 'Optional server API key override when server does not exist yet.',
            },
            description: {
              type: ['string', 'null'],
              description: 'Optional default model description when provider metadata is missing.',
            },
            endpoints: {
              type: ['array', 'null'],
              items: {
                type: 'string',
                enum: OPEN_AI_ENDPOINT_NAMES,
              },
              description: 'Optional endpoint list assigned to loaded models.',
            },
            config: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional endpoint config assigned to loaded models.',
            },
            chatCompletionOnly: {
              type: ['boolean', 'null'],
              description: 'When true, keeps only likely chat-completion-compatible models.',
            },
          },
          required: ['server'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_list_servers',
        description: 'Lists registered servers with base URL and model count.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_list_models',
        description: 'Lists registered models with server, modelId, public name, and endpoints.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: ['string', 'null'],
              description: 'Optional server filter.',
            },
            endpoint: {
              type: ['string', 'null'],
              enum: [...OPEN_AI_ENDPOINT_NAMES, null],
              description: 'Optional endpoint filter.',
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_call_chat_completion',
        description: 'Runs a chat completion request with an OpenAI-compatible model.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: ['string', 'null'],
              description: 'Optional inline prompt sent before input text files. Either prompt or inputTempFileNames is required.',
            },
            model: {
              type: 'string',
              description: 'Registered public model name.',
            },
            instructions: {
              type: ['string', 'null'],
              description: 'Optional system instructions.',
            },
            request: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional per-call request overrides.',
            },
            timeoutMs: {
              type: ['number', 'null'],
              description: 'Optional request timeout in milliseconds. Defaults to 120000.',
            },
            stream: {
              type: ['boolean', 'null'],
              description: 'When true, streams the provider response to measure time to first token and output throughput.',
            },
            inputTempFileNames: {
              type: ['array', 'null'],
              items: {
                type: 'string',
              },
              description: 'Optional input text files appended to prompt. Either prompt or inputTempFileNames is required.',
            },
            visionTempFileName: {
              type: ['string', 'null'],
              description: 'Optional image file used for vision-capable chat models.',
            },
            outputTempFileName: {
              type: ['string', 'null'],
              description: 'Optional output text file name.',
            },
          },
          required: ['model'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_call_response',
        description: 'Runs a request through the OpenAI Responses endpoint.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: ['string', 'null'],
              description: 'Optional inline prompt sent before input text files. Either prompt or inputTempFileNames is required.',
            },
            model: {
              type: 'string',
              description: 'Registered public model name.',
            },
            instructions: {
              type: ['string', 'null'],
              description: 'Optional system instructions.',
            },
            request: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional per-call request overrides.',
            },
            timeoutMs: {
              type: ['number', 'null'],
              description: 'Optional request timeout in milliseconds. Defaults to 120000.',
            },
            inputTempFileNames: {
              type: ['array', 'null'],
              items: {
                type: 'string',
              },
              description: 'Optional input text files appended to prompt. Either prompt or inputTempFileNames is required.',
            },
            outputTempFileName: {
              type: ['string', 'null'],
              description: 'Optional output text file name.',
            },
          },
          required: ['model'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_call_image_generate',
        description: 'Generates an image and stores it in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Image generation prompt.',
            },
            model: {
              type: 'string',
              description: 'Registered public model name.',
            },
            outputTempFileName: {
              type: 'string',
              description: 'Target temp file name.',
            },
            outputMimeType: {
              type: 'string',
              enum: ['image/png', 'image/jpeg', 'image/webp'],
              description: 'Output mime type.',
            },
            size: {
              type: ['string', 'null'],
              description: 'Optional output size, for example 1024x1024.',
            },
            request: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional per-call request overrides.',
            },
            timeoutMs: {
              type: ['number', 'null'],
              description: 'Optional request timeout in milliseconds. Defaults to 120000.',
            },
          },
          required: ['prompt', 'model', 'outputTempFileName', 'outputMimeType'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_call_embedding',
        description: 'Creates vector embeddings with an OpenAI-compatible model.',
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
              },
              description: 'Texts to embed. Returned vectors preserve this order.',
            },
            model: {
              type: 'string',
              description: 'Registered public model name.',
            },
            dimensions: {
              type: ['integer', 'null'],
              minimum: 1,
              description: 'Optional vector dimensions for models that support this parameter.',
            },
            encodingFormat: {
              type: ['string', 'null'],
              enum: ['float', 'base64', null],
              description: 'Optional embedding encoding format. Defaults to float.',
            },
            user: {
              type: ['string', 'null'],
              description: 'Optional provider user identifier.',
            },
            request: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional per-call request overrides.',
            },
            timeoutMs: {
              type: ['number', 'null'],
              description: 'Optional request timeout in milliseconds. Defaults to 120000.',
            },
          },
          required: ['input', 'model'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_call_image_edit',
        description: 'Edits one or more images and stores the result in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Image editing prompt.',
            },
            model: {
              type: 'string',
              description: 'Registered public model name.',
            },
            inputImages: {
              type: 'array',
              minItems: 1,
              maxItems: 16,
              items: {
                type: 'object',
                properties: {
                  tempFileName: {
                    type: 'string',
                    description: 'Source image temp file name.',
                  },
                  role: {
                    type: 'string',
                    enum: ['source', 'style_reference', 'content_reference', 'part_reference'],
                    description: 'How this image should be used.',
                  },
                  description: {
                    type: 'string',
                    description: 'Short usage description.',
                  },
                },
                required: ['tempFileName', 'role', 'description'],
                additionalProperties: false,
              },
            },
            maskTempFileName: {
              type: ['string', 'null'],
              description: 'Optional mask image temp file name. Transparent mask areas indicate where the source image may be edited.',
            },
            outputTempFileName: {
              type: 'string',
              description: 'Target temp file name.',
            },
            outputMimeType: {
              type: 'string',
              enum: ['image/png', 'image/jpeg', 'image/webp'],
              description: 'Output mime type.',
            },
            size: {
              type: ['string', 'null'],
              description: 'Optional output size.',
            },
            request: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional per-call request overrides.',
            },
            timeoutMs: {
              type: ['number', 'null'],
              description: 'Optional request timeout in milliseconds. Defaults to 120000.',
            },
          },
          required: ['prompt', 'model', 'inputImages', 'outputTempFileName', 'outputMimeType'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_call_audio_speech',
        description: 'Generates speech audio from text and stores it in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Text to synthesize.',
            },
            model: {
              type: 'string',
              description: 'Registered public model name.',
            },
            outputTempFileName: {
              type: 'string',
              description: 'Target audio temp file name.',
            },
            outputFormat: {
              type: 'string',
              enum: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
              description: 'Requested audio format.',
            },
            voice: {
              type: ['string', 'null'],
              description: 'Optional voice override.',
            },
            speed: {
              type: ['number', 'null'],
              description: 'Optional speed override.',
            },
            instructions: {
              type: ['string', 'null'],
              description: 'Optional speech style instructions.',
            },
            request: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional per-call request overrides.',
            },
            timeoutMs: {
              type: ['number', 'null'],
              description: 'Optional request timeout in milliseconds. Defaults to 120000.',
            },
          },
          required: ['input', 'model', 'outputTempFileName', 'outputFormat'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_call_audio_transcription',
        description: 'Transcribes an audio file stored in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: 'Audio temp file name.',
            },
            model: {
              type: 'string',
              description: 'Registered public model name.',
            },
            language: {
              type: ['string', 'null'],
              description: 'Optional language code, for example fr or en.',
            },
            prompt: {
              type: ['string', 'null'],
              description: 'Optional transcription prompt.',
            },
            request: {
              type: ['object', 'null'],
              additionalProperties: true,
              description: 'Optional per-call request overrides.',
            },
            timeoutMs: {
              type: ['number', 'null'],
              description: 'Optional request timeout in milliseconds. Defaults to 120000.',
            },
          },
          required: ['tempFileName', 'model'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
      - To get the full list of models available from a server, use open_ai_load_server_models.
      - Register servers with open_ai_register_server.
      - Register models with open_ai_register_model.
      - Optionally import models with open_ai_load_server_models.
      - Inspect with open_ai_list_servers and open_ai_list_models.
      - Use open_ai_call_chat_completion for text/vision chat tasks.
      - Use open_ai_call_response to test models through the OpenAI Responses endpoint.
      - For chat completion and response calls, provide an inline prompt, inputTempFileNames, or both. Prefer files for large prompts.
      - Use open_ai_call_embedding to create vectors for semantic search, similarity, clustering, or retrieval.
      - Use open_ai_call_image_generate to create images.
      - Use open_ai_call_image_edit to edit existing images.
      - Use open_ai_call_audio_speech to synthesize text into audio files.
      - Use open_ai_call_audio_transcription to transcribe audio files.
      - Request precedence is server.config[endpoint] then model.config[endpoint] then call request.
      - Setting a request key to null removes the inherited value for that call.
    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      open_ai_call_chat_completion: '💬 calling OpenAI chat completion',
      open_ai_call_response: '💬 calling OpenAI response',
      open_ai_call_embedding: '🧮 creating OpenAI embeddings',
      open_ai_call_image_generate: '🎨 generating image with OpenAI',
      open_ai_call_image_edit: '🖌️ editing image with OpenAI',
      open_ai_call_audio_speech: '🔊 calling OpenAI audio speech',
      open_ai_call_audio_transcription: '🎙️ calling OpenAI audio transcription',
      open_ai_register_server: '🖥️ registering OpenAI server',
      open_ai_register_model: '🧠 registering OpenAI model',
      open_ai_list_servers: '📋 listing OpenAI servers',
      open_ai_list_models: '📋 listing OpenAI models',
      open_ai_load_server_models: '📥 loading OpenAI server models',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'open_ai_call_chat_completion':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.model, 64);
        break;
      }

      case 'open_ai_call_response':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.model, 64);
        break;
      }

      case 'open_ai_call_embedding':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.model, 64);
        break;
      }

      case 'open_ai_call_image_generate':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.outputTempFileName, 64);
        break;
      }

      case 'open_ai_call_image_edit':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.outputTempFileName, 64);
        break;
      }

      case 'open_ai_call_audio_speech':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.outputTempFileName, 64);
        break;
      }

      case 'open_ai_call_audio_transcription':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'open_ai_register_server':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.server, 64);
        break;
      }

      case 'open_ai_register_model':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.modelId, 64);
        break;
      }

      case 'open_ai_list_servers':
      {
        toolArgsReadable = '';
        break;
      }

      case 'open_ai_list_models':
      {
        toolArgsReadable = '';
        break;
      }

      case 'open_ai_load_server_models':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.server, 64);
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

  async open_ai_register_server(args, context = {})
  {
    return this.registerServer(args.server, {
      description: args.description,
      apiKey: args.apiKey,
      url: args.url,
      config: args.config,
    }, this._resolveStreamId(context.streamId));
  }

  async open_ai_register_model(args, context = {})
  {
    return this.registerModel(args.server, args.modelId, {
      description: args.description,
      endpoints: args.endpoints,
      config: args.config,
    }, this._resolveStreamId(context.streamId));
  }

  async open_ai_load_server_models(args, context = {})
  {
    return await this.registerServerModels(args.server, {
      description: args.description,
      apiKey: args.apiKey,
      url: args.url,
      endpoints: args.endpoints,
      config: args.config,
      chatCompletionOnly: args.chatCompletionOnly,
    }, this._resolveStreamId(context.streamId));
  }

  async open_ai_list_servers(args = {}, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const streamServers = this._getStreamServers(streamId);
    const servers = [];

    for (const [serverName, serverConfig] of streamServers.entries())
    {
      servers.push({
        server: serverName,
        url: serverConfig.url ?? null,
        description: serverConfig.description ?? null,
        modelCount: (serverConfig.models ?? new Map()).size,
      });
    }

    servers.sort((left, right) => left.server.localeCompare(right.server));

    return {
      success: true,
      count: servers.length,
      servers,
    };
  }

  async open_ai_list_models(args = {}, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const streamServers = this._getStreamServers(streamId);
    const serverFilter = args.server == null ? null : AgentUtils.normalizeRequiredString(args.server, 'server');
    const endpointFilter = args.endpoint == null ? null : this._normalizeEndpoint(args.endpoint, 'endpoint');
    const models = [];

    for (const [serverName, serverConfig] of streamServers.entries())
    {
      if (serverFilter && serverName !== serverFilter)
      {
        continue;
      }

      for (const [modelId, modelConfig] of (serverConfig.models ?? new Map()).entries())
      {
        if (endpointFilter && !modelConfig.endpoints.includes(endpointFilter))
        {
          continue;
        }

        models.push({
          server: serverName,
          modelId,
          name: modelConfig.name,
          endpoints: [...modelConfig.endpoints],
          url: serverConfig.url ?? null,
        });
      }
    }

    models.sort((left, right) => left.name.localeCompare(right.name));

    return {
      success: true,
      count: models.length,
      models,
    };
  }

  async open_ai_call_chat_completion(args, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const modelConfig = this._getModelConfigByPublicName(args.model, streamId);
    this._assertModelSupportsEndpoint(modelConfig, OPEN_AI_ENDPOINTS.chatCompletion, args.model);

    const serverConfig = this._getServerConfig(modelConfig.server, streamId);
    const endpointRequest = this._resolveEndpointRequest(
      serverConfig.config,
      modelConfig.config,
      OPEN_AI_ENDPOINTS.chatCompletion,
      args.request
    );

    const requestPayload = {
      ...endpointRequest,
      model: modelConfig.modelId,
    };

    const attachedVisionTempFileName = args.visionTempFileName?.trim() || null;
    const textInput = await this._buildTextInput(args.prompt, args.inputTempFileNames, streamId, context);
    const attachedInputTempFiles = textInput.inputTempFileNames;
    let input = textInput.input;

    if (attachedVisionTempFileName)
    {
      const file = await this.tempFileManagerSkill._getFile(attachedVisionTempFileName, streamId, true, context);
      const base64 = await this.tempFileManagerSkill.temp_file_read({
        tempFileName: attachedVisionTempFileName,
        encoding: 'base64',
        startLine: null,
        endLine: null,
        applyLimit: false,
        allowBinaryBase64: true,
      }, { ...context, streamId });

      input = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: input,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${file.mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ];
    }

    const chatCompletionClient = this._createClient(this.chatCompletionFactory, {
      apiKey: serverConfig.apiKey,
      url: serverConfig.url,
      request: endpointRequest,
      stream: args.stream ?? false,
    });

    const options = {
      request: requestPayload,
      input,
      signal: this._createRequestTimeoutSignal(args.timeoutMs),
    };

    if (args.instructions != null && args.instructions.trim())
    {
      options.instructions = args.instructions;
    }

    const resolvedTimeoutMs = this._resolveRequestTimeoutMs(args.timeoutMs);
    const response = await this._runWithTimeoutHandling(
      () => chatCompletionClient.generate(options),
      OPEN_AI_ENDPOINTS.chatCompletion,
      resolvedTimeoutMs
    );
    const text = response?.assistant_text ?? response?.choices?.[0]?.message?.content ?? '';

    const result = {
      success: true,
      endpoint: OPEN_AI_ENDPOINTS.chatCompletion,
      model: args.model,
      modelId: modelConfig.modelId,
      server: modelConfig.server,
      request: {
        apiBaseUrl: serverConfig.url,
        inheritedServer: serverConfig.config?.[OPEN_AI_ENDPOINTS.chatCompletion] ?? null,
        inheritedModel: modelConfig.config?.[OPEN_AI_ENDPOINTS.chatCompletion] ?? null,
        requestOverrides: args.request ?? null,
        requestEffective: endpointRequest,
        requestPayload,
        instructions: options.instructions ?? null,
      },
      files: {
        inputTempFileNames: attachedInputTempFiles,
        visionTempFileName: attachedVisionTempFileName,
        outputTempFileName: args.outputTempFileName ?? null,
      },
      text,
      usage: response?.usage ?? null,
      response,
    };

    if (args.outputTempFileName)
    {
      await this._writeTextToTempFile(args.outputTempFileName, text, streamId, context);
      result.tempFileName = args.outputTempFileName;
      result.mimeType = 'text/plain';
      result.size = String(text ?? '').length;
      delete result.text;
    }

    return result;
  }

  async open_ai_call_response(args, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const modelConfig = this._getModelConfigByPublicName(args.model, streamId);
    this._assertModelSupportsEndpoint(modelConfig, OPEN_AI_ENDPOINTS.response, args.model);

    const serverConfig = this._getServerConfig(modelConfig.server, streamId);
    const endpointRequest = this._resolveEndpointRequest(
      serverConfig.config,
      modelConfig.config,
      OPEN_AI_ENDPOINTS.response,
      args.request
    );
    const responseClient = this._createClient(this.responseFactory, {
      apiKey: serverConfig.apiKey,
      url: serverConfig.url,
      request: endpointRequest,
    });
    const textInput = await this._buildTextInput(args.prompt, args.inputTempFileNames, streamId, context);
    const resolvedTimeoutMs = this._resolveRequestTimeoutMs(args.timeoutMs);
    const response = await this._runWithTimeoutHandling(
      () => responseClient.generate({
        model: modelConfig.modelId,
        input: textInput.input,
        instructions: args.instructions,
        signal: this._createRequestTimeoutSignal(args.timeoutMs),
      }),
      OPEN_AI_ENDPOINTS.response,
      resolvedTimeoutMs
    );
    const text = response.outputText;
    const result = {
      success: true,
      endpoint: OPEN_AI_ENDPOINTS.response,
      model: args.model,
      modelId: modelConfig.modelId,
      server: modelConfig.server,
      request: {
        apiBaseUrl: serverConfig.url,
        inheritedServer: serverConfig.config?.[OPEN_AI_ENDPOINTS.response] ?? null,
        inheritedModel: modelConfig.config?.[OPEN_AI_ENDPOINTS.response] ?? null,
        requestOverrides: args.request ?? null,
        requestEffective: endpointRequest,
      },
      files: {
        inputTempFileNames: textInput.inputTempFileNames,
        outputTempFileName: args.outputTempFileName ?? null,
      },
      text,
      usage: response.usage,
      ...(response.cost != null ? { cost: response.cost } : {}),
      response,
    };

    if (args.outputTempFileName)
    {
      await this._writeTextToTempFile(args.outputTempFileName, text, streamId, context);
      result.tempFileName = args.outputTempFileName;
      result.mimeType = 'text/plain';
      result.size = text.length;
      delete result.text;
    }

    return result;
  }

  async _buildTextInput(prompt, inputTempFileNames, streamId, context)
  {
    const inputSections = [];
    const attachedInputTempFileNames = [];

    if (typeof prompt === 'string' && prompt.length > 0)
    {
      inputSections.push(prompt);
    }

    if (Array.isArray(inputTempFileNames))
    {
      for (const inputTempFileName of inputTempFileNames)
      {
        const normalizedInputTempFileName = AgentUtils.normalizeRequiredString(inputTempFileName, 'inputTempFileNames item');
        const content = await this.tempFileManagerSkill.temp_file_read({
          tempFileName: normalizedInputTempFileName,
          encoding: 'utf8',
          startLine: null,
          endLine: null,
          applyLimit: false,
        }, { ...context, streamId });

        attachedInputTempFileNames.push(normalizedInputTempFileName);
        inputSections.push(`Input file: ${normalizedInputTempFileName}\n${content}`);
      }
    }

    if (inputSections.length === 0)
    {
      throw new Error('Either prompt or inputTempFileNames is required');
    }

    return {
      input: inputSections.join('\n\n'),
      inputTempFileNames: attachedInputTempFileNames,
    };
  }

  async open_ai_call_embedding(args, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const modelConfig = this._getModelConfigByPublicName(args.model, streamId);
    this._assertModelSupportsEndpoint(modelConfig, OPEN_AI_ENDPOINTS.embedding, args.model);

    const serverConfig = this._getServerConfig(modelConfig.server, streamId);
    const endpointRequest = this._resolveEndpointRequest(
      serverConfig.config,
      modelConfig.config,
      OPEN_AI_ENDPOINTS.embedding,
      args.request
    );

    const embeddingClient = this._createClient(this.embeddingFactory, {
      apiKey: serverConfig.apiKey,
      url: serverConfig.url,
      model: modelConfig.modelId,
    });

    const requestPayload = {
      ...endpointRequest,
      model: modelConfig.modelId,
      input: args.input,
      dimensions: args.dimensions ?? endpointRequest.dimensions,
      encoding_format: args.encodingFormat ?? endpointRequest.encoding_format ?? 'float',
      user: args.user ?? endpointRequest.user,
    };

    if (requestPayload.dimensions == null)
    {
      delete requestPayload.dimensions;
    }

    if (requestPayload.user == null)
    {
      delete requestPayload.user;
    }

    const resolvedTimeoutMs = this._resolveRequestTimeoutMs(args.timeoutMs);
    const response = await this._runWithTimeoutHandling(
      () => embeddingClient.createEmbeddings({
        ...requestPayload,
        signal: AbortSignal.timeout(resolvedTimeoutMs),
      }),
      OPEN_AI_ENDPOINTS.embedding,
      resolvedTimeoutMs
    );

    return {
      success: true,
      endpoint: OPEN_AI_ENDPOINTS.embedding,
      model: args.model,
      modelId: modelConfig.modelId,
      server: modelConfig.server,
      embeddings: response.embeddings,
      usage: response.usage,
      ...(response.cost != null ? { cost: response.cost } : {}),
      request: {
        apiBaseUrl: serverConfig.url,
        inheritedServer: serverConfig.config?.[OPEN_AI_ENDPOINTS.embedding] ?? null,
        inheritedModel: modelConfig.config?.[OPEN_AI_ENDPOINTS.embedding] ?? null,
        requestOverrides: args.request ?? null,
        requestEffective: endpointRequest,
        requestPayload,
      },
      response,
    };
  }

  async open_ai_call_image_generate(args, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const modelConfig = this._getModelConfigByPublicName(args.model, streamId);
    this._assertModelSupportsEndpoint(modelConfig, OPEN_AI_ENDPOINTS.imageGenerate, args.model);

    const serverConfig = this._getServerConfig(modelConfig.server, streamId);
    const endpointRequest = this._resolveEndpointRequest(
      serverConfig.config,
      modelConfig.config,
      OPEN_AI_ENDPOINTS.imageGenerate,
      args.request
    );

    const outputFormat = this._mimeTypeToOutputFormat(args.outputMimeType);
    const imageGenerateClient = this._createClient(this.imageGenerateFactory, {
      apiKey: serverConfig.apiKey,
      url: serverConfig.url,
      model: modelConfig.modelId,
    });

    const resolvedTimeoutMs = this._resolveRequestTimeoutMs(args.timeoutMs);
    const requestSignal = AbortSignal.timeout(resolvedTimeoutMs);

    const requestPayload = {
      ...endpointRequest,
      model: modelConfig.modelId,
      prompt: args.prompt,
      output_format: outputFormat,
      size: args.size?.trim() || undefined,
    };

    const response = await this._runWithTimeoutHandling(
      () => imageGenerateClient.generateImage({
        ...requestPayload,
        signal: requestSignal,
      }),
      OPEN_AI_ENDPOINTS.imageGenerate,
      resolvedTimeoutMs
    );
    const imageBuffer = response.imageBuffer;

    await this._writeBufferToTempFile(args.outputTempFileName, args.outputMimeType, imageBuffer, streamId, context);

    return {
      success: true,
      endpoint: OPEN_AI_ENDPOINTS.imageGenerate,
      model: args.model,
      modelId: modelConfig.modelId,
      server: modelConfig.server,
      tempFileName: args.outputTempFileName,
      mimeType: args.outputMimeType,
      size: imageBuffer.length,
      request: {
        apiBaseUrl: serverConfig.url,
        inheritedServer: serverConfig.config?.[OPEN_AI_ENDPOINTS.imageGenerate] ?? null,
        inheritedModel: modelConfig.config?.[OPEN_AI_ENDPOINTS.imageGenerate] ?? null,
        requestOverrides: args.request ?? null,
        requestEffective: endpointRequest,
        requestPayload,
      },
      response,
    };
  }

  async open_ai_call_image_edit(args, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const modelConfig = this._getModelConfigByPublicName(args.model, streamId);
    this._assertModelSupportsEndpoint(modelConfig, OPEN_AI_ENDPOINTS.imageEdit, args.model);

    const serverConfig = this._getServerConfig(modelConfig.server, streamId);
    const endpointRequest = this._resolveEndpointRequest(
      serverConfig.config,
      modelConfig.config,
      OPEN_AI_ENDPOINTS.imageEdit,
      args.request
    );

    const inputImages = [];

    for (const inputImage of args.inputImages)
    {
      const file = await this.tempFileManagerSkill._getFile(inputImage.tempFileName, streamId, true, context);
      const base64 = await this.tempFileManagerSkill.temp_file_read({
        tempFileName: inputImage.tempFileName,
        encoding: 'base64',
        startLine: null,
        endLine: null,
        applyLimit: false,
        allowBinaryBase64: true,
      }, { ...context, streamId });

      inputImages.push({
        tempFileName: inputImage.tempFileName,
        role: inputImage.role,
        description: inputImage.description,
        imageBase64: base64,
        imageMimeType: file.mimeType,
      });
    }

    const referenceInstructions = inputImages
      .map((image, index) =>
      {
        return [
          `Image ${index + 1}:`,
          `- tempFileName: ${image.tempFileName}`,
          `- role: ${image.role}`,
          `- description: ${image.description}`,
        ].join('\n');
      })
      .join('\n\n');

    const prompt = [
      args.prompt,
      '',
      'Input image usage:',
      referenceInstructions,
      '',
      'Rules:',
      '- Use images with role "source" as the main image(s) to edit.',
      '- Use images with role "style_reference" only as visual style references.',
      '- Use images with role "content_reference" for subject, layout, composition, scene, pose, or structure.',
      '- Use images with role "part_reference" for object or element reuse.',
      '- Do not copy unrelated elements unless explicitly requested.',
    ].join('\n');

    const outputFormat = this._mimeTypeToOutputFormat(args.outputMimeType);
    const imageEditClient = this._createClient(this.imageEditFactory, {
      apiKey: serverConfig.apiKey,
      url: serverConfig.url,
      model: modelConfig.modelId,
    });

    const resolvedTimeoutMs = this._resolveRequestTimeoutMs(args.timeoutMs);
    const requestSignal = AbortSignal.timeout(resolvedTimeoutMs);
    const maskFile = args.maskTempFileName
      ? await this.tempFileManagerSkill._getFile(args.maskTempFileName, streamId, true, context)
      : null;
    const maskBase64 = args.maskTempFileName
      ? await this.tempFileManagerSkill.temp_file_read({
          tempFileName: args.maskTempFileName,
          encoding: 'base64',
          startLine: null,
          endLine: null,
          applyLimit: false,
          allowBinaryBase64: true,
        }, { ...context, streamId })
      : null;

    const requestPayload = {
      ...endpointRequest,
      model: modelConfig.modelId,
      prompt,
      images: inputImages.map((image) =>
      {
        return {
          imageBase64: image.imageBase64,
          imageMimeType: image.imageMimeType,
        };
      }),
      maskBase64,
      maskMimeType: maskFile?.mimeType,
      output_format: outputFormat,
      size: args.size?.trim() || undefined,
    };

    const response = await this._runWithTimeoutHandling(
      () => imageEditClient.editImage({
        ...requestPayload,
        signal: requestSignal,
      }),
      OPEN_AI_ENDPOINTS.imageEdit,
      resolvedTimeoutMs
    );
    const imageBuffer = response.imageBuffer;

    await this._writeBufferToTempFile(args.outputTempFileName, args.outputMimeType, imageBuffer, streamId, context);

    return {
      success: true,
      endpoint: OPEN_AI_ENDPOINTS.imageEdit,
      model: args.model,
      modelId: modelConfig.modelId,
      server: modelConfig.server,
      tempFileName: args.outputTempFileName,
      mimeType: args.outputMimeType,
      size: imageBuffer.length,
      request: {
        apiBaseUrl: serverConfig.url,
        inheritedServer: serverConfig.config?.[OPEN_AI_ENDPOINTS.imageEdit] ?? null,
        inheritedModel: modelConfig.config?.[OPEN_AI_ENDPOINTS.imageEdit] ?? null,
        requestOverrides: args.request ?? null,
        requestEffective: endpointRequest,
        requestPayload,
      },
      response,
      inputImages: inputImages.map((image) =>
      {
        return {
          tempFileName: image.tempFileName,
          role: image.role,
          description: image.description,
          mimeType: image.imageMimeType,
        };
      }),
    };
  }

  async open_ai_call_audio_speech(args, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const modelConfig = this._getModelConfigByPublicName(args.model, streamId);
    this._assertModelSupportsEndpoint(modelConfig, OPEN_AI_ENDPOINTS.audioSpeech, args.model);

    const serverConfig = this._getServerConfig(modelConfig.server, streamId);
    const endpointRequest = this._resolveEndpointRequest(
      serverConfig.config,
      modelConfig.config,
      OPEN_AI_ENDPOINTS.audioSpeech,
      args.request
    );

    const outputFormat = AgentUtils.normalizeRequiredString(args.outputFormat, 'outputFormat').toLowerCase();
    const outputTempFileName = AgentUtils.normalizeRequiredString(args.outputTempFileName, 'outputTempFileName');
    const expectedOutputTempFileName = AgentUtils.ensureExtension(outputTempFileName, outputFormat);

    if (expectedOutputTempFileName !== outputTempFileName)
    {
      throw new Error(`outputTempFileName must end with .${outputFormat}`);
    }

    const resolvedTimeoutMs = this._resolveRequestTimeoutMs(args.timeoutMs);
    const requestSignal = AbortSignal.timeout(resolvedTimeoutMs);

    const requestPayload = {
      ...endpointRequest,
      model: modelConfig.modelId,
      input: args.input,
      response_format: outputFormat,
      voice: args.voice ?? endpointRequest.voice,
      speed: args.speed ?? endpointRequest.speed,
      instructions: args.instructions ?? endpointRequest.instructions,
    };

    if (requestPayload.voice == null)
    {
      delete requestPayload.voice;
    }

    if (requestPayload.speed == null)
    {
      delete requestPayload.speed;
    }

    if (requestPayload.instructions == null)
    {
      delete requestPayload.instructions;
    }

    const audioSpeechClient = this._createClient(this.audioSpeechFactory, {
      apiKey: serverConfig.apiKey,
      url: serverConfig.url,
      model: modelConfig.modelId,
    });

    const response = await this._runWithTimeoutHandling(
      () => audioSpeechClient.generate({
        ...requestPayload,
        signal: requestSignal,
      }),
      OPEN_AI_ENDPOINTS.audioSpeech,
      resolvedTimeoutMs
    );
    const audioBuffer = response.audioBuffer;
    const mimeType = this._outputFormatToAudioMimeType(outputFormat);

    await this._writeBufferToTempFile(outputTempFileName, mimeType, audioBuffer, streamId, context);

    return {
      success: true,
      endpoint: OPEN_AI_ENDPOINTS.audioSpeech,
      model: args.model,
      modelId: modelConfig.modelId,
      server: modelConfig.server,
      tempFileName: outputTempFileName,
      mimeType,
      outputFormat,
      size: audioBuffer.length,
      request: {
        apiBaseUrl: serverConfig.url,
        inheritedServer: serverConfig.config?.[OPEN_AI_ENDPOINTS.audioSpeech] ?? null,
        inheritedModel: modelConfig.config?.[OPEN_AI_ENDPOINTS.audioSpeech] ?? null,
        requestOverrides: args.request ?? null,
        requestEffective: endpointRequest,
        requestPayload,
      },
      response,
    };
  }

  async open_ai_call_audio_transcription(args, context = {})
  {
    const streamId = this._resolveStreamId(context.streamId);
    const modelConfig = this._getModelConfigByPublicName(args.model, streamId);
    this._assertModelSupportsEndpoint(modelConfig, OPEN_AI_ENDPOINTS.audioTranscription, args.model);

    const serverConfig = this._getServerConfig(modelConfig.server, streamId);
    const endpointRequest = this._resolveEndpointRequest(
      serverConfig.config,
      modelConfig.config,
      OPEN_AI_ENDPOINTS.audioTranscription,
      args.request
    );

    const file = await this.tempFileManagerSkill._getFile(args.tempFileName, streamId, true, context);
    const base64 = await this.tempFileManagerSkill.temp_file_read({
      tempFileName: args.tempFileName,
      encoding: 'base64',
      startLine: null,
      endLine: null,
      applyLimit: false,
      allowBinaryBase64: true,
    }, { ...context, streamId });

    const transcriptionClient = this._createClient(this.audioTranscriptionFactory, {
      apiKey: serverConfig.apiKey,
      url: serverConfig.url,
      model: modelConfig.modelId,
    });

    const resolvedTimeoutMs = this._resolveRequestTimeoutMs(args.timeoutMs);
    const requestSignal = AbortSignal.timeout(resolvedTimeoutMs);

    const requestPayload = {
      ...endpointRequest,
      filename: args.tempFileName,
      mimeType: file.mimeType,
      base64,
      model: modelConfig.modelId,
      language: args.language ?? null,
      prompt: args.prompt ?? null,
    };

    const response = await this._runWithTimeoutHandling(
      () => transcriptionClient.transcribe({
        ...requestPayload,
        signal: requestSignal,
      }),
      OPEN_AI_ENDPOINTS.audioTranscription,
      resolvedTimeoutMs
    );
    const text = response?.payload?.text?.trim?.() ?? '';

    return {
      success: true,
      endpoint: OPEN_AI_ENDPOINTS.audioTranscription,
      model: args.model,
      modelId: modelConfig.modelId,
      server: modelConfig.server,
      tempFileName: args.tempFileName,
      request: {
        apiBaseUrl: serverConfig.url,
        inheritedServer: serverConfig.config?.[OPEN_AI_ENDPOINTS.audioTranscription] ?? null,
        inheritedModel: modelConfig.config?.[OPEN_AI_ENDPOINTS.audioTranscription] ?? null,
        requestOverrides: args.request ?? null,
        requestEffective: endpointRequest,
        requestPayload: {
          ...requestPayload,
          base64: '[base64]'
        },
      },
      text,
      response,
    };
  }

  get tempFileManagerSkill()
  {
    return this.agent.skills.get('TempFileManagerSkill');
  }

  async registerServerModels(server, config = {}, streamId = Agent.GLOBAL_STREAM_ID)
  {
    const normalizedStreamId = this._resolveStreamId(streamId);
    const normalizedServer = AgentUtils.normalizeRequiredString(server, 'server');

    this._upsertServerConfig(normalizedServer, config, normalizedStreamId);
    const serverConfig = this._getServerConfig(normalizedServer, normalizedStreamId);

    if (!String(serverConfig.url ?? '').trim())
    {
      throw new Error(`Missing url for server "${normalizedServer}" while loading /models.`);
    }

    const openAIClient = new OpenAIClient({
      apiKey: serverConfig.apiKey,
      url: serverConfig.url,
    });

    const { endpointUrl, payload } = await openAIClient.getModels();
    const candidateModels = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
    const chatCompletionOnly = config.chatCompletionOnly !== false;
    const defaultEndpoints = Array.isArray(config.endpoints) && config.endpoints.length
      ? config.endpoints
      : [OPEN_AI_ENDPOINTS.chatCompletion];

    const registered = [];
    const skipped = [];

    for (const candidateModel of candidateModels)
    {
      const candidateModelId = this._extractModelId(candidateModel);

      if (!candidateModelId)
      {
        skipped.push({
          reason: 'missing_model_id',
          model: candidateModel ?? null,
        });
        continue;
      }

      if (chatCompletionOnly && !this._isChatCompletionModel(candidateModel))
      {
        skipped.push({
          modelId: candidateModelId,
          reason: 'filtered_non_chat_completion',
        });
        continue;
      }

      const registerResult = this.registerModel(normalizedServer, candidateModelId, {
        description: candidateModel?.description ?? config.description,
        endpoints: defaultEndpoints,
        config: config.config ?? null,
      }, normalizedStreamId);

      registered.push(registerResult.name);
    }

    return {
      success: true,
      server: normalizedServer,
      endpointUrl,
      chatCompletionOnly,
      discoveredCount: candidateModels.length,
      registeredCount: registered.length,
      skippedCount: skipped.length,
      registered,
      skipped,
    };
  }

  registerServer(name, config = {}, streamId = Agent.GLOBAL_STREAM_ID)
  {
    const normalizedStreamId = this._resolveStreamId(streamId);
    const normalizedServer = AgentUtils.normalizeRequiredString(name, 'server');
    const normalizedUrl = AgentUtils.normalizeRequiredString(config.url, 'url');
    const normalizedApiKey = AgentUtils.normalizeRequiredString(config.apiKey, 'apiKey');

    const serverConfig = this._upsertServerConfig(normalizedServer, {
      ...config,
      url: normalizedUrl,
      apiKey: normalizedApiKey,
    }, normalizedStreamId);

    return {
      success: true,
      server: normalizedServer,
      serverRegistered: true,
      serverConfig: {
        server: normalizedServer,
        url: serverConfig.url,
        description: serverConfig.description ?? null,
      },
    };
  }

  registerModel(server, modelId, config = {}, streamId = Agent.GLOBAL_STREAM_ID)
  {
    const normalizedStreamId = this._resolveStreamId(streamId);
    const streamServers = this._getStreamServers(normalizedStreamId);
    const normalizedServer = AgentUtils.normalizeRequiredString(server, 'server');
    const normalizedModelId = AgentUtils.normalizeRequiredString(modelId, 'modelId');

    if (!streamServers.has(normalizedServer))
    {
      throw new Error(`Server "${normalizedServer}" is not registered. Call registerServer first.`);
    }

    const normalizedEndpoints = this._normalizeEndpoints(config.endpoints);
    const serverConfig = this._getServerConfig(normalizedServer, normalizedStreamId);
    const serverModels = serverConfig.models ?? new Map();

    const modelConfig = {
      server: normalizedServer,
      modelId: normalizedModelId,
      get name()
      {
        return `${this.server}-${this.modelId}`;
      },
      description: config.description ?? null,
      endpoints: normalizedEndpoints,
      config: this._normalizeEndpointConfig(config.config),
    };

    serverModels.set(normalizedModelId, modelConfig);
    serverConfig.models = serverModels;
    streamServers.set(normalizedServer, serverConfig);

    return {
      success: true,
      server: normalizedServer,
      modelId: normalizedModelId,
      name: modelConfig.name,
      endpoints: [...modelConfig.endpoints],
    };
  }

  // Compatibility aliases for previous source-based API.
  async registerSourceModels(source, config = {}, streamId = Agent.GLOBAL_STREAM_ID)
  {
    return await this.registerServerModels(source, config, streamId);
  }

  registerSource(name, config = {}, streamId = Agent.GLOBAL_STREAM_ID)
  {
    return this.registerServer(name, config, streamId);
  }

  _resolveStreamId(streamId)
  {
    if (typeof streamId !== 'string' || !streamId.trim())
    {
      throw new Error('streamId is required. Use Agent.GLOBAL_STREAM_ID for global scope.');
    }

    return streamId.trim();
  }

  _getStreamServers(streamId = Agent.GLOBAL_STREAM_ID)
  {
    return this._cloneStreamServers(streamId);
  }

  _cloneStreamServers(streamId)
  {
    const normalizedStreamId = this._resolveStreamId(streamId);

    if (normalizedStreamId === Agent.GLOBAL_STREAM_ID)
    {
      const globalServers = this.servers.get(Agent.GLOBAL_STREAM_ID);

      if (globalServers)
      {
        return globalServers;
      }

      const newGlobalServers = new Map();
      this.servers.set(Agent.GLOBAL_STREAM_ID, newGlobalServers);

      return newGlobalServers;
    }

    const existingServers = this.servers.get(normalizedStreamId);

    if (existingServers)
    {
      return existingServers;
    }

    const globalServers = this._cloneStreamServers(Agent.GLOBAL_STREAM_ID);
    const clonedServers = new Map();

    for (const [serverName, serverConfig] of globalServers.entries())
    {
      const clonedModels = new Map();

      for (const [modelId, modelConfig] of (serverConfig.models ?? new Map()).entries())
      {
        clonedModels.set(modelId, {
          server: serverName,
          modelId: modelConfig.modelId,
          get name()
          {
            return `${this.server}-${this.modelId}`;
          },
          description: modelConfig.description ?? null,
          endpoints: [...(modelConfig.endpoints ?? [OPEN_AI_ENDPOINTS.chatCompletion])],
          config: this._normalizeEndpointConfig(modelConfig.config),
        });
      }

      clonedServers.set(serverName, {
        url: serverConfig.url ?? null,
        apiKey: serverConfig.apiKey ?? null,
        description: serverConfig.description ?? null,
        config: this._normalizeEndpointConfig(serverConfig.config),
        models: clonedModels,
      });
    }

    this.servers.set(normalizedStreamId, clonedServers);

    return clonedServers;
  }

  _upsertServerConfig(server, config = {}, streamId = Agent.GLOBAL_STREAM_ID)
  {
    const streamServers = this._getStreamServers(streamId);
    const currentConfig = streamServers.get(server) ?? {
      url: null,
      apiKey: null,
      description: null,
      config: this._normalizeEndpointConfig(null),
      models: new Map(),
    };

    const normalizedUrl = config.url == null ? currentConfig.url : String(config.url).trim();
    const normalizedApiKey = config.apiKey == null ? null : String(config.apiKey).trim();

    const nextConfig = {
      url: normalizedUrl || null,
      apiKey: normalizedApiKey ? normalizedApiKey : currentConfig.apiKey,
      description: config.description !== undefined ? config.description : currentConfig.description,
      config: config.config !== undefined ? this._normalizeEndpointConfig(config.config) : this._normalizeEndpointConfig(currentConfig.config),
      models: currentConfig.models ?? new Map(),
    };

    streamServers.set(server, nextConfig);

    return nextConfig;
  }

  _resolveRequestTimeoutMs(timeoutMs = null)
  {
    return timeoutMs == null
      ? this.defaultRequestTimeoutMs
      : this._normalizeTimeoutMs(timeoutMs);
  }

  _createRequestTimeoutSignal(timeoutMs = null)
  {
    return AbortSignal.timeout(this._resolveRequestTimeoutMs(timeoutMs));
  }

  async _runWithTimeoutHandling(fn, endpointName, timeoutMs)
  {
    try
    {
      return await fn();
    }
    catch (error)
    {
      if (this._isTimeoutError(error))
      {
        const timeoutError = new Error(`OpenAI ${endpointName} request timed out after ${timeoutMs}ms`);
        timeoutError.cause = error;
        throw timeoutError;
      }

      throw error;
    }
  }

  _isTimeoutError(error)
  {
    if (!error)
    {
      return false;
    }

    if (error?.name === 'TimeoutError')
    {
      return true;
    }

    if (error?.name !== 'AbortError')
    {
      return false;
    }

    const errorText = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();

    return errorText.includes('timeout') || errorText.includes('timed out');
  }

  _normalizeTimeoutMs(timeoutMs)
  {
    const numericTimeoutMs = Number(timeoutMs);

    if (!Number.isFinite(numericTimeoutMs))
    {
      throw new Error('timeoutMs must be a finite number');
    }

    const integerTimeoutMs = Math.floor(numericTimeoutMs);

    if (integerTimeoutMs < this.requestTimeoutMsMin)
    {
      throw new Error(`timeoutMs must be >= ${this.requestTimeoutMsMin}`);
    }

    if (integerTimeoutMs > this.requestTimeoutMsMax)
    {
      throw new Error(`timeoutMs must be <= ${this.requestTimeoutMsMax}`);
    }

    return integerTimeoutMs;
  }

  _getServerConfig(server, streamId = Agent.GLOBAL_STREAM_ID)
  {
    const streamServers = this._getStreamServers(streamId);
    const serverConfig = streamServers.get(server);

    if (!serverConfig)
    {
      throw new Error(`Server "${server}" is not registered.`);
    }

    return serverConfig;
  }

  _getModelConfigByPublicName(publicModelName, streamId = Agent.GLOBAL_STREAM_ID)
  {
    const normalizedModelName = AgentUtils.normalizeRequiredString(publicModelName, 'model');
    const streamServers = this._getStreamServers(streamId);

    for (const [serverName, serverConfig] of streamServers.entries())
    {
      for (const [modelId, modelConfig] of (serverConfig.models ?? new Map()).entries())
      {
        if (`${serverName}-${modelId}` === normalizedModelName)
        {
          return modelConfig;
        }
      }
    }

    throw new Error(`Unknown model "${normalizedModelName}".`);
  }

  _normalizeEndpoint(endpoint, argName)
  {
    const normalizedEndpoint = AgentUtils.normalizeRequiredString(endpoint, argName);

    if (!OPEN_AI_ENDPOINT_NAMES.includes(normalizedEndpoint))
    {
      throw new Error(`Unknown endpoint "${normalizedEndpoint}".`);
    }

    return normalizedEndpoint;
  }

  _normalizeEndpoints(endpoints)
  {
    if (!Array.isArray(endpoints) || !endpoints.length)
    {
      return [...OPEN_AI_ENDPOINT_NAMES];
    }

    const normalizedEndpoints = [];
    const seen = new Set();

    for (const endpoint of endpoints)
    {
      const normalizedEndpoint = this._normalizeEndpoint(endpoint, 'endpoints item');

      if (seen.has(normalizedEndpoint))
      {
        continue;
      }

      seen.add(normalizedEndpoint);
      normalizedEndpoints.push(normalizedEndpoint);
    }

    return normalizedEndpoints;
  }

  _normalizeEndpointConfig(config)
  {
    const normalizedConfig = {};

    for (const endpointName of OPEN_AI_ENDPOINT_NAMES)
    {
      normalizedConfig[endpointName] = {};
    }

    if (!config || typeof config !== 'object' || Array.isArray(config))
    {
      return normalizedConfig;
    }

    for (const [endpointName, endpointConfig] of Object.entries(config))
    {
      if (!OPEN_AI_ENDPOINT_NAMES.includes(endpointName))
      {
        continue;
      }

      if (!endpointConfig || typeof endpointConfig !== 'object' || Array.isArray(endpointConfig))
      {
        normalizedConfig[endpointName] = {};
        continue;
      }

      normalizedConfig[endpointName] = this._cloneRequestConfig(endpointConfig) ?? {};
    }

    return normalizedConfig;
  }

  _resolveEndpointRequest(serverConfig, modelConfig, endpoint, requestOverride)
  {
    const normalizedServerConfig = this._normalizeEndpointConfig(serverConfig);
    const normalizedModelConfig = this._normalizeEndpointConfig(modelConfig);

    const inheritedServer = normalizedServerConfig[endpoint] ?? {};
    const inheritedModel = normalizedModelConfig[endpoint] ?? {};
    const mergedInherited = this._mergeRequestConfig(inheritedServer, inheritedModel);

    return this._mergeRequestConfig(mergedInherited, requestOverride);
  }

  _mergeRequestConfig(baseConfig, overrideConfig)
  {
    const mergedConfig = {
      ...(baseConfig && typeof baseConfig === 'object' ? baseConfig : {}),
    };

    if (!overrideConfig || typeof overrideConfig !== 'object' || Array.isArray(overrideConfig))
    {
      return mergedConfig;
    }

    for (const [configKey, configValue] of Object.entries(overrideConfig))
    {
      if (configValue == null)
      {
        delete mergedConfig[configKey];
        continue;
      }

      mergedConfig[configKey] = configValue;
    }

    return mergedConfig;
  }

  _cloneRequestConfig(request)
  {
    if (request == null)
    {
      return null;
    }

    if (typeof request !== 'object')
    {
      return request;
    }

    return structuredClone(request);
  }

  _assertModelSupportsEndpoint(modelConfig, endpoint, modelName)
  {
    if (!modelConfig?.endpoints?.includes(endpoint))
    {
      throw new Error(`Model "${modelName}" does not support endpoint "${endpoint}".`);
    }
  }

  _createClient(FactoryOrFactoryFunction, options)
  {
    return FactoryOrFactoryFunction?.prototype
      ? new FactoryOrFactoryFunction(options)
      : FactoryOrFactoryFunction(options);
  }

  _mimeTypeToOutputFormat(mimeType)
  {
    if (mimeType === 'image/jpeg')
    {
      return 'jpeg';
    }

    if (mimeType === 'image/webp')
    {
      return 'webp';
    }

    return 'png';
  }

  _outputFormatToAudioMimeType(outputFormat)
  {
    if (outputFormat === 'mp3')
    {
      return 'audio/mpeg';
    }

    if (outputFormat === 'opus')
    {
      return 'audio/opus';
    }

    if (outputFormat === 'aac')
    {
      return 'audio/aac';
    }

    if (outputFormat === 'flac')
    {
      return 'audio/flac';
    }

    if (outputFormat === 'wav')
    {
      return 'audio/wav';
    }

    if (outputFormat === 'pcm')
    {
      return 'audio/pcm';
    }

    throw new Error(`Unsupported output format: ${outputFormat}`);
  }

  async _writeTextToTempFile(tempFileName, content, streamId, context = {})
  {
    if ((await this.tempFileManagerSkill.getFiles(streamId, context)).has(tempFileName))
    {
      await this.tempFileManagerSkill.temp_file_remove({
        tempFileName,
      }, context);
    }

    await this.tempFileManagerSkill.temp_file_create({
      tempFileName,
      mimeType: 'text/plain',
      content: String(content ?? ''),
    }, context);
  }

  async _writeBufferToTempFile(tempFileName, mimeType, buffer, streamId, context = {})
  {
    if ((await this.tempFileManagerSkill.getFiles(streamId, context)).has(tempFileName))
    {
      await this.tempFileManagerSkill.temp_file_remove({
        tempFileName,
      }, context);
    }

    await this.tempFileManagerSkill.temp_file_create({
      tempFileName,
      mimeType,
    }, context);

    await this.tempFileManagerSkill.appendBuffer({
      tempFileName,
      data: buffer,
    }, context);
  }

  _extractModelId(model)
  {
    const value = model?.id ?? model?.model ?? model?.name ?? null;

    if (value == null)
    {
      return null;
    }

    const normalizedValue = String(value).trim();
    return normalizedValue || null;
  }

  _isChatCompletionModel(model)
  {
    const capabilities = model?.capabilities ?? model?.supported ?? null;

    if (capabilities && typeof capabilities === 'object')
    {
      if (capabilities.chatCompletion === true || capabilities.chat_completion === true || capabilities.chat === true)
      {
        return true;
      }

      if (capabilities.completion === false && capabilities.chatCompletion === false)
      {
        return false;
      }
    }

    const modalities = Array.isArray(model?.modalities) ? model.modalities : [];

    if (modalities.length)
    {
      const normalizedModalities = modalities.map((item) => String(item ?? '').toLowerCase());
      return normalizedModalities.includes('text') || normalizedModalities.includes('chat') || normalizedModalities.includes('text-in');
    }

    const modelType = String(model?.type ?? model?.object ?? '').toLowerCase();

    if (modelType.includes('embedding') || modelType.includes('rerank') || modelType.includes('audio') || modelType.includes('image'))
    {
      return false;
    }

    return true;
  }
}
