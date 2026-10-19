/**
 * v3.4.0 纯增量装配入口（仅投屏）。
 * renderer.js 只需两行挂钩：
 *   import { initIncrementalCast } from './incremental-cast.js';
 *   initIncrementalCast({ api, state, escapeHtml });
 * 本模块拿到的都是既有函数/状态的只读引用，不改变其行为。
 */

import { initCastPanel } from './cast-panel.js';
import { initPosterRelay } from './poster-relay.js';

let bridge = null;

export function getBridge() {
  return bridge;
}

export function initIncrementalCast(deps = {}) {
  bridge = deps;

  try {
    initPosterRelay({ api: deps.api });
  } catch (error) {
    console.warn('[CineFlow] 海报兜底加载初始化失败，已跳过', error);
  }

  try {
    initCastPanel();
  } catch (error) {
    console.warn('[CineFlow] 投屏面板初始化失败，已跳过', error);
  }
}
