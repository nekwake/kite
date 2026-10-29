<p align="center">
  <img src="assets/app-icon.svg" width="112" alt="Kite" />
</p>

<h1 align="center">Kite</h1>

<p align="center">
  A lightweight code editor and terminal for macOS and Windows.<br/>
  ~14 MB download on macOS, ~6 MB on Windows · Tauri 2 + Rust · Monaco · xterm.js
</p>

<p align="center">
  <a href="https://github.com/nekwake/kite/releases/latest"><b>Download</b></a>
  ·
  <a href="https://github.com/nekwake/kite/releases">Releases</a>
  ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

## Features

- **Editor**: Monaco engine with split editor groups, preview tabs, quick open (`⌘P`), command palette (`⌘⇧P`), git gutter indicators and a Problems panel.
- **Terminal**: native shell sessions, split panes, a terminal list, and desktop notifications when a long-running agent or command needs attention.
- **Agent sessions**: project-based session history with one-click `--resume`, side-by-side layout, and drag-and-drop file references (`@file`).
- **AI chat**: OpenRouter integration with free models, streaming answers and read-only project tools (read, list, search, git diff). API keys are stored in the system keychain.
- **Git**: changes view, side-by-side diff, staging, commits, branch switching, history graph, fetch/pull/push and one-click GitHub publishing.
- **Search and system**: `ripgrep`-powered search, file operations, accent themes, English and Turkish UI, and built-in auto-updates.

## Installation

### macOS

1. Download the latest `.dmg` from the [Releases](https://github.com/nekwake/kite/releases/latest) page and move Kite to your `Applications` folder.
2. Kite is not notarized yet. If macOS blocks the first launch, run:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Kite.app
   ```

3. Optional: install the `kite` command to open folders from the terminal:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/nekwake/kite/main/scripts/kite -o ~/.local/bin/kite && chmod +x ~/.local/bin/kite
   ```

4. Open any directory:

   ```bash
   kite .
   ```

### Windows

1. Download the latest `Kite_x.y.z_x64-setup.exe` from the [Releases](https://github.com/nekwake/kite/releases/latest) page and run it.
2. Kite is not code-signed yet. If SmartScreen shows a warning, choose **More info › Run anyway**.
3. Optional: save [`scripts/kite.cmd`](scripts/kite.cmd) to a folder on your `PATH`, then run `kite .` in any directory.

When an update is available, click **Update** in the top-right corner. Kite downloads it and restarts.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build and install locally to /Applications (macOS)
npm run install-app
```

## Releases

```bash
npm run release -- 0.3.0
git push && git push origin v0.3.0
```

Pushing a version tag runs [`release.yml`](.github/workflows/release.yml), which builds a universal macOS `.dmg`, a Windows installer and the signed update assets, then publishes them to GitHub Releases.

The repository needs one Actions secret (`Settings › Secrets and variables › Actions`):

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/kite.key` |
