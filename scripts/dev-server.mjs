#!/usr/bin/env node
/**
 * 极简静态文件服务器，用于本地预览构建产物。
 *
 * 为什么自己写：避免引入任何依赖（含原生二进制）。功能需求只有「把 dist 目录用正确的
 * MIME 类型发出去」。
 *
 * 端口 5273，与 DSH GUI 的 19387 无关。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'apps', 'web', 'dist');
const PORT = Number(process.env.PORT ?? 5273);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

if (!fs.existsSync(DIST)) {
  console.error('✗ 尚未构建。请先运行：pnpm --filter @camp/web build');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  // 防目录穿越
  const target = path.resolve(DIST, '.' + rel);
  if (!target.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      console.log(`404 ${rel}`);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
    console.log(`200 ${rel}`);
  });
});

server.listen(PORT, () => {
  console.log(`静态预览已启动：http://localhost:${PORT}`);
  console.log(`服务目录：${DIST}`);
  console.log('修改源码后请重新运行 pnpm --filter @camp/web build');
});
