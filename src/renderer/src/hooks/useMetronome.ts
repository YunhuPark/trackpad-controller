/**
 * useMetronome — BPM 기반 메트로놈 훅
 * metronomeOn이 true일 때 BPM에 맞춰 비트 콜백 호출
 */
import { useEffect, useRef } from 'react'

export function useMetronome(bpm: number, enabled: boolean, onBeat: (beat: number) => void) {
  const beatRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!enabled || bpm <= 0) return

    const ms = (60 / bpm) * 1000

    intervalRef.current = setInterval(() => {
      beatRef.current = (beatRef.current % 4) + 1
      onBeat(beatRef.current)
    }, ms)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [bpm, enabled, onBeat])
}
