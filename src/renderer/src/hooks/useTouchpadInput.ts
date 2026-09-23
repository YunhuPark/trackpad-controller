/**
 * useTouchpadInput — 터치패드 IPC 이벤트 → 존 트리거
 *
 * 추가 기능:
 * - 제스처 감지: 2손가락 스와이프 → 레이어 전환 / 3손가락 탭 → 메트로놈
 * - X/Y Expression: 존 내부 이동 → Pitch Bend + Modulation
 * - Arpeggiator: 존 누르고 있으면 BPM 동기 반복
 */
import { useEffect, useRef, useCallback } from 'react'
import { ZoneConfig, ZoneLayout, getZoneBounds, getGridDimensions } from '@core/zoneEngine'
import useStore from '../store/useStore'
import type { TouchInputEvent } from '../env'

type TriggerFn = (zone: ZoneConfig, on: boolean, pressure?: number) => Promise<unknown>

function applyCalib(v: number, min: number, max: number): number {
  if (max <= min) return v
  return Math.max(0, Math.min(1, (v - min) / (max - min)))
}

/** 존 내에서의 상대 좌표 계산 (0-1) */
function relativeInZone(
  x: number, y: number,
  zone: ZoneConfig,
  grid: string,
  layout: ZoneLayout
): { rx: number; ry: number } {
  const { rows, cols } = getGridDimensions(grid as '2x2' | '3x3' | '4x4')
  const colWidths = layout.colWidths.length === cols ? layout.colWidths : Array(cols).fill(1 / cols)
  const rowHeights = layout.rowHeights.length === rows ? layout.rowHeights : Array(rows).fill(1 / rows)
  const b = getZoneBounds(zone.row, zone.col, { colWidths, rowHeights })
  const rx = b.w > 0 ? Math.max(0, Math.min(1, (x - b.x) / b.w)) : 0.5
  const ry = b.h > 0 ? Math.max(0, Math.min(1, (y - b.y) / b.h)) : 0.5
  return { rx, ry }
}

/** Expression 전송: pitchbend / mod / aftertouch */
function sendExpression(target: string | undefined, channel: number, value01: number) {
  if (!target || target === 'none') return
  const api = window.electronAPI as any
  if (target === 'pitchbend') {
    const pb = Math.round((value01 - 0.5) * 16383)   // -8191 ~ 8192
    api?.sendMidiPitchBend?.(channel, pb)
  } else if (target === 'mod') {
    api?.sendMidiCC?.(channel, 1, Math.round(value01 * 127))
  } else if (target === 'aftertouch') {
    api?.sendMidiCC?.(channel, 2, Math.round(value01 * 127))
  }
}

