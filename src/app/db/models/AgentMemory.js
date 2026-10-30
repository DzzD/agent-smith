/*
 * ONE-SHOT GENERATED FILE
 *
 * This file is generated once and can be freely modified.
 * You may add your own rules, methods, or overrides here.
 *
 * If this file is deleted, it can be generated again by re-running app-core.
 */

import { CoreAgentMemory } from '../../../core/db/models/CoreAgentMemory.js';
import { DbManager } from '../DbManager.js';
import { AgentMemoryFile } from './AgentMemoryFile.js';

export class AgentMemory extends CoreAgentMemory
{
	async saveReplacing(replaceMemoryUids = [], currentStreamUuid = null, files = [])
	{
		const connector = DbManager.getConnector(this._databaseName, this._connectionUid);
		const replacements = new AgentMemory(this._connectionUid);
		let replacementsSearched = false;

		await connector.beginTransaction();

		try
		{
			if (replaceMemoryUids.length > 0)
			{
				replacementsSearched = true;
				await replacements.search('"uuid" = ANY($1::uuid[])', [replaceMemoryUids]);

				const foundMemoryUids = new Set();

				while (await replacements.next())
				{
					const accessibleStream = replacements.streamUuid === null || replacements.streamUuid === currentStreamUuid;

					if (replacements.agentUuid !== this.agentUuid || !accessibleStream)
					{
						throw new Error('Every replaced memory must be accessible to the current agent and stream.');
					}

					foundMemoryUids.add(replacements.uuid);
				}

				if (foundMemoryUids.size !== replaceMemoryUids.length)
				{
					throw new Error('Every replaced memory must exist and be accessible to the current agent and stream.');
				}
			}

			await this.save(true);

			for (const file of files)
			{
				const memoryFile = new AgentMemoryFile(this._connectionUid);
				memoryFile.memoryUuid = this.uuid;
				memoryFile.name = file.name;
				memoryFile.mimeType = file.mimeType ?? null;
				memoryFile.data = file.data;
				memoryFile.description = file.description ?? null;
				await memoryFile.save(true);
			}

			for (const memoryUid of replaceMemoryUids)
			{
				const obsoleteMemory = new AgentMemory(this._connectionUid);
				obsoleteMemory.uuid = memoryUid;
				await obsoleteMemory.delete();
			}

			await connector.commit();
			return this;
		}
		catch (error)
		{
			await connector.rollback();
			throw error;
		}
		finally
		{
			if (replacementsSearched)
			{
				replacements.close();
			}

			connector.close();
		}
	}
}
