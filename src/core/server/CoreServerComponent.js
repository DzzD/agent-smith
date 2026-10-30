/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

export class CoreServerComponent
{
    #server = null;

    get server()
    {
        return this.#server;
    }

    set server(server)
    {
        this.#server = server;
    }

    async start()
    {
    }

    async stop()
    {
    }
}