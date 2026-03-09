const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

class LauncherService {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.paths = {
      dataDir: path.join(rootDir, 'data'),
      manifestDir: path.join(rootDir, 'data', 'manifests'),
      cacheDir: path.join(rootDir, 'data', 'cache'),
      logsDir: path.join(rootDir, 'data', 'logs'),
      imagesDir: path.join(rootDir, 'data', 'images'),
      stateFile: path.join(rootDir, 'data', 'state.json'),
      settingsFile: path.join(rootDir, 'data', 'settings.json'),
      gamesDir: path.join(rootDir, 'games'),
      tempDir: path.join(rootDir, 'temp'),
    };
    this.listeners = new Set();
    this.state = { games: [], installed: {}, downloads: [], settings: { theme: 'dark', libraryRelative: 'games', clearTempAfterInstall: true } };
    this.jobs = new Map();
  }

  async initialize() {
    await Promise.all(Object.values(this.paths).filter((v) => v.endsWith('Dir')).map((dir) => fsp.mkdir(dir, { recursive: true })));
    await this.loadSettings();
    await this.loadState();
    await this.loadManifests();
  }

  async loadSettings() {
    if (fs.existsSync(this.paths.settingsFile)) {
      const loaded = JSON.parse(await fsp.readFile(this.paths.settingsFile, 'utf8'));
      this.state.settings = { ...this.state.settings, ...loaded };
    } else {
      await this.saveSettings();
    }
  }

  async loadState() {
    if (fs.existsSync(this.paths.stateFile)) {
      const loaded = JSON.parse(await fsp.readFile(this.paths.stateFile, 'utf8'));
      this.state.installed = loaded.installed || {};
    } else {
      await this.saveState();
    }
  }

  async loadManifests() {
    const files = (await fsp.readdir(this.paths.manifestDir)).filter((f) => f.endsWith('.json'));
    const manifests = [];
    for (const file of files) {
      try {
        const manifest = JSON.parse(await fsp.readFile(path.join(this.paths.manifestDir, file), 'utf8'));
        if (manifest.visibility !== false) manifests.push(manifest);
      } catch (error) {
        this.log(`Manifest parse error for ${file}: ${error.message}`);
      }
    }
    this.state.games = manifests;
  }

  getState() {
    return {
      ...this.state,
      rootDir: this.rootDir,
      paths: this.paths,
      appVersion: '1.0.0',
    };
  }

  getGame(id) {
    return this.state.games.find((g) => g.id === id) || null;
  }

  onEvent(listener) { this.listeners.add(listener); }
  offEvent(listener) { this.listeners.delete(listener); }
  emit(type, payload) { this.listeners.forEach((listener) => listener({ type, payload })); }

  async setSetting(key, value) {
    this.state.settings[key] = value;
    await this.saveSettings();
    this.emit('state', this.getState());
    return true;
  }

  async saveSettings() { await fsp.writeFile(this.paths.settingsFile, JSON.stringify(this.state.settings, null, 2)); }
  async saveState() { await fsp.writeFile(this.paths.stateFile, JSON.stringify({ installed: this.state.installed }, null, 2)); }

  log(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(path.join(this.paths.logsDir, 'launcher.log'), line);
  }

  async queueInstall(id, mode = 'install') {
    const game = this.getGame(id);
    if (!game) throw new Error('Game not found');
    const jobId = `${id}-${Date.now()}`;
    const job = { id: jobId, gameId: id, title: game.title, status: 'queued', progress: 0, speed: 0, etaSeconds: 0, downloadedBytes: 0, totalBytes: 0, mode, paused: false, canceled: false };
    this.state.downloads.push(job);
    this.jobs.set(jobId, job);
    this.emit('state', this.getState());
    this.runInstall(job, game).catch((error) => {
      job.status = 'error';
      job.error = error.message;
      this.log(`Install error (${id}): ${error.stack}`);
      this.emit('state', this.getState());
    });
    return job;
  }

  async runInstall(job, game) {
    job.status = 'downloading';
    this.emit('state', this.getState());
    const tempGameDir = path.join(this.paths.tempDir, game.id);
    await fsp.mkdir(tempGameDir, { recursive: true });

    const assets = game.assets || [];
    if (!assets.length) throw new Error('No assets configured');
    if (game.multipart && !assets.every((a) => /\.\d{3}$/.test(a.file_name))) throw new Error('Multipart assets must end with .001/.002...');

    for (const asset of assets) {
      if (job.canceled) throw new Error('Canceled');
      await this.downloadFileWithRetry(asset.url, path.join(tempGameDir, asset.file_name), job, 3);
    }

    job.status = 'extracting';
    this.emit('state', this.getState());

    const targetDir = path.join(this.paths.gamesDir, game.install_dir_name);
    await fsp.mkdir(targetDir, { recursive: true });

    const firstAsset = path.join(tempGameDir, assets[0].file_name);
    const requiredBytes = Number(game.install_size_bytes || 0);
    await this.ensureDiskSpace(requiredBytes, targetDir);

    if (game.archive_type === 'zip') {
      await this.extractZip(firstAsset, targetDir);
    } else {
      await this.extract7z(firstAsset, targetDir);
    }

    if (this.state.settings.clearTempAfterInstall) {
      await fsp.rm(tempGameDir, { recursive: true, force: true });
    }

    this.state.installed[game.id] = {
      version: game.version,
      installPath: targetDir,
      executable: game.executable_relative_path,
      lastPlayed: this.state.installed[game.id]?.lastPlayed || null,
      launchCount: this.state.installed[game.id]?.launchCount || 0,
      installedAt: new Date().toISOString(),
    };
    await this.saveState();
    job.status = 'completed';
    job.progress = 100;
    this.emit('state', this.getState());
  }

  async ensureDiskSpace(requiredBytes, folder) {
    if (!requiredBytes) return;
    const { stdout } = await this.spawnCommand(process.platform === 'win32' ? 'cmd' : 'df', process.platform === 'win32' ? ['/c', 'wmic logicaldisk get size,freespace,caption'] : ['-k', folder]);
    if (process.platform !== 'win32') {
      const line = stdout.trim().split('\n').at(-1);
      const freeKb = Number(line.trim().split(/\s+/)[3]);
      if (freeKb * 1024 < requiredBytes) throw new Error('Insufficient free disk space for extraction.');
    }
  }

  async extractZip(archiveFile, targetDir) {
    if (process.platform === 'win32') {
      await this.spawnCommand('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${archiveFile}" -DestinationPath "${targetDir}" -Force`]);
      return;
    }
    await this.spawnCommand('unzip', ['-o', archiveFile, '-d', targetDir]);
  }

  async extract7z(archiveFile, targetDir) {
    const bundled = path.join(this.rootDir, 'tools', '7zr.exe');
    const fallback = process.platform === 'win32' ? '7z' : '7zz';
    const bin = fs.existsSync(bundled) ? bundled : fallback;
    await this.spawnCommand(bin, ['x', archiveFile, `-o${targetDir}`, '-y']);
  }

  async spawnCommand(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `Command failed: ${command}`)));
    });
  }

  async downloadFileWithRetry(url, destination, job, retries) {
    for (let i = 1; i <= retries; i += 1) {
      try {
        await this.downloadFile(url, destination, job);
        return;
      } catch (error) {
        if (i === retries) throw error;
        this.log(`Retrying download (${i}/${retries}) ${url}`);
      }
    }
  }

  async downloadFile(url, destination, job) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const request = https.get(url, { timeout: 30000, headers: { 'User-Agent': 'PortableGitHubGameLauncher' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.downloadFile(res.headers.location, destination, job).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) return reject(new Error(`Download failed with status ${res.statusCode}`));

        const total = Number(res.headers['content-length'] || 0);
        job.totalBytes += total;
        const file = fs.createWriteStream(destination);
        let downloaded = 0;

        res.on('data', (chunk) => {
          if (job.canceled) {
            request.destroy();
            return;
          }
          while (job.paused) { return; }
          downloaded += chunk.length;
          job.downloadedBytes += chunk.length;
          const elapsed = (Date.now() - started) / 1000;
          job.speed = elapsed ? Math.round(job.downloadedBytes / elapsed) : 0;
          const remaining = Math.max(job.totalBytes - job.downloadedBytes, 0);
          job.etaSeconds = job.speed ? Math.round(remaining / job.speed) : 0;
          job.progress = job.totalBytes ? Math.round((job.downloadedBytes / job.totalBytes) * 100) : 0;
          this.emit('state', this.getState());
        });

        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      });

      request.on('timeout', () => request.destroy(new Error('Download timeout')));
      request.on('error', reject);
    });
  }

  pauseDownload(jobId) { const job = this.jobs.get(jobId); if (job) job.paused = true; return true; }
  resumeDownload(jobId) { const job = this.jobs.get(jobId); if (job) job.paused = false; return true; }
  cancelDownload(jobId) { const job = this.jobs.get(jobId); if (job) job.canceled = true; return true; }

  async launchGame(id) {
    const game = this.getGame(id);
    const installed = this.state.installed[id];
    if (!game || !installed) throw new Error('Game not installed');
    const exePath = path.join(installed.installPath, installed.executable);
    if (!fs.existsSync(exePath)) throw new Error('Executable missing. Use Repair.');
    spawn(exePath, game.launch_arguments || [], { detached: true, stdio: 'ignore' }).unref();
    installed.lastPlayed = new Date().toISOString();
    installed.launchCount = (installed.launchCount || 0) + 1;
    await this.saveState();
    this.emit('state', this.getState());
    return true;
  }

  async uninstallGame(id) {
    const game = this.getGame(id);
    const installed = this.state.installed[id];
    if (!game || !installed) return false;
    const preserve = new Set(game.preserve_paths_on_uninstall || []);
    const files = await fsp.readdir(installed.installPath).catch(() => []);
    for (const item of files) {
      if (preserve.has(item)) continue;
      await fsp.rm(path.join(installed.installPath, item), { recursive: true, force: true });
    }
    delete this.state.installed[id];
    await this.saveState();
    this.emit('state', this.getState());
    return true;
  }

  async clearCache() {
    await fsp.rm(this.paths.cacheDir, { recursive: true, force: true });
    await fsp.mkdir(this.paths.cacheDir, { recursive: true });
    return true;
  }
}

module.exports = { LauncherService };
