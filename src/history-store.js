// v3.4.0 纯增量：播放历史采集（零挂钩）
// 不改播放链路：只用 MutationObserver 看 #playerModal 的开合 class、监听既有 <video> 的
// timeupdate / ended，把"看到哪一秒"记进 localStorage。任何异常都只让历史为空，不影响播放。

export const HISTORY_KEY = 'cineflow:history:v3';
const MAX_ITEMS = 60;
const FLUSH_MS = 5000;

let store = null;
let flushTimer = null;
let session = null;
let deps = null;

function read() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function write(items) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch (error) {
    /* 存储不可用时静默：历史页只会显示为空 */
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    write(store || read());
  }, FLUSH_MS);
}

export function listHistory() {
  if (!store) store = read();
  return store.slice();
}

export function removeHistory(key) {
  if (!store) store = read();
  store = store.filter((item) => item.key !== key);
  write(store);
}

export function clearHistory() {
  store = [];
  write(store);
}

export function restoreHistory(items) {
  if (!store) store = read();
  const byKey = new Map(store.map((item) => [item.key, item]));
  for (const item of items || []) {
    if (item?.key && !byKey.has(item.key)) byKey.set(item.key, item);
  }
  store = [...byKey.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, MAX_ITEMS);
  write(store);
}

function detailsOf(id, mediaType) {
  const key = `${mediaType}:${id}`;
  const caches = [deps?.state?.detailsCache, deps?.state?.cardMovies];
  for (const cache of caches) {
    try {
      const hit = cache?.get?.(key);
      if (hit) return hit;
    } catch (error) {
      /* 缓存不可用时只是补不到海报 */
    }
  }
  return null;
}

// 基线缓存里存的是 camelCase（posterPath / releaseDate），snake_case 只当回退留着
function firstString(details, names) {
  for (const name of names) {
    const value = details?.[name];
    if (typeof value === 'string' && value) return value;
  }
  return '';
}

function posterPathOf(details) {
  return firstString(details, ['posterPath', 'backdropPath', 'poster_path', 'backdrop_path']);
}

function yearOf(details) {
  return firstString(details, ['releaseDate', 'firstAirDate', 'release_date', 'first_air_date']).slice(0, 4);
}

// 早期记录里的海报/年份是空的（字段名当时读错了），从缓存把它们补回来并落盘一次
export function hydrateHistory() {
  if (!store) store = read();
  let changed = false;
  store = store.map((item) => {
    if (item?.posterPath && item?.year && item?.title) return item;
    const details = detailsOf(item?.id, item?.mediaType === 'tv' ? 'tv' : 'movie');
    if (!details) return item;
    const next = { ...item };
    if (!next.posterPath) next.posterPath = posterPathOf(details);
    if (!next.year) next.year = yearOf(details);
    if (!next.title) next.title = firstString(details, ['title', 'name']).trim();
    if (next.posterPath !== item.posterPath || next.year !== item.year || next.title !== item.title) changed = true;
    return next;
  });
  if (changed) write(store);
  return store.slice();
}

// 升级前记下的记录没有海报，内存缓存也空着：这时按 TMDB 详情补一次（基线现成的 IPC，一轮最多补几条）。
// 补不到就记住这条别再试，异常只会让这一行继续显示占位点。
const POSTER_FETCH_LIMIT = 12;
const attempted = new Set();
let posterFetchInflight = false;

