import { createHash } from 'node:crypto';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'public', 'repo-tools', 'code');
const manifestPath = path.join(root, 'public', 'repo-tools', 'manifest.json');

const sourceFiles = [
  {
    fileName: 'MonoQR.html',
    repoId: 'monoqr',
    name: 'MonoQR-二维码生成器',
    description: '黑白二维码生成与导出工具。',
    runtime: 'html',
    language: 'html',
    category: '二维码',
    tags: ['二维码', '生成器'],
  },
  {
    fileName: 'pinjie.html',
    repoId: 'pinjie',
    name: '图片无缝拼接',
    description: '图片拼接和预览工具。',
    runtime: 'html',
    language: 'html',
    category: '图像处理',
    tags: ['图片', '拼接'],
  },
  {
    fileName: 'tudao.html',
    repoId: 'tudao',
    name: '图刀',
    description: '图片裁切与分割工具。',
    runtime: 'html',
    language: 'html',
    category: '图像处理',
    tags: ['图片', '裁切'],
  },
];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function run() {
  await mkdir(outputDir, { recursive: true });

  const manifestItems = [];

  for (const item of sourceFiles) {
    const sourcePath = path.join(root, item.fileName);
    const targetPath = path.join(outputDir, item.fileName);
    await copyFile(sourcePath, targetPath);

    const content = await readFile(sourcePath, 'utf8');
    manifestItems.push({
      ...item,
      sha256: sha256(content),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    items: manifestItems,
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`manifest generated: ${manifestPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
