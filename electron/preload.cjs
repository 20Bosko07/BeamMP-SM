const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beammpApi', {
  listServers: () => ipcRenderer.invoke('servers:list'),
  saveServer: (server) => ipcRenderer.invoke('servers:save', server),
  deleteServer: (serverId) => ipcRenderer.invoke('servers:delete', serverId),
  startServer: (serverId) => ipcRenderer.invoke('servers:start', serverId),
  stopServer: (serverId) => ipcRenderer.invoke('servers:stop', serverId),
  getServerStatus: (serverId) => ipcRenderer.invoke('servers:status', serverId),
  listMods: (serverId) => ipcRenderer.invoke('servers:mods:list', serverId),
  setActiveMods: (serverId, activeMods) => ipcRenderer.invoke('servers:mods:setActive', serverId, activeMods),
  listMaps: (serverId) => ipcRenderer.invoke('servers:maps:list', serverId),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  pickExecutable: () => ipcRenderer.invoke('dialog:pickExecutable'),
  openPath: (targetPath) => ipcRenderer.invoke('dialog:openPath', targetPath),
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximize: () => ipcRenderer.invoke('win:maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winIsMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  getUpdateState: () => ipcRenderer.invoke('updates:getState'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updates:quitAndInstall'),
  onUpdateState: (listener) => {
    const channel = 'updates:state';
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
});
