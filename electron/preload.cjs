const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cineflow', {
  getCredentialState: () => ipcRenderer.invoke('app:getCredentialState'),
  saveCredential: (credential) => ipcRenderer.invoke('app:saveCredential', credential),
  clearCredential: () => ipcRenderer.invoke('app:clearCredential'),
  saveProxy: (proxy) => ipcRenderer.invoke('app:saveProxy', proxy),
  getResourceSettings: () => ipcRenderer.invoke('app:getResourceSettings'),
  saveResourceMode: (mode) => ipcRenderer.invoke('app:saveResourceMode', mode),
  saveResourcePlaybackMode: (mode) => ipcRenderer.invoke('app:saveResourcePlaybackMode', mode),
  importResourceSources: (payload) => ipcRenderer.invoke('app:importResourceSources', payload),
  clearResourceSources: () => ipcRenderer.invoke('app:clearResourceSources'),
  testConnection: () => ipcRenderer.invoke('app:testConnection'),
  getInitialData: () => ipcRenderer.invoke('tmdb:initial'),
  searchMovies: (query, options) => ipcRenderer.invoke('tmdb:search', query, options),
  discoverMovies: (options) => ipcRenderer.invoke('tmdb:discover', options),
  recommendByMovie: (movieId, options) => ipcRenderer.invoke('tmdb:recommendByMovie', movieId, options),
  getMovieDetails: (movieId, options) => ipcRenderer.invoke('tmdb:details', movieId, options),
  findMovieResources: (payload, options) => ipcRenderer.invoke('resources:findMovie', payload, options),
  resolveMediaUrl: (url) => ipcRenderer.invoke('player:resolveMediaUrl', url),
  getMediaProxyUrl: (url) => ipcRenderer.invoke('player:getMediaProxyUrl', url),
  getPlaybackProxyMode: () => ipcRenderer.invoke('player:getPlaybackProxyMode'),
  savePlaybackProxyMode: (mode) => ipcRenderer.invoke('player:setPlaybackProxyMode', mode),
  getMetadataStatus: () => ipcRenderer.invoke('meta:getStatus'),
  onPlaybackProxyState: (callback) => {
    ipcRenderer.on('playback:proxy-state', (_event, payload) => callback?.(payload));
  },
  minimize: () => ipcRenderer.invoke('window:minimize'),
  enterIsland: (height) => ipcRenderer.invoke('window:enterIsland', height),
  expandIsland: (height) => ipcRenderer.invoke('window:expandIsland', height),
  restoreNormal: () => ipcRenderer.invoke('window:restoreNormal'),
  dockIsland: (edge) => ipcRenderer.invoke('window:dockIsland', edge),
  islandDragBegin: (payload) => ipcRenderer.send('window:islandDragBegin', payload),
  islandDragMove: (payload) => ipcRenderer.send('window:islandDragMove', payload),
  islandDragEnd: (shouldDock = true, payload) => ipcRenderer.invoke('window:islandDragEnd', shouldDock, payload),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onWindowMode: (callback) => {
    ipcRenderer.on('window:mode', (_event, payload) => callback?.(payload));
  },
  // v3.4.0 投屏（纯增量新增 API，全部走 cast:* 通道）
  castScan: () => ipcRenderer.invoke('cast:scan'),
  castList: () => ipcRenderer.invoke('cast:list'),
  castStopSearch: () => ipcRenderer.invoke('cast:stop-search'),
  castRefreshBluetooth: () => ipcRenderer.invoke('cast:refresh-bluetooth'),
  castOpenBluetoothSettings: () => ipcRenderer.invoke('cast:open-bluetooth-settings'),
  castTo: (payload) => ipcRenderer.invoke('cast:to', payload),
  castStop: (payload) => ipcRenderer.invoke('cast:stop', payload),
  onCastDevices: (callback) => {
    ipcRenderer.on('cast:devices', (_event, payload) => callback?.(payload));
  },
  // v3.4.0 海报兜底（纯增量）：直连失败时请主进程经 DoH 通道回传图片字节
  relayImage: (url) => ipcRenderer.invoke('image:relay', { url }),
  // v3.4.0 片源管理（纯增量）：单个播放源的手动测速
  testResourceSource: (payload) => ipcRenderer.invoke('resources:testSource', payload)
});
