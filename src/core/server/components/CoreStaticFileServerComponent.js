/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';

import { ServerComponent } from '../../../app/server/ServerComponent.js';
import { Log } from '../../../app/Log.js';

export class CoreStaticFileServerComponent extends ServerComponent
{
    directory;

    constructor(directory = 'public')
    {
        super();
        this.directory = directory;
    }

    get staticDirectory()
    {
        return path.resolve(this.server.baseDirectory, this.directory);
    }

    get fallbackDirectories()
    {
        return [
            'app',
            'core',
        ];
    }

    async start()
    {
        this.server.application.use(async (request, response, next) =>
        {
            try
            {
                const relativeFileName = request.path.replace(/^\/+/, '').replace(/\/$/, '/index.html') || 'index.html';
                const fileName = path.join(this.staticDirectory, relativeFileName);

                const result = await this.getStaticFile(fileName, request);

                if (result === null)
                {
                    next();
                    return;
                }

                response.type(path.extname(fileName)).send(result.content);
            }
            catch (error)
            {
                next(error);
            }
        });

        this.server.application.use(express.static(this.staticDirectory));
    }

    async getStaticFile(fileName, request)
    {
        Log.debug(`[CoreStaticFileServerComponent] ${request.path} => ${fileName}`);

        if (fileName.includes('.tpl.'))
        {
            const resolvedFileName = await this.resolveStaticFile(fileName, request);

            if (resolvedFileName === null)
            {
                return null;
            }

            const content = await fs.readFile(resolvedFileName, 'utf8');

            return { content };
        }

        const templateFileName = fileName.replace(/(\.[^./]+)$/, '.tpl$1');
        const resolvedTemplateFileName = await this.resolveStaticFile(templateFileName, request);

        if (resolvedTemplateFileName !== null)
        {
            let content = await fs.readFile(resolvedTemplateFileName, 'utf8');
            content = await this.processTemplate(content, resolvedTemplateFileName, request);

            return { content };
        }

        const resolvedFileName = await this.resolveStaticFile(fileName, request);

        if (resolvedFileName === null)
        {
            return null;
        }

        const content = await fs.readFile(resolvedFileName);

        return { content };
    }

    async resolveStaticFile(fileName, request)
    {
        try
        {
            await fs.access(fileName);
            return fileName;
        }
        catch
        {
            return await this.resolveFallbackStaticFile(fileName, request);
        }
    }

    async resolveFallbackStaticFile(fileName, request)
    {
        let relativeFileName = path.relative(this.staticDirectory, fileName).replaceAll('\\', '/');

        if (relativeFileName.startsWith('core/'))
        {
            return null;
        }

        let fallbackDirectories = this.fallbackDirectories;

        if (relativeFileName.startsWith('app/'))
        {
            relativeFileName = relativeFileName.replace(/^app\//, '');

            fallbackDirectories = [
                'core',
            ];
        }

        for (const fallbackDirectory of fallbackDirectories)
        {
            const fallbackFileName = path.join(this.staticDirectory, fallbackDirectory, relativeFileName);

            try
            {
                await fs.access(fallbackFileName);

                Log.debug(`[CoreStaticFileServerComponent] ${request.path} => ${fileName} => ${fallbackFileName}`);

                return fallbackFileName;
            }
            catch
            {
            }
        }

        return null;
    }

    async processTemplate(content, fileName, request)
    {
        return content;
    }
}