/**
 * AppCoreJS Framework
 * APP LAYER
 * INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import { CoreLog } from '../core/CoreLog.js';

export class Log extends CoreLog
{
}

Log.exclude(/^Core.*/i);
