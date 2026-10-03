/**
 * 行为引擎：把节律、调度与突发演示组装成一条**连续覆盖、可复现、可断言**的时间线。
 *
 * 三条工程纪律（都是第一阶段踩过的坑的延伸）：
 *   1. **时间线是纯数据，不依赖 wall clock**。画面推进由 `apps/web` 按 wall clock 做，
 *      引擎只按调用方给的 `t` 求值。这样后台标签页被降帧、无头环境只渲染少量帧时，
 *      自检仍然能拿到正确值。
 *   2. **区间连续覆盖**：`segments` 首尾相接、无空洞、无重叠，`Σ durS === durationS`。
 *      有了这条，`activityAt(t)` 才有唯一正确答案，回归断言也才有判据。
 *   3. **突发是覆盖层，不是新的行为轴**。注入一次突发只在行为之上叠加一段带
 *      `incidentKind` 的区间，并保证 `injected === true`，让「注入 → 还原」可被断言。
 */
import type {
  CatAnchorSpec,
  CatBehaviorIncident,
  CatBehaviorIncidentRequest,
  CatBehaviorInput,
  CatBehaviorSegment,
  CatBehaviorTimeline,
} from './contract.ts';
import { hourOfDayAt } from './contract.ts';
import { activityWeightAt, isOwnerAwayHour } from './rhythm.ts';
import { makeBehaviorRng } from './rng.ts';
import {
  activityDurationS,
  activityWeights,
  chooseActivity,
  selectAnchor,
  travelDurationS,
} from './schedule.ts';
import { ACTIVITY_DEFS, INCIDENT_DEFS } from './vocabulary.ts';
import type { CatActivityId, CatIncidentKind, CatPosture } from './vocabulary.ts';

/** 行为推进的步长（秒）。取 30 s 是为了让注入的突发能得到足够多的求值采样点。 */
export const BEHAVIOR_STRIDE_S = 30;

/** 注入突发的排序与去重（同一时刻只保留第一条，越界的丢弃）。 */
function normalizeIncidents(
  requested: readonly CatBehaviorIncidentRequest[] | undefined,
  durationS: number,
): CatBehaviorIncidentRequest[] {
  if (!requested || requested.length === 0) return [];
  const seen = new Set<number>();
  const out: CatBehaviorIncidentRequest[] = [];
  for (const item of [...requested].sort((a, b) => a.atS - b.atS)) {
    if (!(item.atS >= 0) || item.atS >= durationS) continue;
    if (seen.has(item.atS)) continue;
    seen.add(item.atS);
    out.push({ atS: item.atS, kind: item.kind });
  }
  return out;
}

/** 突发覆盖期间「算作什么活动」。 */
function activityOfIncident(kind: CatIncidentKind): CatActivityId {
  return kind === 'withdrawal' ? 'hiding' : kind === 'vomit' ? 'vomit' : 'resting';
}

/**
 * 构建一条行为时间线。
 *
 * 同一 `(seed, durationS, injectIncidents, anchors)` 必然产出同一条时间线——
 * 这是 `simulator` 的「同种子字节级一致」断言能继续成立的前提。
 */
