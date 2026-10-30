/*
 * ONE-SHOT GENERATED FILE
 *
 * This file is generated once and can be freely modified.
 * You may add your own rules, methods, or overrides here.
 *
 * If this file is deleted, it can be generated again by re-running app-core.
 */

import { CoreAgentEvent } from '../../../core/db/models/CoreAgentEvent.js';

export class AgentEvent extends CoreAgentEvent
{
	async save(...args)
	{
		const result = await super.save(...args);
		const files = await this.getAgentFiles();

		if (files)
		{
			try
			{
				while (await files.next())
				{
					if (files.active !== this.active)
					{
						files.active = this.active;
						await files.save();
					}
				}
			}
			finally
			{
				files.close();
			}
		}

		return result;
	}
}
