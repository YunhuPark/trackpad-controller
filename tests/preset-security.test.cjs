const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('file import disables executable actions in every layer while local sessions retain intentional actions', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trackpad-preset-'));
  try {
    const preset = { zones: {
      1: [{ id: 'a', action: { type: 'script', script: 'synthetic-only' } }],
      2: [{ id: 'b', action: { type: 'midi', midiNote: 64 } }],
      4: [
        { id: 'c', action: { type: 'script', script: 'synthetic-only' } },
        { id: 'd', action: { type: 'keyboard', keySequence: [
          { keys: ['command', 'r'], delayMs: 10 }, { keys: ['a'], delayMs: 0 }, { keys: ['enter'], delayMs: 0 },
        ] } },
        { id: 'e', action: { type: 'plugin', pluginFile: 'synthetic.js', pluginActionId: 'run' } },
        { id: 'f', action: { type: 'webhook', webhookUrl: 'http://localhost/synthetic' } },
        { id: 'g', action: { type: 'osc', oscAddress: '/synthetic' } },
        { id: 'h', action: { type: 'keyboard', keys: ['enter'] } },
      ],
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
    for (const zone of result.preset.zones[4]) {
      assert.equal(zone.action.type, 'none', `untrusted ${zone.id} action survived IPC import`);
      assert.deepEqual(Object.keys(zone.action), ['type']);
    }
    assert.equal(result.disabledActions, 7);
    handlers.get('session-save')(null, preset);
    const local = handlers.get('session-load')();
    assert.equal(local.zones[1][0].action.script, 'synthetic-only');
    assert.equal(local.zones[4][1].action.keySequence[0].keys[1], 'r');
    assert.equal(local.zones[4][2].action.pluginActionId, 'run');
    // Source file is never modified and importing does not execute its script.
    assert.equal(JSON.parse(fs.readFileSync(filename)).zones[1][0].action.type, 'script');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
