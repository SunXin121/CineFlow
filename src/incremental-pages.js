/**
 * v3.4.0 纯增量装配入口（分类片库 + 播放历史 + 三页切换）。
 * renderer.js 只需要两行挂钩：
 *   import { initIncrementalPages } from './incremental-pages.js';
 *   initIncrementalPages({ api, state, escapeHtml });
 * 首页永远是基线原样（.app-shell 一行未动、不进 3D），本层只占标题栏以下区域且不声明 app-region，
 * 窗口拖拽仍由基线标题栏负责；第九轮起切页只认键盘左右方向键（Alt+1/2/3 直跳）；
 * 任何异常都只让这一层不出现，不影响原有链路。
 */

import { createPageTransition } from './page-transition.js';
import { createLibraryPage } from './library-page.js';
import { createHistoryPage } from './history-page.js';
import { createHistoryResume } from './history-resume.js';
import { initHistoryStore } from './history-store.js';
import { initIncrementalSettings } from './incremental-settings.js';
import { initIncrementalSourceManager } from './source-manager.js';

const ISLAND_CLASSES = ['island-mode', 'island-expanded-mode', 'island-docked-mode'];
const PRELOAD_DELAY_MS = 2200;

function mountPages(deps) {
  const root = document.getElementById('app');
  if (!root || root.dataset.cf3Pages === '1') return false;
  root.dataset.cf3Pages = '1';
  const { api, state, escapeHtml } = deps;

  const isIsland = () => ISLAND_CLASSES.some((name) => document.body.classList.contains(name));

  initHistoryStore({ state, api });
  initIncrementalSettings({ api, state });
  initIncrementalSourceManager({ api, state, escapeHtml });

  const library = createLibraryPage({ api, state, escapeHtml });
  const history = createHistoryPage({ state, escapeHtml, resume: createHistoryResume({ state }) });

  const stage = createPageTransition({
    root,
    pages: [
      { id: 'home', el: null },
      {
        id: 'library',
        el: library.el,
        activate: () => library.activate(),
        settle: () => library.settle(),
      },
      {
        id: 'history',
        el: history.el,
        // 每次进入都重读记录：播放中攒下的进度回来就能立刻看到
        activate: () => history.activate(),
        prepare: () => history.activate(),
        settle: () => history.settle?.(),
      },
    ],
  });

  let preloaded = false;
  window.setTimeout(() => {
    if (preloaded || isIsland() || stage.getCurrent() !== 0) return;
    preloaded = true;
    stage.preload(1);
    stage.preload(2);
  }, PRELOAD_DELAY_MS);

  new MutationObserver(() => stage.setEnabled(!isIsland())).observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  return true;
}

export function initIncrementalPages(deps = {}) {
  try {
    return mountPages(deps);
  } catch (error) {
    console.warn('[CineFlow] 分类片库 / 播放历史与三页切换装配失败，已跳过', error);
    return false;
  }
}
