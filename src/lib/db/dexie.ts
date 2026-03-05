import Dexie, { type Table } from 'dexie';

import {
  DEFAULT_APP_SETTINGS,
  appSettingsSchema,
  type AppSettings,
  type CategoryRecord,
  type SettingRecord,
  type SyncMetaRecord,
  type TagRecord,
  type ToolRecord,
} from '@/types/schema';

export class CodeDeckDexie extends Dexie {
  tools!: Table<ToolRecord, string>;
  categories!: Table<CategoryRecord, string>;
  tags!: Table<TagRecord, string>;
  settings!: Table<SettingRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor() {
    super('CodeDeckV2DB');
    this.version(1).stores({
      tools: 'id, repoId, updatedAt, deletedAt, pinned, sortOrder, categoryId',
      categories: 'id, updatedAt, deletedAt, sortOrder',
      tags: 'id, updatedAt, deletedAt',
      settings: 'key',
      syncMeta: 'key',
    });
  }
}

export const db = new CodeDeckDexie();
const APP_SETTINGS_BACKUP_KEY = 'codedeck_app_settings_backup_v1';

function normalizeAppSettings(value: AppSettings | undefined): AppSettings {
  if (!value) return DEFAULT_APP_SETTINGS;
  return {
    ...DEFAULT_APP_SETTINGS,
    ...value,
    webdav: {
      ...DEFAULT_APP_SETTINGS.webdav,
      ...(value.webdav ?? {}),
    },
  };
}

function readAppSettingsBackup(): AppSettings | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_BACKUP_KEY);
    if (!raw) return undefined;
    const parsed = appSettingsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeAppSettingsBackup(value: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_SETTINGS_BACKUP_KEY, JSON.stringify(value));
  } catch {
    // Ignore quota/security errors and keep IndexedDB as source of truth.
  }
}

export async function getAppSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app');
  if (row?.value) {
    const normalized = normalizeAppSettings(row.value);
    writeAppSettingsBackup(normalized);
    return normalized;
  }

  const backup = readAppSettingsBackup();
  return normalizeAppSettings(backup);
}

export async function setAppSettings(next: AppSettings): Promise<void> {
  const normalized = normalizeAppSettings(next);
  await db.settings.put({ key: 'app', value: normalized });
  writeAppSettingsBackup(normalized);
}

export async function getSyncMeta(key: string): Promise<string | null> {
  const row = await db.syncMeta.get(key);
  return row?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await db.syncMeta.put({ key, value });
}
