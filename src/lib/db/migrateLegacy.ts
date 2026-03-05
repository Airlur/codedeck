import { v4 as uuidv4 } from 'uuid';

import { db, setSyncMeta } from '@/lib/db/dexie';
import { sha256Text } from '@/lib/utils/hash';
import type { LegacyToolRecord, ToolRecord } from '@/types/schema';

const LEGACY_DB_NAME = 'CodeDeckDB';
const LEGACY_STORE_NAME = 'tools';
const MIGRATION_DONE_KEY = 'migration_v2_done';
const PRE_MIGRATION_BACKUP_KEY = 'backup-local-pre-migrate-v2';

function nowIso(): string {
  return new Date().toISOString();
}

function readLegacyTools(): Promise<LegacyToolRecord[]> {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve([]);
      return;
    }

    let settled = false;

    try {
      const request = indexedDB.open(LEGACY_DB_NAME, 1);
      request.onerror = () => {
        if (!settled) {
          settled = true;
          resolve([]);
        }
      };

      request.onsuccess = () => {
        try {
          const legacyDb = request.result;
          if (!legacyDb.objectStoreNames.contains(LEGACY_STORE_NAME)) {
            settled = true;
            resolve([]);
            return;
          }

          const tx = legacyDb.transaction(LEGACY_STORE_NAME, 'readonly');
          const store = tx.objectStore(LEGACY_STORE_NAME);
          const getAllReq = store.getAll();

          getAllReq.onsuccess = () => {
            if (!settled) {
              settled = true;
              resolve((getAllReq.result as LegacyToolRecord[]) ?? []);
            }
            legacyDb.close();
          };

          getAllReq.onerror = () => {
            if (!settled) {
              settled = true;
              resolve([]);
            }
            legacyDb.close();
          };
        } catch {
          if (!settled) {
            settled = true;
            resolve([]);
          }
        }
      };

      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve([]);
        }
      }, 1200);
    } catch {
      resolve([]);
    }
  });
}

function normalizeTodo(todo: LegacyToolRecord['todo']): ToolRecord['todo'] {
  const now = nowIso();
  if (Array.isArray(todo)) {
    return todo
      .filter((item) => item.text?.trim())
      .map((item) => ({
        id: item.id || uuidv4(),
        text: item.text.trim(),
        completed: Boolean(item.completed),
        updatedAt: now,
      }));
  }

  if (typeof todo === 'string') {
    return todo
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({
        id: uuidv4(),
        text,
        completed: false,
        updatedAt: now,
      }));
  }

  return [];
}

export async function migrateLegacyIfNeeded(
  repoHashMap: Map<string, { repoBaseId: string; fileName: string; name: string }>,
): Promise<void> {
  const migrated = await db.syncMeta.get(MIGRATION_DONE_KEY);
  if (migrated?.value === 'true') return;

  const existingCount = await db.tools.count();
  if (existingCount > 0) {
    await setSyncMeta(MIGRATION_DONE_KEY, 'true');
    return;
  }

  const legacyRows = await readLegacyTools();
  if (legacyRows.length === 0) {
    await setSyncMeta(MIGRATION_DONE_KEY, 'true');
    return;
  }

  const now = nowIso();
  const converted: ToolRecord[] = [];

  for (let index = 0; index < legacyRows.length; index += 1) {
    const row = legacyRows[index];
    if (!row.name?.trim()) continue;

    const hash = await sha256Text(row.code ?? '');
    const matchedRepo = repoHashMap.get(hash);

    if (matchedRepo) {
      converted.push({
        id: uuidv4(),
        repoId: matchedRepo.repoBaseId,
        origin: 'local',
        isOverride: true,
        isPublic: true,
        name: row.name.trim() || matchedRepo.name,
        description: row.description?.trim() ?? '',
        categoryId: null,
        tagIds: [],
        fileName: matchedRepo.fileName,
        runtime: 'html',
        language: 'html',
        code: row.code ?? '',
        todo: normalizeTodo(row.todo),
        pinned: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      continue;
    }

    converted.push({
      id: uuidv4(),
      repoId: null,
      origin: 'local',
      isOverride: false,
      isPublic: true,
      name: row.name.trim(),
      description: row.description?.trim() ?? '',
      categoryId: null,
      tagIds: [],
      fileName: `${row.name.trim() || `legacy-${index + 1}`}.html`,
      runtime: 'html',
      language: 'html',
      code: row.code ?? '',
      todo: normalizeTodo(row.todo),
      pinned: false,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  if (converted.length > 0) {
    const backup = {
      schemaVersion: 2,
      exportedAt: now,
      tools: converted,
      categories: [],
      tags: [],
    };
    await setSyncMeta(PRE_MIGRATION_BACKUP_KEY, JSON.stringify(backup));
    await db.tools.bulkPut(converted);
  }

  await setSyncMeta(MIGRATION_DONE_KEY, 'true');
}
