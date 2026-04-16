/**
 * useLoopRecorder — BPM 동기 MIDI 루프 녹음/재생
 *
 * - Recording: 존 트리거 이벤트를 타임스탬프와 함께 기록
 * - Quantize: BPM 그리드에 맞게 타임스탬프 반올림
 * - Playback: setInterval로 루프 길이 내 이벤트를 정확한 시간에 재생
 */
import { useRef, useEffect, useCallback } from 'react'
import useStore from '../store/useStore'

export interface LoopEvent {
  zoneId: string
  on: boolean
  t: number       // ms from loop start
  pressure: number
}

type TriggerFn = (zoneId: string, on: boolean, pressure: number) => void

export function useLoopRecorder(onReplay: TriggerFn) {
  const recordStart = useRef<number | null>(null)
  const playTimer  = useRef<ReturnType<typeof setInterval> | null>(null)
  const playStart  = useRef<number>(0)

  const stopPlayback = useCallback(() => {
    if (playTimer.current) { clearInterval(playTimer.current); playTimer.current = null }
  }, [])

  // 루프 길이 ms 계산
  const loopMs = useCallback(() => {
    const { bpm, loopLength } = useStore.getState()
    return Math.round((60000 / bpm) * 4 * loopLength)
  }, [])

  // 이벤트 양자화
  const quantize = useCallback((t: number, gridMs: number) => {
    return Math.round(t / gridMs) * gridMs
  }, [])

  const startRecording = useCallback(() => {
    stopPlayback()
    recordStart.current = Date.now()
    // 오버더빙 모드: 기존 이벤트 유지, 일반 모드: 초기화
    if (!useStore.getState().loopOverdub) {
      useStore.getState().setLoopEvents([])
    }
    useStore.getState().setLoopState('recording')
  }, [stopPlayback])

  const stopRecording = useCallback(() => {
    recordStart.current = null
    const { bpm } = useStore.getState()
    const gridMs = Math.round(60000 / bpm / 4)   // 1/16 grid
    // 양자화 적용
    const evs = useStore.getState().loopEvents.map((ev) => ({
      ...ev,
      t: quantize(ev.t, gridMs),
    }))
    useStore.getState().setLoopEvents(evs)
    useStore.getState().setLoopState('idle')
  }, [quantize])

  const startPlayback = useCallback(() => {
    stopPlayback()
    useStore.getState().setLoopState('playing')
    const lms = loopMs()
    playStart.current = Date.now()
    let prevElapsed = 0

    playTimer.current = setInterval(() => {
      const elapsed = (Date.now() - playStart.current) % lms
      const evs = useStore.getState().loopEvents
      // 구간 방식: [prevElapsed, elapsed) 사이 이벤트만 실행 → 중복 발동 없음
      for (const ev of evs) {
        if (elapsed >= prevElapsed) {
          // 일반 구간
          if (ev.t >= prevElapsed && ev.t < elapsed) {
            onReplay(ev.zoneId, ev.on, ev.pressure)
          }
        } else {
          // 루프 경계 넘어감 (wrap-around)
          if (ev.t >= prevElapsed || ev.t < elapsed) {
            onReplay(ev.zoneId, ev.on, ev.pressure)
          }
        }
      }
      prevElapsed = elapsed
    }, 8)
  }, [stopPlayback, loopMs, onReplay])

  const stopAll = useCallback(() => {
    stopPlayback()
    recordStart.current = null
    useStore.getState().setLoopState('idle')
  }, [stopPlayback])

  // 녹음 중 이벤트 추가
  const recordEvent = useCallback((zoneId: string, on: boolean, pressure: number) => {
    const { loopState } = useStore.getState()
    if (loopState !== 'recording' || recordStart.current === null) return
    const t = Date.now() - recordStart.current
    const lms = loopMs()
    if (t > lms) { stopRecording(); startPlayback(); return }   // 루프 길이 초과 → 자동 재생
    useStore.getState().setLoopEvents([
      ...useStore.getState().loopEvents,
      { zoneId, on, t, pressure },
    ])
  }, [loopMs, stopRecording, startPlayback])

  useEffect(() => () => { stopPlayback() }, [stopPlayback])

  return { startRecording, stopRecording, startPlayback, stopAll, recordEvent }
}
