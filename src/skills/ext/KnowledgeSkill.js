/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AgentSkill } from '../../AgentSkill.js';

export class KnowledgeSkill extends AgentSkill
{
  constructor({ fileUrl, description })
  {
    super();

    this.filePath = fileURLToPath(fileUrl);
    this.description = description;
    this.content = fs.readFileSync(this.filePath, 'utf8').trim();
  }

  get name()
  {
    return path.basename(this.filePath, path.extname(this.filePath));
  }

  get usage()
  {
    return this.content;
  }
}