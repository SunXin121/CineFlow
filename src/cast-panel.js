/**
 * 投屏面板（v3.4.0 新增，纯增量）。
 * 右侧拉出，实时展示主进程发现的 DLNA / 蓝牙设备，选中后把当前播放源推给设备。
 * 只读取 state.player，绝不改动播放链路；投屏失败只在面板内提示。
 */

import { getBridge } from './incremental-cast.js';

let panel = null;
let dlnaList = null;
let bluetoothList = null;
let hintHost = null;
let nowPlayingHost = null;
let initialized = false;
let lastSnapshot = null;
let activeUdn = '';
let rippleTimer = null;

function castApi() {
  return getBridge()?.api;
}

function currentCastUrl() {
  const player = getBridge()?.state?.player;
  if (!player) return '';
  // 原始外发地址优先，其次已解析地址；本地代理 loopback 地址无法投给设备
  const candidate = player.originalUrl || player.resolvedUrl || player.url || '';
  if (/^https?:\/\//i.test(candidate) && !/127\.0\.0\.1|localhost/i.test(candidate)) return candidate;
  if (/^https?:\/\//i.test(player.url) && !/127\.0\.0\.1|localhost/i.test(player.url)) return player.url;
  return '';
}

function escapeHtml(value) {
  const bridge = getBridge();
  if (bridge?.escapeHtml) return bridge.escapeHtml(value);
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function startCastRipple(direction = 'open') {
  if (!panel) return;
  window.clearTimeout(rippleTimer);
  panel.classList.remove('is-rippling-open', 'is-rippling-close');
  void panel.offsetWidth;
  panel.classList.add(direction === 'close' ? 'is-rippling-close' : 'is-rippling-open');
  rippleTimer = window.setTimeout(() => {
    panel?.classList.remove('is-rippling-open', 'is-rippling-close');
  }, direction === 'close' ? 640 : 780);
}

export function openCastPanel() {
  if (!panel) return;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('cast-open');
  startCastRipple('open');
  refreshNowPlaying();
  castApi()?.castScan?.();
}

export function closeCastPanel() {
  if (!panel) return;
  if (panel.classList.contains('is-open')) startCastRipple('close');
  else panel.classList.remove('is-rippling-open', 'is-rippling-close');
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('cast-open');
  castApi()?.castStopSearch?.();
}

export function toggleCastPanel() {
  if (panel?.classList.contains('is-open')) closeCastPanel();
  else openCastPanel();
}

function refreshNowPlaying() {
  const player = getBridge()?.state?.player;
  if (!nowPlayingHost) return;
  if (player?.title) {
    const episode = player.episodeIndex ? ` · 第 ${player.episodeIndex + 1} 集` : '';
    nowPlayingHost.textContent = `${player.title}${episode}`;
    nowPlayingHost.hidden = false;
  } else {
    nowPlayingHost.textContent = '';
    nowPlayingHost.hidden = true;
  }
}

// v3.4.0：只保留必要性文字（状态 / 结果 / 错误），说明性文案一律不占位
function setHint(text) {
  if (!hintHost) return;
  const value = String(text || '');
  hintHost.textContent = value;
  hintHost.hidden = !value;
}

function deviceRow(device, actionable) {
  const casting = device.udn && device.udn === activeUdn;
  const status = device.online ? '在线' : '离线';
  const connected = device.connected ? ' · 已连接' : '';
  return `
    <div class="cast-device${casting ? ' is-casting' : ''}" data-udn="${escapeHtml(device.udn || '')}" data-kind="${escapeHtml(device.kind || 'dlna')}">
      <div class="cast-device-icon">${device.kind === 'bluetooth' ? '◉' : '🖵'}</div>
      <div class="cast-device-main">
        <strong>${escapeHtml(device.name || '未命名设备')}</strong>
        <span>${escapeHtml(device.modelName || '')}${device.hostName ? ` · ${escapeHtml(device.hostName)}` : ''}${escapeHtml(connected)}</span>
      </div>
      <button type="button" class="cast-device-action" data-udn="${escapeHtml(device.udn || '')}" ${actionable ? '' : 'disabled'}>
        ${casting ? '断开' : (device.kind === 'bluetooth' ? '系统设置' : (actionable ? '投屏' : status))}
      </button>
    </div>
  `;
}

function renderSnapshot(snapshot) {
  if (!snapshot || !dlnaList || !bluetoothList) return;
  lastSnapshot = snapshot;

  const url = currentCastUrl();
  const dlna = snapshot.dlna || [];
  if (!dlna.length) {
    dlnaList.innerHTML = '<p class="cast-empty">暂无设备</p>';
  } else {
    dlnaList.innerHTML = dlna.map((device) => deviceRow(device, Boolean(url))).join('');
  }

  // v3.4.0：只把"无线显示器 / 扩展坞"类型的蓝牙设备交给前端
  const bluetooth = (snapshot.bluetooth || [])
    .filter((device) => device.category === 'display' || device.category === 'dock');
  if (!snapshot.bluetoothSupported) {
    bluetoothList.innerHTML = '<p class="cast-empty">系统不支持</p>';
  } else if (!bluetooth.length) {
    bluetoothList.innerHTML = '<p class="cast-empty">暂无设备</p>';
  } else {
    bluetoothList.innerHTML = bluetooth.map((device) => deviceRow({ ...device, online: true }, false)).join('');
  }

  setHint(snapshot.searching ? '搜索中…' : '');
}

async function handleDeviceAction(udn, kind) {
  const api = castApi();
  if (!api) return;
  if (kind === 'bluetooth') {
    api.castOpenBluetoothSettings?.();
    return;
  }

  if (activeUdn && activeUdn === udn) {
    const device = (lastSnapshot?.dlna || []).find((item) => item.udn === udn);
    await api.castStop?.({ device: device || { udn } });
    activeUdn = '';
    renderSnapshot(lastSnapshot || { dlna: [], bluetooth: [] });
    return;
  }

  const url = currentCastUrl();
  if (!url) {
    setHint('本地代理片源无法投屏，请选择在线片源。');
    return;
  }
  const device = (lastSnapshot?.dlna || []).find((item) => item.udn === udn);
  const player = getBridge()?.state?.player;
  const result = await api.castTo?.({ device, url, title: player?.title || '' });
  if (result?.ok) {
    activeUdn = udn;
    setHint(`已投屏到「${result.name || '设备'}」。`);
  } else {
    setHint(result?.error || '投屏失败。');
  }
  if (lastSnapshot) renderSnapshot({ ...lastSnapshot, dlna: lastSnapshot.dlna });
}

function bindPanel() {
  document.getElementById('castCloseBtn')?.addEventListener('click', closeCastPanel);
  document.getElementById('castBackdrop')?.addEventListener('click', closeCastPanel);
  document.getElementById('castRescanBtn')?.addEventListener('click', () => {
    activeUdn = '';
    setHint('');
    castApi()?.castScan?.();
  });
  document.getElementById('castBluetoothSettingsBtn')?.addEventListener('click', () => castApi()?.castOpenBluetoothSettings?.());

  const onListClick = (event) => {
    const button = event.target.closest('.cast-device-action');
    if (!button || button.disabled) return;
    const row = button.closest('.cast-device');
    handleDeviceAction(row?.dataset.udn, row?.dataset.kind);
  };
  dlnaList.addEventListener('click', onListClick);
  bluetoothList.addEventListener('click', onListClick);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) closeCastPanel();
  });
}

export function initCastPanel() {
  if (initialized) return;
  panel = document.getElementById('castPanel');
  if (!panel) return;

  dlnaList = document.getElementById('castDlnaList');
  bluetoothList = document.getElementById('castBluetoothList');
  hintHost = document.getElementById('castHint');
  nowPlayingHost = document.getElementById('castNowPlaying');

  bindPanel();
  initialized = true;

  castApi()?.onCastDevices?.((snapshot) => {
    renderSnapshot(snapshot);
  });
  document.getElementById('playerCastBtn')?.addEventListener('click', toggleCastPanel);

  // 面板打开时定时回捞蓝牙（Web Bluetooth 主进程回调 + Windows 枚举）
  setInterval(() => {
    if (panel.classList.contains('is-open')) castApi()?.castRefreshBluetooth?.();
  }, 12000);
}
