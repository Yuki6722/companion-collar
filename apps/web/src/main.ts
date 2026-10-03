/**
 * 应用入口。
 *
 * 两屏：**家居场景**（默认，3D 样板间 + 资源清单）与**工程自检**（跨包链路与仿真数据流）。
 * 屏切换走 hash 路由（#/home、#/status），静态托管零配置。
 */
import { mountApp } from './app.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  mountApp(root);
} else {
  console.error('找不到 #app 挂载点');
}
