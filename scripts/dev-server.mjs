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
  // 3D 资产：GLTFLoader / RGBELoader 走 fetch，MIME 不致命，但补齐更正确
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.hdr': 'image/vnd.radiance',
};

if (!fs.existsSync(DIST)) {
  console.error('✗ 尚未构建。请先运行：pnpm --filter @camp/web build');
  process.exit(1);
}

const ROOT_DIR = ROOT;
const SELFTEST_LOG = path.join(ROOT_DIR, '.tools', 'selftest.jsonl');

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  /*
   * 自检回传端点（仅本地预览服务提供，静态部署上没有这个路由）。
   *
   * 为什么需要它：本环境的沙箱不允许启动浏览器（Chromium 的进程间通信用命名管道），
   * 也不给 DOM dump，唯一能跑通的是截图。于是让页面把自检快照 POST 回来，
   * 自动化脚本就能断言「真的渲染了、模型真的换上了、切状态真的改变了参数」。
   * 每行一个 JSON，便于比对切换前后的两次快照。
   */
  if (req.method === 'POST' && url.pathname === '/__selftest') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 200_000) req.destroy();
    });
    req.on('end', () => {
      try {
        fs.mkdirSync(path.dirname(SELFTEST_LOG), { recursive: true });
        fs.appendFileSync(SELFTEST_LOG, `${body.trim()}\n`, 'utf8');
        console.log(`200 POST /__selftest（${body.length} 字节）`);
      } catch (err) {
        console.error(`写入自检日志失败：${err.message}`);
      }
      res.writeHead(204).end();
    });
    return;
  }

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
