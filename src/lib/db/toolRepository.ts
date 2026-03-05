import { v4 as uuidv4 } from 'uuid';

import { db } from '@/lib/db/dexie';
import {
  APP_SCHEMA_VERSION,
  backupV2Schema,
  type BackupV2,
  type CategoryRecord,
  type LegacyToolRecord,
  type RemoteSnapshotV2,
  type TagRecord,
  type TodoItem,
  type ToolRecord,
  type ToolViewModel,
} from '@/types/schema';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function sortTools<T extends Pick<ToolRecord, 'pinned' | 'sortOrder' | 'updatedAt'>>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function normalizeTodo(todo: LegacyToolRecord['todo']): TodoItem[] {
  const current = nowIso();

  if (Array.isArray(todo)) {
    return todo
      .filter((item) => item.text?.trim())
      .map((item) => ({
        id: item.id || uuidv4(),
        text: item.text.trim(),
        completed: Boolean(item.completed),
        updatedAt: current,
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
        updatedAt: current,
      }));
  }

  return [];
}

function normalizeToolRecord(record: ToolRecord): ToolRecord {
  return {
    ...record,
    isPublic: record.isPublic !== false,
  };
}

export class ToolRepository {
  async listMergedTools(): Promise<ToolViewModel[]> {
    const all = (await db.tools.toCollection().filter((item) => item.deletedAt === null).toArray()).map(
      normalizeToolRecord,
    );
    const repoBases = all.filter((tool) => tool.origin === 'repo' && !tool.isOverride);
    const localTools = all.filter((tool) => tool.origin === 'local');
    const overrides = localTools.filter((tool) => tool.isOverride && tool.repoId);
    const plainLocal = localTools.filter((tool) => !tool.isOverride);

    const overrideByRepoId = new Map(overrides.map((item) => [item.repoId as string, item]));

    const mergedRepo: ToolViewModel[] = repoBases.map((base) => {
      const override = overrideByRepoId.get(base.id);
      if (!override) {
        return { ...base, baseRepoToolId: base.id };
      }
      return { ...override, baseRepoToolId: base.id };
    });

    const merged = [...mergedRepo, ...plainLocal.map((tool) => ({ ...tool, baseRepoToolId: null }))];
    return sortTools(merged);
  }

  async getToolById(id: string): Promise<ToolRecord | undefined> {
    const row = await db.tools.get(id);
    return row ? normalizeToolRecord(row) : undefined;
  }

  async saveTool(input: ToolRecord): Promise<void> {
    await db.tools.put(normalizeToolRecord(input));
  }

