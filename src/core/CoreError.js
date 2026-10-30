/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

export class CoreError extends Error
{
    constructor(message, originalError = null, context = {})
    {
        super(message);

        this.name = 'CoreError';
        this.originalError = originalError;
        this.context = context;
    }
}