export function fetchMissingPosters(onDone) {
  const api = deps?.api;
  if (!api?.getMovieDetails || posterFetchInflight) return false;
  if (!store) store = read();
  const targets = store
    .filter((item) => item?.id && !item.posterPath && !attempted.has(item.key))
    .slice(0, POSTER_FETCH_LIMIT);
  if (!targets.length) return false;
  for (const item of targets) attempted.add(item.key);
  posterFetchInflight = true;
  (async () => {
    let changed = false;
    for (const item of targets) {
      try {
        const details = await api.getMovieDetails(item.id, { mediaType: item.mediaType === 'tv' ? 'tv' : 'movie' });
        const entry = store.find((candidate) => candidate.key === item.key);
        if (!entry) continue;
        const poster = posterPathOf(details);
        const year = yearOf(details);
        if (poster && !entry.posterPath) {
          entry.posterPath = poster;
          changed = true;
        }
        if (year && !entry.year) {
          entry.year = year;
          changed = true;
        }
      } catch (error) {
        /* 单条补不到不影响其余，也不弹任何提示 */
      }
    }
    posterFetchInflight = false;
    if (changed) {
      write(store);
      onDone?.();
    }
  })();
  return true;
}

function episodeLabel() {
  const active = document.querySelector('.player-episode-button.is-active');
  return active ? active.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
}

// 只读取基线 state.player（它是 openResourcePlayer 里整体替换的普通对象），
// 用来记录"当时是哪个源、哪条线、第几集"——断点续播要靠这几个字段定位。
function playerContext() {
  const player = deps?.state?.player;
  if (!player || !player.open) return {};
  return {
    sourceName: String(player.sourceName || ''),
    lineName: String(player.lineName || ''),
    label: String(player.label || ''),
    episodeIndex: Number.isFinite(Number(player.episodeIndex)) ? Number(player.episodeIndex) : 0,
  };
}

function startSession() {
  const state = deps?.state;
  const id = state?.lastDetailMovieId;
  if (!id) return;
  const mediaType = state.lastDetailMediaType || 'movie';
  const details = detailsOf(id, mediaType);
  session = {
    key: `${mediaType}:${id}`,
    id,
    mediaType,
    title: (details?.title || details?.name || document.querySelector('#playerTitle')?.textContent || '').trim(),
    posterPath: posterPathOf(details),
    year: yearOf(details),
    episode: mediaType === 'tv' ? episodeLabel() : '',
    progress: 0,
    duration: 0,
    updatedAt: Date.now(),
    ...playerContext(),
  };
}

function commitProgress(progress, duration) {
  if (!session) startSession();
  if (!session) return;
  if (!Number.isFinite(progress) || progress <= 0) return;
  session.progress = Math.round(progress);
  session.duration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : session.duration;
  session.updatedAt = Date.now();
  session.episode = session.mediaType === 'tv' ? (episodeLabel() || session.episode) : session.episode;
  for (const [field, value] of Object.entries(playerContext())) {
    if (value) session[field] = value;
  }
  if (!store) store = read();
  const rest = store.filter((item) => item.key !== session.key);
  store = [{ ...session }, ...rest];
  scheduleFlush();
}

function bindVideo() {
  const video = document.querySelector('#resourcePlayer');
  if (!video || video.dataset.cfHistoryBound) return video;
  video.dataset.cfHistoryBound = '1';
  let lastTick = 0;
  video.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - lastTick < 4000) return;
    lastTick = now;
    commitProgress(video.currentTime, video.duration);
  });
  video.addEventListener('ended', () => commitProgress(video.duration || 0, video.duration));
  return video;
}

function modalOpen() {
  return document.querySelector('#playerModal')?.classList.contains('is-open');
}

export function initHistoryStore(nextDeps = {}) {
  deps = nextDeps;
  if (!store) store = read();
  const modal = document.querySelector('#playerModal');
  if (!modal) return false;
  let wasOpen = false;
  const observer = new MutationObserver(() => {
    const open = modalOpen();
    if (open && !wasOpen) {
      bindVideo();
      startSession();
    } else if (!open && wasOpen) {
      const video = document.querySelector('#resourcePlayer');
      if (video) commitProgress(video.currentTime, video.duration);
      session = null;
      write(store || []);
    }
    wasOpen = open;
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  bindVideo();
  wasOpen = modalOpen();
  if (wasOpen) startSession();
  return true;
}
