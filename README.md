# TrackPad Controller

Turn your laptop trackpad into a MIDI / keyboard performance surface.

![Windows](https://img.shields.io/badge/Windows-10%2F11-blue) ![License](https://img.shields.io/badge/license-MIT-green)

> **Windows 전용 앱입니다.** macOS는 자체 트랙패드 앱 생태계가 잘 갖춰져 있어, 이 프로젝트는 Windows 노트북 사용자를 위해 만들어졌습니다.

## Features

- **Zone Grid** — 2×2 / 3×3 / 4×4 touch zones, 4 independent layers
- **MIDI Output** — Note, CC, Pitch Bend per zone; MIDI Clock master/slave; MIDI Thru
- **Keyboard & Media** — Simulate keystrokes, media keys, or run scripts
- **OSC** — Send OSC messages to any host/port
- **Loop Recorder** — Record, overdub, and export loops as MIDI files (4 slots)
- **Scale Lock** — Snap all zones to a musical scale automatically
- **Piano / Drum layouts** — One-click GM drum or chromatic piano mapping
- **1:1 Absolute Mode** — Entire trackpad becomes a hardware pad surface
- **Preset system** — Save/load `.tpz` preset files, 3 built-in presets included
- **Plugin support** — Extend with custom JS plugins
- **Overlay mode** — Float above other windows
- **Undo / Redo** — Full zone edit history

## Requirements

- Windows 10 / 11 (64-bit)
- Precision Touchpad driver (most modern laptops)
- Optional: virtual MIDI port (e.g. [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)) for DAW routing

## Installation

1. Download `TrackPad-Controller-Setup-x.x.x.exe` from [Releases](../../releases)
2. Run the installer
3. Launch **TrackPad Controller** from the Start menu or desktop shortcut

### Security update: 1.0.1

The original 1.0.0 installer predates the preset import security fix and has been
withdrawn from public downloads. Use 1.0.1 or later. Importing a shared preset now
disables executable actions, including scripts, keyboard sequences, plugins,
webhooks and OSC; local actions must be deliberately configured in the UI.
Previously installed copies are not updated by a source-code change on GitHub.

Windows packages are rebuilt in CI and their actual packaged main-process bundle
is checked for this import boundary. Release checksums verify downloaded bytes;
they do not replace an Authenticode signature. Physical touchpad/MIDI hardware and
an interactive installer session are not covered by the package checks.

## Quick Start

1. Open the app — the trackpad grid appears in the center
2. **Right-click** any zone to assign a MIDI note, key, or action
3. Select your MIDI output port in the bottom panel
4. Touch zones to trigger actions

## Building from Source

```bash
# Install dependencies
npm install

# Build native addon (requires Visual Studio Build Tools with C++ workload)
npm run build:native

# Run in development
npm run dev

# Build installer
npm run build:win
```

## License

MIT
