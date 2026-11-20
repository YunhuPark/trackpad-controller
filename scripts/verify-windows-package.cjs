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
  installerExecuted: false,
  hardwareValidated: false,
  codeSigningConfigured: false,
};
fs.writeFileSync(path.join(output, 'package-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
