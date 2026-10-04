/**
 * 猫头顶的状态标签：把**行为模型本身**变成可见的。
 *
 * 为什么需要它（这是设计判断，不是装饰）：
 *   动画天生难以表达「抽搐」「呼吸急促」「用猫砂盆」这类动作——它们在画面上都只是
 *   「猫在动」。而本项目的交付面本来就是**行为层**，不是写实动画。
 *   把当前行为与突发状态直接标在猫头顶，等于把内部模型外显：
 *   演示时观众不需要猜「它现在是在抓挠还是在抖」。
 *
 * 三条纪律：
 *   1. **与资源标签独立**。资源标签层有「近处优先 + 相互遮挡就隐藏」的贪心去重，
 *      是为了避免十几个锚点标签糊成一团；猫的状态标签只有一条，绝不能因为它
 *      进了某个资源标签的矩形就被隐藏。
 *   2. **只在内容变化时改 DOM**。每帧写 textContent 会让文字被反复重排，
 *      低端设备上肉眼可见地抖。
 *   3. **只描述可观察的行为与动作**，不出现任何感受、情绪或疾病名称——
 *      文案来源是 `@camp/core` 的行为/突发词汇表，不在本文件里另写一套。
 */
import * as THREE from 'three';
import { ACTIVITY_DEFS, INCIDENT_DEFS } from '@camp/core';
import type { CatActivityId, CatIncidentKind, CatPosture } from '@camp/core';

/** 头顶标签相对猫的世界坐标偏移（米）。 */
const HEAD_OFFSET_Y = 0.34;
/** 投影用的复用向量，避免每帧分配。 */
const FRAME = new THREE.Vector3();

export interface CatStatusInput {
  activity: CatActivityId;
  posture: CatPosture;
  /** 当前突发（若有）。标签会切成「警示」样式。 */
  incident: CatIncidentKind | null;
  /** 当前行为段已进行的真实秒数（用于进展指示） */
  segmentElapsedS?: number;
  /** 当前行为段的真实总时长（秒） */
  segmentRealDurationS?: number;
}

export class CatStatusLabel {
  private readonly root: HTMLDivElement;
  private readonly nameNode: HTMLSpanElement;
  private readonly detailNode: HTMLSpanElement;
  private readonly timeNode: HTMLSpanElement;
  private lastKey = '';
  private lastShownSeconds = -1;
  private visible = true;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'cat-status';
    this.nameNode = document.createElement('span');
    this.nameNode.className = 'cat-status-name';
    this.detailNode = document.createElement('span');
    this.detailNode.className = 'cat-status-detail';
    this.timeNode = document.createElement('span');
    this.timeNode.className = 'cat-status-time';
    this.root.append(this.nameNode, this.detailNode, this.timeNode);
    // 标签只是展示，不该拦截轨道控制的拖拽
    this.root.style.pointerEvents = 'none';
    host.appendChild(this.root);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.style.display = on ? 'flex' : 'none';
  }

  /**
   * 更新文案与段内进展。只在内容真的变了才碰 DOM（见文件头的纪律 2）。
   *
   * 展示规则：突发期间**以突发为主标题**（那是此刻最该被看到的事），
   * 行为作为副标题；其余时刻主标题是行为、副标题是姿势。
   *
   * 末尾的「已进行 Xs」是关键：`resting` 段平均 56 秒、最长超过 2 分钟，
   * 而整段时间里活动文字是不变的——没有这个计数，用户会以为标签卡住了。
   * 计数按**秒**更新（不是逐帧），既看得出时间在走，又不会每帧重排文字。
   */
  set(input: CatStatusInput): void {
    const key = `${input.activity}|${input.posture}|${input.incident ?? ''}`;
    const seconds = Math.floor(input.segmentElapsedS ?? 0);
    const keyChanged = key !== this.lastKey;

    if (keyChanged) {
      this.lastKey = key;
      if (input.incident) {
        const inc = INCIDENT_DEFS[input.incident];
        this.nameNode.textContent = inc?.label ?? String(input.incident);
        this.detailNode.textContent = ACTIVITY_DEFS[input.activity]?.label ?? String(input.activity);
        this.root.dataset.state = 'incident';
      } else {
        this.nameNode.textContent = ACTIVITY_DEFS[input.activity]?.label ?? String(input.activity);
        this.detailNode.textContent = postureLabel(input.posture);
        this.root.dataset.state = 'normal';
      }
      // 段一换，计数无条件刷新（即使秒数恰好相同）
      this.lastShownSeconds = seconds;
      this.timeNode.textContent = `${seconds}s`;
      return;
    }

    if (seconds !== this.lastShownSeconds) {
      this.lastShownSeconds = seconds;
      this.timeNode.textContent = `${seconds}s`;
    }
  }

  /** 便于自检断言：当前文案（`主标题 · 副标题 · 计时`），未设置时为空串。 */
  text(): string {
    const name = this.nameNode.textContent ?? '';
    if (!name) return '';
    const detail = this.detailNode.textContent ?? '';
    const time = this.timeNode.textContent ?? '';
    return [name, detail, time].filter(Boolean).join(' · ');
  }

  /**
   * 每帧调用：把标签投到猫头顶的屏幕位置。
   *
   * @param anchor 猫的世界坐标（脚底/根节点位置）
   */
  update(camera: THREE.Camera, anchor: THREE.Vector3, width: number, height: number): void {
    if (!this.visible) return;
    FRAME.set(anchor.x, anchor.y + HEAD_OFFSET_Y, anchor.z).project(camera);
    const x = (FRAME.x * 0.5 + 0.5) * width;
    const y = (-FRAME.y * 0.5 + 0.5) * height;
    const inFront = FRAME.z > -1 && FRAME.z < 1;
    // 猫走出画面或跑到相机背后时隐藏，避免标签贴在屏幕边缘误导「它在那」
    const offScreen = x < -120 || y < -60 || x > width + 120 || y > height + 60;
    if (!inFront || offScreen) {
      this.root.style.opacity = '0';
      return;
    }
    this.root.style.opacity = '1';
    this.root.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  dispose(): void {
    this.root.remove();
  }
}

function postureLabel(posture: CatPosture): string {
  switch (posture) {
    case 'lying':
      return '趴卧';
    case 'sitting':
      return '坐';
    case 'standing':
      return '站立';
    case 'crouching':
      return '蹲伏';
    case 'walking':
      return '行走';
    case 'climbing':
      return '攀跳';
    default:
      return String(posture);
  }
}
