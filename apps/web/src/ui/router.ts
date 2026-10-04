/**
 * 极简 hash 路由。
 *
 * 为什么不用 history API：静态站要能直接从文件/任意子路径打开，
 * hash 路由不需要服务端重写规则，GitHub Pages 上零配置可用。
 */
import { clear } from './dom.ts';

export interface Route {
  id: string;
  label: string;
  /** 挂载并返回卸载函数（用于停掉渲染循环、移除监听） */
  mount(host: HTMLElement): () => void;
}

export class Router {
  private readonly routes: Route[];
  private readonly fallback: string;
  private readonly host: HTMLElement;
  private readonly navHost: HTMLElement | null;
  private disposeCurrent: (() => void) | null = null;
  private readonly onHashChange: () => void;

  constructor(routes: Route[], fallback: string, host: HTMLElement, navHost: HTMLElement | null) {
    this.routes = routes;
    this.fallback = fallback;
    this.host = host;
    this.navHost = navHost;
    this.onHashChange = () => this.render();
  }

  start(): void {
    window.addEventListener('hashchange', this.onHashChange);
    this.render();
  }

  go(id: string): void {
    if (this.currentId() === id) return;
    window.location.hash = `#/${id}`;
  }

  currentId(): string {
    // 允许在 hash 里带查询串（`#/vitals?scenario=vet-visit`）：只取问号前的路由 id。
    // 为什么要容忍：用户会直接复制带参数的地址，而"复制来的地址打不开对应屏"
    // 是最容易被当成"功能坏了"的一类问题。
    const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0]?.trim() ?? '';
    if (raw && this.routes.some((r) => r.id === raw)) return raw;
    return this.fallback;
  }

  private render(): void {
    const id = this.currentId();
    const route = this.routes.find((r) => r.id === id) ?? this.routes.find((r) => r.id === this.fallback);
    if (!route) return;
    this.disposeCurrent?.();
    this.disposeCurrent = null;
    clear(this.host);
    this.disposeCurrent = route.mount(this.host) ?? null;
    this.renderNav(id);
  }

  private renderNav(activeId: string): void {
    if (!this.navHost) return;
    clear(this.navHost);
    for (const route of this.routes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = route.id === activeId ? 'nav-btn nav-btn-active' : 'nav-btn';
      button.textContent = route.label;
      button.setAttribute('aria-current', route.id === activeId ? 'page' : 'false');
      button.addEventListener('click', () => this.go(route.id));
      this.navHost.appendChild(button);
    }
  }

  dispose(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    this.disposeCurrent?.();
    this.disposeCurrent = null;
  }
}
