const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os');
const TOML = require('@iarna/toml');
const pidusage = require('pidusage');
const { autoUpdater } = require('electron-updater');

const storeFileName = 'servers.json';
const defaultPort = 30814;

const defaultMaps = [
  '/levels/west_coast_usa/info.json',
  '/levels/italy/info.json',
  '/levels/utah/info.json',
  '/levels/east_coast_usa/info.json',
  '/levels/industrial/info.json',
  '/levels/gridmap_v2/info.json',
];

/** @type {Map<string, { process: import('node:child_process').ChildProcessWithoutNullStreams, startedAt: number, lastExitCode: number | null, logs: string[] }>} */
const processStore = new Map();

/** @type {BrowserWindow | null} */
let mainWindow = null;

const updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseName: null,
  releaseNotes: null,
  downloaded: false,
  percent: 0,
  error: null,
};

function emitUpdateState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('updates:state', { ...updateState });
}

function setUpdateState(patch) {
  Object.assign(updateState, patch);
  emitUpdateState();
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      status: 'checking',
      error: null,
      downloaded: false,
      percent: 0,
    });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      status: 'available',
      latestVersion: info?.version ?? null,
      releaseName: info?.releaseName ?? null,
      releaseNotes:
        typeof info?.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info?.releaseNotes)
            ? info.releaseNotes.map((entry) => (entry && entry.note ? entry.note : '')).join('\n\n')
            : null,
      downloaded: false,
      percent: 0,
      error: null,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      status: 'up-to-date',
      latestVersion: app.getVersion(),
      downloaded: false,
      percent: 0,
      error: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({
      status: 'downloading',
      percent: Number((progress?.percent ?? 0).toFixed(1)),
      error: null,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      status: 'downloaded',
      latestVersion: info?.version ?? updateState.latestVersion,
      downloaded: true,
      percent: 100,
      error: null,
    });
  });

  autoUpdater.on('error', (error) => {
    setUpdateState({
      status: 'error',
      error: error?.message || 'Updater error',
    });
  });
}

function getStorePath() {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, storeFileName);
}

