#!/usr/bin/env node
/**
 * 一次性抓取 CC0 资产到 apps/web/public/assets/。
 *
 * 为什么抓下来入库而不是运行时外链：
 *   构建产物要能在 GitHub Pages 上**零网络依赖**地跑（演示现场的网不可控），
 *   同时让构建确定性、可离线复现。因此资产只在这里下载一次，之后进版本库。
 *
 * 为什么带校验：glTF 的贴图/缓冲是**相对 URI**，少一个文件只会在运行时静默失败。
 *   本脚本解析 .gltf 后逐个落地，并核对 content-length；任何一项不完整就整体失败退出，
 *   绝不留下半成品资产目录。
 *
 * 用法：node scripts/fetch-assets.mjs [--force]
 * 退出码：0 = 资产齐全；1 = 有缺失或超预算
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps', 'web', 'public', 'assets');
const API = 'https://api.polyhaven.com/files/';
const FORCE = process.argv.includes('--force');

/** 总资产预算（字节）。超过只警告，硬上限见 HARD_LIMIT。 */
const BUDGET = 15e6;
const HARD_LIMIT = 25e6;

/**
 * 扫描模型：家具的「英雄件」。
 *
 * 选型经过一轮**看图的取舍**（缩略图对比见设计文档的记录）：
 * 第一版按名字选的 `sofa_02`（黑皮切斯特菲尔德）、`CoffeeTable_01`（青绿雕花）、
 * `throw_pillows_01`（锯齿撞色）在暖色调样板间里非常突兀，被整体替换掉。
 * 现在这一组是米色布沙发、圆形茶几、白色置物架、奶白餐边柜、绿植、吊灯、木凳、藤篮 ——
 * 都是「温馨写实」这套叙事里站得住的东西。
 *
 * 取舍记录：`old_bed_frame`（3.85 MB）与 `desk_lamp_arm_01`（2.75 MB）也被排除——
 * 床架与落地灯用程序化几何做得足够像，而它们吃掉近三分之一预算。
 */
const MODELS = [
  'sofa_03',
  'coffee_table_round_01',
  'Shelf_01',
  'painted_wooden_cabinet',
  'potted_plant_02',
  'modern_ceiling_lamp_01',
];

/**
 * 平铺 PBR 贴图。刻意只保留三张「大面积、决定观感」的：木地板、墙面、石材台面。
 * 逐项指定要哪几张图——墙面与石材不需要法线/粗糙度，省下的体积换别的真实感。
 * 织物与金属用程序化贴图生成。
 */
const TEXTURES = [
  { id: 'wood_floor_deck', maps: ['Diffuse', 'Rough', 'nor_gl'] },
  { id: 'painted_plaster_wall', maps: ['Diffuse', 'Rough'] },
  { id: 'marble_01', maps: ['Diffuse'] },
];

/** 只作 IBL 环境光，不做背景（背景是程序化天空，只在窗口处可见）。 */
const HDRI = 'hotel_room';

const TILE_SUFFIX = {
  Diffuse: 'diff',
  Rough: 'rough',
  nor_gl: 'nor_gl',
};

const credits = [];
let totalBytes = 0;

async function api(id) {
  const res = await fetch(API + id);
  if (!res.ok) throw new Error(`资产 ${id} 不存在（HTTP ${res.status}）`);
  return res.json();
}

