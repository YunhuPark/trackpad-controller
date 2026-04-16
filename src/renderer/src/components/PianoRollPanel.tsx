/**
 * PianoRollPanel — Session Timeline (Piano Roll Visualization + .mid Export)
 *
 * - Records MIDI note on/off events with timestamps during a session
 * - Renders them as a piano roll (color bars on a pitch-time grid)
 * - Exports to standard .mid file (Format 0, 480 PPQ)
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import useStore from '../store/useStore'

interface NoteEvent {
  note: number
  channel: number
  velocity: number
  startMs: number
  durationMs: number   // 0 if still held
}

// ── MIDI file generator (pure JS, no deps) ───────────────────────
function varLen(value: number): number[] {
  const bytes = [value & 0x7F]
  let v = value >> 7
  while (v > 0) {
    bytes.unshift((v & 0x7F) | 0x80)
    v >>= 7
  }
  return bytes
}

function buildMidiFile(events: NoteEvent[], bpm: number): number[] {
  const tpb = 480  // ticks per beat
  const us = Math.round(60_000_000 / bpm)

  type TickEvent = { tick: number; bytes: number[] }
  const tickEvents: TickEvent[] = []

  // Tempo
  tickEvents.push({
    tick: 0,
    bytes: [0xFF, 0x51, 0x03, (us >> 16) & 0xFF, (us >> 8) & 0xFF, us & 0xFF],
  })

  for (const ev of events) {
    const ch = (ev.channel - 1) & 0x0F
    const startTick = Math.round((ev.startMs / 60000) * bpm * tpb)
    const endTick = startTick + Math.max(1, Math.round((ev.durationMs / 60000) * bpm * tpb))
    tickEvents.push({ tick: startTick, bytes: [0x90 | ch, ev.note & 0x7F, ev.velocity & 0x7F] })
    tickEvents.push({ tick: endTick, bytes: [0x80 | ch, ev.note & 0x7F, 0x00] })
  }

  tickEvents.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0])

  const track: number[] = []
  let prevTick = 0
  for (const ev of tickEvents) {
    const delta = ev.tick - prevTick
    prevTick = ev.tick
    track.push(...varLen(delta), ...ev.bytes)
  }
  track.push(0x00, 0xFF, 0x2F, 0x00)  // End of track

  const tLen = track.length
  return [
    // MThd
    0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,                                          // format 0
    0x00, 0x01,                                          // 1 track
    (tpb >> 8) & 0xFF, tpb & 0xFF,
    // MTrk
    0x4D, 0x54, 0x72, 0x6B,
    (tLen >> 24) & 0xFF, (tLen >> 16) & 0xFF, (tLen >> 8) & 0xFF, tLen & 0xFF,
    ...track,
  ]
}

// ── Component ─────────────────────────────────────────────────────
interface Props {
  onClose: () => void
}

const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

export default function PianoRollPanel({ onClose }: Props) {
  const { bpm, locale } = useStore()
  const [events, setEvents] = useState<NoteEvent[]>([])
  const [recording, setRecording] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')

  // Pending note-ons (note+channel → startMs + velocity)
  const pending = useRef<Map<string, { startMs: number; velocity: number }>>(new Map())
  const startTime = useRef<number>(0)

  // ── Record: intercept zone-triggered IPC events ──────────────
  useEffect(() => {
    if (!recording) return

    // Listen to zone-triggered messages from main (forwarded via custom event)
    const onZoneMidi = (e: CustomEvent) => {
      const { note, channel, velocity, on } = e.detail as {
        note: number; channel: number; velocity: number; on: boolean
      }
      const key = `${channel}-${note}`
      const nowMs = Date.now() - startTime.current

      if (on) {
        pending.current.set(key, { startMs: nowMs, velocity })
      } else {
        const p = pending.current.get(key)
        if (p) {
          pending.current.delete(key)
          setEvents((prev) => [...prev, {
            note, channel, velocity: p.velocity,
            startMs: p.startMs,
            durationMs: Math.max(10, nowMs - p.startMs),
          }])
        }
      }
    }

    window.addEventListener('piano-roll-midi', onZoneMidi as EventListener)
    return () => window.removeEventListener('piano-roll-midi', onZoneMidi as EventListener)
  }, [recording])

  const startRec = useCallback(() => {
    startTime.current = Date.now()
    pending.current.clear()
    setEvents([])
    setRecording(true)
    setStatus('')
  }, [])

  const stopRec = useCallback(() => {
    // Finalize any held notes
    const nowMs = Date.now() - startTime.current
    setEvents((prev) => {
      const extra: NoteEvent[] = []
      pending.current.forEach(({ startMs, velocity }, key) => {
        const [ch, note] = key.split('-').map(Number)
        extra.push({ note, channel: ch, velocity, startMs, durationMs: Math.max(10, nowMs - startMs) })
      })
      pending.current.clear()
      return [...prev, ...extra]
    })
    setRecording(false)
  }, [])

  const exportMidi = useCallback(async () => {
    if (events.length === 0) { setStatus(locale === 'ko' ? '녹음된 이벤트 없음' : 'No events recorded'); return }
    setExporting(true)
    const bytes = buildMidiFile(events, bpm)
    const result = await window.electronAPI?.exportMidi?.(bytes)
    setExporting(false)
    if (result?.ok) setStatus(locale === 'ko' ? '✓ 내보내기 완료' : '✓ Exported')
    else if (result?.canceled) setStatus('')
    else setStatus(result?.error ?? 'Error')
  }, [events, bpm, locale])

  const clearEvents = useCallback(() => {
    setEvents([])
    setStatus('')
    pending.current.clear()
  }, [])

  // ── Piano roll render ─────────────────────────────────────────
  const totalMs = events.reduce((m, e) => Math.max(m, e.startMs + e.durationMs), 1000)
  const minNote = Math.max(0, Math.min(...events.map((e) => e.note), 60) - 2)
  const maxNote = Math.min(127, Math.max(...events.map((e) => e.note), 72) + 2)
  const noteRange = maxNote - minNote + 1
  const rollH = Math.max(120, noteRange * 6)

  const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(n % 12)

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="glass-panel p-5 flex flex-col gap-4 shadow-accent-glow"
        style={{ width: 640, maxHeight: '80vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-text-primary font-semibold">
            {locale === 'ko' ? '🎹 세션 타임라인' : '🎹 Session Timeline'}
          </h2>
          <button className="text-text-secondary hover:text-text-primary text-lg" onClick={onClose}>✕</button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              recording
                ? 'border-red-400 text-red-400 animate-pulse'
                : 'border-zone-border text-text-secondary hover:border-red-400 hover:text-red-400'
            }`}
            onClick={recording ? stopRec : startRec}
          >
            {recording ? (locale === 'ko' ? '■ 녹음 중지' : '■ Stop') : (locale === 'ko' ? '⏺ 녹음 시작' : '⏺ Record')}
          </button>

          <button
            className="px-3 py-1.5 rounded-lg text-xs font-mono border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all disabled:opacity-40"
            onClick={exportMidi}
            disabled={exporting || events.length === 0}
          >
            {exporting ? '...' : (locale === 'ko' ? '⬇ .mid 내보내기' : '⬇ Export .mid')}
          </button>

          {events.length > 0 && (
            <button className="px-3 py-1.5 rounded-lg text-xs font-mono border border-zone-border text-text-secondary hover:border-red-400 hover:text-red-400 transition-all"
              onClick={clearEvents}>
              {locale === 'ko' ? '초기화' : 'Clear'}
            </button>
          )}

          <span className="text-[10px] font-mono text-text-secondary ml-auto">
            {events.length} {locale === 'ko' ? '노트' : 'notes'} · BPM {bpm}
          </span>
          {status && <span className="text-[10px] font-mono text-accent">{status}</span>}
        </div>

        {/* Piano Roll */}
        {events.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-text-secondary text-sm">
            {recording
              ? (locale === 'ko' ? '⏺ 녹음 중 — 존을 터치하세요' : '⏺ Recording — touch zones now')
              : (locale === 'ko' ? '녹음 버튼을 눌러 MIDI 이벤트를 캡처하세요' : 'Press Record to capture MIDI events')}
          </div>
        ) : (
          <div className="relative overflow-x-auto overflow-y-hidden border border-zone-border rounded-lg"
            style={{ height: rollH + 20 }}>
            <svg width="100%" height={rollH + 20} style={{ minWidth: 400 }}
              viewBox={`0 0 ${Math.max(400, totalMs / 10)} ${rollH + 20}`}
              preserveAspectRatio="none">
              {/* Piano key lanes */}
              {Array.from({ length: noteRange }, (_, i) => {
                const note = maxNote - i
                const y = i * (rollH / noteRange)
                const h = rollH / noteRange
                return (
                  <g key={note}>
                    <rect x={0} y={y} width="100%" height={h}
                      fill={isBlack(note) ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.03)'}
                    />
                    {note % 12 === 0 && (
                      <text x={4} y={y + h * 0.75} fontSize={Math.max(5, h * 0.7)}
                        fill="rgba(255,255,255,0.25)" fontFamily="monospace">
                        {NOTE_NAMES_SHARP[note % 12]}{Math.floor(note / 12) - 1}
                      </text>
                    )}
                  </g>
                )
              })}
              {/* Note bars */}
              {events.map((ev, idx) => {
                const x = (ev.startMs / totalMs) * Math.max(400, totalMs / 10)
                const w = Math.max(2, (ev.durationMs / totalMs) * Math.max(400, totalMs / 10))
                const row = maxNote - ev.note
                const y = row * (rollH / noteRange) + 1
                const h = rollH / noteRange - 2
                const alpha = 0.4 + (ev.velocity / 127) * 0.6
                return (
                  <rect key={idx} x={x} y={y} width={w} height={h}
                    rx={2}
                    fill={`rgba(var(--color-accent), ${alpha})`}
                    stroke="rgba(var(--color-accent), 0.8)"
                    strokeWidth={0.5}
                  />
                )
              })}
            </svg>
          </div>
        )}

        {/* Note list (compact) */}
        {events.length > 0 && (
          <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto text-[10px] font-mono text-text-secondary">
            {events.slice(-20).reverse().map((ev, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-text-secondary/50">{(ev.startMs / 1000).toFixed(2)}s</span>
                <span>{NOTE_NAMES_SHARP[ev.note % 12]}{Math.floor(ev.note / 12) - 1}</span>
                <span className="text-text-secondary/50">ch{ev.channel}</span>
                <span className="text-text-secondary/50">vel{ev.velocity}</span>
                <span className="text-text-secondary/50">{ev.durationMs}ms</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
