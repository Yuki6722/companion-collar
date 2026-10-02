/**
 * 应用入口。
 *
 * 当前为骨架：验证跨包解析（@camp/core、@camp/simulator）与仿真数据流可用。
 * 完整的档案配置、视角对比与资源清单 UI 属于 Day 2 工作。
 */
import { ageBandOf, collarBudgetOf, sizeClassOf } from '@camp/core';
import type { PetProfile } from '@camp/core';
import { generateSession, SCENARIOS } from '@camp/simulator';

const profile: PetProfile = {
  species: 'cat',
  breedId: 'domestic-shorthair',
  weightKg: 4.2,
  heightCm: 24,
  ageMonths: 36,
};

const session = generateSession({
  profile,
  seed: 42,
  durationMin: 240,
  scenario: 'living-room-day',
});

const hr = session.samples.map((s) => s.hrBpm ?? 0);
const budget = collarBudgetOf(profile);

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <main style="max-width:720px;margin:0 auto;padding:32px 20px;font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.7">
      <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:700;margin:0 0 10px">
        骨架就绪 · v0.0.1
      </p>
      <h1 style="font-size:28px;margin:0 0 14px">项圈 · 伴侣视角</h1>
      <p style="color:#3d434e;margin:0 0 24px">
        按证据等级可视化猫狗感知差异，并核查居家资源是否符合权威指南。
        当前页面仅用于验证工程链路，不是最终体验。
      </p>

      <h2 style="font-size:16px;margin:0 0 8px">跨包链路自检</h2>
      <ul style="color:#3d434e;margin:0 0 24px;padding-left:20px">
        <li><code>@camp/core</code> 年龄分档：${ageBandOf(profile.ageMonths)}</li>
        <li><code>@camp/core</code> 体型分档：${sizeClassOf(profile.species, profile.weightKg)}</li>
        <li><code>@camp/core</code> 项圈重量上限：${budget.maxWeightG} g</li>
        <li><code>@camp/simulator</code> 场景：${SCENARIOS['living-room-day'].name}</li>
        <li><code>@camp/simulator</code> 采样点：${session.samples.length}（${session.samples.length > 0 ? Math.min(...hr).toFixed(0) : '–'}–${session.samples.length > 0 ? Math.max(...hr).toFixed(0) : '–'} bpm）</li>
        <li><code>@camp/simulator</code> 事件：${session.events.length} 条</li>
      </ul>

      <p style="border-left:3px solid #b45309;background:#fdf3e3;padding:12px 16px;margin:0;font-size:14px;color:#3d434e">
        <b>边界说明</b>：本页数据全部为仿真，不是真实测量。
        本项目不构成兽医诊断或治疗建议；仿真数据不得作为临床决策依据。
      </p>
    </main>
  `;
}
