const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('file import disables scripts in every layer while local sessions retain intentional scripts', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trackpad-preset-'));
  try {
    const preset = { zones: {
      1: [{ id: 'a', action: { type: 'script', script: 'synthetic-only' } }],
      2: [{ id: 'b', action: { type: 'midi', midiNote: 64 } }],
      4: [{ id: 'c', action: { type: 'script', script: 'synthetic-only' } }],
    }};
    const filename = path.join(directory, 'untrusted.tpz');
    fs.writeFileSync(filename, JSON.stringify(preset));
    const handlers = new Map();
    const electron = {
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      app: { getPath: () => directory },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [filename] }) },
    };
    const source = fs.readFileSync(path.join(__dirname, '../src/main/sessionManager.ts'), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, { exports, require: name => name === 'electron' ? electron : require(name), console, process, Buffer });
    exports.initSessionManager();
    const result = await handlers.get('preset-import')();
    assert.equal(result.ok, true);
    assert.equal(result.preset.zones[1][0].action.type, 'none');
    assert.equal(result.preset.zones[1][0].action.script, undefined);
    assert.equal(result.preset.zones[4][0].action.type, 'none');
    assert.equal(result.preset.zones[2][0].action.midiNote, 64);
    assert.equal(result.disabledScripts, 2);
    handlers.get('session-save')(null, preset);
    assert.equal(handlers.get('session-load')().zones[1][0].action.script, 'synthetic-only');
    // Source file is never modified and importing does not execute its script.
    assert.equal(JSON.parse(fs.readFileSync(filename)).zones[1][0].action.type, 'script');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
