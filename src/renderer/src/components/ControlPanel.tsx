import { useCallback, useState, useRef, useEffect } from 'react'
import useStore from '../store/useStore'
import { GridSize } from '@core/zoneEngine'
import { useMetronome } from '../hooks/useMetronome'
import MidiPortSelector from './MidiPortSelector'
import { t } from '../i18n'
import type { MidiClockMode } from '../store/useStore'


export default function ControlPanel() {
  const {
    bpm, setBpm, metronomeOn, toggleMetronome,
    grid, setGrid, layer, setLayer,
    quantize, cycleQuantize, noteRepeat, cycleNoteRepeat,
    midiClockMode, setMidiClockMode,
    zones, zoneLayouts,
    locale,
    absPadMode, setAbsPadMode,
  } = useStore()

  const [beat, setBeat] = useState(0)

  const onBeat = useCallback((b: number) => {
    setBeat(b)
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = b === 1 ? 880 : 660
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
    } catch (_) {}
  }, [])

  useMetronome(bpm, metronomeOn, onBeat)

  // Sync MIDI Clock mode + BPM changes to main process
  useEffect(() => {
    window.electronAPI?.setMidiClock?.(midiClockMode, bpm)
  }, [midiClockMode])

  useEffect(() => {
    if (midiClockMode === 'master') {
      window.electronAPI?.updateMidiClockBpm?.(bpm)
    }
  }, [bpm, midiClockMode])

  // Slave: receive BPM from external clock
  useEffect(() => {
    const cleanup = window.electronAPI?.onMidiClockBpm?.((externalBpm) => {
      if (midiClockMode === 'slave') setBpm(externalBpm)
    })
    return cleanup
  }, [midiClockMode, setBpm])

  const handleClockMode = (mode: MidiClockMode) => {
    setMidiClockMode(mode)
    window.electronAPI?.setMidiClock?.(mode, bpm)
  }

  // Preset export
  const handleExportPreset = async () => {
    const presetData = {
      version: '1',
      grid,
      zones,
      zoneLayouts,
      bpm,
      quantize,
      noteRepeat,
    }
    await window.electronAPI?.exportPreset?.(presetData)
  }

  // Built-in preset state
  const [builtinPresets, setBuiltinPresets] = useState<Array<{ name: string; file: string }>>([])

  useEffect(() => {
    window.electronAPI?.listBuiltinPresets?.().then(setBuiltinPresets).catch(() => {})
  }, [])

  const handleLoadBuiltin = async (file: string) => {
    const result = await window.electronAPI?.loadBuiltinPreset?.(file)
    if (!result || result.error || !result.preset) return
    const preset = result.preset as {
      grid?: GridSize
      zones?: typeof zones
      zoneLayouts?: typeof zoneLayouts
      bpm?: number
      quantize?: 'off' | '1/8' | '1/16'
      noteRepeat?: 'off' | '1/8' | '1/16'
    }
    if (preset.grid) useStore.setState({ grid: preset.grid })
    if (preset.zones) useStore.setState({ zones: preset.zones })
    if (preset.zoneLayouts) useStore.setState({ zoneLayouts: preset.zoneLayouts })
    if (preset.bpm) setBpm(preset.bpm)
    if (preset.quantize) useStore.setState({ quantize: preset.quantize })
    if (preset.noteRepeat) useStore.setState({ noteRepeat: preset.noteRepeat })
  }

  // Preset import
  const handleImportPreset = async () => {
    const result = await window.electronAPI?.importPreset?.()
    if (!result || result.canceled || result.error) return
    const preset = result.preset as {
      grid?: GridSize
      zones?: typeof zones
      zoneLayouts?: typeof zoneLayouts
      bpm?: number
      quantize?: 'off' | '1/8' | '1/16'
      noteRepeat?: 'off' | '1/8' | '1/16'
    }
    if (preset.grid) useStore.setState({ grid: preset.grid })
    if (preset.zones) useStore.setState({ zones: preset.zones })
    if (preset.zoneLayouts) useStore.setState({ zoneLayouts: preset.zoneLayouts })
    if (preset.bpm) setBpm(preset.bpm)
    if (preset.quantize) useStore.setState({ quantize: preset.quantize })
    if (preset.noteRepeat) useStore.setState({ noteRepeat: preset.noteRepeat })
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">

      {/* BPM + Metronome */}
      <div className="glass-panel p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="label-tag">{t(locale, 'bpm')}</span>
          {metronomeOn && (
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((b) => (
                <div
                  key={b}
                  className="w-2 h-2 rounded-full transition-all duration-75"
                  style={{
                    backgroundColor: beat === b
                      ? (b === 1 ? 'rgb(var(--color-accent))' : 'rgb(var(--color-zone-active))')
                      : 'rgb(var(--color-zone-idle))',
                    transform: beat === b ? 'scale(1.3)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number" min={20} max={300}
            className="flex-1 bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-2xl font-mono font-bold text-text-primary outline-none focus:border-accent text-center"
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
          <TapButton onTap={setBpm} />
        </div>
        <button
          className={`control-btn w-full ${metronomeOn ? 'selected' : ''}`}
          onClick={toggleMetronome}
        >
          {metronomeOn ? t(locale, 'metronomeOn') : t(locale, 'metronomeOff')}
        </button>
      </div>

      {/* Layer */}
      <div className="glass-panel p-4 flex flex-col gap-2">
        <span className="label-tag">{t(locale, 'layer')}</span>
        <div className="grid grid-cols-4 gap-1.5">
          {([1, 2, 3, 4] as const).map((l) => (
            <button
              key={l}
              className={`control-btn text-center font-mono font-bold ${layer === l ? 'selected' : ''}`}
              onClick={() => setLayer(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Absolute Trackpad Mode */}
      <div className="glass-panel p-4 flex flex-col gap-2 border border-accent/20">
        <div className="flex justify-between items-center">
          <span className="label-tag text-accent font-bold">1:1 Absolute Mode</span>
          <button
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
               absPadMode ? 'bg-accent' : 'bg-zone-border'
            }`}
             onClick={() => setAbsPadMode(!absPadMode)}
          >
            <span
               aria-hidden="true"
               className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                 absPadMode ? 'translate-x-5' : 'translate-x-0'
               }`}
             />
          </button>
        </div>
        <p className="text-[10px] text-text-secondary leading-tight mt-1">
          When ON, your entire trackpad becomes a dedicated hardware pad surface. Normal mouse movements are blocked.
        </p>
      </div>

      {/* Grid */}
      <div className="glass-panel p-4 flex flex-col gap-2">
        <span className="label-tag">{t(locale, 'grid')}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['2x2', '3x3', '4x4'] as GridSize[]).map((g) => (
            <button
              key={g}
              className={`control-btn text-center font-mono text-xs ${grid === g ? 'selected' : ''}`}
              onClick={() => setGrid(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Quantize & Note Repeat */}
      <div className="glass-panel p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="label-tag">{t(locale, 'loopQuantize')}</span>
          <button className={`control-btn text-center ${quantize !== 'off' ? 'selected' : ''}`} onClick={cycleQuantize}>
            {quantize === 'off' ? t(locale, 'off') : quantize}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <span className="label-tag">{t(locale, 'noteRepeat')}</span>
          <button className={`control-btn text-center ${noteRepeat !== 'off' ? 'selected' : ''}`} onClick={cycleNoteRepeat}>
            {noteRepeat === 'off' ? t(locale, 'off') : noteRepeat}
          </button>
        </div>
      </div>

      {/* MIDI Thru */}
      <MidiThruToggle locale={locale} />

      {/* MIDI Clock */}
      <div className="glass-panel p-4 flex flex-col gap-2">
        <span className="label-tag">{t(locale, 'midiClock')}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['off', 'master', 'slave'] as MidiClockMode[]).map((mode) => (
            <button
              key={mode}
              className={`control-btn text-center text-xs ${midiClockMode === mode ? 'selected' : ''}`}
              onClick={() => handleClockMode(mode)}
            >
              {mode === 'off' ? t(locale, 'off') : mode === 'master' ? t(locale, 'master') : t(locale, 'slave')}
            </button>
          ))}
        </div>
        {midiClockMode !== 'off' && (
          <div className="flex items-center gap-1.5 pt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${
              midiClockMode === 'master' ? 'bg-accent animate-pulse' : 'bg-zone-active animate-pulse'
            }`} />
            <span className="text-[10px] font-mono text-text-secondary">
              {midiClockMode === 'master' ? `${bpm} BPM → OUT` : 'EXT → BPM'}
            </span>
          </div>
        )}
      </div>

      {/* Preset */}
      <div className="glass-panel p-4 flex flex-col gap-2">
        <span className="label-tag">{t(locale, 'preset')}</span>
        {/* 내장 프리셋 드롭다운 */}
        {builtinPresets.length > 0 && (
          <select
            className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
            defaultValue=""
            onChange={(e) => { if (e.target.value) handleLoadBuiltin(e.target.value) }}
          >
            <option value="" disabled>
              {locale === 'ko' ? '내장 프리셋 불러오기...' : 'Load built-in preset...'}
            </option>
            {builtinPresets.map((p) => (
              <option key={p.file} value={p.file}>{p.name}</option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <button className="control-btn text-center text-xs" onClick={handleExportPreset}>
            ↑ {t(locale, 'exportPreset')}
          </button>
          <button className="control-btn text-center text-xs" onClick={handleImportPreset}>
            ↓ {t(locale, 'importPreset')}
          </button>
        </div>
      </div>

      {/* MIDI Port Selector */}
      <MidiPortSelector />
    </div>
  )
}

// ---- Tap Tempo ----
function TapButton({ onTap }: { onTap: (bpm: number) => void }) {
  const taps = useRef<number[]>([])
  const [active, setActive] = useState(false)

  const handleTap = useCallback(() => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 3000), now]
    if (taps.current.length >= 2) {
      const intervals = taps.current.slice(1).map((t, i) => t - taps.current[i])
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      onTap(Math.round(60000 / avg))
    }
    setActive(true)
    setTimeout(() => setActive(false), 150)
  }, [onTap])

  useEffect(() => {
    window.addEventListener('tap-tempo', handleTap)
    return () => window.removeEventListener('tap-tempo', handleTap)
  }, [handleTap])

  return (
    <button
      className={`px-3 py-2 rounded-lg border text-xs font-mono font-bold transition-all duration-100 ${
        active
          ? 'bg-accent border-accent text-white scale-95'
          : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'
      }`}
      onClick={handleTap}
    >
      TAP
    </button>
  )
}

function MidiThruToggle({ locale }: { locale: string }) {
  const [enabled, setEnabled] = useState(false)

  const toggle = async () => {
    const next = !enabled
    const result = await window.electronAPI?.setMidiThru?.(next)
    if (result && !result.error) setEnabled(next)
  }

  return (
    <div className="glass-panel p-4 flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="label-tag">MIDI Thru</span>
        <span className="text-[10px] text-text-secondary">
          {locale === 'ko' ? '입력 → 출력 통과' : 'Input → Output pass-through'}
        </span>
      </div>
      <button
        className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
          enabled
            ? 'border-accent text-accent bg-accent/10'
            : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'
        }`}
        onClick={toggle}
      >
        {enabled ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}
