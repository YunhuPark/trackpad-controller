# Imported presets

External `.tpz`/JSON presets require local review before enabling executable
actions. File import replaces script, keyboard (including key sequences), plugin,
webhook and OSC actions with `none` at the main-process IPC boundary. Unknown
action classes are disabled too. Only MIDI notes, chords, CC, predefined media
controls and `none` remain active. The UI reports the total disabled action count.

Inspect the original preset contents and deliberately configure any executable
action in the local zone editor to enable it. Import does not modify the original
file. Local sessions retain actions that the user deliberately configured. Plugins
are executable code and should only be installed from trusted sources.

Regression: `node --test tests/*.test.cjs`; also run the TypeScript checks, lint
and `npm run build`. Tests do not launch Electron, native drivers, keyboard input,
network requests or external scripts.
