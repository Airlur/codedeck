import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

import { processPublishRequest } from './api/publishCore.js';

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function normalizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    out[key] = String(value);
  }
  return out;
}

function pickResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (normalized === 'etag' || normalized === 'content-type' || normalized === 'last-modified') {
      out[normalized] = value;
    }
  });
  return out;
}

function formatUpstreamError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause as { code?: unknown; message?: unknown } | undefined;
  if (cause && (cause.code || cause.message)) {
    const detail = [String(cause.code || ''), String(cause.message || '')].filter(Boolean).join(' ');
    return detail ? `${error.message} (${detail})` : error.message;
  }
  return error.message;
}

function webdavProxyDevPlugin(): Plugin {
  return {
    name: 'codedeck-webdav-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/webdav', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        try {
          const rawBody = await readRequestBody(req);
          const payload = rawBody ? JSON.parse(rawBody) : {};
          const {
            endpoint,
            username,
            password,
            method = 'GET',
            headers = {},
            body,
          } = payload as {
            endpoint?: string;
            username?: string;
            password?: string;
            method?: string;
            headers?: Record<string, unknown>;
            body?: string;
          };

          if (!endpoint || !username || !password) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing required fields' }));
            return;
          }

          const upperMethod = String(method).toUpperCase();
          const normalizedHeaders = normalizeHeaders(headers);
          normalizedHeaders.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
          normalizedHeaders['User-Agent'] = 'CodeDeck-WebDAV-Proxy/1.0';

          const upstreamResponse = await fetch(endpoint, {
            method: upperMethod,
            headers: normalizedHeaders,
            body: upperMethod === 'GET' || upperMethod === 'HEAD' ? undefined : body ?? undefined,
            redirect: 'follow',
          });

          const text = await upstreamResponse.text();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: upstreamResponse.ok,
              status: upstreamResponse.status,
              statusText: upstreamResponse.statusText,
              headers: pickResponseHeaders(upstreamResponse.headers),
              body: text,
            }),
          );
        } catch (error) {
          console.error('[webdav-dev-proxy] upstream request failed', {
            method: req.method,
            error: error instanceof Error ? error.message : String(error),
          });

          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: `WEBDAV_PROXY_UPSTREAM_FETCH_FAILED: ${formatUpstreamError(error)}`,
            }),
          );
        }
      });
    },
  };
}

function publishProxyDevPlugin(): Plugin {
  return {
    name: 'codedeck-publish-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/publish', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        try {
          const rawBody = await readRequestBody(req);
          const result = await processPublishRequest({
            method: req.method,
            headers: req.headers ?? {},
            rawBody,
          });

          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result.body));
        } catch (error) {
          console.error('[publish-dev-proxy] failed', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), webdavProxyDevPlugin(), publishProxyDevPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
