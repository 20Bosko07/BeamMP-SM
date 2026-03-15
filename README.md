# BeamMP Server Manager

Desktop BeamMP multi-server manager built with Angular + Electron.

## Features

- Multiple server profiles with custom ports, working directories, and executable paths
- BeamMP config management (Name, AuthKey, Map, MaxPlayers, Tags)
- Automatic `ServerConfig.toml` writing plus `BEAMMP_*` environment overrides
- Mod activation management in `Resources/Client` (`.zip` enabled, `.zip.disabled` disabled)
- Map selection (default map list + inferred map paths)
- Process control and monitoring (status, PID, CPU, RAM, uptime, logs)
- Built-in updater center (check, download, install updates)
- Windows installer (`.exe`) through NSIS (`electron-builder`)

## Official References

- BeamMP Server Manual: https://docs.beammp.com/server/manual/
- BeamMP Server Setup: https://docs.beammp.com/server/create-a-server/
- Angular Docs: https://angular.dev/docs

## Requirements

- Windows 10/11
- Node.js 20+
- BeamMP server binary (`BeamMP-Server.exe`) for each profile

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts Angular and Electron together.

## Build

```bash
npm run build
```

Frontend output: `dist/beammp-sm/browser`

## Build Installer

```bash
npm run dist
```

Output file:

- `release/BeamMP-Server-Manager-0.1.0-Setup.exe`

## Updater + GitHub Releases Setup

The in-app updater uses GitHub Releases via `electron-updater`.

1. Create a GitHub repository and push this project.
2. Set environment variables before publishing:
	- `GH_OWNER` (GitHub username or org)
	- `GH_REPO` (repository name)
	- `GH_TOKEN` (classic token with `repo` scope)
3. Build and publish release artifacts:

```bash
npm run dist:publish
```

The app can then detect updates in packaged mode from the release feed.

## Usage

1. Create a server profile.
2. Select a working directory.
3. Optionally select a custom `BeamMP-Server.exe`.
4. Set AuthKey, port, map, max players, and save.
5. Put mods into `Resources/Client` and toggle active mods.
6. Start server and monitor runtime stats.
