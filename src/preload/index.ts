import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Touchpad events: main → renderer
  onTouchEvent: (callback: (event: TouchInputEvent) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: TouchInputEvent) => callback(data)
    ipcRenderer.on('touch-event', handler)
    return () => ipcRenderer.removeListener('touch-event', handler)
  },

  // Touchpad mode change notification
  onTouchpadMode: (callback: (mode: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, mode: string) => callback(mode)
    ipcRenderer.on('touchpad-mode', handler)
    return () => ipcRenderer.removeListener('touchpad-mode', handler)
  },

  // Native HID 실패 알림 (uiohook fallback으로 전환)
  onNativeHidFailed: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('touchpad-native-hid-failed', handler)
    return () => ipcRenderer.removeListener('touchpad-native-hid-failed', handler)
  },

  // MIDI
  sendMidiNote: (channel: number, note: number, velocity: number, on: boolean) =>
    ipcRenderer.invoke('midi-note', { channel, note, velocity, on }),
  sendMidiCC: (channel: number, cc: number, value: number) =>
    ipcRenderer.invoke('midi-cc', { channel, cc, value }),
  sendMidiPitchBend: (channel: number, value: number) =>
    ipcRenderer.invoke('midi-pitchbend', { channel, value }),
  startMidiLearn: () => ipcRenderer.invoke('midi-learn-start'),
  stopMidiLearn: () => ipcRenderer.invoke('midi-learn-stop'),
  onMidiLearnEvent: (callback: (e: { type: 'note' | 'cc'; channel: number; number: number }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { type: 'note' | 'cc'; channel: number; number: number }) => callback(data)
    ipcRenderer.on('midi-learn-event', handler)
    return () => ipcRenderer.removeListener('midi-learn-event', handler)
  },
  getMidiPorts: (): Promise<string[]> => ipcRenderer.invoke('midi-get-ports'),
  openMidiPort: (portIndex: number) => ipcRenderer.invoke('midi-open-port', portIndex),
  openMidiVirtual: () => ipcRenderer.invoke('midi-open-virtual'),
  onMidiPortChanged: (callback: (portName: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, name: string) => callback(name)
    ipcRenderer.on('midi-port-changed', handler)
    return () => ipcRenderer.removeListener('midi-port-changed', handler)
  },

  // MIDI Clock
  setMidiClock: (mode: 'off' | 'master' | 'slave', bpm: number) =>
    ipcRenderer.invoke('midi-clock-set', { mode, bpm }),
  updateMidiClockBpm: (bpm: number) =>
    ipcRenderer.invoke('midi-clock-update-bpm', bpm),
  onMidiClockBpm: (callback: (bpm: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, bpm: number) => callback(bpm)
    ipcRenderer.on('midi-clock-bpm', handler)
    return () => ipcRenderer.removeListener('midi-clock-bpm', handler)
  },
  onMidiClockSlaveStart: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('midi-clock-slave-start', handler)
    return () => ipcRenderer.removeListener('midi-clock-slave-start', handler)
  },
  onMidiClockSlaveStop: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('midi-clock-slave-stop', handler)
    return () => ipcRenderer.removeListener('midi-clock-slave-stop', handler)
  },

  // Keyboard output
  sendKeyboard: (keys: string[]) => ipcRenderer.invoke('keyboard-send', keys),
  sendKeyboardSequence: (sequence: Array<{ keys: string[]; delayMs: number }>) =>
    ipcRenderer.invoke('keyboard-sequence', sequence),
  executeScript: (script: string) => ipcRenderer.invoke('script-exec', script),
  sendMediaKey: (action: string) => ipcRenderer.invoke('media-key', action),

  // Global shortcuts
  setGlobalShortcuts: (enabled: boolean) => ipcRenderer.invoke('global-shortcuts-set', enabled),
  onGlobalLayer: (callback: (layer: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, layer: number) => callback(layer)
    ipcRenderer.on('global-layer', handler)
    return () => ipcRenderer.removeListener('global-layer', handler)
  },

  // Autostart
  getAutostart: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('autostart-get'),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke('autostart-set', enabled),

  // Zone trigger notification to main
  zoneTriggered: (zoneId: string, action: unknown, on: boolean) =>
    ipcRenderer.send('zone-triggered', { zoneId, action, on }),

  // Session
  saveSession: (data: unknown) => ipcRenderer.invoke('session-save', data),
  loadSession: (): Promise<unknown> => ipcRenderer.invoke('session-load'),

  // Preset (.tpz)
  exportPreset: (data: unknown) => ipcRenderer.invoke('preset-export', data),
  importPreset: (): Promise<{ ok?: boolean; preset?: unknown; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('preset-import'),
  listBuiltinPresets: (): Promise<Array<{ name: string; file: string }>> =>
    ipcRenderer.invoke('preset-list-builtin'),
  loadBuiltinPreset: (filename: string): Promise<{ ok?: boolean; preset?: unknown; error?: string }> =>
    ipcRenderer.invoke('preset-load-builtin', filename),

  // Overlay / Window mode
  toggleOverlay: (): Promise<{ overlay: boolean }> => ipcRenderer.invoke('window-overlay-toggle'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onOverlayState: (callback: (active: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, active: boolean) => callback(active)
    ipcRenderer.on('overlay-state', handler)
    return () => ipcRenderer.removeListener('overlay-state', handler)
  },

  // OSC
  setOscConfig: (host: string, port: number) => ipcRenderer.invoke('osc-set-config', { host, port }),
  sendOscNote: (channel: number, note: number, velocity: number, on: boolean) =>
    ipcRenderer.invoke('osc-note', { channel, note, velocity, on }),
  sendOscZone: (zoneId: string, on: boolean, pressure: number) =>
    ipcRenderer.invoke('osc-zone', { zoneId, on, pressure }),
  sendOscCustom: (address: string, args: Array<{ type: 'i' | 'f'; value: number }>) =>
    ipcRenderer.invoke('osc-custom', { address, args }),

  // Input config (sensitivity / dead zone)
  setInputConfig: (sensitivity: number, deadZone: number) =>
    ipcRenderer.send('input-set-config', { sensitivity, deadZone }),
  setAbsPadMode: (enabled: boolean) => ipcRenderer.send('set-abs-pad-mode', enabled),

  // MIDI Thru
  setMidiThru: (enabled: boolean) => ipcRenderer.invoke('midi-thru-set', enabled),

  // MIDI Export
  exportMidi: (data: number[]) => ipcRenderer.invoke('midi-export', data),

  // Plugin
  listPlugins: () => ipcRenderer.invoke('plugin-list'),
  executePlugin: (pluginFile: string, actionId: string, payload: unknown) =>
    ipcRenderer.invoke('plugin-execute', { pluginFile, actionId, payload }),
  reloadPlugins: () => ipcRenderer.invoke('plugin-reload'),
  openPluginsDir: () => ipcRenderer.invoke('plugin-open-dir'),
  onPluginsReloaded: (callback: (names: string[]) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, names: string[]) => callback(names)
    ipcRenderer.on('plugins-reloaded', handler)
    return () => ipcRenderer.removeListener('plugins-reloaded', handler)
  },
})

export interface TouchInputEvent {
  type: 'down' | 'move' | 'up'
  x: number
  y: number
  pressure: number
  id: number
  mode: 'precision' | 'legacy'
}
