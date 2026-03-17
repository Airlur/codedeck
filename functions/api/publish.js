const DEFAULT_BRANCH = 'main';
const DEFAULT_PUBLISH_PATH = 'public/published.json';
const DEFAULT_VERIFY_WINDOW_SEC = 600;
const DEFAULT_VERIFY_MAX_ATTEMPTS = 5;
const DEFAULT_SESSION_TTL_SEC = 900;
const MAX_COMMIT_MESSAGE_LENGTH = 120;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const verifyAttempts = new Map();

function safeJsonParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getVerifyWindowMs(env) {
  const sec = clampInt(env.PUBLISH_VERIFY_WINDOW_SEC, DEFAULT_VERIFY_WINDOW_SEC, 60, 3600);
  return sec * 1000;
}

function getVerifyMaxAttempts(env) {
  return clampInt(env.PUBLISH_VERIFY_MAX_ATTEMPTS, DEFAULT_VERIFY_MAX_ATTEMPTS, 1, 20);
}

function getSessionTtlMs(env) {
  const sec = clampInt(env.PUBLISH_SESSION_TTL_SEC, DEFAULT_SESSION_TTL_SEC, 60, 7200);
  return sec * 1000;
}

function toErrorStatus(errorCode) {
  if (
    errorCode === 'ADMIN_PASSWORD_REQUIRED' ||
    errorCode === 'PUBLISH_ACTION_INVALID' ||
    errorCode === 'PUBLISH_MESSAGE_REQUIRED' ||
    errorCode === 'PUBLISH_MESSAGE_TOO_LONG' ||
    errorCode === 'PUBLISH_SNAPSHOT_INVALID'
  ) {
    return 400;
  }
  if (errorCode === 'ADMIN_PASSWORD_INVALID' || errorCode === 'PUBLISH_AUTH_REQUIRED') {
    return 401;
  }
  if (errorCode === 'ADMIN_VERIFY_RATE_LIMITED') {
    return 429;
  }
  if (errorCode === 'PUBLISH_METHOD_NOT_ALLOWED') {
    return 405;
  }
  if (
    errorCode === 'ADMIN_PASSWORD_NOT_CONFIGURED' ||
    errorCode === 'GITHUB_ENV_MISSING' ||
    errorCode === 'GITHUB_REPO_INVALID'
  ) {
    return 500;
  }
  return 500;
}

function encodeRepoPath(pathValue) {
  return String(pathValue)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizeSnapshot(snapshot) {
  const payload = asObject(snapshot);
  if (!payload) {
    throw new Error('PUBLISH_SNAPSHOT_INVALID');
  }

  const tools = Array.isArray(payload.tools) ? payload.tools : null;
  const categories = Array.isArray(payload.categories) ? payload.categories : null;
  const tags = Array.isArray(payload.tags) ? payload.tags : null;
  const schemaVersion = Number(payload.schemaVersion);
  const exportedAt = typeof payload.exportedAt === 'string' ? payload.exportedAt : null;

  if (!tools || !categories || !tags || !Number.isFinite(schemaVersion) || !exportedAt) {
    throw new Error('PUBLISH_SNAPSHOT_INVALID');
  }

  return {
    schemaVersion,
    exportedAt,
    tools,
    categories,
    tags,
  };
}

function parseGithubRepoSlug(repoValue) {
  const trimmed = String(repoValue ?? '').trim();
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  if (!match) {
    throw new Error('GITHUB_REPO_INVALID');
  }
  return {
    owner: match[1],
    repo: match[2],
  };
}

function pickHeaderValue(headers, key) {
  if (!headers) return '';

  if (typeof headers.get === 'function') {
    return headers.get(key) || headers.get(key.toLowerCase()) || '';
  }

  const lowerKey = key.toLowerCase();
  const direct = headers[key] ?? headers[lowerKey];
  if (Array.isArray(direct)) return String(direct[0] ?? '');
  if (typeof direct === 'string') return direct;
  if (direct == null) return '';
  return String(direct);
}

function resolveClientIp(headers) {
  const forwarded = pickHeaderValue(headers, 'cf-connecting-ip') || pickHeaderValue(headers, 'x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim() || 'unknown';
  }
  const realIp = pickHeaderValue(headers, 'x-real-ip').trim();
  if (realIp) return realIp;
  return 'unknown';
}

async function sha256Hex(value) {
  const buffer = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function timingSafeEqualText(left, right) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', textEncoder.encode(left)),
    crypto.subtle.digest('SHA-256', textEncoder.encode(right)),
  ]);

  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let diff = leftBytes.length === rightBytes.length ? 0 : 1;
  const maxLength = Math.max(leftBytes.length, rightBytes.length);

  for (let i = 0; i < maxLength; i += 1) {
    diff |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
  }

  return diff === 0;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Url(value) {
  return bytesToBase64(textEncoder.encode(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '=');
  return textDecoder.decode(base64ToBytes(padded));
}

async function signHmac(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(data));
  return bytesToBase64(new Uint8Array(signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createTokenSecret(adminPassword, env) {
  const extra = String(env.PUBLISH_AUTH_SECRET ?? '').trim();
  if (extra) return extra;
  return sha256Hex(`${adminPassword}|${env.GITHUB_TOKEN ?? ''}|codedeck_publish`);
}

async function createSignedToken(payload, secret) {
  const headerPart = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'PUBLISH' }));
  const payloadPart = encodeBase64Url(JSON.stringify(payload));
  const data = `${headerPart}.${payloadPart}`;
  const signature = await signHmac(data, secret);
  return `${data}.${signature}`;
}

