const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the emitted main-process function without launching Electron, loading
// native input hooks, or evaluating the rest of the application bundle.
test('compiled main quarantines executable actions in imported presets', async () => {
  const main = process.env.TRACKPAD_COMPILED_MAIN || path.join(__dirname, '../out/main/index.js');
  const source = fs.readFileSync(main, 'utf8');
  const ast = ts.createSourceFile(main, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const init = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'initSessionManager');
  assert.ok(init, 'compiled main must include the preset import handler');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trackpad-bundle-preset-'));
  try {
    const file = path.join(directory, 'untrusted.tpz');
    const actions = ['script', 'keyboard', 'plugin', 'webhook', 'osc'];
    const preset = { zones: { 1: actions.map((type, i) => ({ id: String(i), action: { type, script: 'synthetic-only', keys: ['enter'], webhookUrl: 'http://localhost/synthetic' } })) } };
    fs.writeFileSync(file, JSON.stringify(preset));
    const handlers = new Map();
    const electron = {
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      app: { getPath: () => directory },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [file] }) },
    };
    const context = { ...electron, electron, join: path.join, readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync, existsSync: fs.existsSync, readdirSync: fs.readdirSync, fs, path, console: { log() {} }, process: { env: {} }, Buffer };
    vm.runInNewContext('(' + init.getText(ast) + ')()', context, { timeout: 1000 });
    const result = await handlers.get('preset-import')();
    assert.equal(result.ok, true);
    assert.equal(result.disabledActions, actions.length);
    for (const zone of result.preset.zones[1]) {
      assert.equal(zone.action.type, 'none');
      assert.deepEqual(Object.keys(zone.action), ['type']);
    }
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).zones[1][0].action.type, 'script');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
