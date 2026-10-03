/**
 * 居家资源页（`#/resources`）。
 *
 * 这一页原来钉在 3D 场景的右侧边栏上，和"看房间"互相遮挡。
 * 拆出来之后两边各自完整：场景页只放操作与 App 预览，这一页只做资源核对报告。
 *
 * 内容与证据等级都来自 `@camp/core` 的 `summarizeHomeResources`，
 * 与 3D 房间用的是**同一份布局数据**（`scene/layout.ts`）——否则"清单说缺砂盆、房间里却有两个"。
 */
import { summarizeHomeResources } from '@camp/core';
import { HOME_RESOURCES, TRAFFIC_PATH } from '../scene/layout.ts';
import { el } from '../ui/dom.ts';
import { renderResourceList, resourceSummaryLine } from '../ui/resource-list.ts';

export function mountResourcesScreen(host: HTMLElement): () => void {
  const summary = summarizeHomeResources(HOME_RESOURCES, { cats: 1, trafficPath: TRAFFIC_PATH });

  const screen = el('div', { class: 'status-screen resources-screen' }, [
    el('p', { class: 'eyebrow', text: '居家资源 · 可核查清单' }),
    el('h1', { class: 'status-title', text: '你家的资源够不够' }),
    el('p', {
      class: 'status-lead',
      text: '「环境舒适度」不是感受，而是一份可核查的资源清单：砂盆、食水、睡窝、抓挠面、躲藏处、垂直空间，以及它们是否分散在多处。逐条按 AAFP/ISFM 健康猫科环境五大支柱核对。',
    }),
    el('p', { class: 'resources-summary', text: resourceSummaryLine(summary) }),
    renderResourceList(summary),
    el('p', {
      class: 'boundary-note',
      text: '边界说明：「待确认」不等于合格——本项目对未回答的问题一律返回待确认，绝不默认达标。清单核对的是房间资源，不判断猫的感受或健康状态。',
    }),
    el('p', {
      class: 'panel-foot',
      text: '3D 样板间与这份清单使用同一份布局数据；房间本身在「家居场景」页。',
    }),
  ]);

  host.append(screen);
  return () => {
    screen.remove();
  };
}