export function buildBehaviorTimeline(input: CatBehaviorInput): CatBehaviorTimeline {
  const durationS = Math.max(0, input.durationS);
  const timeScale = input.timeScale ?? 60;
  const anchors: readonly CatAnchorSpec[] = input.anchors ?? [];
  const awayWindows = input.awayWindows ?? [];
  const rng = makeBehaviorRng(input.seed);
  const requested = normalizeIncidents(input.injectIncidents, durationS);

  const segments: CatBehaviorSegment[] = [];
  const incidentsOut: CatBehaviorIncident[] = [];
  const budgetS: Record<string, number> = {};
  let cursor = 0;

  let prevAnchorId = '';
  let prevActivity: CatActivityId | null = null;
  let lastWasVomit = false;
  let preferHidingUntilS = -1;

  /** 当前所处锚点。为 `locomoting` 区间时，`prevAnchorId` 已经是**目的地**。 */
  function currentAnchorId(): string {
    return prevAnchorId || anchors[0]?.id || 'floor';
  }

  function isAway(t: number): boolean {
    return awayWindows.some(([lo, hi]) => t >= lo && t < hi) || isOwnerAwayHour(hourOfDayAt(t));
  }

  /**
   * 追加一段区间。
   *
   * `countAsActivity` 为 false 时只推进时间线、不计入 `budgetS`——用于「补白」：
   * 补白用的是休息姿势，但把它算进休息时长会虚高休息占比，扭曲时间预算断言。
   */
  function pushSegment(
    t: number,
    dur: number,
    activity: CatActivityId,
    posture: CatPosture,
    anchorId: string,
    options: {
      incidentKind?: CatIncidentKind;
      countAsActivity?: boolean;
      /** 位移是否真的发生；缺省时按「本来就在该锚点」推断 */
      resolved?: boolean;
    } = {},
  ): void {
    if (!(dur > 0)) return;
    const seg: CatBehaviorSegment = { t, durS: dur, activity, posture, anchorId };
    // 移动段默认视为已发生位移；退化路径会显式传 false
    const resolved = options.resolved ?? (activity !== 'locomoting' || anchorId !== prevAnchorId);
    if (!resolved) seg.resolved = false;
    if (options.incidentKind) seg.incidentKind = options.incidentKind;
    segments.push(seg);
    cursor = t + dur;
    if (options.countAsActivity !== false) {
      budgetS[activity] = (budgetS[activity] ?? 0) + dur;
    }
    prevAnchorId = anchorId;
    prevActivity = activity;
    lastWasVomit = activity === 'vomit';
  }

  /** 推进常规行为，直到 `untilT` 或时间线结束。 */
  function stride(untilT: number): void {
    while (cursor < durationS) {
      if (cursor >= untilT) return;
      const hour = hourOfDayAt(cursor);
      const away = isAway(cursor);
      const remainingWindow = Math.min(untilT, durationS) - cursor;

      // 自然干呕：证据政策下它是极小概率事件，且刻意不连续出现，
      // 否则会伪造出「反复呕吐」这种本项目不该有的读数。
      if (!lastWasVomit && rng.chance(0.0015)) {
        const dur = Math.min(INCIDENT_DEFS.vomit.demoDurationS, remainingWindow, durationS - cursor);
        if (dur > 0) {
          const t = cursor;
          pushSegment(t, dur, activityOfIncident('vomit'), INCIDENT_DEFS.vomit.posture, currentAnchorId());
          incidentsOut.push({ t, durationS: dur, kind: 'vomit', injected: false });
          continue;
        }
      }

      let activity = chooseActivity(activityWeights(hour, away, rng), prevActivity, rng);

      // 躲藏后的抑制窗口：一旦退避，短时间内不会立刻回到开阔处活动
      if (preferHidingUntilS > 0 && cursor < preferHidingUntilS) {
        activity = rng.chance(0.7) ? 'hiding' : 'resting';
      } else if (preferHidingUntilS > 0) {
        preferHidingUntilS = -1;
      }

      const def = ACTIVITY_DEFS[activity];
      const wanted = activityDurationS(activity, hour, rng);
      // 不越过 `untilT`（注入点前 1 秒），也不越过时间线末尾
      const window = Number.isFinite(untilT) ? untilT - cursor : durationS - cursor;
      const remaining = Math.min(wanted, durationS - cursor, window);
      if (!(remaining > 0)) return;

      if (def.anchorCapability.length === 0) {
        // 原地行为：不产生位移
        pushSegment(cursor, remaining, activity, def.posture, currentAnchorId());
        continue;
      }

      const target = selectAnchor(anchors, def.anchorCapability, rng, prevAnchorId);
      const from = anchors.find((a) => a.id === prevAnchorId);
      if (!target || !from || target.id === from.id) {
        // 没有可用锚点、或已经在目标处：退化为**原地**行为。
        // 注意不能把 `locomoting` 原样推出去——原地不动却报「移动」会让
        // 时间预算与画面自相矛盾（自检也会据此误判猫在走动）。
        const local: CatActivityId = activity === 'locomoting' ? 'alert' : activity;
        const localAnchor = target?.id ?? currentAnchorId();
        pushSegment(cursor, remaining, local, ACTIVITY_DEFS[local].posture, localAnchor, {
          resolved: false,
        });
        continue;
      }

      const travel = travelDurationS(from, target, rng);
      const moveDur = Math.min(travel, remaining);
      if (moveDur > 0) {
        const climb = Math.abs(target.heightM - from.heightM) > 0.15;
        pushSegment(cursor, moveDur, 'locomoting', climb ? 'climbing' : 'walking', target.id);
      }
      const left = remaining - moveDur;
      if (left > 0) pushSegment(cursor, left, activity, def.posture, target.id);
    }
  }

  /**
   * 把游标回退到目标时刻，通过**裁短**末段实现（而不是丢弃整段）。
   *
   * 为什么需要它：躲藏退避这类突发要先走一段路，如果只是「走完再开始计时」，
   * 注入时刻就会被路程整体后推（实测后推 11–14 秒），
   * 「注入 → 还原」的回归断言随之失去意义。这里改为先把时间轴裁到
   * `事发时刻 − 路程`，再走一段**贴地走路**（一次位移不构成本模型在意的事件），
   * 使「到达躲藏点」与「突发开始」落在同一时刻。
   */
  function rewindTo(targetT: number): void {
    while (segments.length > 0) {
      const seg = segments[segments.length - 1] as CatBehaviorSegment;
      const start = seg.t;
      if (start < targetT) {
        const cut = targetT - start;
        if (cut <= 0) return;
        if (cut >= seg.durS) {
          segments.pop();
          cursor = start;
          continue;
        }
        const kept: CatBehaviorSegment = { ...seg, durS: cut };
        segments[segments.length - 1] = kept;
        cursor = targetT;
        budgetS[seg.activity] = Math.max(0, (budgetS[seg.activity] ?? 0) - (seg.durS - cut));
        return;
      }
      segments.pop();
      budgetS[seg.activity] = Math.max(0, (budgetS[seg.activity] ?? 0) - seg.durS);
      cursor = start;
    }
  }

  for (const event of requested) {
    const def = INCIDENT_DEFS[event.kind];
    const strideTarget = Math.max(0, event.atS - 1);
    stride(strideTarget);
    if (cursor >= durationS) break;

    // 需要移动的突发：为路程预留时间，使「到达」与「事发」同时发生
    if (def.anchorCapability) {
      const target = selectAnchor(anchors, [def.anchorCapability], rng, undefined);
      const from = anchors.find((a) => a.id === prevAnchorId);
      if (target && from && target.id !== from.id) {
        const travel = Math.max(2, travelDurationS(from, target, rng));
        rewindTo(event.atS - travel);
        const startT = Math.max(0, cursor);
        const goDur = Math.min(travel, durationS - startT);
        if (goDur > 0) pushSegment(startT, goDur, 'locomoting', 'walking', target.id);
      } else if (target) {
        // 已经在躲藏点（或锚点表里只有一个候选）：只把时间轴对齐到事发时刻
        rewindTo(event.atS);
      }
    }

    const bodyStart = Math.min(Math.max(cursor, 0), durationS);
    const anchorId = currentAnchorId();
    const dur = Math.min(def.demoDurationS, durationS - bodyStart);
    if (!(dur > 0)) break;
    pushSegment(bodyStart, dur, activityOfIncident(event.kind), def.posture, anchorId, {
      incidentKind: event.kind,
    });
    // 记录的是**这一次突发**的时长，不是移动时长
    incidentsOut.push({ t: bodyStart, durationS: dur, kind: event.kind, injected: true });

    // 躲藏退避之后一段时间仍偏向躲藏。这是行为后果，不是新的突发。
    if (event.kind === 'withdrawal') preferHidingUntilS = bodyStart + dur + 20 * 60;
  }

  // 收尾：补满剩余时间，保证 Σ durS === durationS
  if (cursor < durationS) stride(Number.POSITIVE_INFINITY);
  if (cursor < durationS) {
    pushSegment(cursor, durationS - cursor, 'resting', ACTIVITY_DEFS.resting.posture, currentAnchorId());
  }

  return {
    seed: input.seed,
    durationS,
    segments,
    incidents: incidentsOut,
    budgetS: budgetS as Partial<Record<CatActivityId, number>>,
    timeScale,
  };
}

