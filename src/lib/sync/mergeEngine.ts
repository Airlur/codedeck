import type {
  CategoryRecord,
  RemoteSnapshotV2,
  TagRecord,
  ToolRecord,
} from '@/types/schema';

interface CoreRecord {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

function pickLatest<T extends CoreRecord>(current: T | undefined, incoming: T): T {
  if (!current) return incoming;

  const currentDeletedAt = current.deletedAt ? Date.parse(current.deletedAt) : 0;
  const incomingDeletedAt = incoming.deletedAt ? Date.parse(incoming.deletedAt) : 0;

  if (incomingDeletedAt > currentDeletedAt) return incoming;

  const currentUpdatedAt = Date.parse(current.updatedAt);
  const incomingUpdatedAt = Date.parse(incoming.updatedAt);
  if (incomingUpdatedAt >= currentUpdatedAt) return incoming;
  return current;
}

function mergeById<T extends CoreRecord>(left: T[], right: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of [...left, ...right]) {
    map.set(item.id, pickLatest(map.get(item.id), item));
  }

  return Array.from(map.values());
}

export function mergeSnapshots(
  local: Pick<RemoteSnapshotV2, 'tools' | 'categories' | 'tags'>,
  remote: Pick<RemoteSnapshotV2, 'tools' | 'categories' | 'tags'>,
): { tools: ToolRecord[]; categories: CategoryRecord[]; tags: TagRecord[] } {
  return {
    tools: mergeById(local.tools, remote.tools),
    categories: mergeById(local.categories, remote.categories),
    tags: mergeById(local.tags, remote.tags),
  };
}
