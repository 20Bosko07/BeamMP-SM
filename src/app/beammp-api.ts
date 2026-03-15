export interface ServerProfile {
  id: string;
  name: string;
  workingDirectory: string;
  executablePath: string;
  port: number;
  maxPlayers: number;
  map: string;
  authKey: string;
  description: string;
  tags: string;
  activeMods: string[];
}

export interface ModEntry {
  fileName: string;
  label: string;
  enabled: boolean;
}

export interface ServerStatus {
  id: string;
  running: boolean;
  pid: number | null;
  cpuPercent: number;
  memoryMb: number;
  uptimeSec: number;
  lastExitCode: number | null;
  logs: string[];
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error' | 'dev-mode' | 'no-releases';
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  downloaded: boolean;
  percent: number;
  error: string | null;
}

export interface BeammpApi {
  listServers(): Promise<ServerProfile[]>;
  saveServer(server: ServerProfile): Promise<ServerProfile>;
  deleteServer(serverId: string): Promise<boolean>;
  startServer(serverId: string): Promise<ServerStatus>;
  stopServer(serverId: string): Promise<ServerStatus>;
  getServerStatus(serverId: string): Promise<ServerStatus>;
  listMods(serverId: string): Promise<ModEntry[]>;
  setActiveMods(serverId: string, activeMods: string[]): Promise<ModEntry[]>;
  listMaps(serverId: string): Promise<string[]>;
  pickDirectory(): Promise<string | null>;
  pickExecutable(): Promise<string | null>;
  openPath(targetPath: string): Promise<string>;
  winMinimize(): Promise<void>;
  winMaximize(): Promise<boolean>;
  winClose(): Promise<void>;
  winIsMaximized(): Promise<boolean>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  quitAndInstallUpdate(): Promise<UpdateState>;
  onUpdateState(listener: (state: UpdateState) => void): (() => void) | void;
}

const fallbackApi: BeammpApi = {
  async listServers() {
    return [];
  },
  async saveServer(server) {
    return server;
  },
  async deleteServer() {
    return true;
  },
  async startServer(serverId) {
    return {
      id: serverId,
      running: false,
      pid: null,
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSec: 0,
      lastExitCode: null,
      logs: [],
    };
  },
  async stopServer(serverId) {
    return {
      id: serverId,
      running: false,
      pid: null,
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSec: 0,
      lastExitCode: null,
      logs: [],
    };
  },
  async getServerStatus(serverId) {
    return {
      id: serverId,
      running: false,
      pid: null,
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSec: 0,
      lastExitCode: null,
      logs: [],
    };
  },
  async listMods() {
    return [];
  },
  async setActiveMods() {
    return [];
  },
  async listMaps() {
    return [];
  },
  async pickDirectory() {
    return null;
  },
  async pickExecutable() {
    return null;
  },
  async openPath() {
    return '';
  },
  async winMinimize() {},
  async winMaximize() { return false; },
  async winClose() {},
  async winIsMaximized() { return false; },
  async getUpdateState() {
    return {
      status: 'idle',
      currentVersion: '0.0.0',
      latestVersion: null,
      releaseName: null,
      releaseNotes: null,
      downloaded: false,
      percent: 0,
      error: null,
    };
  },
  async checkForUpdates() {
    return this.getUpdateState();
  },
  async downloadUpdate() {
    return this.getUpdateState();
  },
  async quitAndInstallUpdate() {
    return this.getUpdateState();
  },
  onUpdateState() {
    return () => {};
  },
};

export function getBeammpApi(): BeammpApi {
  const candidate = (window as Window & { beammpApi?: BeammpApi }).beammpApi;
  return candidate ?? fallbackApi;
}