/**
 * 求某个时刻的行为区间。
 *
 * 用二分查找而不是线性扫描：自检与 UI 每帧都会调用它，线性扫描在 24 小时
 * 时间线（数千个区间）上会明显拖慢帧率。
 */
export function activityAt(timeline: CatBehaviorTimeline, tS: number): CatBehaviorSegment {
  const segs = timeline.segments;
  if (segs.length === 0) {
    return { t: 0, durS: 0, activity: 'resting', posture: 'lying', anchorId: 'floor' };
  }
  const last = segs[segs.length - 1] as CatBehaviorSegment;
  const t = Math.min(Math.max(tS, 0), Math.max(timeline.durationS, 0));
  let lo = 0;
  let hi = segs.length - 1;
  let found = last;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segs[mid] as CatBehaviorSegment;
    if (seg.t <= t && seg.t + seg.durS > t) {
      found = seg;
      break;
    }
    if (seg.t > t) hi = mid - 1;
    else lo = mid + 1;
  }
  return found;
}

/** 求某个时刻是否处于突发演示中。 */
export function incidentAt(timeline: CatBehaviorTimeline, tS: number): CatBehaviorIncident | null {
  for (const inc of timeline.incidents) {
    if (tS >= inc.t && tS < inc.t + inc.durationS) return inc;
  }
  return null;
}

/** 逐活动的占比（0–1）。UI 与断言共用，避免各自算一遍。 */
export function activityShare(timeline: CatBehaviorTimeline, activity: CatActivityId): number {
  if (timeline.durationS <= 0) return 0;
  return (timeline.budgetS[activity] ?? 0) / timeline.durationS;
}

/** 倾向曲线的当前值（0–1）。**不用于展示具体数值**，只用于行为加权与调试。 */
export function tendencyAt(tS: number): number {
  return activityWeightAt(hourOfDayAt(tS));
}
