/** DOM 小工具：够用就好，不引入任何框架（与「无打包器」的构建方式保持一致）。 */

export interface ElOptions {
  class?: string;
  text?: string;
  title?: string;
  type?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (ev: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElOptions = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.title) node.title = opts.title;
  if (opts.type) node.setAttribute('type', opts.type);
  if (opts.attrs) {
    for (const [key, value] of Object.entries(opts.attrs)) node.setAttribute(key, value);
  }
  if (opts.on) {
    for (const [event, handler] of Object.entries(opts.on)) {
      if (handler) node.addEventListener(event, handler as EventListener);
    }
  }
  for (const child of children) node.append(child);
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** 「证据等级」徽章：所有面向用户的参数都必须带这个标签。 */
export function tierBadge(tier: string): HTMLElement {
  const zh: Record<string, string> = {
    strong: '证据强',
    moderate: '证据中',
    weak: '证据弱',
    unverified: '未核实',
    disputed: '来源冲突',
  };
  return el('span', {
    class: `tier tier-${tier}`,
    text: zh[tier] ?? tier,
    title: '证据等级：本项目的每个参数都必须标出它有多可靠',
  });
}

export function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}
