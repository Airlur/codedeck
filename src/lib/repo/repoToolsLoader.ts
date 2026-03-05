import type { RepoManifest, RepoManifestItem } from '@/types/schema';

export interface RepoToolLoaded extends RepoManifestItem {
  code: string;
}

export async function loadRepoManifest(): Promise<RepoManifest> {
  const response = await fetch('/repo-tools/manifest.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load repo manifest: ${response.status}`);
  }
  return (await response.json()) as RepoManifest;
}

export async function loadRepoTools(): Promise<RepoToolLoaded[]> {
  const manifest = await loadRepoManifest();
  const results: RepoToolLoaded[] = [];

  for (const item of manifest.items) {
    const response = await fetch(`/repo-tools/code/${encodeURIComponent(item.fileName)}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Failed to load repo tool ${item.fileName}: ${response.status}`);
    }
    const code = await response.text();
    results.push({ ...item, code });
  }

  return results;
}
