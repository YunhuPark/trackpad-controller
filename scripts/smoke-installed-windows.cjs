const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const child = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron } = require('playwright');

// This test intentionally installs and starts the app, but only on a disposable
// GitHub-hosted Windows runner. Never run it on a developer's workstation.
assert.equal(process.platform, 'win32');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'installed smoke is CI-only');
assert.match(process.env.GITHUB_RUN_ID || '', /^\d+$/);
const root = path.resolve(__dirname, '..');
const runnerTemp = path.resolve(process.env.RUNNER_TEMP);
const installDir = path.join(runnerTemp, 'trackpad-installed-smoke-' + process.env.GITHUB_RUN_ID);
assert.ok(installDir.startsWith(runnerTemp + path.sep));
const output = path.join(root, 'release', 'installed-smoke');
fs.mkdirSync(output, { recursive: true });
const verification = JSON.parse(fs.readFileSync(path.join(root, 'release/package-verification.json'), 'utf8'));
const installer = path.join(root, 'release', verification.installer);
const exe = path.join(installDir, 'TrackPad Controller.exe');
const installedAsar = path.join(installDir, 'resources', 'app.asar');
const uninstaller = path.join(installDir, 'Uninstall TrackPad Controller.exe');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const result = {
  sourceSha: process.env.GITHUB_SHA,
  version: verification.version,
  installerSha256: sha(installer),
  silentInstallPassed: false,
  installedPayloadMatchesPackage: false,
  applicationUiPassed: false,
  rendererIsolationPassed: false,
  presetImportUiPassed: false,
  gracefulShutdownPassed: false,
  silentUninstallPassed: false,
  physicalHardwareValidated: false,
  interactiveInstallerWizardValidated: false,
  workstationUsed: false,
};
assert.equal(result.installerSha256, verification.sha256);

async function waitUntil(check, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error('Timed out: ' + label);
}
function run(file, args) {
  return new Promise((resolve, reject) => {
    const proc = child.spawn(file, args, { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => {
      if (proc.exitCode === null) proc.kill();
      reject(new Error('Process timed out: ' + path.basename(file)));
    }, 90000);
    proc.on('error', error => { clearTimeout(timer); reject(error); });
    proc.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(path.basename(file) + ' exit ' + code)); });
  });
}
async function main() {
  let app;
  let page;
  try {
    await run(installer, ['/S', '/D=' + installDir]);
    await waitUntil(() => fs.existsSync(exe) && fs.existsSync(installedAsar), 'installed payload');
    result.silentInstallPassed = true;
    assert.equal(sha(installedAsar), sha(path.join(root, 'release/win-unpacked/resources/app.asar')));
    assert.equal(sha(path.join(installDir, 'resources/touchpad.node')), sha(path.join(root, 'release/win-unpacked/resources/touchpad.node')));
    result.installedPayloadMatchesPackage = true;

    // Do not pass workflow tokens, repository secrets or build credentials to
    // the application. It starts with a fresh disposable runner profile.
    const allowed = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'USERNAME', 'USERDOMAIN', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'ALLUSERSPROFILE', 'HOMEDRIVE', 'HOMEPATH']);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase())));
    env.NODE_ENV = 'production';
    app = await _electron.launch({ executablePath: exe, args: ['--user-data-dir=' + path.join(installDir, 'test-profile')], env, timeout: 30000 });
    page = await app.firstWindow({ timeout: 30000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => !!window.electronAPI?.importPreset, null, { timeout: 15000 });
    await page.getByRole('button', { name: /↓.*(불러오기|Import)/ }).waitFor({ timeout: 15000 });
    assert.ok((await page.locator('body').innerText()).length > 100, 'renderer must show application content');
    result.applicationUiPassed = true;
    const isolation = await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process }));
    assert.deepEqual(isolation, { require: 'undefined', process: 'undefined' });
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity };
    });
    assert.deepEqual(prefs, { contextIsolation: true, nodeIntegration: false, webSecurity: true });
    result.rendererIsolationPassed = true;

    const exported = path.join(installDir, 'baseline.tpz');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported);
    await page.getByRole('button', { name: /↑.*(내보내기|Export)/ }).click();
    await waitUntil(() => fs.existsSync(exported), 'export through real UI and IPC');
    const preset = JSON.parse(fs.readFileSync(exported, 'utf8'));
    const selected = [];
    const types = ['script', 'keyboard', 'plugin', 'webhook', 'osc'];
    for (const [layer, zones] of Object.entries(preset.zones)) {
      for (const [index, zone] of zones.entries()) {
        if (selected.length === types.length) break;
        zone.action = { type: types[selected.length], script: '', keys: [], pluginFile: 'missing-ci-fixture.js', webhookUrl: 'http://127.0.0.1:9/never', oscAddress: '/ci-never' };
        selected.push({ layer, index, id: zone.id });
      }
    }
    assert.equal(selected.length, types.length);
    const imported = path.join(installDir, 'untrusted.tpz');
    fs.writeFileSync(imported, JSON.stringify(preset));
    await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, imported);
    let warning = '';
    page.once('dialog', async dialog => { warning = dialog.message(); await dialog.accept(); });
    await page.getByRole('button', { name: /↓.*(불러오기|Import)/ }).click();
    await waitUntil(() => warning.includes('5'), 'imported-action warning');
    await page.waitForFunction(ids => {
      const stored = JSON.parse(localStorage.getItem('trackpad-controller-session') || 'null');
      return ids.every(({ layer, index, id }) => {
        const zone = stored?.state?.zones?.[layer]?.[index];
        return zone?.id === id && zone.action.type === 'none';
      });
    }, selected);
    assert.equal(errors.length, 0, 'renderer errors: ' + errors.join('; '));
    result.presetImportUiPassed = true;
    await page.screenshot({ path: path.join(output, 'installed-app.png') });
    await app.close();
    result.gracefulShutdownPassed = true;
    app = null;
  } catch (error) {
    result.error = error.message;
    if (page) await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 5000 }).catch(() => {});
    throw error;
  } finally {
    if (app) {
      const proc = app.process();
      await Promise.race([app.close().catch(() => {}), delay(5000)]);
      if (proc.exitCode === null) child.spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
    if (fs.existsSync(uninstaller)) {
      try {
        await run(uninstaller, ['/S', '_?=' + installDir]);
        await waitUntil(() => !fs.existsSync(exe) && !fs.existsSync(installedAsar), 'uninstalled application files');
        result.silentUninstallPassed = true;
      } catch (error) { result.uninstallError = error.message; }
    }
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  }
  assert.ok(result.silentUninstallPassed, result.uninstallError || 'uninstall must pass');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
