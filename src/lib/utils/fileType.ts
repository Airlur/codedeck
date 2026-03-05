import type { ToolRuntime } from '@/types/schema';

export const runtimeToExtension: Record<ToolRuntime, string> = {
  html: 'html',
  javascript: 'js',
  css: 'css',
  markdown: 'md',
  json: 'json',
  text: 'txt',
};

export const runtimeToLanguage: Record<ToolRuntime, string> = {
  html: 'html',
  javascript: 'javascript',
  css: 'css',
  markdown: 'markdown',
  json: 'json',
  text: 'plaintext',
};

const extToRuntime: Record<string, ToolRuntime> = {
  html: 'html',
  htm: 'html',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  css: 'css',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  txt: 'text',
};

export function inferRuntimeFromFileName(fileName: string): ToolRuntime {
  const normalized = fileName.trim().toLowerCase();
  const ext = normalized.includes('.') ? normalized.split('.').pop() ?? '' : '';
  return extToRuntime[ext] ?? 'html';
}

export function inferRuntimeFromCode(code: string): ToolRuntime {
  const text = code.trimStart();
  if (text.startsWith('<!DOCTYPE html') || text.startsWith('<html')) return 'html';
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      JSON.parse(text);
      return 'json';
    } catch {
      // noop
    }
  }
  if (/^#\s+.+/m.test(text) || /```/.test(text)) return 'markdown';
  if (/function\s+|const\s+|let\s+|=>/.test(text)) return 'javascript';
  if (/\{[^}]+:\s*[^;]+;/.test(text)) return 'css';
  return 'text';
}

export function ensureFileName(fileName: string, runtime: ToolRuntime): string {
  const trimmed = fileName.trim();
  if (!trimmed) return `untitled.${runtimeToExtension[runtime]}`;
  if (trimmed.includes('.')) return trimmed;
  return `${trimmed}.${runtimeToExtension[runtime]}`;
}

export function contentTypeByRuntime(runtime: ToolRuntime): string {
  switch (runtime) {
    case 'html':
      return 'text/html;charset=utf-8';
    case 'javascript':
      return 'application/javascript;charset=utf-8';
    case 'css':
      return 'text/css;charset=utf-8';
    case 'markdown':
      return 'text/markdown;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
    default:
      return 'text/plain;charset=utf-8';
  }
}

export function suggestionFromCode(code: string): {
  runtime: ToolRuntime;
  language: string;
  defaultFileName: string;
} {
  const runtime = inferRuntimeFromCode(code);
  const language = runtimeToLanguage[runtime];
  return {
    runtime,
    language,
    defaultFileName: `untitled.${runtimeToExtension[runtime]}`,
  };
}
