import { v4 as uuidv4 } from 'uuid';

import { db } from '@/lib/db/dexie';
import { loadRepoTools } from '@/lib/repo/repoToolsLoader';
import type { CategoryRecord, TagRecord, ToolRecord } from '@/types/schema';

const categoryPalette = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#7c3aed',
  '#e11d48',
  '#0ea5e9',
  '#f59e0b',
  '#14b8a6',
  '#f97316',
  '#22c55e',
];
const tagPalette = [
  '#22c55e',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#10b981',
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function ensureCategory(name: string, indexSeed: number): Promise<CategoryRecord> {
  const normalized = normalizeName(name);
  const existing = (await db.categories.toArray()).find(
    (item) => normalizeName(item.name) === normalized && item.deletedAt === null,
  );
  if (existing) return existing;

  const now = nowIso();
  const record: CategoryRecord = {
    id: uuidv4(),
    name,
    color: categoryPalette[indexSeed % categoryPalette.length],
    sortOrder: Date.now() + indexSeed,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.categories.put(record);
  return record;
}

async function ensureTags(tags: string[]): Promise<TagRecord[]> {
  const all = await db.tags.toArray();
  const result: TagRecord[] = [];
  let offset = 0;

  for (const rawName of tags) {
    const name = rawName.trim();
    if (!name) continue;

    const normalized = normalizeName(name);
    const existing = all.find((item) => normalizeName(item.name) === normalized && item.deletedAt === null);
    if (existing) {
      result.push(existing);
      continue;
    }

    const now = nowIso();
    const record: TagRecord = {
      id: uuidv4(),
      name,
      color: tagPalette[offset % tagPalette.length],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    offset += 1;
    await db.tags.put(record);
    all.push(record);
    result.push(record);
  }

  return result;
}

export async function syncRepoToolsToDB(): Promise<void> {
  const loadedTools = await loadRepoTools();

  await db.transaction('rw', db.tools, db.categories, db.tags, async () => {
    for (let index = 0; index < loadedTools.length; index += 1) {
      const tool = loadedTools[index];
      const now = nowIso();
      const category = await ensureCategory(tool.category, index);
      const tags = await ensureTags(tool.tags);
      const id = `repo:${tool.repoId}`;

      const existing = await db.tools.get(id);
      const nextBase: ToolRecord = {
        id,
        repoId: null,
        origin: 'repo',
        isOverride: false,
        isPublic: existing?.isPublic !== false,
        name: tool.name,
        description: tool.description,
        categoryId: category.id,
        tagIds: tags.map((item) => item.id),
        fileName: tool.fileName,
        runtime: tool.runtime,
        language: tool.language,
        code: tool.code,
        todo: existing?.todo ?? [],
        pinned: existing?.pinned ?? false,
        sortOrder: existing?.sortOrder ?? index,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: existing?.deletedAt ?? null,
      };

      await db.tools.put(nextBase);
    }
  });
}
