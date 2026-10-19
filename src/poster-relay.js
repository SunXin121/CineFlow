/**
 * 海报兜底加载（v3.4.0 新增，纯增量）。
 * 两条触发：① <img> 的 error（document 捕获阶段）；② 上屏后 WATCHDOG_MS 内仍未解码成功的
 * 看门狗。后者是为了直连被墙时不用干等 TCP/DNS 超时（实测能等十几秒，海报整片空白）。
 * 命中后请主进程经 DoH 通道取回字节换成 data URL 重试一次。不改任何既有渲染逻辑，
 * 主进程不可用时完全无副作用。
 */

const RELAY_HOSTS = ['image.tmdb.org', 'static-1.themoviedb.org', 'media.themoviedb.org'];
const MAX_CONCURRENT = 4;
const WATCHDOG_MS = 2600;
// 看门狗只管卡片小图：挂代理时大图（背景/w1280/original）本来就可能几秒才到，
// 2.6s 就换 data URL 反而会把正在进行的代理请求掐断，越兜越慢。
const SMALL_POSTER_RE = /\/t\/p\/(w92|w154|w185|w342|w500)\//;

let running = 0;
const queue = [];

function pump(api) {
  while (running < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    running += 1;
    job(api).finally(() => {
      running -= 1;
      pump(api);
    });
  }
}

function isPosterUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl, window.location.href);
    return parsed.protocol === 'https:' && RELAY_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function relayJob(img, sourceUrl) {
  return async (api) => {
    try {
      const result = await api.relayImage(sourceUrl);
      if (!result?.ok || !result.base64) return;
      if (!img.isConnected) return;
      img.src = `data:${result.contentType || 'image/jpeg'};base64,${result.base64}`;
    } catch {
      // 兜底失败时保持原状（与修复前行为一致）
    }
  };
}

function enqueue(img, sourceUrl) {
  if (img.dataset.cfRelayed || !isPosterUrl(sourceUrl)) return;
  img.dataset.cfRelayed = '1';
  queue.push(relayJob(img, sourceUrl));
  pump(getApi());
}

let api = null;
function getApi() {
  return api;
}

function watch(img) {
  const sourceUrl = img.getAttribute('src') || '';
  if (!isPosterUrl(sourceUrl) || img.dataset.cfRelayed) return;
  if (img.complete && img.naturalWidth > 0) return;
  if (!SMALL_POSTER_RE.test(sourceUrl)) return;
  window.setTimeout(() => {
    if ((img.complete && img.naturalWidth > 0) || !img.isConnected) return;
    enqueue(img, sourceUrl);
  }, WATCHDOG_MS);
}

function scanNode(node) {
  if (node.nodeType !== 1) return;
  if (node.tagName === 'IMG') watch(node);
  node.querySelectorAll?.('img[src]').forEach(watch);
}

export function initPosterRelay({ api: bridgeApi } = {}) {
  if (!bridgeApi?.relayImage) return false;
  api = bridgeApi;
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG') return;
    enqueue(img, img.getAttribute('src') || img.src || '');
  }, true);
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target.tagName === 'IMG') {
          watch(record.target);
          continue;
        }
        record.addedNodes.forEach(scanNode);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    document.querySelectorAll('img[src]').forEach(watch);
  }
  return true;
}
