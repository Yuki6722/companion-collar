/**
 * 居家资源清单的渲染。
 *
 * 为什么从 `hud.ts` 里抽出来：它原本是 3D 场景页的**右侧边栏**，
 * 但它的内容（按 AAFP/ISFM 五大支柱逐条核对房间）是**一份独立报告**，
 * 不是场景的操作控件。把它钉在场景上，会让"看房间"和"读清单"两件事互相遮挡。
 * 现在它有自己的页面（`#/resources`），本模块被那一页使用。
 */
import type { HomeResourceSummary } from '@camp/core';
import { el, tierBadge } from './dom.ts';

const PILLAR_TITLES: Record<string, string> = {
  'safe-place': '安全据点',
  'separated-resources': '资源分离',
  'play-hunt': '玩耍与捕猎',
  'predictable-interaction': '可预期的互动',
  olfactory: '气味环境',
};

const STATUS_TEXT: Record<string, string> = {
  ok: '达标',
  gap: '存在缺口',
  unknown: '待确认',
};

/** 把清单汇总渲染成一组可折叠的支柱卡片。 */
export function renderResourceList(summary: HomeResourceSummary): HTMLElement {
  const host = el('div', { class: 'resource-list' });

  const byPillar = new Map<string, HomeResourceSummary['checks']>();
  for (const check of summary.checks) {
    const list = byPillar.get(check.pillar) ?? [];
    list.push(check);
    byPillar.set(check.pillar, list);
  }

  for (const [pillar, checks] of byPillar) {
    const gaps = checks.filter((c) => c.status === 'gap').length;
    const unknown = checks.filter((c) => c.status === 'unknown').length;

    const body = el('div', { class: 'check-list' });
    for (const check of checks) {
      body.append(
        el('div', { class: 'check' }, [
          el('div', { class: 'check-line' }, [
            el('span', {
              class: `check-status check-status-${check.status}`,
              text: STATUS_TEXT[check.status] ?? check.status,
            }),
            el('span', { class: 'check-req', text: check.requirement }),
            tierBadge(check.evidence),
          ]),
          el('div', { class: 'check-actual', text: `现状：${check.actual}` }),
          check.note ? el('div', { class: 'check-note', text: check.note }) : el('span'),
        ]),
      );
    }

    // 用 <details>：默认展开"有缺口的支柱"，其余收起——清单很长，
    // 但"哪里不够"必须第一眼就能看到。
    const open = gaps > 0;
    const details = el('details', { class: 'pillar' }) as HTMLDetailsElement;
    details.open = open;
    details.append(
      el('summary', { class: 'pillar-head' }, [
        el('span', { text: PILLAR_TITLES[pillar] ?? pillar }),
        el('span', {
          class: 'pillar-count',
          text: gaps > 0 ? `${gaps} 项缺口` : unknown > 0 ? `${unknown} 项待确认` : '全部达标',
        }),
      ]),
      body,
    );
    host.append(details);
  }

  return host;
}

/** 清单一句话小结：先说缺口，再说待确认——顺序不能反。 */
export function resourceSummaryLine(summary: HomeResourceSummary): string {
  const gaps = summary.checks.filter((c) => c.status === 'gap').length;
  const unknown = summary.checks.filter((c) => c.status === 'unknown').length;
  const ok = summary.checks.filter((c) => c.status === 'ok').length;
  return `${ok} 项达标 · ${gaps} 项存在缺口 · ${unknown} 项待确认`;
}
