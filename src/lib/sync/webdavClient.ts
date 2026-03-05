import { APP_SCHEMA_VERSION, backupV2Schema, type RemoteSnapshotV2 } from '@/types/schema';

export interface SyncProvider {
  pull(): Promise<{ snapshot: RemoteSnapshotV2; etag: string | null; missing: boolean }>;
  push(snapshot: RemoteSnapshotV2, etag: string | null): Promise<{ etag: string | null }>;
}

interface ProxyPayload {
  endpoint: string;
  username: string;
  password: string;
  method: string;
  headers?: Record<string, string>;
  body?: string | null;
}

interface ProxyResponseData {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

interface RequestResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface WebDavHistoryItem {
  fileName: string;
  stamp: string;
  timeLabel: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return '';

  const url = new URL(trimmed);
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}

function buildDirectoryEndpoint(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) throw new Error('WEBDAV_INVALID_BASE_URL');

  const url = new URL(normalized);
  const pathNoTrailing = url.pathname.replace(/\/+$/, '');
  if (pathNoTrailing.toLowerCase().endsWith('/codedeck')) {
    url.pathname = `${pathNoTrailing}/`;
  } else {
    url.pathname = `${pathNoTrailing}/CodeDeck/`;
  }
  return url.toString();
}

function buildDataFileEndpoint(directoryEndpoint: string): string {
  return new URL('codedeck-data.v2.json', directoryEndpoint).toString();
}

function classifyFetchError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Failed to fetch')) {
    return new Error('WEBDAV_FETCH_FAILED_CORS_OR_REDIRECT');
  }
  return error instanceof Error ? error : new Error(message);
}

function snapshotFallback(): RemoteSnapshotV2 {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tools: [],
    categories: [],
    tags: [],
  };
}

function normalizeHeaderRecord(headers: Record<string, string> | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

function formatDateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

function stampToLabel(stamp: string): string {
  const match = stamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!match) return stamp;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
}

function parseHistoryItems(body: string): WebDavHistoryItem[] {
  const regex = /codedeck-data\.v2-(\d{8}-\d{6})\.json/gi;
  const map = new Map<string, WebDavHistoryItem>();

  let match = regex.exec(body);
  while (match) {
    const stamp = match[1];
    const fileName = `codedeck-data.v2-${stamp}.json`;
    map.set(fileName, {
      fileName,
      stamp,
      timeLabel: stampToLabel(stamp),
    });
    match = regex.exec(body);
  }

  return Array.from(map.values()).sort((a, b) => b.stamp.localeCompare(a.stamp));
}

function buildHistoryFileName(date = new Date()): string {
  return `codedeck-data.v2-${formatDateStamp(date)}.json`;
}

function assertHistoryFileName(fileName: string): void {
  if (!/^codedeck-data\.v2-\d{8}-\d{6}\.json$/.test(fileName)) {
    throw new Error('WEBDAV_HISTORY_INVALID_FILE_NAME');
  }
}