async function verifySignedToken(token, secret) {
  const chunks = String(token ?? '').split('.');
  if (chunks.length !== 3) {
    return { ok: false, code: 'PUBLISH_AUTH_REQUIRED' };
  }

  const [headerPart, payloadPart, signaturePart] = chunks;
  const data = `${headerPart}.${payloadPart}`;
  const expectedSignature = await signHmac(data, secret);
  if (!(await timingSafeEqualText(signaturePart, expectedSignature))) {
    return { ok: false, code: 'PUBLISH_AUTH_REQUIRED' };
  }

  try {
    const payloadRaw = JSON.parse(decodeBase64Url(payloadPart));
    return { ok: true, payload: payloadRaw };
  } catch {
    return { ok: false, code: 'PUBLISH_AUTH_REQUIRED' };
  }
}

function cleanupExpiredAttempts(now) {
  for (const [ip, value] of verifyAttempts.entries()) {
    if (value.resetAt <= now) {
      verifyAttempts.delete(ip);
    }
  }
}

function remainingRetryAfterSec(now, ip) {
  const row = verifyAttempts.get(ip);
  if (!row) return 0;
  return Math.max(0, Math.ceil((row.resetAt - now) / 1000));
}

function isRateLimited(now, ip, env) {
  cleanupExpiredAttempts(now);
  const row = verifyAttempts.get(ip);
  if (!row) return false;
  return row.count >= getVerifyMaxAttempts(env) && row.resetAt > now;
}

function recordVerifyFailure(now, ip, env) {
  const windowMs = getVerifyWindowMs(env);
  const row = verifyAttempts.get(ip);
  if (!row || row.resetAt <= now) {
    verifyAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }

  verifyAttempts.set(ip, {
    count: row.count + 1,
    resetAt: row.resetAt,
  });
}

function clearVerifyFailures(ip) {
  verifyAttempts.delete(ip);
}

function auditLog(action, data) {
  const payload = {
    time: new Date().toISOString(),
    action,
    ...data,
  };
  console.info('[publish-api]', JSON.stringify(payload));
}

async function githubRequest(url, token, init = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'CodeDeck-Publisher/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(init.headers || {}),
  };
  return fetch(url, { ...init, headers });
}

