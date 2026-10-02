#!/usr/bin/env node
/**
 * 仿真数据 CLI。
 *
 * 用法：
 *   node src/cli.ts [--seed 42] [--scenario noise-event] [--minutes 240] [--species cat] [--out DIR]
 *
 * 或经 pnpm：pnpm sim:generate -- --seed 42 --scenario noise-event
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSession, SCENARIOS } from './index.ts';
import type { ScenarioId } from './index.ts';
import type { PetProfile, Species } from '@camp/core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(HERE, '../../../data/sessions');

function argOf(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v ?? fallback;
}

function numOf(name: string, fallback: number): number {
  const n = Number(argOf(name, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

const species = argOf('species', 'cat') as Species;
const scenarioArg = argOf('scenario', 'living-room-day');
const scenario: ScenarioId =
  scenarioArg in SCENARIOS ? (scenarioArg as ScenarioId) : 'living-room-day';
const seed = numOf('seed', 42);
const minutes = numOf('minutes', 240);
const outDir = path.resolve(argOf('out', DEFAULT_OUT));

const profile: PetProfile =
  species === 'cat'
    ? { species: 'cat', breedId: 'domestic-shorthair', weightKg: 4.2, heightCm: 24, ageMonths: 36 }
    : { species: 'dog', breedId: 'golden-retriever', weightKg: 32, heightCm: 58, ageMonths: 60 };

const session = generateSession({ profile, seed, durationMin: minutes, scenario });

fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `${session.id}.json`);
fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf8');

const hr = session.samples.map((s) => s.hrBpm ?? 0);
const noise = session.samples.map((s) => s.noiseDbA ?? 0);
console.log('场景      :', SCENARIOS[scenario].name);
console.log('物种      :', profile.species);
console.log('种子      :', seed);
console.log('时长      :', minutes, '分钟 →', session.samples.length, '个采样点');
console.log('事件      :', session.events.length, '条');
console.log('心率范围  :', Math.min(...hr).toFixed(1), '–', Math.max(...hr).toFixed(1), 'bpm');
console.log('噪声范围  :', Math.min(...noise).toFixed(1), '–', Math.max(...noise).toFixed(1), 'dB(A)');
console.log('注入缺口  :', session.truth?.injectedGaps.join(', ') || '（无）');
console.log('注入滞后  :', JSON.stringify(session.truth?.injectedLags));
console.log('已写入    :', file);
