import { z } from 'zod';

export const APP_SCHEMA_VERSION = 2 as const;

export const toolRuntimeSchema = z.enum([
  'html',
  'javascript',
  'css',
  'markdown',
  'json',
  'text',
]);

export const toolOriginSchema = z.enum(['repo', 'local']);

export const todoItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  completed: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const toolRecordSchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1).nullable(),
  origin: toolOriginSchema,
  isOverride: z.boolean(),
  isPublic: z.boolean().default(true),
  name: z.string().min(1),
  description: z.string(),
  categoryId: z.string().min(1).nullable(),
  tagIds: z.array(z.string().min(1)),
  fileName: z.string().min(1),
  runtime: toolRuntimeSchema,
  language: z.string().min(1),
  code: z.string(),
  todo: z.array(todoItemSchema),
  pinned: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const categoryRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#(?:[A-Fa-f0-9]{6})$/),
  sortOrder: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const tagRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#(?:[A-Fa-f0-9]{6})$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const appSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  editorFontSize: z.number().min(10).max(32),
  editorWordWrap: z.enum(['on', 'off']),
  webdav: z.object({
    enabled: z.boolean(),
    baseUrl: z.string(),
    username: z.string(),
    password: z.string(),
    autoSync: z.boolean(),
    autoSyncIntervalSec: z.number().int().min(10),
    backupLimit: z.number().int().min(5).max(50),
    lastEtag: z.string().nullable(),
    lastSyncAt: z.string().datetime().nullable(),
  }),
});

export const backupV2Schema = z.object({
  schemaVersion: z.literal(APP_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  tools: z.array(toolRecordSchema),
  categories: z.array(categoryRecordSchema),
  tags: z.array(tagRecordSchema),
});

export type ToolRuntime = z.infer<typeof toolRuntimeSchema>;
export type ToolOrigin = z.infer<typeof toolOriginSchema>;
export type TodoItem = z.infer<typeof todoItemSchema>;
export type ToolRecord = z.infer<typeof toolRecordSchema>;
export type CategoryRecord = z.infer<typeof categoryRecordSchema>;
export type TagRecord = z.infer<typeof tagRecordSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type BackupV2 = z.infer<typeof backupV2Schema>;

export interface RepoManifestItem {
  repoId: string;
  fileName: string;
  name: string;
  description: string;
  runtime: ToolRuntime;
  language: string;
  sha256: string;
  category: string;
  tags: string[];
}

export interface RepoManifest {
  generatedAt: string;
  items: RepoManifestItem[];
}

export interface SyncMetaRecord {
  key: string;
  value: string;
}

export interface SettingRecord {
  key: 'app';
  value: AppSettings;
}

export interface RemoteSnapshotV2 {
  schemaVersion: number;
  exportedAt: string;
  tools: ToolRecord[];
  categories: CategoryRecord[];
  tags: TagRecord[];
}

export interface ToolViewModel extends ToolRecord {
  baseRepoToolId: string | null;
}

export interface LegacyToolRecord {
  id?: number;
  name: string;
  description: string;
  todo?: string | Array<{ id: string; text: string; completed: boolean }>;
  code: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  editorFontSize: 14,
  editorWordWrap: 'on',
  webdav: {
    enabled: false,
    baseUrl: '',
    username: '',
    password: '',
    autoSync: false,
    autoSyncIntervalSec: 120,
    backupLimit: 10,
    lastEtag: null,
    lastSyncAt: null,
  },
};
