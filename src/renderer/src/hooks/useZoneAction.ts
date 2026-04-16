/**
 * useZoneAction — 존 터치 시 MIDI/키보드/OSC/플러그인 액션을 트리거하는 훅
 * 압력 커브를 적용해 velocity를 동적으로 산출
 */
import { useCallback, useRef } from 'react'
import { ZoneConfig } from '@core/zoneEngine'
import { applyPressureCurve, DEFAULT_CURVE } from '@core/pressureCurve'
import useStore from '../store/useStore'

export interface TriggerResult {
  ok: boolean
  error?: string
}

function toResult(r: { ok?: boolean; error?: string } | undefined): TriggerResult {
  return { ok: r?.ok ?? false, error: r?.error }
}

export function useZoneAction() {
  const activeNotes = useRef<Map<string, { channel: number; note: number }>>(new Map())

  /**
   * @param zone  대상 존
   * @param on    true = Note On / false = Note Off
   * @param pressure 0~1 터치 압력 (없으면 존 설정 velocity 사용)
   */
  const trigger = useCallback(async (
    zone: ZoneConfig,
    on: boolean,
    pressure?: number
  ): Promise<TriggerResult> => {
    const api = window.electronAPI
    if (!api) return { ok: false, error: 'No ElectronAPI' }

    // zone-triggered 알림
    api.zoneTriggered?.(zone.id, zone.action, on)

    // OSC zone 메시지 (액션 타입에 관계 없이 항상 전송)
    api.sendOscZone?.(zone.id, on, pressure ?? 1.0)

    switch (zone.action.type) {
      case 'midi': {
        const channel = zone.action.midiChannel ?? 1
        const note = zone.action.midiNote ?? 60

        // 압력 → velocity 계산 (커브 적용 + 범위 매핑)
        const curve = useStore.getState().pressureCurve ?? DEFAULT_CURVE
        const velMin = zone.action.midiVelocityMin ?? 1
        const velMax = zone.action.midiVelocityMax ?? 127
        const velocity = pressure !== undefined
          ? Math.max(1, Math.min(127, Math.round(
              velMin + applyPressureCurve(pressure, curve) * (velMax - velMin)
            )))
          : (zone.action.midiVelocity ?? velMax)

        if (on) {
          activeNotes.current.set(zone.id, { channel, note })
          // MIDI + OSC note 동시 전송
          api.sendOscNote?.(channel, note, velocity, true)
          window.dispatchEvent(new CustomEvent('piano-roll-midi', { detail: { note, channel, velocity, on: true } }))
          return toResult(await api.sendMidiNote(channel, note, velocity, true))
        } else {
          const active = activeNotes.current.get(zone.id)
          if (active) {
            activeNotes.current.delete(zone.id)
            api.sendOscNote?.(active.channel, active.note, 0, false)
            window.dispatchEvent(new CustomEvent('piano-roll-midi', { detail: { note: active.note, channel: active.channel, velocity: 0, on: false } }))
            return toResult(await api.sendMidiNote(active.channel, active.note, 0, false))
          }
        }
        break
      }

      case 'keyboard': {
        if (!on) break
        // 시퀀스 모드: keySequence가 있으면 딜레이 시퀀스 실행
        if (zone.action.keySequence && zone.action.keySequence.length > 0) {
          return toResult(await api.sendKeyboardSequence?.(zone.action.keySequence))
        }
        // 단일 키 조합
        if (zone.action.keys && zone.action.keys.length > 0) {
          return toResult(await api.sendKeyboard?.(zone.action.keys))
        }
        break
      }

      case 'media': {
        if (on && zone.action.mediaAction) {
          return toResult(await api.sendMediaKey?.(zone.action.mediaAction))
        }
        break
      }

      case 'osc': {
        if (!zone.action.oscAddress) break
        // 커스텀 OSC: 존에 설정된 주소 + 인자 전송
        const oscArgs: Array<{ type: 'i' | 'f'; value: number }> = zone.action.oscArgs ?? [
          { type: 'i', value: on ? 1 : 0 },
          { type: 'f', value: pressure ?? 1.0 },
        ]
        return toResult(await api.sendOscCustom?.(zone.action.oscAddress, oscArgs))
      }

      case 'plugin': {
        if (on && zone.action.pluginFile && zone.action.pluginActionId) {
          const curve = useStore.getState().pressureCurve ?? DEFAULT_CURVE
          const velocity = pressure !== undefined
            ? Math.max(1, Math.round(applyPressureCurve(pressure, curve) * 127))
            : 100
          const payload = {
            zoneId: zone.id,
            pressure: pressure ?? 1.0,
            velocity,
            layer: useStore.getState().layer,
          }
          return toResult(
            await api.executePlugin?.(zone.action.pluginFile, zone.action.pluginActionId, payload)
          )
        }
        break
      }

      case 'script': {
        if (on && zone.action.script) {
          return toResult(await api.executeScript?.(zone.action.script))
        }
        break
      }

      case 'chord': {
        const channel = zone.action.chordChannel ?? zone.action.midiChannel ?? 1
        const notes = zone.action.chordNotes ?? [60, 64, 67]
        const curve = useStore.getState().pressureCurve ?? DEFAULT_CURVE
        const velMin = zone.action.midiVelocityMin ?? 1
        const velMax = zone.action.midiVelocityMax ?? 127
        const velocity = pressure !== undefined
          ? Math.max(1, Math.min(127, Math.round(velMin + applyPressureCurve(pressure, curve) * (velMax - velMin))))
          : velMax
        if (on) {
          activeNotes.current.set(zone.id, { channel, note: notes[0] })
          for (const note of notes) {
            api.sendOscNote?.(channel, note, velocity, true)
            api.sendMidiNote(channel, note, velocity, true)
            window.dispatchEvent(new CustomEvent('piano-roll-midi', { detail: { note, channel, velocity, on: true } }))
          }
        } else {
          for (const note of notes) {
            api.sendOscNote?.(channel, note, 0, false)
            api.sendMidiNote(channel, note, 0, false)
            window.dispatchEvent(new CustomEvent('piano-roll-midi', { detail: { note, channel, velocity: 0, on: false } }))
          }
          activeNotes.current.delete(zone.id)
        }
        break
      }

      case 'webhook': {
        if (!zone.action.webhookUrl) break
        try {
          const body = (zone.action.webhookBody ?? '')
            .replace('{{on}}', String(on))
            .replace('{{zone}}', zone.id)
            .replace('{{pressure}}', String(pressure ?? 1))
          const init: RequestInit = {
            method: zone.action.webhookMethod ?? 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
          if (init.method !== 'GET' && body) init.body = body
          fetch(zone.action.webhookUrl, init).catch(() => {})
        } catch (_) {}
        break
      }

      case 'cc': {
        // CC 값은 move 이벤트(useTouchpadInput)에서 처리; 여기선 무시
        break
      }

      case 'none':
      default:
        break
    }

    return { ok: true }
  }, [])

  return { trigger }
}