export function useTouchpadInput(trigger: TriggerFn) {
  const activePointers = useRef<Map<number, string>>(new Map())

  // ── 제스처 트래킹 ──────────────────────────────────────────────
  const gestureRef = useRef<{
    starts: Map<number, { x: number; y: number; t: number }>
    maxCount: number
  }>({ starts: new Map(), maxCount: 0 })

  // ── Arpeggiator 타이머 ─────────────────────────────────────────
  const arpTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const stopArp = useCallback((zoneId: string) => {
    const t = arpTimers.current.get(zoneId)
    if (t) { clearInterval(t); arpTimers.current.delete(zoneId) }
  }, [])

  const startArp = useCallback((zone: ZoneConfig, pressure: number) => {
    stopArp(zone.id)
    const { bpm } = useStore.getState()
    const rateMap: Record<string, number> = {
      '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125,
    }
    const beats = rateMap[zone.action.arpRate ?? '1/8'] ?? 0.5
    const ms = Math.round((60000 / bpm) * beats)
    let step = 0
    const notes = zone.action.type === 'chord'
      ? (zone.action.chordNotes ?? [zone.action.midiNote ?? 60])
      : [zone.action.midiNote ?? 60]
    const pattern = zone.action.arpPattern ?? 'up'

    const tick = () => {
      const api = window.electronAPI as any
      const ch = zone.action.midiChannel ?? 1
      let noteIdx = 0
      if (pattern === 'up') noteIdx = step % notes.length
      else if (pattern === 'down') noteIdx = notes.length - 1 - (step % notes.length)
      else if (pattern === 'random') noteIdx = Math.floor(Math.random() * notes.length)
      else if (pattern === 'updown') {
        const len = notes.length * 2 - 2
        const pos = step % len
        noteIdx = pos < notes.length ? pos : len - pos
      }
      const note = notes[noteIdx]
      const vel = Math.round((pressure ?? 0.8) * 127)
      api?.sendMidiNote?.(ch, note, vel, true)
      setTimeout(() => api?.sendMidiNote?.(ch, note, 0, false), Math.max(30, ms * 0.4))
      step++
    }

    tick()
    arpTimers.current.set(zone.id, setInterval(tick, ms))
  }, [stopArp])

  useEffect(() => {
    const cleanup = window.electronAPI?.onTouchEvent?.((event: TouchInputEvent) => {
      const { type, id, pressure } = event
      let { x, y } = event

      const store = useStore.getState()
      const { zones, layer, onTouch, onTouchEnd, padCalib, grid, zoneLayouts } = store

      // ── 캘리브레이션 보정 ──────────────────────────────────────
      if (padCalib && event.mode !== 'precision') {
        x = applyCalib(x, padCalib.minX, padCalib.maxX)
        y = applyCalib(y, padCalib.minY, padCalib.maxY)
      }

      // ── 캘리브레이션 수집 모드 ──────────────────────────────────
      const calibState = (window as any).__padCalibState as
        | { step: 0 | 1; p1?: { x: number; y: number } } | undefined

      if (calibState !== undefined && type === 'down') {
        if (calibState.step === 0) {
          (window as any).__padCalibState = { step: 1, p1: { x, y } }
          window.dispatchEvent(new CustomEvent('calib-step', { detail: { step: 1 } }))
        } else if (calibState.step === 1 && calibState.p1) {
          const p1 = calibState.p1
          const newCalib = {
            minX: Math.min(p1.x, x), maxX: Math.max(p1.x, x),
            minY: Math.min(p1.y, y), maxY: Math.max(p1.y, y),
          }
          useStore.getState().setPadCalib(newCalib)
          ;(window as any).__padCalibState = undefined
          window.dispatchEvent(new CustomEvent('calib-done', { detail: newCalib }))
        }
        return
      }

      // ── 제스처 트래킹 ──────────────────────────────────────────
      if (type === 'down') {
        gestureRef.current.starts.set(id, { x, y, t: Date.now() })
        gestureRef.current.maxCount = Math.max(
          gestureRef.current.maxCount,
          gestureRef.current.starts.size
        )
      }

      if (type === 'up') {
        const startInfo = gestureRef.current.starts.get(id)
        gestureRef.current.starts.delete(id)

        // 모든 손가락이 떼어졌을 때 제스처 판단
        if (gestureRef.current.starts.size === 0 && startInfo) {
          const maxCount = gestureRef.current.maxCount
          gestureRef.current.maxCount = 0
          const elapsed = Date.now() - startInfo.t
          const dx = x - startInfo.x
          const dy = y - startInfo.y

          if (maxCount >= 3 && elapsed < 400 && Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) {
            // 3손가락 탭 → 메트로놈 토글
            useStore.getState().toggleMetronome()
            return
          }
          if (maxCount === 2 && Math.abs(dx) > 0.25 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            // 2손가락 수평 스와이프 → 레이어 전환
            const { layer: cur, setLayer } = useStore.getState()
            if (dx > 0 && cur < 4) setLayer((cur + 1) as 1 | 2 | 3 | 4)
            if (dx < 0 && cur > 1) setLayer((cur - 1) as 1 | 2 | 3 | 4)
            return
          }
        }
      }

      // ── 일반 존 매핑 ───────────────────────────────────────────
      if (type === 'down') {
        const zoneId = onTouch(x, y)
        if (!zoneId) return
        activePointers.current.set(id, zoneId)
        const zone = zones[layer]?.find((z) => z.id === zoneId)
        if (!zone) return
        trigger(zone, true, pressure)
        // Arpeggiator 시작
        if (zone.action.arpEnabled) startArp(zone, pressure)

      } else if (type === 'up') {
        const zoneId = activePointers.current.get(id)
        if (!zoneId) return
        activePointers.current.delete(id)
        stopArp(zoneId)
        onTouchEnd(zoneId)
        const zone = zones[layer]?.find((z) => z.id === zoneId)
        if (zone) {
          trigger(zone, false, pressure)
          // Pitch Bend 리셋
          if (zone.action.expressionX === 'pitchbend' || zone.action.expressionY === 'pitchbend') {
            const ch = zone.action.expressionChannel ?? zone.action.midiChannel ?? 1
            ;(window.electronAPI as any)?.sendMidiPitchBend?.(ch, 0)
          }
        }

      } else if (type === 'move') {
        const currentZoneId = activePointers.current.get(id)
        const newZoneId = onTouch(x, y)

        if (newZoneId && newZoneId !== currentZoneId) {
          // 다른 존으로 이동
          if (currentZoneId) {
            stopArp(currentZoneId)
            const oldZone = zones[layer]?.find((z) => z.id === currentZoneId)
            if (oldZone) {
              trigger(oldZone, false, pressure)
              if (oldZone.action.expressionX === 'pitchbend' || oldZone.action.expressionY === 'pitchbend') {
                const ch = oldZone.action.expressionChannel ?? oldZone.action.midiChannel ?? 1
                ;(window.electronAPI as any)?.sendMidiPitchBend?.(ch, 0)
              }
            }
            onTouchEnd(currentZoneId)
          }
          activePointers.current.set(id, newZoneId)
          const newZone = zones[layer]?.find((z) => z.id === newZoneId)
          if (newZone) {
            trigger(newZone, true, pressure)
            if (newZone.action.arpEnabled) startArp(newZone, pressure)
          }

        } else if (currentZoneId && newZoneId === currentZoneId) {
          const zone = zones[layer]?.find((z) => z.id === currentZoneId)
          if (!zone) return

          // CC axis
          if (zone.action.type === 'cc') {
            const axis = zone.action.ccAxis ?? 'x'
            const ccValue = Math.round((axis === 'x' ? x : y) * 127)
            window.electronAPI?.sendMidiCC?.(zone.action.midiCCChannel ?? 1, zone.action.midiCC ?? 1, ccValue)
          }

          // X/Y Expression
          if (zone.action.type === 'midi' && (zone.action.expressionX || zone.action.expressionY)) {
            const layout: ZoneLayout = zoneLayouts[layer] ?? {
              colWidths: Array(parseInt(grid[2])).fill(1 / parseInt(grid[2])),
              rowHeights: Array(parseInt(grid[0])).fill(1 / parseInt(grid[0])),
            }
            const { rx, ry } = relativeInZone(x, y, zone, grid, layout)
            const ch = zone.action.expressionChannel ?? zone.action.midiChannel ?? 1
            sendExpression(zone.action.expressionX, ch, rx)
            sendExpression(zone.action.expressionY, ch, ry)
          }
        }
      }
    })

    return () => {
      cleanup?.()
      arpTimers.current.forEach((t) => clearInterval(t))
      arpTimers.current.clear()
    }
  }, [trigger, startArp, stopArp])
}
