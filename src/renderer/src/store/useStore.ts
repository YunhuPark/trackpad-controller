import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  GridSize,
  ZoneConfig,
  ZoneLayout,
  createDefaultZones,
  createDefaultLayout,
  getZoneAtPoint,
  zoneId,
  SCALE_INTERVALS,
  scaleNoteAt,
} from '@core/zoneEngine'
import type { Locale } from '../i18n'
import { DEFAULT_CURVE, type PressureCurve } from '@core/pressureCurve'

export type QuantizeMode = 'off' | '1/8' | '1/16'
export type Theme = 'dark' | 'light'
export type MidiClockMode = 'off' | 'master' | 'slave'

interface TouchpadStore {
  // Grid & Zones
  grid: GridSize
  layer: 1 | 2 | 3 | 4
  zones: Record<number, ZoneConfig[]>       // layer → zones
  zoneLayouts: Record<number, ZoneLayout>   // layer → col/row weights
  activeZoneIds: Set<string>

  // BPM & Metronome
  bpm: number
  metronomeOn: boolean
  quantize: QuantizeMode
  noteRepeat: QuantizeMode

  // MIDI Clock
  midiClockMode: MidiClockMode

  // Device info
  touchpadMode: 'precision' | 'legacy' | 'none'
  midiPort: string

  // UI settings
  theme: Theme
  locale: Locale

  // Phase 4
  pressureCurve: PressureCurve
  oscHost: string
  oscPort: number
  overlayMode: boolean

  // Input settings
  sensitivity: number   // 0.1 ~ 3.0 (기본 1.0)
  deadZone: number      // 0 ~ 0.15 (기본 0.02)
  maxTouches: number    // 1 ~ 10 (기본 5) — Precision TP 멀티터치 최대 동시 인식 수

  // App settings
  autostart: boolean
  globalShortcutsEnabled: boolean
  absPadMode: boolean

  // Pad calibration (raw coord → 0-1 mapping)
  padCalib: { minX: number; maxX: number; minY: number; maxY: number } | null

  // Scale Lock
  scaleLock: { root: number; scale: string } | null

  // Undo/Redo (zones + layouts 스냅샷, 최대 30단계)
  _undoStack: Array<{ zones: TouchpadStore['zones']; zoneLayouts: TouchpadStore['zoneLayouts'] }>
  _redoStack: Array<{ zones: TouchpadStore['zones']; zoneLayouts: TouchpadStore['zoneLayouts'] }>

  // Loop Recorder
  loopState: 'idle' | 'recording' | 'playing'
  loopLength: number   // bars
  loopEvents: Array<{ zoneId: string; on: boolean; t: number; pressure: number }>
  loopActiveSlot: 'A' | 'B' | 'C' | 'D'
  loopSlots: Record<'A' | 'B' | 'C' | 'D', Array<{ zoneId: string; on: boolean; t: number; pressure: number }>>
  loopOverdub: boolean

  // MIDI Learn
  midiLearnTarget: string | null   // zone id 또는 null

  // Actions
  setGrid: (g: GridSize) => void
  setLayer: (l: 1 | 2 | 3 | 4) => void
  setBpm: (b: number) => void
  toggleMetronome: () => void
  cycleQuantize: () => void
  cycleNoteRepeat: () => void
  setTouchpadMode: (m: 'precision' | 'legacy' | 'none') => void
  setMidiPort: (p: string) => void
  updateZone: (layerNum: number, zone: ZoneConfig) => void
  setMidiClockMode: (m: MidiClockMode) => void
  setTheme: (t: Theme) => void
  setLocale: (l: Locale) => void
  setPressureCurve: (c: PressureCurve) => void
  setOscConfig: (host: string, port: number) => void
  setOverlayMode: (on: boolean) => void
  setSensitivity: (v: number) => void
  setDeadZone: (v: number) => void
  setMaxTouches: (v: number) => void
  setAutostart: (v: boolean) => void
  setGlobalShortcutsEnabled: (v: boolean) => void
  setAbsPadMode: (v: boolean) => void
  setPadCalib: (c: { minX: number; maxX: number; minY: number; maxY: number } | null) => void
  setZoneLayout: (layerNum: number, layout: ZoneLayout) => void
  setScaleLock: (s: { root: number; scale: string } | null) => void
  applyScaleLock: () => void
  setLoopState: (s: 'idle' | 'recording' | 'playing') => void
  setLoopLength: (bars: number) => void
  setLoopEvents: (evs: Array<{ zoneId: string; on: boolean; t: number; pressure: number }>) => void
  setLoopActiveSlot: (slot: 'A' | 'B' | 'C' | 'D') => void
  setLoopOverdub: (v: boolean) => void
  setMidiLearnTarget: (id: string | null) => void
  pushUndoSnapshot: () => void
  undo: () => void
  redo: () => void

