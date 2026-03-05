const cache = new Map<string, string | null>();

const linkTagRegex = /<link\b[^>]*>/gi;
const attrRegex = /([a-zA-Z:-]+)\s*=\s*(['"])(.*?)\2/g;

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null = null;

  while ((match = attrRegex.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[3];
  }

  return attrs;
}

export function extractFaviconHref(code: string): string | null {
  if (!code) return null;

  if (cache.has(code)) {
    return cache.get(code) ?? null;
  }

  const linkTags = code.match(linkTagRegex) ?? [];
  for (const tag of linkTags) {
    const attrs = parseAttributes(tag);
    const rel = (attrs.rel ?? '').toLowerCase();
    const href = (attrs.href ?? '').trim();
    if (rel.includes('icon') && href) {
      cache.set(code, href);
      return href;
    }
  }

  cache.set(code, null);
  return null;
}