async function requestByProxy(payload: ProxyPayload): Promise<RequestResult> {
  let response: Response;
  try {
    response = await fetch('/api/webdav', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw classifyFetchError(error);
  }

  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text();
  let parsed: Record<string, unknown> | null = null;
  if (contentType.includes('application/json')) {
    try {
      parsed = JSON.parse(bodyText || '{}') as Record<string, unknown>;
    } catch {
      throw new Error('WEBDAV_PROXY_INVALID_RESPONSE');
    }
  }

  if (response.status === 404) {
    throw new Error('WEBDAV_PROXY_UNAVAILABLE');
  }

  if (!response.ok) {
    const message = parsed?.error || `WEBDAV_PROXY_HTTP_${response.status}`;
    throw new Error(String(message));
  }

  if (!parsed || typeof parsed.status !== 'number') {
    throw new Error('WEBDAV_PROXY_INVALID_RESPONSE');
  }

  const proxyData: ProxyResponseData = {
    ok: Boolean(parsed.ok),
    status: Number(parsed.status),
    statusText: typeof parsed.statusText === 'string' ? parsed.statusText : '',
    headers:
      parsed.headers && typeof parsed.headers === 'object'
        ? (parsed.headers as Record<string, string>)
        : {},
    body: typeof parsed.body === 'string' ? parsed.body : '',
  };
  return {
    ok: proxyData.ok,
    status: proxyData.status,
    statusText: proxyData.statusText,
    headers: normalizeHeaderRecord(proxyData.headers),
    body: proxyData.body ?? '',
  };
}

export class WebDavSyncProvider implements SyncProvider {
  private readonly baseEndpoint: string;
  private readonly endpoint: string;
  private readonly directoryEndpoint: string;
  private readonly username: string;
  private readonly password: string;
  private directoryEnsured = false;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseEndpoint = normalizeBaseUrl(baseUrl);
    if (!this.baseEndpoint) throw new Error('WEBDAV_INVALID_BASE_URL');
    this.directoryEndpoint = buildDirectoryEndpoint(this.baseEndpoint);
    this.endpoint = buildDataFileEndpoint(this.directoryEndpoint);
    this.username = username;
    this.password = password;
  }

  private async request(
    method: string,
    headers?: Record<string, string>,
    body?: string,
    endpoint = this.endpoint,
  ): Promise<RequestResult> {
    return requestByProxy({
      endpoint,
      username: this.username,
      password: this.password,
      method,
      headers,
      body: body ?? null,
    });
  }

  private async ensureDirectory(): Promise<void> {
    if (this.directoryEnsured) return;

    const probe = await this.request('PROPFIND', { Depth: '0' }, undefined, this.directoryEndpoint);
    if (probe.ok) {
      this.directoryEnsured = true;
      return;
    }

    if (probe.status !== 404) {
      throw new Error(`WEBDAV_DIR_CHECK_FAILED_${probe.status}`);
    }

    const created = await this.request('MKCOL', undefined, undefined, this.directoryEndpoint);
    if (created.ok || created.status === 405 || created.status === 409) {
      this.directoryEnsured = true;
      return;
    }
    throw new Error(`WEBDAV_DIR_CREATE_FAILED_${created.status}`);
  }

  async probeConnection(): Promise<{ status: number }> {
    const response = await this.request('PROPFIND', { Depth: '0' }, undefined, this.baseEndpoint);

    if (response.status === 404) {
      throw new Error('WEBDAV_BASE_NOT_FOUND_404');
    }

    if (!response.ok) {
      throw new Error(`WebDAV probe failed: ${response.status} ${response.statusText}`.trim());
    }

    return { status: response.status };
  }

  async pull(): Promise<{ snapshot: RemoteSnapshotV2; etag: string | null; missing: boolean }> {
    const response = await this.request('GET');

    if (response.status === 404) {
      return { snapshot: snapshotFallback(), etag: null, missing: true };
    }

    if (!response.ok) {
      throw new Error(`WebDAV pull failed: ${response.status} ${response.statusText}`.trim());
    }

    const raw = JSON.parse(response.body || '{}');
    const parsed = backupV2Schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('Remote snapshot format is invalid.');
    }

    return {
      snapshot: parsed.data,
      etag: response.headers.etag ?? null,
      missing: false,
    };
  }

  async push(snapshot: RemoteSnapshotV2, etag: string | null): Promise<{ etag: string | null }> {
    await this.ensureDirectory();
    const response = await this.request(
      'PUT',
      {
        'Content-Type': 'application/json',
        ...(etag ? { 'If-Match': etag } : {}),
      },
      JSON.stringify(snapshot, null, 2),
    );

    if (response.status === 412) {
      throw new Error(etag ? 'ETAG_CONFLICT_412' : 'WEBDAV_PUT_412_NO_ETAG');
    }

    if (!response.ok) {
      throw new Error(`WebDAV push failed: ${response.status} ${response.statusText}`.trim());
    }

    return { etag: response.headers.etag ?? null };
  }

  async saveHistory(snapshot: RemoteSnapshotV2): Promise<WebDavHistoryItem> {
    await this.ensureDirectory();
    const fileName = buildHistoryFileName();
    const endpoint = new URL(fileName, this.directoryEndpoint).toString();

    const response = await this.request(
      'PUT',
      { 'Content-Type': 'application/json' },
      JSON.stringify(snapshot, null, 2),
      endpoint,
    );

    if (!response.ok) {
      throw new Error(`WebDAV history push failed: ${response.status} ${response.statusText}`.trim());
    }

    const stamp = fileName.replace('codedeck-data.v2-', '').replace('.json', '');
    return {
      fileName,
      stamp,
      timeLabel: stampToLabel(stamp),
    };
  }

  async listHistory(): Promise<WebDavHistoryItem[]> {
    const response = await this.request('PROPFIND', { Depth: '1' }, undefined, this.directoryEndpoint);

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`WebDAV history list failed: ${response.status} ${response.statusText}`.trim());
    }

    return parseHistoryItems(response.body || '');
  }

  async deleteHistory(fileName: string): Promise<void> {
    assertHistoryFileName(fileName);
    const endpoint = new URL(fileName, this.directoryEndpoint).toString();

    const response = await this.request('DELETE', undefined, undefined, endpoint);
    if (response.status === 404) return;

    if (!response.ok) {
      throw new Error(`WebDAV history delete failed: ${response.status} ${response.statusText}`.trim());
    }
  }

  async pullHistory(fileName: string): Promise<RemoteSnapshotV2> {
    assertHistoryFileName(fileName);
    const endpoint = new URL(fileName, this.directoryEndpoint).toString();

    const response = await this.request('GET', undefined, undefined, endpoint);
    if (!response.ok) {
      throw new Error(`WebDAV history pull failed: ${response.status} ${response.statusText}`.trim());
    }

    const raw = JSON.parse(response.body || '{}');
    const parsed = backupV2Schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('Remote history snapshot format is invalid.');
    }
    return parsed.data;
  }

  async pruneHistory(limit: number): Promise<void> {
    const finalLimit = Math.max(1, Math.min(50, Math.floor(limit || 10)));
    const all = await this.listHistory();
    if (all.length <= finalLimit) return;

    const toDelete = all.slice(finalLimit);
    await Promise.all(toDelete.map((item) => this.deleteHistory(item.fileName)));
  }
}