  // Touch state
  setActiveZones: (ids: Set<string>) => void
  onTouch: (x: number, y: number) => string | null
  onTouchEnd: (id: string) => void
}

const QUANTIZE_CYCLE: QuantizeMode[] = ['off', '1/8', '1/16']

const DEFAULT_GRID: GridSize = '3x3'

const useStore = create<TouchpadStore>()(
  persist(
    (set, get) => ({
      grid: DEFAULT_GRID,
      layer: 1,
      zones: {
        1: createDefaultZones(DEFAULT_GRID),
        2: createDefaultZones(DEFAULT_GRID),
        3: createDefaultZones(DEFAULT_GRID),
        4: createDefaultZones(DEFAULT_GRID),
      },
      zoneLayouts: {
        1: createDefaultLayout(DEFAULT_GRID),
        2: createDefaultLayout(DEFAULT_GRID),
        3: createDefaultLayout(DEFAULT_GRID),
        4: createDefaultLayout(DEFAULT_GRID),
      },
      activeZoneIds: new Set(),
      bpm: 120,
      metronomeOn: false,
      quantize: 'off',
      noteRepeat: 'off',
      midiClockMode: 'off',
      touchpadMode: 'none',
      midiPort: '',
      theme: 'dark',
      locale: 'ko',
      pressureCurve: DEFAULT_CURVE,
      oscHost: '127.0.0.1',
      oscPort: 8000,
      overlayMode: false,
      sensitivity: 1.0,
      deadZone: 0.02,
      maxTouches: 5,
      autostart: false,
      globalShortcutsEnabled: true,
      absPadMode: false,
      padCalib: null,
      scaleLock: null,
      loopState: 'idle',
      loopLength: 2,
      loopEvents: [],
      loopActiveSlot: 'A' as const,
      loopSlots: { A: [], B: [], C: [], D: [] },
      loopOverdub: false,
      _undoStack: [],
      _redoStack: [],
      midiLearnTarget: null,

      setGrid: (g) => set((s) => ({
        grid: g,
        zones: {
          ...s.zones,
          [s.layer]: createDefaultZones(g),
        },
        zoneLayouts: {
          ...s.zoneLayouts,
          [s.layer]: createDefaultLayout(g),  // 레이아웃도 그리드에 맞춰 초기화
        },
      })),
      setLayer: (l) => set({ layer: l }),
      setBpm: (b) => set({ bpm: Math.max(20, Math.min(300, b)) }),
      toggleMetronome: () => set((s) => ({ metronomeOn: !s.metronomeOn })),
      cycleQuantize: () => set((s) => {
        const idx = QUANTIZE_CYCLE.indexOf(s.quantize)
        return { quantize: QUANTIZE_CYCLE[(idx + 1) % QUANTIZE_CYCLE.length] }
      }),
      cycleNoteRepeat: () => set((s) => {
        const idx = QUANTIZE_CYCLE.indexOf(s.noteRepeat)
        return { noteRepeat: QUANTIZE_CYCLE[(idx + 1) % QUANTIZE_CYCLE.length] }
      }),
      setTouchpadMode: (m) => set({ touchpadMode: m }),
      setMidiPort: (p) => set({ midiPort: p }),
      updateZone: (layerNum, zone) => set((s) => ({
        zones: {
          ...s.zones,
          [layerNum]: s.zones[layerNum].map((z) => z.id === zone.id ? zone : z),
        },
        _undoStack: [...s._undoStack.slice(-29), { zones: s.zones, zoneLayouts: s.zoneLayouts }],
        _redoStack: [],
      })),
      setMidiClockMode: (m) => set({ midiClockMode: m }),
      setTheme: (t) => set({ theme: t }),
      setLocale: (l) => set({ locale: l }),
      setPressureCurve: (c) => set({ pressureCurve: c }),
      setOscConfig: (host, port) => set({ oscHost: host, oscPort: port }),
      setOverlayMode: (on) => set({ overlayMode: on }),
      setSensitivity: (v) => set({ sensitivity: Math.max(0.1, Math.min(3.0, v)) }),
      setDeadZone: (v) => set({ deadZone: Math.max(0, Math.min(0.15, v)) }),
      setMaxTouches: (v) => set({ maxTouches: Math.max(1, Math.min(10, v)) }),
      setAutostart: (v) => set({ autostart: v }),
      setGlobalShortcutsEnabled: (v) => set({ globalShortcutsEnabled: v }),
      setAbsPadMode: (v) => {
        set({ absPadMode: v })
        window.electronAPI?.setAbsPadMode?.(v)
      },
      setPadCalib: (c) => set({ padCalib: c }),
      setZoneLayout: (layerNum, layout) => set((s) => ({
        zoneLayouts: { ...s.zoneLayouts, [layerNum]: layout },
      })),
      setScaleLock: (s) => set({ scaleLock: s }),
      applyScaleLock: () => {
        const { scaleLock, zones, layer } = get()
        if (!scaleLock) return
        const currentZones = zones[layer] ?? []
        const updated = currentZones.map((zone, i) => {
          const note = scaleNoteAt(scaleLock.root, scaleLock.scale, i)
          return {
            ...zone,
            action: {
              ...zone.action,
              type: 'midi' as const,
              midiNote: note,
              midiInstrument: 'piano' as const,
              midiChannel: zone.action.midiChannel ?? 1,
            },
          }
        })
        set((s) => ({ zones: { ...s.zones, [layer]: updated } }))
      },
      setLoopState: (s) => set({ loopState: s }),
      setLoopLength: (bars) => set({ loopLength: bars }),
      setLoopEvents: (evs) => set((state) => ({
        loopEvents: evs,
        loopSlots: { ...state.loopSlots, [state.loopActiveSlot]: evs },
      })),
      setLoopActiveSlot: (slot) => set((state) => ({
        loopSlots: { ...state.loopSlots, [state.loopActiveSlot]: state.loopEvents },
        loopActiveSlot: slot,
        loopEvents: state.loopSlots[slot],
        loopState: 'idle',
      })),
      setLoopOverdub: (v) => set({ loopOverdub: v }),
      pushUndoSnapshot: () => set((s) => ({
        _undoStack: [...s._undoStack.slice(-29), { zones: s.zones, zoneLayouts: s.zoneLayouts }],
        _redoStack: [],
      })),
      undo: () => set((s) => {
        if (s._undoStack.length === 0) return {}
        const prev = s._undoStack[s._undoStack.length - 1]
        return {
          zones: prev.zones,
          zoneLayouts: prev.zoneLayouts,
          _undoStack: s._undoStack.slice(0, -1),
          _redoStack: [...s._redoStack, { zones: s.zones, zoneLayouts: s.zoneLayouts }],
        }
      }),
      redo: () => set((s) => {
        if (s._redoStack.length === 0) return {}
        const next = s._redoStack[s._redoStack.length - 1]
        return {
          zones: next.zones,
          zoneLayouts: next.zoneLayouts,
          _redoStack: s._redoStack.slice(0, -1),
          _undoStack: [...s._undoStack, { zones: s.zones, zoneLayouts: s.zoneLayouts }],
        }
      }),
      setMidiLearnTarget: (id) => set({ midiLearnTarget: id }),

      setActiveZones: (ids) => set({ activeZoneIds: ids }),
      onTouch: (x, y) => {
        const { grid, layer, zones, zoneLayouts } = get()
        const { rows, cols } = { rows: parseInt(grid[0]), cols: parseInt(grid[2]) }
        const layout: ZoneLayout = zoneLayouts[layer] ?? {
          colWidths: Array(cols).fill(1 / cols),
          rowHeights: Array(rows).fill(1 / rows),
        }
        const zone = getZoneAtPoint(x, y, zones[layer] ?? [], layout)
        if (!zone) return null
        set((s) => ({ activeZoneIds: new Set([...s.activeZoneIds, zone.id]) }))
        return zone.id
      },
      onTouchEnd: (id) => set((s) => {
        const next = new Set(s.activeZoneIds)
        next.delete(id)
        return { activeZoneIds: next }
      }),
    }),
    {
      name: 'trackpad-controller-session',
      partialize: (s) => ({
        grid: s.grid,
        layer: s.layer,
        zones: s.zones,
        zoneLayouts: s.zoneLayouts,
        bpm: s.bpm,
        quantize: s.quantize,
        noteRepeat: s.noteRepeat,
        midiPort: s.midiPort,
        midiClockMode: s.midiClockMode,
        theme: s.theme,
        locale: s.locale,
        pressureCurve: s.pressureCurve,
        oscHost: s.oscHost,
        oscPort: s.oscPort,
        sensitivity: s.sensitivity,
        deadZone: s.deadZone,
        maxTouches: s.maxTouches,
        autostart: s.autostart,
        globalShortcutsEnabled: s.globalShortcutsEnabled,
        absPadMode: s.absPadMode,
        padCalib: s.padCalib,
        loopEvents: s.loopEvents,
        loopLength: s.loopLength,
        loopSlots: s.loopSlots,
        loopActiveSlot: s.loopActiveSlot,
        // overlayMode, loopState는 저장 안 함 (매 실행 시 초기화)
      }),
    }
  )
)

export default useStore
// grid dimensions 헬퍼 (inline, import 줄이기)
export function _gridDims(grid: GridSize) {
  const map: Record<GridSize, { rows: number; cols: number }> = {
    '2x2': { rows: 2, cols: 2 }, '3x3': { rows: 3, cols: 3 }, '4x4': { rows: 4, cols: 4 },
  }
  return map[grid]
}
// zoneId re-export for convenience
export { zoneId }
