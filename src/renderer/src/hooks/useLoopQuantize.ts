/**
 * useLoopQuantize — 루프 퀀타이즈 훅
 * MIDI Note On 타이밍을 BPM 그리드에 스냅
 * Note On 이벤트를 다음 퀀타이즈 그리드 경계에 맞춰 지연시킴
 */
import { useRef, useCallback } from 'react'
import { QuantizeMode } from '../store/useStore'

export function useLoopQuantize(bpm: number, quantize: QuantizeMode) {
  const startTimeRef = useRef<number>(Date.now())

  // 앱 시작 시간 기준 비트 위치 계산
  const getNextGridTime = useCallback((now: number): number => {
    if (quantize === 'off') return now

    const beatsPerMs = bpm / 60000
    const divisionMap: Record<QuantizeMode, number> = {
      'off': 1,
      '1/8': 0.5,
      '1/16': 0.25,
    }
    const division = divisionMap[quantize]
    const gridMs = division / beatsPerMs

    const elapsed = now - startTimeRef.current
    const gridCount = Math.floor(elapsed / gridMs)
    const nextGrid = startTimeRef.current + (gridCount + 1) * gridMs

    // 그리드 경계가 현재 시간과 너무 가까우면 다음 그리드로
    const delay = nextGrid - now
    return delay < 10 ? nextGrid + gridMs : nextGrid
  }, [bpm, quantize])

  /**
   * 퀀타이즈된 타이밍에 콜백 실행
   * quantize가 'off'이면 즉시 실행
   */
  const scheduleQuantized = useCallback((fn: () => void) => {
    if (quantize === 'off') {
      fn()
      return
    }
    const now = Date.now()
    const fireAt = getNextGridTime(now)
    const delay = Math.max(0, fireAt - now)
    setTimeout(fn, delay)
  }, [quantize, getNextGridTime])

  return { scheduleQuantized }
}
