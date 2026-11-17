const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const ts = require('typescript');

function loadMain(name, electron, loadModule) {
  const filename = path.join(__dirname, '../src/main', name + '.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll('import.meta.url', '__moduleUrl');
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, __moduleUrl: pathToFileURL(filename).href,
    require: name => name === 'electron' ? electron : name === 'node:module' ? {
      createRequire: url => {
        assert.equal(url, pathToFileURL(filename).href);
        return loadModule || createRequire(url);
      },
    } : require(name),
    console, process, Buffer, global: {}, setInterval, clearInterval, setTimeout,
  });
  return exports;
}

test('keyboard optional backend remains lazy and missing backend returns safe failure', async () => {
  const handlers = new Map();
  let loads = 0;
  const engine = loadMain('keyboardEngine', { ipcMain: { handle: (key, fn) => handlers.set(key, fn) } }, name => {
    assert.equal(name, 'robotjs'); loads++; throw new Error('synthetic missing backend');
  });
  engine.initKeyboardEngine();
  assert.equal(loads, 0);
  const result = await handlers.get('keyboard-send')(null, ['control', 'a']);
  assert.equal(result.ok, false);
  assert.equal(loads, 1);
});

test('MIDI missing native backend preserves empty port fallback and cleanup', () => {
  const handlers = new Map();
  const ipcMain = { handle: (key, fn) => handlers.set(key, fn), on: () => {} };
  const engine = loadMain('midiEngine', { ipcMain }, name => {
    assert.equal(name, 'midi'); throw new Error('synthetic missing addon');
  });
  engine.initMidiEngine({ webContents: { send: () => {} } });
  assert.equal(handlers.get('midi-get-ports')().length, 0);
  engine.cleanupMidi();
});

test('CommonJS user plugin reload invalidates cached implementation in ESM host', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trackpad-plugin-'));
  try {
    const pluginDir = path.join(directory, 'plugins');
    fs.mkdirSync(pluginDir);
    const file = path.join(pluginDir, 'example.js');
    fs.writeFileSync(file, "module.exports = { name: 'First', version: '1', actions: [] }");
    const handlers = new Map();
    const engine = loadMain('pluginLoader', {
      ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
      app: { getPath: () => directory },
    });
    engine.initPluginLoader({ webContents: { send: () => {} } });
    assert.equal(handlers.get('plugin-list')()[0].name, 'First');
    fs.writeFileSync(file, "module.exports = { name: 'Second', version: '2', actions: [] }");
    handlers.get('plugin-reload')();
    assert.equal(handlers.get('plugin-list')()[0].name, 'Second');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


test('touchpad missing addons preserves legacy mode and cleanup without starting drivers', () => {
  const loads = [];
  const modes = [];
  const engine = loadMain('touchpadInput', {
    ipcMain: { on: () => {} },
    screen: { getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 } }) },
    app: { isPackaged: false, getAppPath: () => os.tmpdir() },
  }, name => { loads.push(name); throw new Error('synthetic missing addon'); });
  engine.initTouchpadInput({
    webContents: { send: (name, value) => modes.push([name, value]) },
    hookWindowMessage: () => {},
  });
  assert.equal(loads[0], path.join(os.tmpdir(), 'build', 'Release', 'touchpad.node'));
  assert.equal(loads[1], 'uiohook-napi');
  assert.ok(modes.some(([name, value]) => name === 'touchpad-mode' && value === 'legacy'));
  engine.cleanupTouchpad();
  assert.equal(loads[2], 'uiohook-napi');
});
