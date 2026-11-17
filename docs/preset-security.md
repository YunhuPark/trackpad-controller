# Imported presets

External `.tpz`/JSON presets are data, not permission to execute OS commands.
File import disables every `script` action before returning the preset to the
renderer. MIDI actions and other settings remain usable. The UI reports the
number of disabled actions. To execute a script, inspect its source and configure
it yourself in the local zone editor. Import never modifies the source preset.

Local sessions retain scripts that the user deliberately configured. Plugins are
also executable code and should only be installed from trusted sources.

Regression: `node --test tests/preset-security.test.cjs`; also run the TypeScript
checks, lint and `npm run build`. No Electron/native application is launched by
this test.