  async createTool(input: Omit<ToolRecord, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<string> {
    const now = nowIso();
    const record: ToolRecord = {
      ...input,
      isPublic: input.isPublic !== false,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.tools.put(record);
    return record.id;
  }

  async saveMergedTool(tool: ToolViewModel): Promise<string> {
    const now = nowIso();

    if (tool.baseRepoToolId && tool.origin === 'repo' && !tool.isOverride) {
      const existingOverride = await db.tools
        .where('repoId')
        .equals(tool.baseRepoToolId)
        .filter((item) => item.isOverride && item.deletedAt === null)
        .first();

      const override: ToolRecord = {
        ...(existingOverride ?? {
          id: uuidv4(),
          repoId: tool.baseRepoToolId,
          origin: 'local',
          isOverride: true,
          createdAt: now,
        }),
        isPublic: tool.isPublic !== false,
        name: tool.name,
        description: tool.description,
        categoryId: tool.categoryId,
        tagIds: tool.tagIds,
        fileName: tool.fileName,
        runtime: tool.runtime,
        language: tool.language,
        code: tool.code,
        todo: tool.todo,
        pinned: tool.pinned,
        sortOrder: tool.sortOrder,
        updatedAt: now,
        deletedAt: null,
      } as ToolRecord;

      await db.tools.put(override);
      return override.id;
    }

    const current = await db.tools.get(tool.id);
    const next: ToolRecord = {
      ...tool,
      isPublic: tool.isPublic !== false,
      updatedAt: now,
      createdAt: current?.createdAt ?? now,
      deletedAt: null,
    };
    await db.tools.put(next);
    return next.id;
  }

  async deleteTool(id: string): Promise<void> {
    const current = await db.tools.get(id);
    if (!current) return;

    await db.tools.put({
      ...current,
      deletedAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  async resetOverride(repoId: string): Promise<void> {
    const rows = await db.tools
      .where('repoId')
      .equals(repoId)
      .filter((item) => item.isOverride && item.deletedAt === null)
      .toArray();

    const now = nowIso();
    await Promise.all(
      rows.map((row) =>
        db.tools.put({
          ...row,
          deletedAt: now,
          updatedAt: now,
        }),
      ),
    );
  }

  async upsertCategory(payload: { id?: string; name: string; color: string; sortOrder?: number }): Promise<string> {
    const normalized = normalizeName(payload.name);
    const duplicate = (await db.categories.toArray()).find(
      (item) => item.deletedAt === null && normalizeName(item.name) === normalized && item.id !== payload.id,
    );
    if (duplicate) {
      return duplicate.id;
    }

    const now = nowIso();
    const id = payload.id ?? uuidv4();
    const current = payload.id ? await db.categories.get(payload.id) : undefined;

    const next: CategoryRecord = {
      id,
      name: payload.name,
      color: payload.color,
      sortOrder: payload.sortOrder ?? current?.sortOrder ?? Date.now(),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };

    await db.categories.put(next);
    return id;
  }

  async getCategoryById(id: string): Promise<CategoryRecord | undefined> {
    return db.categories.get(id);
  }

  async listCategories(): Promise<CategoryRecord[]> {
    const rows = await db.categories.toCollection().filter((item) => item.deletedAt === null).toArray();
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async deleteCategory(id: string): Promise<void> {
    const row = await db.categories.get(id);
    if (!row || row.deletedAt !== null) return;
    const now = nowIso();

    await db.transaction('rw', db.categories, db.tools, async () => {
      await db.categories.put({ ...row, deletedAt: now, updatedAt: now });
      const tools = await db.tools.toCollection().filter((item) => item.categoryId === id).toArray();
      await Promise.all(
        tools.map((tool) =>
          db.tools.put({
            ...tool,
            categoryId: null,
            updatedAt: now,
          }),
        ),
      );
    });
  }

  async upsertTag(payload: { id?: string; name: string; color: string }): Promise<string> {
    const normalized = normalizeName(payload.name);
    const duplicate = (await db.tags.toArray()).find(
      (item) => item.deletedAt === null && normalizeName(item.name) === normalized && item.id !== payload.id,
    );
    if (duplicate) {
      return duplicate.id;
    }

    const now = nowIso();
    const id = payload.id ?? uuidv4();
    const current = payload.id ? await db.tags.get(payload.id) : undefined;

    const next: TagRecord = {
      id,
      name: payload.name,
      color: payload.color,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };

    await db.tags.put(next);
    return id;
  }

  async getTagById(id: string): Promise<TagRecord | undefined> {
    return db.tags.get(id);
  }

  async listTags(): Promise<TagRecord[]> {
    return db.tags.toCollection().filter((item) => item.deletedAt === null).toArray();
  }

  async deleteTag(id: string): Promise<void> {
    const row = await db.tags.get(id);
    if (!row || row.deletedAt !== null) return;
    const now = nowIso();

    await db.transaction('rw', db.tags, db.tools, async () => {
      await db.tags.put({ ...row, deletedAt: now, updatedAt: now });
      const tools = await db.tools.toArray();
      await Promise.all(
        tools
          .filter((tool) => tool.tagIds.includes(id))
          .map((tool) =>
            db.tools.put({
              ...tool,
              tagIds: tool.tagIds.filter((tagId) => tagId !== id),
              updatedAt: now,
            }),
          ),
      );
    });
  }

  async updateSortOrders(toolIds: string[]): Promise<void> {
    const now = nowIso();
    await Promise.all(
      toolIds.map(async (id, index) => {
        const row = await db.tools.get(id);
        if (!row) return;
        await db.tools.put({
          ...row,
          sortOrder: index,
          updatedAt: now,
        });
      }),
    );
  }

  async buildSnapshot(): Promise<RemoteSnapshotV2> {
    const [rawTools, categories, tags] = await Promise.all([
      db.tools.toArray(),
      db.categories.toArray(),
      db.tags.toArray(),
    ]);
    const tools = rawTools.map(normalizeToolRecord);

    return {
      schemaVersion: APP_SCHEMA_VERSION,
      exportedAt: nowIso(),
      tools,
      categories,
      tags,
    };
  }

  async applySnapshot(snapshot: RemoteSnapshotV2): Promise<void> {
    await db.transaction('rw', db.tools, db.categories, db.tags, async () => {
      const normalizedTools = snapshot.tools.map(normalizeToolRecord);
      await db.tools.clear();
      await db.categories.clear();
      await db.tags.clear();
      await db.tools.bulkPut(normalizedTools);
      await db.categories.bulkPut(snapshot.categories);
      await db.tags.bulkPut(snapshot.tags);
    });
  }

  async exportBackupV2(): Promise<BackupV2> {
    const snapshot = await this.buildSnapshot();
    return backupV2Schema.parse(snapshot);
  }

  async importBackup(raw: unknown): Promise<void> {
    if (Array.isArray(raw)) {
      await this.importLegacyArray(raw as LegacyToolRecord[]);
      return;
    }

    const parsed = backupV2Schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('Unsupported backup file format.');
    }

    await this.applySnapshot(parsed.data);
  }

  async importLegacyArray(rows: LegacyToolRecord[]): Promise<void> {
    const now = nowIso();
    const converted: ToolRecord[] = rows
      .filter((item) => item.name?.trim())
      .map((item, index) => ({
        id: uuidv4(),
        repoId: null,
        origin: 'local',
        isOverride: false,
        isPublic: true,
        name: item.name.trim(),
        description: item.description?.trim() ?? '',
        categoryId: null,
        tagIds: [],
        fileName: `${item.name.trim() || `tool-${index + 1}`}.html`,
        runtime: 'html',
        language: 'html',
        code: item.code ?? '',
        todo: normalizeTodo(item.todo),
        pinned: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }));

    await db.transaction('rw', db.tools, async () => {
      const locals = await db.tools.toCollection().filter((item) => item.origin === 'local').toArray();
      await Promise.all(locals.map((item) => db.tools.delete(item.id)));
      await db.tools.bulkPut(converted);
    });
  }
}

export const toolRepository = new ToolRepository();

