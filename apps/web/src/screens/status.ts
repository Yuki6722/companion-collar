/**
 * 工程自检屏：原来的骨架页内容。
 *
 * 保留它的原因：跨包链路（`@camp/core` → `@camp/simulator` → `apps/web`）与仿真数据流
 * 是后续三屏（事件流／漂移报告／宠物档案）的基础；3D 场景上线后它仍然是**最快的链路体检入口**。
 */
import { ageBandOf, collarBudgetOf, sizeClassOf } from '@camp/core';
import { SCENARIOS, generateSession } from '@camp/simulator';
import { DEMO_PROFILE } from '../pet.ts';
import { el } from '../ui/dom.ts';

export function mountStatusScreen(host: HTMLElement): () => void {
  const session = generateSession({
    profile: DEMO_PROFILE,
    seed: 42,
    durationMin: 240,
    scenario: 'living-room-day',
  });
  const hr = session.samples.map((s) => s.hrBpm).filter((v): v is number => typeof v === 'number');
  const budget = collarBudgetOf(DEMO_PROFILE);

  const rows: Array<[string, string]> = [
    ['@camp/core 年龄分档', ageBandOf(DEMO_PROFILE.ageMonths)],
    ['@camp/core 体型分档', sizeClassOf(DEMO_PROFILE.species, DEMO_PROFILE.weightKg)],
    ['@camp/core 项圈重量上限', `${budget.maxWeightG} g`],
    ['@camp/simulator 场景', SCENARIOS['living-room-day'].name],
    [
      '@camp/simulator 采样点',
      `${session.samples.length}（${hr.length > 0 ? Math.min(...hr).toFixed(0) : '–'}–${hr.length > 0 ? Math.max(...hr).toFixed(0) : '–'} bpm）`,
    ],
    ['@camp/simulator 事件', `${session.events.length} 条`],
  ];

  const list = el('ul', { class: 'status-list' });
  for (const [label, value] of rows) {
    list.append(el('li', {}, [el('span', { class: 'status-key', text: label }), el('span', { text: value })]));
  }

  const screen = el('div', { class: 'status-screen' }, [
    el('p', { class: 'eyebrow', text: '工程链路 · v0.1.0' }),
    el('h1', { class: 'status-title', text: '项圈 · 伴侣视角' }),
    el('p', {
      class: 'status-lead',
      text: '按证据等级可视化猫的感知参数，并核查居家资源是否符合权威指南。当前页用于验证跨包链路与仿真数据流。',
    }),
    el('h2', { class: 'panel-title', text: '跨包链路自检' }),
    list,
    el('p', {
      class: 'boundary-note',
      text: '边界说明：本页数据全部为仿真，不是真实测量。本项目不构成兽医诊断或治疗建议；仿真数据不得作为临床决策依据。',
    }),
  ]);

  host.append(screen);
  return () => {
    screen.remove();
  };
}
