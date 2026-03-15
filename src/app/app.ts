import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BeammpApi, ModEntry, ServerProfile, ServerStatus, UpdateState, getBeammpApi } from './beammp-api';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected readonly servers = signal<ServerProfile[]>([]);
  protected readonly selectedServerId = signal<string | null>(null);
  protected readonly mods = signal<ModEntry[]>([]);
  protected readonly mapOptions = signal<string[]>([]);
  protected readonly statusByServerId = signal<Record<string, ServerStatus>>({});
  protected readonly message = signal<string>('');
  protected readonly busy = signal(false);
  protected readonly isMaximized = signal(false);
  protected readonly updateState = signal<UpdateState>({
    status: 'idle',
    currentVersion: '0.0.0',
    latestVersion: null,
    releaseName: null,
    releaseNotes: null,
    downloaded: false,
    percent: 0,
    error: null,
  });

  protected readonly selectedServer = computed(() => {
    const selectedId = this.selectedServerId();
    if (!selectedId) {
      return null;
    }

    return this.servers().find((entry) => entry.id === selectedId) ?? null;
  });

  protected readonly hasServers = computed(() => this.servers().length > 0);

  protected form = this.createDefaultServer();
  private readonly api: BeammpApi = getBeammpApi();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private detachUpdateListener: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    this.isMaximized.set(await this.api.winIsMaximized());
    this.updateState.set(await this.api.getUpdateState());
    const detachMaybe = this.api.onUpdateState((state) => {
      this.updateState.set(state);
    });
    this.detachUpdateListener = typeof detachMaybe === 'function' ? detachMaybe : null;

    try {
      await this.refreshServers();
    } catch (error) {
      this.message.set(this.toErrorMessage(error));
      this.form = this.createDefaultServer();
    }
    this.pollTimer = setInterval(() => {
      void this.pollAllStatuses();
    }, 3000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.detachUpdateListener) {
      this.detachUpdateListener();
      this.detachUpdateListener = null;
    }
  }

  protected async checkForUpdates(): Promise<void> {
    this.updateState.set(await this.api.checkForUpdates());
  }

  protected async downloadUpdate(): Promise<void> {
    this.updateState.set(await this.api.downloadUpdate());
  }

  protected async installUpdateNow(): Promise<void> {
    this.updateState.set(await this.api.quitAndInstallUpdate());
  }

  protected updateStatusText(): string {
    const state = this.updateState();
    switch (state.status) {
      case 'checking':
        return 'Checking for updates...';
      case 'available':
        return `Update available: v${state.latestVersion ?? 'unknown'}`;
      case 'downloading':
        return `Downloading update... ${state.percent.toFixed(1)}%`;
      case 'downloaded':
        return 'Update downloaded. Restart app to install.';
      case 'up-to-date':
        return 'You are on the latest version.';
      case 'dev-mode':
        return 'Updater is disabled in dev mode.';
      case 'error':
        return state.error ? `Update error: ${state.error}` : 'Update error.';
      default:
        return 'Ready to check for updates.';
    }
  }

  protected async refreshServers(): Promise<void> {
    const servers = await this.api.listServers();
    this.servers.set(servers);

    if (!servers.length) {
      this.selectedServerId.set(null);
      this.form = this.createDefaultServer();
      this.mods.set([]);
      this.mapOptions.set([]);
      return;
    }

    const currentId = this.selectedServerId();
    const hasCurrent = currentId ? servers.some((entry) => entry.id === currentId) : false;
    const nextId: string = hasCurrent && currentId ? currentId : servers[0].id;
    this.selectedServerId.set(nextId);

    const nextServer = servers.find((entry) => entry.id === nextId) ?? servers[0];
    this.form = { ...nextServer, activeMods: [...nextServer.activeMods] };
    await this.loadSelectionData(nextId);
  }

  protected createNewServer(): void {
    this.selectedServerId.set(null);
    this.mods.set([]);
    this.mapOptions.set([]);
    this.form = this.createDefaultServer();
    this.message.set('New server profile created.');
  }

  protected createDemoServer(): void {
    const slug = String(Date.now()).slice(-5);
    this.form = {
      id: `demo-${slug}`,
      name: `BeamMP Demo ${slug}`,
      workingDirectory: `C:/BeamMP/Server-${slug}`,
      executablePath: '',
      port: 30814,
      maxPlayers: 8,
      map: '/levels/west_coast_usa/info.json',
      authKey: '',
      description: 'Sample profile for a quick start',
      tags: 'Freeroam, Demo',
      activeMods: [],
    };
    this.selectedServerId.set(null);
    this.message.set('Demo profile prepared. Set working directory and auth key, then save.');
  }

  protected selectServer(serverId: string): void {
    const found = this.servers().find((entry) => entry.id === serverId);
    if (!found) {
      return;
    }

    this.selectedServerId.set(serverId);
    this.form = { ...found, activeMods: [...found.activeMods] };
    void this.loadSelectionData(serverId);
  }

  protected async browseWorkingDirectory(): Promise<void> {
    const selected = await this.api.pickDirectory();
    if (selected) {
      this.form.workingDirectory = selected;
    }
  }

  protected async browseExecutable(): Promise<void> {
    const selected = await this.api.pickExecutable();
    if (selected) {
      this.form.executablePath = selected;
    }
  }

  protected async openWorkingDirectory(): Promise<void> {
    if (!this.form.workingDirectory?.trim()) {
      this.message.set('Please enter a working directory first.');
      return;
    }

    const result = await this.api.openPath(this.form.workingDirectory.trim());
    if (result) {
      this.message.set(`Could not open folder: ${result}`);
    }
  }

  protected async winMinimize(): Promise<void> {
    await this.api.winMinimize();
  }

  protected async winMaximize(): Promise<void> {
    const maximized = await this.api.winMaximize();
    this.isMaximized.set(maximized);
  }

  protected async winClose(): Promise<void> {
    await this.api.winClose();
  }

  protected async saveServer(): Promise<void> {
    this.busy.set(true);
    this.message.set('');
    try {
      const profileToSave: ServerProfile = {
        ...this.form,
        id: this.form.id.trim(),
        name: this.form.name.trim(),
        workingDirectory: this.form.workingDirectory.trim(),
        executablePath: this.form.executablePath.trim(),
        port: Number(this.form.port),
        maxPlayers: Number(this.form.maxPlayers),
        map: this.form.map.trim(),
        authKey: this.form.authKey.trim(),
        description: this.form.description.trim(),
        tags: this.form.tags.trim(),
      };

      const saved = await this.api.saveServer(profileToSave);
      this.selectedServerId.set(saved.id);
      this.form = { ...saved, activeMods: [...saved.activeMods] };
      await this.refreshServers();
      this.message.set(`Server profile ${saved.name} saved.`);
    } catch (error) {
      this.message.set(this.toErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteServer(): Promise<void> {
    const selectedId = this.selectedServerId();
    if (!selectedId) {
      return;
    }

    this.busy.set(true);
    this.message.set('');
    try {
      await this.api.deleteServer(selectedId);
      await this.refreshServers();
      this.message.set('Server profile deleted.');
    } catch (error) {
      this.message.set(this.toErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async startSelectedServer(): Promise<void> {
    const selectedId = this.selectedServerId();
    if (!selectedId) {
      return;
    }

    this.busy.set(true);
    this.message.set('');
    try {
      await this.saveServer();
      const status = await this.api.startServer(selectedId);
      this.upsertStatus(status);
      this.message.set('Server started.');
    } catch (error) {
      this.message.set(this.toErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async stopSelectedServer(): Promise<void> {
    const selectedId = this.selectedServerId();
    if (!selectedId) {
      return;
    }

    this.busy.set(true);
    this.message.set('');
    try {
      const status = await this.api.stopServer(selectedId);
      this.upsertStatus(status);
      this.message.set('Server stopped.');
    } catch (error) {
      this.message.set(this.toErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleMod(fileName: string, checked: boolean): Promise<void> {
    const selectedId = this.selectedServerId();
    if (!selectedId) {
      return;
    }

    const active = new Set(this.form.activeMods);
    if (checked) {
      active.add(fileName);
    } else {
      active.delete(fileName);
    }

    this.form.activeMods = Array.from(active);
    this.mods.set(
      this.mods().map((mod) =>
        mod.fileName === fileName
          ? {
              ...mod,
              enabled: checked,
            }
          : mod,
      ),
    );

    try {
      const updatedMods = await this.api.setActiveMods(selectedId, this.form.activeMods);
      this.mods.set(updatedMods);
      this.form.activeMods = updatedMods.filter((mod) => mod.enabled).map((mod) => mod.fileName);
    } catch (error) {
      this.message.set(this.toErrorMessage(error));
    }
  }

  protected selectedStatus(): ServerStatus | null {
    const selectedId = this.selectedServerId();
    if (!selectedId) {
      return null;
    }

    return this.statusByServerId()[selectedId] ?? null;
  }

  protected statusLabel(status: ServerStatus | null): string {
    if (!status) {
      return 'Unknown';
    }

    return status.running ? 'Running' : 'Stopped';
  }

  protected statusTone(status: ServerStatus | null): 'ok' | 'idle' | 'warn' {
    if (!status || !status.running) {
      return 'idle';
    }

    if (status.cpuPercent > 85 || status.memoryMb > 4096) {
      return 'warn';
    }

    return 'ok';
  }

  protected toPercent(value: number, max: number): number {
    if (max <= 0) {
      return 0;
    }

    const normalized = (value / max) * 100;
    return Math.max(0, Math.min(100, Math.round(normalized)));
  }

  protected formatUptime(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
      return `${h}h ${m}m`;
    }

    if (m > 0) {
      return `${m}m ${s}s`;
    }

    return `${s}s`;
  }

  private async loadSelectionData(serverId: string): Promise<void> {
    try {
      const [mods, maps, status] = await Promise.all([
        this.api.listMods(serverId),
        this.api.listMaps(serverId),
        this.api.getServerStatus(serverId),
      ]);

      this.mods.set(mods);
      this.mapOptions.set(maps);
      this.form.activeMods = mods.filter((mod) => mod.enabled).map((mod) => mod.fileName);
      this.upsertStatus(status);
    } catch (error) {
      this.message.set(this.toErrorMessage(error));
    }
  }

  private async pollAllStatuses(): Promise<void> {
    const ids = this.servers().map((entry) => entry.id);
    if (!ids.length) {
      return;
    }

    const statuses = await Promise.all(ids.map((serverId) => this.api.getServerStatus(serverId)));
    const map: Record<string, ServerStatus> = {};
    statuses.forEach((status) => {
      map[status.id] = status;
    });
    this.statusByServerId.set(map);
  }

  private upsertStatus(status: ServerStatus): void {
    this.statusByServerId.update((current) => ({
      ...current,
      [status.id]: status,
    }));
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Unknown error.';
  }

  private createDefaultServer(): ServerProfile {
    const id = `srv-${Date.now()}`;
    return {
      id,
      name: 'New BeamMP Server',
      workingDirectory: '',
      executablePath: '',
      port: 30814,
      maxPlayers: 8,
      map: '/levels/west_coast_usa/info.json',
      authKey: '',
      description: '',
      tags: 'Freeroam',
      activeMods: [],
    };
  }
}
