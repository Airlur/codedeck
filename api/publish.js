import { processPublishRequest } from './publishCore.js';

function toRawBody(bodyValue) {
  if (typeof bodyValue === 'string') return bodyValue;
  if (Buffer.isBuffer(bodyValue)) return bodyValue.toString('utf8');
  if (bodyValue && typeof bodyValue === 'object') {
    try {
      return JSON.stringify(bodyValue);
    } catch {
      return '{}';
    }
  }
  return '';
}

export default async function handler(req, res) {
  const result = await processPublishRequest({
    method: req.method,
    headers: req.headers || {},
    rawBody: toRawBody(req.body),
  });

  return res.status(result.status).json(result.body);
}