function readStore() {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(storePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(servers) {
  const storePath = getStorePath();
  fs.writeFileSync(storePath, JSON.stringify(servers, null, 2), 'utf-8');
}

function normalizeServer(input) {
  const now = Date.now();
  const id = (input.id || `srv-${now}`).trim();
  const name = (input.name || 'BeamMP Server').trim();
  const workingDirectory = (input.workingDirectory || '').trim();
  const executablePath = (input.executablePath || '').trim();
  const port = Number(input.port) || defaultPort;
  const maxPlayers = Number(input.maxPlayers) || 8;
  const map = (input.map || '').trim();
  const authKey = (input.authKey || '').trim();
  const description = (input.description || '').trim();
  const tags = (input.tags || '').trim();
  const activeMods = Array.isArray(input.activeMods)
    ? input.activeMods.filter(Boolean).map((entry) => String(entry))
    : [];

  return {
    id,
    name,
    workingDirectory,
    executablePath,
    port,
    maxPlayers,
    map,
    authKey,
    description,
    tags,
    activeMods,
  };
}

function ensureServer(serverId) {
  const all = readStore();
  const found = all.find((entry) => entry.id === serverId);
  if (!found) {
    throw new Error(`Server ${serverId} was not found.`);
  }
  return normalizeServer(found);
}

function getClientResourceFolder(server) {
  return path.join(server.workingDirectory, 'Resources', 'Client');
}

function ensureResourceFolder(server) {
  const resourceDir = getClientResourceFolder(server);
  fs.mkdirSync(resourceDir, { recursive: true });
  return resourceDir;
}

function parseMapNameFromMod(fileName) {
  const withoutSuffix = fileName.replace(/\.disabled$/i, '').replace(/\.zip$/i, '');
  const candidate = withoutSuffix.replace(/[._-]+/g, ' ').trim();
  return candidate.length > 2 ? candidate : null;
}

function listModsForServer(server) {
  const resourceDir = ensureResourceFolder(server);
  const files = fs.readdirSync(resourceDir, { withFileTypes: true });

  return files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().endsWith('.zip') || name.toLowerCase().endsWith('.zip.disabled'))
    .map((fileName) => {
      const enabled = fileName.toLowerCase().endsWith('.zip');
      const normalizedName = fileName.replace(/\.disabled$/i, '');
      return {
        fileName: normalizedName,
        enabled,
        label: normalizedName.replace(/\.zip$/i, ''),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function setActiveMods(serverId, desiredMods) {
  const server = ensureServer(serverId);
  const resourceDir = ensureResourceFolder(server);
  const desired = new Set((desiredMods || []).map((entry) => String(entry).replace(/\.disabled$/i, '')));
  const mods = listModsForServer(server);

  mods.forEach((mod) => {
    const enabledPath = path.join(resourceDir, mod.fileName);
    const disabledPath = path.join(resourceDir, `${mod.fileName}.disabled`);
    const shouldBeEnabled = desired.has(mod.fileName);

    if (shouldBeEnabled && fs.existsSync(disabledPath)) {
      fs.renameSync(disabledPath, enabledPath);
    }

    if (!shouldBeEnabled && fs.existsSync(enabledPath)) {
      fs.renameSync(enabledPath, disabledPath);
    }
  });

  const all = readStore().map((entry) => {
    if (entry.id !== serverId) {
      return entry;
    }

    return {
      ...entry,
      activeMods: Array.from(desired),
    };
  });
  writeStore(all);

  return listModsForServer(server);
}

function listMaps(serverId) {
  const server = ensureServer(serverId);
  const mods = listModsForServer(server);
  const guessedMaps = mods
    .map((mod) => parseMapNameFromMod(mod.fileName))
    .filter(Boolean)
    .map((name) => `/levels/${name.toLowerCase().replace(/\s+/g, '_')}/info.json`);

  const mapSet = new Set(defaultMaps);
  guessedMaps.forEach((map) => mapSet.add(map));
  if (server.map) {
    mapSet.add(server.map);
  }

  return Array.from(mapSet).sort((a, b) => a.localeCompare(b));
}

function writeServerConfig(server) {
  if (!server.workingDirectory) {
    return;
  }

  fs.mkdirSync(server.workingDirectory, { recursive: true });
  const configPath = path.join(server.workingDirectory, 'ServerConfig.toml');
  let current = {};

  if (fs.existsSync(configPath)) {
    try {
      current = TOML.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      current = {};
    }
  }

  const next = { ...current };
  next.General = {
    ...(typeof current.General === 'object' && current.General !== null ? current.General : {}),
    Name: server.name,
    Description: server.description,
    AuthKey: server.authKey,
    Port: Number(server.port) || defaultPort,
    MaxPlayers: Number(server.maxPlayers) || 8,
    Map: server.map,
    Tags: server.tags,
  };

  fs.writeFileSync(configPath, TOML.stringify(next), 'utf-8');
}

function resolveExecutable(server) {
  if (server.executablePath) {
    return server.executablePath;
  }

  return path.join(server.workingDirectory, 'BeamMP-Server.exe');
}

function getStatus(serverId) {
  const tracked = processStore.get(serverId);
  if (!tracked || !tracked.process || tracked.process.killed || tracked.process.exitCode !== null) {
    return {
      id: serverId,
      running: false,
      pid: null,
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSec: 0,
      lastExitCode: tracked?.lastExitCode ?? null,
      logs: tracked?.logs ?? [],
    };
  }

  return {
    id: serverId,
    running: true,
    pid: tracked.process.pid,
    cpuPercent: 0,
    memoryMb: 0,
    uptimeSec: Math.max(0, Math.round((Date.now() - tracked.startedAt) / 1000)),
    lastExitCode: tracked.lastExitCode,
    logs: tracked.logs,
  };
}

async function getStatusWithUsage(serverId) {
  const status = getStatus(serverId);
  if (!status.running || !status.pid) {
    return status;
  }

  try {
    const usage = await pidusage(status.pid);
    return {
      ...status,
      cpuPercent: Number(usage.cpu.toFixed(2)),
      memoryMb: Number((usage.memory / (1024 * 1024)).toFixed(2)),
    };
  } catch {
    return status;
  }
}

async function stopServer(serverId) {
  const tracked = processStore.get(serverId);
  if (!tracked?.process || tracked.process.exitCode !== null) {
    return getStatusWithUsage(serverId);
  }

  const pid = tracked.process.pid;
  if (!pid) {
    tracked.process.kill('SIGTERM');
    return getStatusWithUsage(serverId);
  }

  if (os.platform() === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
  } else {
    tracked.process.kill('SIGTERM');
  }

  return getStatusWithUsage(serverId);
}

async function startServer(serverId) {
  const currentStatus = getStatus(serverId);
  if (currentStatus.running) {
    return getStatusWithUsage(serverId);
  }

  const server = ensureServer(serverId);
  if (!server.workingDirectory) {
    throw new Error('Please set a server working directory.');
  }

  const executable = resolveExecutable(server);
  if (!fs.existsSync(executable)) {
    throw new Error(`Server executable not found: ${executable}`);
  }

  writeServerConfig(server);

  const beammpEnv = {
    ...process.env,
    BEAMMP_NAME: server.name,
    BEAMMP_DESCRIPTION: server.description,
    BEAMMP_AUTH_KEY: server.authKey,
    BEAMMP_PORT: String(server.port || defaultPort),
    BEAMMP_MAX_PLAYERS: String(server.maxPlayers || 8),
    BEAMMP_MAP: server.map || '',
    BEAMMP_TAGS: server.tags || '',
  };

  const child = spawn(executable, [], {
    cwd: server.workingDirectory,
    env: beammpEnv,
    windowsHide: true,
  });

  const state = {
    process: child,
    startedAt: Date.now(),
    lastExitCode: null,
    logs: [],
  };

  const addLogLine = (chunk) => {
    const lines = String(chunk || '').split(/\r?\n/).filter(Boolean);
    lines.forEach((line) => state.logs.push(line));
    if (state.logs.length > 200) {
      state.logs.splice(0, state.logs.length - 200);
    }
  };

  child.stdout.on('data', addLogLine);
  child.stderr.on('data', addLogLine);
  child.on('exit', (code) => {
    state.lastExitCode = code;
  });

  processStore.set(serverId, state);
  return getStatusWithUsage(serverId);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0d1614',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL;
  mainWindow = win;
  win.removeMenu();
  win.setMenuBarVisibility(false);
  win.autoHideMenuBar = true;

  if (startUrl) {
    win.loadURL(startUrl);
  } else {
    const candidates = [
      path.join(__dirname, '..', 'dist', 'beammp-sm', 'browser', 'index.html'),
      path.join(__dirname, '..', 'dist', 'beammp-sm', 'index.html'),
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) {
      win.loadFile(found);
    } else {
      win.loadURL(
        'data:text/html;charset=utf-8,<html><body style="font-family:Segoe UI,sans-serif;padding:24px;background:#111;color:#eee"><h2>UI could not be loaded</h2><p>Build artifacts are missing. Please rebuild the package with <code>npm run dist</code>.</p></body></html>',
      );
    }
  }

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

ipcMain.handle('servers:list', () => {
  return readStore().map((entry) => normalizeServer(entry));
});

ipcMain.handle('servers:save', (_event, payload) => {
  const incoming = normalizeServer(payload || {});
  if (!incoming.workingDirectory) {
    throw new Error('A working directory is required.');
  }

  const all = readStore();
  const index = all.findIndex((entry) => entry.id === incoming.id);
  if (index >= 0) {
    all[index] = incoming;
  } else {
    all.push(incoming);
  }
  writeStore(all);

  writeServerConfig(incoming);
  return incoming;
});

ipcMain.handle('servers:delete', (_event, serverId) => {
  const all = readStore();
  const filtered = all.filter((entry) => entry.id !== serverId);
  writeStore(filtered);

  return true;
});

ipcMain.handle('servers:start', async (_event, serverId) => {
  return startServer(serverId);
});

ipcMain.handle('servers:stop', async (_event, serverId) => {
  return stopServer(serverId);
});

ipcMain.handle('servers:status', async (_event, serverId) => {
  return getStatusWithUsage(serverId);
});

ipcMain.handle('servers:mods:list', (_event, serverId) => {
  const server = ensureServer(serverId);
  return listModsForServer(server);
});

ipcMain.handle('servers:mods:setActive', (_event, serverId, activeMods) => {
  return setActiveMods(serverId, activeMods);
});

ipcMain.handle('servers:maps:list', (_event, serverId) => {
  return listMaps(serverId);
});

ipcMain.handle('dialog:pickDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('dialog:pickExecutable', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Executable', extensions: ['exe'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('win:minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.handle('win:maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});

ipcMain.handle('win:close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

ipcMain.handle('win:isMaximized', () => {
  const win = BrowserWindow.getFocusedWindow();
  return win ? win.isMaximized() : false;
});

ipcMain.handle('dialog:openPath', async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') {
    return 'No path provided.';
  }

  return shell.openPath(targetPath);
});

ipcMain.handle('updates:getState', () => {
  return { ...updateState };
});

ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'dev-mode',
      error: 'Update checks are only available in packaged builds.',
    });
    return { ...updateState };
  }

  await autoUpdater.checkForUpdates();
  return { ...updateState };
});

ipcMain.handle('updates:download', async () => {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'dev-mode',
      error: 'Download is only available in packaged builds.',
    });
    return { ...updateState };
  }

  await autoUpdater.downloadUpdate();
  return { ...updateState };
});

ipcMain.handle('updates:quitAndInstall', () => {
  if (updateState.status === 'downloaded') {
    autoUpdater.quitAndInstall();
  }

  return { ...updateState };
});

app.whenReady().then(() => {
  setupAutoUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
