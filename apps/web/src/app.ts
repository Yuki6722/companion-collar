/** 应用外壳：顶栏（品牌 + 屏切换）与路由宿主。 */
import { mountHomeScreen } from './screens/home.ts';
import { mountResourcesScreen } from './screens/resources.ts';
import { mountStatusScreen } from './screens/status.ts';
import { mountVitalsScreen } from './screens/vitals.ts';
import { el } from './ui/dom.ts';
import { Router } from './ui/router.ts';

export function mountApp(root: HTMLElement): () => void {
  const nav = el('nav', { class: 'nav', attrs: { 'aria-label': '屏切换' } });
  const topbar = el('header', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [
      el('span', { class: 'brand-dot' }),
      el('span', { class: 'brand-name', text: '项圈 · 伴侣视角' }),
      el('span', { class: 'brand-note', text: '居家样板间' }),
    ]),
    nav,
  ]);

  const host = el('main', { class: 'screen-host' });
  root.append(topbar, host);

  const router = new Router(
    [
      { id: 'home', label: '家居场景', mount: mountHomeScreen },
      { id: 'vitals', label: '生理读数', mount: mountVitalsScreen },
      { id: 'resources', label: '居家资源', mount: mountResourcesScreen },
      { id: 'status', label: '工程自检', mount: mountStatusScreen },
    ],
    'home',
    host,
    nav,
  );
  router.start();

  return () => {
    router.dispose();
    topbar.remove();
    host.remove();
  };
}
