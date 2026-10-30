/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

const BRAVE_SEARCH_REQUEST_COST = 0.005;

export class BraveSearchSkill extends AgentSkill
{
  constructor({
    apiKey,
    offset = 0,
    count = 20,
    country = 'FR',
    searchLang = 'fr',
    uiLang = 'fr-FR',
    summary = false,
    freshness = null,
  } = {})
  {
    super();
    this.apiKey = apiKey;
    this.offset = offset;
    this.count = count;
    this.country = country;
    this.searchLang = searchLang;
    this.uiLang = uiLang;
    this.summary = summary;
    this.freshness = freshness;
    this.description = 'Provides functions to search on Internet and news.';
    

    this.tools = [
      {
        type: 'function',
        name: 'brave_search',
        description: 'Performs a web search with Brave Search and returns the results.',
        parameters: this.#buildSearchParameters(),
      },
      {
        type: 'function',
        name: 'brave_news_search',
        description: 'Performs a news search with Brave Search News API and returns recent news articles.',
        parameters: this.#buildSearchParameters(),
      },
    ];
  }

  #buildSearchParameters()
  {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to send to Brave Search.',
        },
        count: {
          type: ['integer', 'null'],
          description: 'Number of results to return. Maximum 20. Default value is 20.',
          minimum: 1,
          maximum: 20,
        },
        offset: {
          type: ['integer', 'null'],
          description: 'Pagination offset. Minimum 0, maximum 9. Set to null to use the default value.',
          minimum: 0,
          maximum: 9,
        },
        summary: {
          type: ['boolean', 'null'],
          description: 'Enables Brave summary generation when supported. Set to null to use the default value.',
        },
        freshness: {
          type: ['string', 'null'],
          description: 'Freshness filter: pd, pw, pm, py, or a YYYY-MM-DDtoYYYY-MM-DD range. Set to null to disable filtering.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    };
  }

  get usage()
  {
    return `
Searching rules:
- Use brave_news_search for current news, press articles, breaking news, ...
- If brave_news_search returns no result, use brave_search as fallback.
- Use brave_search for general web search.
`;

//- Never answer factual questions about external information from BraveSearch snippets alone.
//- If no reliable source confirms the fact, explicitly say that no reliable public source was found.
// - Before sending a factual answer based on search results, open at least one relevant source URL with HttpSkill.

  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      brave_search: '🔎 searching the web with brave',
      brave_news_search: '📰 searching news with brave',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'brave_search':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.query, 64);
        break;
      }

      case 'brave_news_search':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.query, 64);
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

  async brave_news_search(args)
  {
    const result = await this.#search({
      endpoint: 'https://api.search.brave.com/res/v1/news/search',
      args,
      resultKey: 'news',
    });

    if (result.results.length)
    {
      return {
        ...result,
        fallback: false,
        fallbackFrom: null,
        noNewsResults: false,
      };
    }

    const fallback = await this.#search({
      endpoint: 'https://api.search.brave.com/res/v1/web/search',
      args,
      resultKey: 'web',
    });

    return {
      ...fallback,
      fallback: true,
      fallbackFrom: 'news',
      noNewsResults: true,
      cost: result.cost + fallback.cost,
      reason: 'brave_news_search returned no result, fallback to brave_search/web search was used.',
    };
  }

  async brave_search(args)
  {
    const result = await this.#search({
      endpoint: 'https://api.search.brave.com/res/v1/web/search',
      args,
      resultKey: 'web',
    });

    return {
      ...result,
      fallback: false,
      fallbackFrom: null,
      noNewsResults: false,
    };
  }

  async #search({ endpoint, args, resultKey })
  {
    const count = Math.min(
      20,
      Math.max(1, Number.isInteger(args.count) ? args.count : this.count)
    );

    const offset = Math.min(
      9,
      Math.max(0, Number.isInteger(args.offset) ? args.offset : this.offset)
    );

    const summary = typeof args.summary === 'boolean' ? args.summary : this.summary;
    const freshness = typeof args.freshness === 'string' ? args.freshness : this.freshness;

    const url = new URL(endpoint);
    url.searchParams.set('q', args.query);
    url.searchParams.set('count', String(count));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('text_decorations', 'false');

    if (freshness)
    {
      url.searchParams.set('freshness', freshness);
    }

    if (resultKey === 'web')
    {
      url.searchParams.set('country', this.country);
      url.searchParams.set('search_lang', this.searchLang);
      url.searchParams.set('ui_lang', this.uiLang);
      url.searchParams.set('summary', String(summary));
      url.searchParams.set('result_filter', summary ? 'web,summarizer' : 'web');
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
    });

    if (!response.ok)
    {
      throw new Error(`Brave Search error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const results = payload[resultKey]?.results ?? [];

    return {
      type: resultKey,
      query: payload.query?.original ?? args.query,
      count,
      offset,
      summary: resultKey === 'web' ? summary : null,
      freshness,
      summarizer: payload.summarizer ?? null,
      cost: BRAVE_SEARCH_REQUEST_COST,
      results: results.map((item) => ({
        title: item.title,
        url: item.url,
        description: item.description,
        age: item.age,
        pageAge: item.page_age,
        source: item.source,
        breaking: item.breaking,
        thumbnail: item.thumbnail?.src ?? null,
      })),
    };
  }
}
