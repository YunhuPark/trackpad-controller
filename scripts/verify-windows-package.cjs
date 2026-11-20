const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const child = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const output = path.join(root, 'release');
const bundlePath = path.join(output, 'verified-main.js');
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packagedInfo = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(packagedInfo.version, packageInfo.version);
const bundle = asar.extractFile(archive, path.join('out', 'main', 'index.js'));
assert.deepEqual(bundle, fs.readFileSync(path.join(root, 'out/main/index.js')));
fs.writeFileSync(bundlePath, bundle);
try {
  const check = child.spawnSync(process.execPath, ['--test', 'tests/packaged-preset-security.test.cjs'], {
    cwd: root,
    env: { ...process.env, TRACKPAD_COMPILED_MAIN: bundlePath },
    stdio: 'inherit',
  });
  assert.equal(check.status, 0, 'actual packaged main must quarantine imported actions');
} finally {
  fs.unlinkSync(bundlePath);
}
const binaries = fs.readdirSync(output).filter(name => name.endsWith('.exe'));
assert.equal(binaries.length, 1, 'one Windows installer is expected');
const installer = fs.readFileSync(path.join(output, binaries[0]));
const nativePath = path.join(root, 'release/win-unpacked/resources/touchpad.node');
assert.ok(fs.statSync(nativePath).size > 0, 'rebuilt native touchpad module must be packaged');
assert.deepEqual(fs.readFileSync(nativePath), fs.readFileSync(path.join(root, 'build/Release/touchpad.node')));
// Load modules under the packaged Electron ABI on the CI runner. Do not call
// start(), enumerate devices, open ports, or launch the application/installer.
const nativeCheck = child.spawnSync(path.join(output, 'win-unpacked', 'TrackPad Controller.exe'), ['-e', `
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const base = process.env.TRACKPAD_PACKAGE_ROOT;
  assert.equal(process.versions.electron, process.env.TRACKPAD_EXPECTED_ELECTRON);
  const touchpad = require(path.join(base, 'resources', 'touchpad.node'));
  assert.equal(typeof touchpad.start, 'function');
  assert.equal(typeof touchpad.stop, 'function');
  const modules = path.join(base, 'resources', 'app.asar', 'node_modules');
  const midi = require(path.join(modules, 'midi'));
  assert.equal(typeof midi.Input, 'function');
  assert.equal(typeof midi.Output, 'function');
  const hid = require(path.join(modules, 'node-hid'));
  assert.equal(typeof hid.devices, 'function');
  const hook = require(path.join(modules, 'uiohook-napi'));
  assert.equal(typeof hook.uIOhook.start, 'function');
  console.log('Packaged native modules load; no hooks started or devices opened.');
`], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TRACKPAD_PACKAGE_ROOT: path.join(output, 'win-unpacked'), TRACKPAD_EXPECTED_ELECTRON: require('electron/package.json').version },
  encoding: 'utf8',
  timeout: 30000,
});
process.stdout.write(nativeCheck.stdout || '');
if (nativeCheck.status !== 0) process.stderr.write(nativeCheck.stderr || '');
assert.equal(nativeCheck.status, 0, 'packaged native modules must load under the packaged Electron runtime');
const result = {
  version: packageInfo.version,
  electronVersion: require('electron/package.json').version,
  sourceSha: process.env.GITHUB_SHA || null,
  installer: binaries[0],
  sha256: crypto.createHash('sha256').update(installer).digest('hex'),
  bytes: installer.length,
  packagedMainMatchesBuiltSource: true,
  packagedPresetQuarantinePassed: true,
  nativeTouchpadMatchesRebuild: true,
  nativeModulesLoadUnderPackagedElectron: true,
  hooksStartedDuringVerification: false,
  installerExecuted: false,
  hardwareValidated: false,
  codeSigningConfigured: false,
};
fs.writeFileSync(path.join(output, 'package-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
