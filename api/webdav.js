function toBasicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function safeJsonParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    out[key] = String(value);
  }
  return out;
}

function pickResponseHeaders(headers) {
  const out = {};
  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (normalized === 'etag' || normalized === 'content-type' || normalized === 'last-modified') {
      out[normalized] = value;
    }
  });
  return out;
}

function validateEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Unsupported protocol');
  }
}

function formatUpstreamError(error) {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause;
  if (cause && typeof cause === 'object') {
    const code = 'code' in cause ? String(cause.code || '') : '';
    const message = 'message' in cause ? String(cause.message || '') : '';
    const detail = [code, message].filter(Boolean).join(' ');
    if (detail) return `${error.message} (${detail})`;
  }

  return error.message;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeJsonParse(req.body) : req.body || {};
  const { endpoint, username, password, method = 'GET', headers = {}, body: requestBody } = body;
  const upperMethod = String(method).toUpperCase();

  if (!endpoint || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    validateEndpoint(endpoint);

    const upstreamHeaders = normalizeHeaders(headers);
    upstreamHeaders.Authorization = toBasicAuth(username, password);
    upstreamHeaders['User-Agent'] = 'CodeDeck-WebDAV-Proxy/1.0';

    const response = await fetch(endpoint, {
      method: upperMethod,
      headers: upstreamHeaders,
      body: upperMethod === 'GET' || upperMethod === 'HEAD' ? undefined : requestBody ?? undefined,
      redirect: 'follow',
    });

    const text = await response.text();
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: pickResponseHeaders(response.headers),
      body: text,
    });
  } catch (error) {
    console.error('[webdav-proxy] upstream request failed', {
      method: upperMethod,
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      error: `WEBDAV_PROXY_UPSTREAM_FETCH_FAILED: ${formatUpstreamError(error)}`,
    });
  }
}
