/**
 * useNoteRepeat — 노트 리피트 훅
 * 존을 누르고 있는 동안 BPM에 맞춰 MIDI Note를 반복 트리거
 * noteRepeat: 'off' | '1/8' | '1/16'
 */
import { useRef, useCallback } from 'react'
import { ZoneConfig } from '@core/zoneEngine'
import { QuantizeMode } from '../store/useStore'

type TriggerFn = (zone: ZoneConfig, on: boolean, pressure?: number) => Promise<unknown>

export function useNoteRepeat(bpm: number, noteRepeat: QuantizeMode) {
  const repeatTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const startRepeat = useCallback((zone: ZoneConfig, trigger: TriggerFn) => {
    if (noteRepeat === 'off') return
    if (repeatTimers.current.has(zone.id)) return

    // 비트 간격 계산 (ms)
    const beatsPerMs = bpm / 60000
    const divisionMap: Record<QuantizeMode, number> = {
      'off': 0,
      '1/8': 0.5,    // 8분음표 = 0.5 박
      '1/16': 0.25,  // 16분음표 = 0.25 박
    }
    const division = divisionMap[noteRepeat]
    const intervalMs = division / beatsPerMs

    const timer = setInterval(async () => {
      await trigger(zone, false)
      await new Promise(r => setTimeout(r, 20)) // 짧은 Note Off 딜레이
      await trigger(zone, true)
    }, intervalMs)

    repeatTimers.current.set(zone.id, timer)
  }, [bpm, noteRepeat])

  const stopRepeat = useCallback((zoneId: string) => {
    const timer = repeatTimers.current.get(zoneId)
    if (timer) {
      clearInterval(timer)
      repeatTimers.current.delete(zoneId)
    }
  }, [])

  const stopAll = useCallback(() => {
    repeatTimers.current.forEach((timer) => clearInterval(timer))
    repeatTimers.current.clear()
  }, [])

  return { startRepeat, stopRepeat, stopAll }
}