async function readExistingFileSha(owner, repo, branch, pathValue, token) {
  const pathEncoded = encodeRepoPath(pathValue);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${pathEncoded}?ref=${encodeURIComponent(branch)}`;
  const response = await githubRequest(url, token, { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`GitHub read failed: ${response.status} ${bodyText}`);
  }
  const raw = await response.json();
  if (!raw || typeof raw.sha !== 'string') {
    throw new Error('GitHub read response missing sha');
  }
  return raw.sha;
}

async function writeFile(owner, repo, branch, pathValue, token, contentBase64, message, sha) {
  const pathEncoded = encodeRepoPath(pathValue);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${pathEncoded}`;
  const requestBody = {
    message,
    content: contentBase64,
    branch,
    ...(sha ? { sha } : {}),
  };

  const response = await githubRequest(url, token, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub write failed: ${response.status} ${responseText}`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {};
  }
}

function success(body) {
  return { status: 200, body };
}

function failure(errorCode, extras = {}) {
  return {
    status: toErrorStatus(errorCode),
    body: {
      error: errorCode,
      ...extras,
    },
  };
}

async function handleVerify(body, headers, env) {
  const adminPassword = String(env.ADMIN_PASSWORD ?? '');
  if (!adminPassword) {
    return failure('ADMIN_PASSWORD_NOT_CONFIGURED');
  }

  const now = Date.now();
  const ip = resolveClientIp(headers);
  if (isRateLimited(now, ip, env)) {
    const retryAfterSec = remainingRetryAfterSec(now, ip);
    auditLog('verify.rate_limited', { ip, retryAfterSec });
    return failure('ADMIN_VERIFY_RATE_LIMITED', { retryAfterSec });
  }

  const providedPassword = typeof body.password === 'string' ? body.password : '';
  if (!providedPassword) {
    return failure('ADMIN_PASSWORD_REQUIRED');
  }

  if (!(await timingSafeEqualText(providedPassword, adminPassword))) {
    recordVerifyFailure(now, ip, env);
    const remaining = Math.max(0, getVerifyMaxAttempts(env) - (verifyAttempts.get(ip)?.count ?? 0));
    auditLog('verify.failed', { ip, remainingAttempts: remaining });
    return failure('ADMIN_PASSWORD_INVALID', { remainingAttempts: remaining });
  }

  clearVerifyFailures(ip);
  const sessionTtlMs = getSessionTtlMs(env);
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + sessionTtlMs).toISOString();
  const secret = await createTokenSecret(adminPassword, env);
  const ipHash = await sha256Hex(ip);
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const nonce = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const token = await createSignedToken(
    {
      iat: now,
      exp: now + sessionTtlMs,
      ipHash,
      nonce,
    },
    secret,
  );

  auditLog('verify.success', { ip, expiresAt });
  return success({
    ok: true,
    verified: true,
    token,
    issuedAt: nowIso,
    expiresAt,
  });
}

async function verifyPublishToken(rawToken, headers, env) {
  const adminPassword = String(env.ADMIN_PASSWORD ?? '');
  if (!adminPassword) {
    return { ok: false, status: failure('ADMIN_PASSWORD_NOT_CONFIGURED') };
  }

  const token = typeof rawToken === 'string' ? rawToken : '';
  if (!token) {
    return { ok: false, status: failure('PUBLISH_AUTH_REQUIRED') };
  }

  const secret = await createTokenSecret(adminPassword, env);
  const verified = await verifySignedToken(token, secret);
  if (!verified.ok || !verified.payload || typeof verified.payload !== 'object') {
    return { ok: false, status: failure('PUBLISH_AUTH_REQUIRED') };
  }

  const payload = verified.payload;
  const exp = Number(payload.exp);
  const ipHash = typeof payload.ipHash === 'string' ? payload.ipHash : '';
  const now = Date.now();
  if (!Number.isFinite(exp) || exp < now) {
    return { ok: false, status: failure('PUBLISH_AUTH_REQUIRED') };
  }

  const ip = resolveClientIp(headers);
  if (!ipHash || ipHash !== (await sha256Hex(ip))) {
    return { ok: false, status: failure('PUBLISH_AUTH_REQUIRED') };
  }

  return { ok: true, ip };
}

async function handlePublish(body, headers, env) {
  const authResult = await verifyPublishToken(body.token, headers, env);
  if (!authResult.ok) {
    return authResult.status;
  }

  const token = String(env.GITHUB_TOKEN ?? '').trim();
  const repoSlug = String(env.GITHUB_REPO ?? '').trim();
  const branch = String(env.GITHUB_BRANCH ?? DEFAULT_BRANCH).trim() || DEFAULT_BRANCH;
  const publishPath = String(env.GITHUB_PUBLISH_PATH ?? DEFAULT_PUBLISH_PATH).trim() || DEFAULT_PUBLISH_PATH;

  if (!token || !repoSlug) {
    return failure('GITHUB_ENV_MISSING');
  }

  let owner;
  let repo;
  try {
    const parsed = parseGithubRepoSlug(repoSlug);
    owner = parsed.owner;
    repo = parsed.repo;
  } catch {
    return failure('GITHUB_REPO_INVALID');
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return failure('PUBLISH_MESSAGE_REQUIRED');
  }
  if (message.length > MAX_COMMIT_MESSAGE_LENGTH) {
    return failure('PUBLISH_MESSAGE_TOO_LONG', { maxLength: MAX_COMMIT_MESSAGE_LENGTH });
  }

  let snapshot;
  try {
    snapshot = normalizeSnapshot(body.snapshot);
  } catch {
    return failure('PUBLISH_SNAPSHOT_INVALID');
  }

  try {
    const sha = await readExistingFileSha(owner, repo, branch, publishPath, token);
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    const contentBase64 = bytesToBase64(textEncoder.encode(content));
    const result = await writeFile(owner, repo, branch, publishPath, token, contentBase64, message, sha);

    auditLog('publish.success', {
      ip: authResult.ip,
      repo: repoSlug,
      branch,
      path: publishPath,
      commit: result?.commit?.sha ? String(result.commit.sha).slice(0, 8) : null,
    });

    return success({
      ok: true,
      path: publishPath,
      branch,
      commit: result?.commit?.sha || null,
      htmlUrl: result?.commit?.html_url || null,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    auditLog('publish.failed', {
      ip: authResult.ip,
      repo: repoSlug,
      error: messageText,
    });
    return {
      status: 500,
      body: {
        error: messageText,
      },
    };
  }
}

async function processPublishRequest({ method, headers, rawBody, env }) {
  if (String(method || '').toUpperCase() !== 'POST') {
    return failure('PUBLISH_METHOD_NOT_ALLOWED');
  }

  const parsedBody =
    typeof rawBody === 'string'
      ? safeJsonParse(rawBody)
      : asObject(rawBody) || {};

  const action = typeof parsedBody.action === 'string' ? parsedBody.action.trim().toLowerCase() : '';

  if (action === 'verify') {
    return handleVerify(parsedBody, headers, env);
  }

  if (action === 'publish') {
    return handlePublish(parsedBody, headers, env);
  }

  return failure('PUBLISH_ACTION_INVALID');
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() !== 'POST') {
    return jsonResponse(405, { error: 'PUBLISH_METHOD_NOT_ALLOWED' });
  }

  const result = await processPublishRequest({
    method: context.request.method,
    headers: context.request.headers,
    rawBody: await context.request.text(),
    env: context.env || {},
  });

  return jsonResponse(result.status, result.body);
}
