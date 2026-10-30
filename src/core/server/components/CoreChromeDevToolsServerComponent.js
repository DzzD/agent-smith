/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import crypto from 'node:crypto';
import { CoreServerComponent } from '../CoreServerComponent.js';
import { StaticFileServerComponent } from '../../../app/server/components/StaticFileServerComponent.js';

export class CoreChromeDevToolsServerComponent extends CoreServerComponent
{
    chromeDevToolsPath = '/.well-known/appspecific/com.chrome.devtools.json';

    chromeDevToolsUuid = null;

    constructor({ chromeDevToolsUuid = null } = {})
    {
        super();

        this.chromeDevToolsUuid = chromeDevToolsUuid ?? crypto.randomUUID();
    }

    async start()
    {
        this.server.application.use((request, response, next) =>
        {
            if (request.path !== this.chromeDevToolsPath)
            {
                next();
                return;
            }

            if (!this.server.devModeEnabled)
            {
                next();
                return;
            }

            response
                .type('application/json; charset=utf-8')
                .send(JSON.stringify(this.getChromeDevToolsDescriptor(), null, 2));
        });
    }

    getChromeDevToolsDescriptor()
    {
        const staticFileServerComponent = this.server.getServerComponent(StaticFileServerComponent);

        return {
            workspace:
            {
                root: staticFileServerComponent?.staticDirectory ?? null,
                uuid: this.chromeDevToolsUuid
            }
        };
    }
}