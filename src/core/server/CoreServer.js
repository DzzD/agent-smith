/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import express from 'express';
// import path from 'node:path';
// import { fileURLToPath } from 'node:url';
import { Log } from '../../app/Log.js';

export class CoreServer
{
    #application;
    #httpServer;
    #serverComponents;
    devModeEnabled;
    appName;

    constructor(options = {})
    {
        this.appName = "Your Application Name";
        this.devModeEnabled = false;
        this.#serverComponents = [];
        this.#application = express();
        this.#application.use(express.json(options.json ?? {}));
        this.#httpServer = null;
    }

    get baseDirectory()
    {
        throw new Error('baseDirectory must be implemented.');
    }
    
    get application()
    {
        return this.#application;
    }

    get httpServer()
    {
        return this.#httpServer;
    }

    getServerComponent(componentClass)
    {
        return this.#serverComponents.find((serverComponent) => serverComponent instanceof componentClass) ?? null;
    }

    async start(host = '127.0.0.1', port = 3000)
    {
        return new Promise((resolve, reject) =>
        {
            this.#httpServer = this.#application.listen(port, host, async () =>
            {
                try
                {
                    for (const serverComponent of this.#serverComponents)
                    {
                        await serverComponent.start();
                    }

                    Log.info(`[CoreServer] Server listening on "${host}" port "${port}"`);
                    Log.info(`[CoreServer] Open http://${host}:${port} to view your application.`);
                    resolve();
                }
                catch (error)
                {
                    reject(error);
                }
            });

            this.#httpServer.once('error', reject);
        });
    }

    async stop()
    {
        for (const serverComponent of [...this.#serverComponents].reverse())
        {
            await serverComponent.stop();
        }

        return new Promise((resolve, reject) =>
        {
            this.#httpServer.close((error) =>
            {
                if (error)
                {
                    reject(error);
                    return;
                }

                this.#httpServer = null;
                resolve();
            });
        });
    }

    get serverComponents()
    {
        return this.#serverComponents;
    }    

    registerServerComponent(serverComponent)
    {
        serverComponent.server = this;
        this.#serverComponents.push(serverComponent);
        return serverComponent;
    }
}
