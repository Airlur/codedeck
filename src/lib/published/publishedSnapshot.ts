import { backupV2Schema, type BackupV2 } from '@/types/schema';

export async function loadPublishedSnapshot(): Promise<BackupV2> {
  const response = await fetch('/published.json', { cache: 'no-store' });
  if (response.status === 404) {
    throw new Error('PUBLISHED_SNAPSHOT_NOT_FOUND');
  }
  if (!response.ok) {
    throw new Error(`PUBLISHED_SNAPSHOT_HTTP_${response.status}`);
  }

  const raw = (await response.json()) as unknown;
  const parsed = backupV2Schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('PUBLISHED_SNAPSHOT_INVALID_FORMAT');
  }
  return parsed.data;
}
