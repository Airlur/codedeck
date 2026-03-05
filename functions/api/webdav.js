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

export async function onRequestPost(context) {
  const { request } = context;

  const payload = safeJsonParse(await request.text());
  const { endpoint, username, password, method = 'GET', headers = {}, body } = payload;

  if (!endpoint || !username || !password) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    validateEndpoint(endpoint);

    const upstreamHeaders = normalizeHeaders(headers);
    upstreamHeaders.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
    upstreamHeaders['User-Agent'] = 'CodeDeck-WebDAV-Proxy/1.0';

    const upperMethod = String(method).toUpperCase();
    const response = await fetch(endpoint, {
      method: upperMethod,
      headers: upstreamHeaders,
      body: upperMethod === 'GET' || upperMethod === 'HEAD' ? undefined : body ?? undefined,
      redirect: 'follow',
    });

    const text = await response.text();
    return new Response(
      JSON.stringify({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: pickResponseHeaders(response.headers),
        body: text,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
