/// <reference types="vite/client" />

export interface TouchInputEvent {
  type: 'down' | 'move' | 'up'
  x: number
  y: number
  pressure: number
  id: number
  mode: 'precision' | 'legacy'
}

interface PluginInfo {
  file: string
  name: string
  version: string
  actions: Array<{ id: string; label: string }>
}

interface ElectronAPI {
  // Window
  minimize: () => void
  maximize: () => void
  close: () => void

  // Touchpad events
  onTouchEvent: (cb: (event: TouchInputEvent) => void) => () => void
  onTouchpadMode: (cb: (mode: string) => void) => () => void

  // MIDI Note
  sendMidiNote: (channel: number, note: number, velocity: number, on: boolean) => Promise<{ ok?: boolean; error?: string }>
  sendMidiCC: (channel: number, cc: number, value: number) => Promise<{ ok?: boolean; error?: string }>
  getMidiPorts: () => Promise<string[]>
  openMidiPort: (portIndex: number) => Promise<{ ok?: boolean; error?: string }>
  openMidiVirtual: () => Promise<{ ok?: boolean; error?: string }>
  onMidiPortChanged: (cb: (portName: string) => void) => () => void

  // MIDI Clock
  setMidiClock: (mode: 'off' | 'master' | 'slave', bpm: number) => Promise<{ ok?: boolean; mode?: string; error?: string }>
  updateMidiClockBpm: (bpm: number) => Promise<{ ok?: boolean }>
  onMidiClockBpm: (cb: (bpm: number) => void) => () => void
  onMidiClockSlaveStart: (cb: () => void) => () => void
  onMidiClockSlaveStop: (cb: () => void) => () => void

  // Keyboard output
  sendKeyboard: (keys: string[]) => Promise<{ ok?: boolean; error?: string }>
  sendKeyboardSequence: (sequence: Array<{ keys: string[]; delayMs: number }>) => Promise<{ ok?: boolean; error?: string }>
  executeScript: (script: string) => Promise<{ ok?: boolean; output?: string; error?: string }>
  sendMediaKey: (action: string) => Promise<{ ok?: boolean; error?: string }>

  // Global shortcuts
  setGlobalShortcuts: (enabled: boolean) => Promise<{ ok?: boolean; enabled?: boolean }>
  onGlobalLayer: (cb: (layer: number) => void) => () => void

  // Autostart
  getAutostart: () => Promise<{ enabled: boolean }>
  setAutostart: (enabled: boolean) => Promise<{ ok?: boolean; enabled?: boolean }>

  // Zone trigger notification
  zoneTriggered: (zoneId: string, action: unknown, on: boolean) => void

  // Session
  saveSession: (data: unknown) => Promise<{ ok?: boolean; error?: string }>
  loadSession: () => Promise<unknown>

  // Preset (.tpz)
  exportPreset: (data: unknown) => Promise<{ ok?: boolean; filePath?: string; canceled?: boolean; error?: string }>
  importPreset: () => Promise<{ ok?: boolean; preset?: unknown; canceled?: boolean; error?: string }>
  listBuiltinPresets: () => Promise<Array<{ name: string; file: string }>>
  loadBuiltinPreset: (filename: string) => Promise<{ ok?: boolean; preset?: unknown; error?: string }>

  // Overlay / Window mode
  toggleOverlay: () => Promise<{ overlay: boolean }>
  windowMinimize: () => void
  windowClose: () => void
  onOverlayState: (cb: (active: boolean) => void) => () => void

  // OSC
  setOscConfig: (host: string, port: number) => Promise<{ ok?: boolean; host?: string; port?: number; error?: string }>
  sendOscNote: (channel: number, note: number, velocity: number, on: boolean) => Promise<{ ok?: boolean; error?: string }>
  sendOscZone: (zoneId: string, on: boolean, pressure: number) => Promise<{ ok?: boolean; error?: string }>
  sendOscCustom: (address: string, args: Array<{ type: 'i' | 'f'; value: number }>) => Promise<{ ok?: boolean; error?: string }>

  // Input config (sensitivity / dead zone → main process)
  setInputConfig: (sensitivity: number, deadZone: number) => void
  setAbsPadMode: (enabled: boolean) => void

  // MIDI Export
  exportMidi: (data: number[]) => Promise<{ ok?: boolean; canceled?: boolean; error?: string }>

  // Plugin
  listPlugins: () => Promise<PluginInfo[]>
  executePlugin: (pluginFile: string, actionId: string, payload: unknown) => Promise<{ ok?: boolean; error?: string }>
  reloadPlugins: () => Promise<{ ok?: boolean; count?: number }>
  openPluginsDir: () => Promise<{ ok?: boolean; path?: string }>
  onPluginsReloaded: (cb: (names: string[]) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
