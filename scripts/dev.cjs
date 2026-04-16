// Wrapper that removes ELECTRON_RUN_AS_NODE before starting electron-vite dev
// This env var (set by Claude Code / other Electron-based tools) causes Electron
// to run as plain Node.js instead of initializing the browser process.
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const { resolve } = require('path');

const isWin = process.platform === 'win32';
const evBin = resolve(__dirname, '../node_modules/.bin/electron-vite' + (isWin ? '.cmd' : ''));

const child = spawn(evBin, ['dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: isWin,
});

child.on('close', (code) => process.exit(code ?? 0));