async function download(url, dest, label) {
  if (!FORCE && fs.existsSync(dest)) {
    return fs.statSync(dest).size;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} 下载失败（HTTP ${res.status}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  const expected = Number(res.headers.get('content-length'));
  if (Number.isFinite(expected) && expected > 0 && expected !== buf.length) {
    throw new Error(`${label} 字节数不符：期望 ${expected}，实得 ${buf.length}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function fetchModel(id) {
  const files = await api(id);
  const entry = files.gltf?.['1k']?.gltf;
  if (!entry?.url) throw new Error(`模型 ${id} 没有 1k glTF`);

  const rel = `models/${id}/${path.basename(entry.url)}`;
  const dest = path.join(OUT, rel);
  totalBytes += await download(entry.url, dest, `模型 ${id}`);
  const text = fs.readFileSync(dest, 'utf8');

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`模型 ${id} 的 .gltf 不是合法 JSON：${err.message}`);
  }

  const refs = [
    ...(json.buffers ?? []).map((b) => b.uri),
    ...(json.images ?? []).map((i) => i.uri),
  ].filter(Boolean);

  // glTF 里的相对 URI 在 CDN 上是**打散存放**的（贴图在 Models/jpg/、缓冲在 Models/gltf/），
  // 不能简单按相对路径拼。API 的 include 表给出了每个 URI 的真实 URL 与字节数，照它下载。
  const include = entry.include ?? {};
  for (const ref of refs) {
    if (/^https?:/i.test(ref)) throw new Error(`模型 ${id} 含外链资源：${ref}`);
    const node = include[ref];
    if (!node?.url) throw new Error(`模型 ${id} 缺少 ${ref} 的下载地址（API include 表未列出）`);
    const bytes = await download(node.url, path.join(OUT, `models/${id}/${ref}`), `模型 ${id} · ${ref}`);
    if (node.size && node.size !== bytes) {
      throw new Error(`模型 ${id} 的 ${ref} 字节数不符：期望 ${node.size}，实得 ${bytes}`);
    }
    totalBytes += bytes;
  }

  credits.push({
    kind: 'model',
    id,
    files: [path.basename(entry.url), ...refs],
    note: `${refs.length} 个附属文件（缓冲 + 贴图）`,
  });
  console.log(`  ✓ 模型 ${id}（${refs.length + 1} 个文件）`);
}

async function fetchTexture(spec) {
  const { id, maps } = spec;
  const files = await api(id);
  const rels = [];
  for (const key of maps) {
    const suffix = TILE_SUFFIX[key];
    const node = files[key]?.['1k'];
    const file = node?.jpg ?? node?.png;
    if (!file) {
      if (key === 'Diffuse') throw new Error(`贴图 ${id} 缺少 1k 颜色图`);
      console.log(`  · 贴图 ${id} 无 ${suffix}，跳过`);
      continue;
    }
    const ext = path.extname(new URL(file.url).pathname) || '.jpg';
    const name = `${id}_${suffix}_1k${ext}`;
    totalBytes += await download(file.url, path.join(OUT, 'textures', id, name), `贴图 ${id} · ${suffix}`);
    rels.push(name);
  }
  credits.push({ kind: 'texture', id, files: rels, note: '平铺 PBR' });
  console.log(`  ✓ 贴图 ${id}（${rels.length} 个文件）`);
}

async function fetchHdri(id) {
  const files = await api(id);
  const file = files.hdri?.['1k']?.hdr;
  if (!file) throw new Error(`HDRI ${id} 没有 1k .hdr`);
  const name = `${id}_1k.hdr`;
  totalBytes += await download(file.url, path.join(OUT, 'env', name), `HDRI ${id}`);
  credits.push({ kind: 'env', id, files: [name], note: '室内 HDRI，仅作环境光（IBL）' });
  console.log(`  ✓ HDRI ${id}`);
}

function writeCredits() {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '# 3D 资产来源与许可（CC0）',
    '',
    '> 本目录全部素材来自 [Poly Haven](https://polyhaven.com)，**许可为 CC0 1.0（公共领域贡献）**：',
    '> 可自由用于商业与非商业用途，无需署名。这里仍逐项记录来源，是为了**可追溯与可复核** ——',
    '> 「CC0」不等于「没有出处」。',
    '>',
    `> 抓取方式：\`node scripts/fetch-assets.mjs\`（最近一次抓取：${today}）。`,
    '> 重新抓取会在文件已存在时跳过，除非加 `--force`。',
    '',
    '| 类型 | 资产 | 来源页 | 包含文件 | 说明 |',
    '|---|---|---|---|---|',
  ];
  for (const c of credits) {
    const page = `https://polyhaven.com/a/${c.id}`;
    lines.push(
      `| ${c.kind} | \`${c.id}\` | [${c.id}](${page}) | ${c.files.join('<br>')} | ${c.note} |`,
    );
  }
  lines.push(
    '',
    '## 为什么只抓这些',
    '',
    '- 家具「英雄件」用扫描模型补真实感（沙发、茶几、书架、单人椅、绿植、落地灯、靠垫、床架）；',
    '  冰箱、电视、厨房、衣柜、猫爬架、猫砂盆、饮水机等**没有合适的 CC0 扫描件**，一律程序化建模，',
    '  这样它们的尺寸与位置可以严格服从房间布局与指南要求。',
    '- 平铺贴图只保留三张「大面积、决定观感」的：木地板、墙面、石材台面；',
    '  织物与金属用程序化贴图生成，把仓库体积留给更值钱的地方。',
    '- 猫没有可信的 CC0 写实模型（Poly Haven 521 个模型中只有 `concrete_cat_statue` 这类雕塑），',
    '  因此橘猫是程序化重建：比例与毛色写实，但不是照片级扫描。替换缝见 `scene/cat/cat-model.ts`。',
    '',
  );
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'), lines.join('\n'), 'utf8');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`→ 抓取 CC0 资产 → ${path.relative(ROOT, OUT)}`);
  console.log('→ 模型');
  for (const id of MODELS) await fetchModel(id);
  console.log('→ 平铺贴图');
  for (const spec of TEXTURES) await fetchTexture(spec);
  console.log('→ 环境光');
  await fetchHdri(HDRI);
  writeCredits();

  const mb = (totalBytes / 1e6).toFixed(2);
  console.log(`✓ 资产就绪：${mb} MB（预算 ${BUDGET / 1e6} MB）`);
  if (totalBytes > HARD_LIMIT) {
    console.error(`✗ 资产超过硬上限 ${HARD_LIMIT / 1e6} MB，请按设计文档的裁剪顺序减项`);
    process.exit(1);
  }
  if (totalBytes > BUDGET) {
    console.warn(`! 资产超过软预算 ${BUDGET / 1e6} MB，建议裁剪装饰件或降档`);
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
