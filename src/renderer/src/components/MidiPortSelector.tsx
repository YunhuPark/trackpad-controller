/**
 * MidiPortSelector — MIDI 출력 포트 선택 패널
 */
import { useEffect, useState } from 'react'
import useStore from '../store/useStore'
import { t } from '../i18n'

export default function MidiPortSelector() {
  const { midiPort, setMidiPort, locale } = useStore()
  const [ports, setPorts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const fetchPorts = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI?.getMidiPorts()
      setPorts(result ?? [])
      return result ?? []
    } catch (_) {
      setPorts([])
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 앱 시작 시 저장된 포트 자동 연결
    const autoConnect = async () => {
      const portList = await fetchPorts()
      const savedPort = midiPort
      if (savedPort) {
        const idx = portList.findIndex((name) => name === savedPort)
        if (idx !== -1) {
          await window.electronAPI?.openMidiPort(idx)
          console.log(`[MIDI] Auto-connected: ${savedPort}`)
        }
      }
    }
    autoConnect()

    const cleanup = window.electronAPI?.onMidiPortChanged?.((name) => {
      setMidiPort(name)
    })
    return cleanup
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectPort = async (idx: number, name: string) => {
    const result = await window.electronAPI?.openMidiPort(idx)
    if (result && !('error' in result)) setMidiPort(name)
  }

  const handleVirtual = async () => {
    const result = await window.electronAPI?.openMidiVirtual()
    if (result && !('error' in result)) setMidiPort('TrackPad Controller (Virtual)')
  }

  return (
    <div className="glass-panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label-tag">{t(locale, 'midiOut')}</span>
        <button
          className="text-[10px] text-text-secondary hover:text-accent underline"
          onClick={fetchPorts}
        >
          {loading ? '...' : t(locale, 'refresh')}
        </button>
      </div>

      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
        {ports.length === 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-text-secondary font-mono">{t(locale, 'noPortsFound')}</span>
            {typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent) && (
              <div className="p-2.5 rounded-lg bg-bg-primary border border-zone-border flex flex-col gap-1">
                <span className="text-xs font-semibold text-accent">{t(locale, 'loopMidiGuide')}</span>
                <span className="text-[10px] text-text-secondary leading-relaxed">{t(locale, 'loopMidiGuideDesc')}</span>
              </div>
            )}
            {typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent) && (
              <div className="p-2.5 rounded-lg bg-bg-primary border border-zone-border flex flex-col gap-1">
                <span className="text-xs font-semibold text-accent">{t(locale, 'iacDriverGuide')}</span>
                <span className="text-[10px] text-text-secondary leading-relaxed">{t(locale, 'iacDriverGuideDesc')}</span>
              </div>
            )}
          </div>
        )}
        {ports.map((name, idx) => (
          <button
            key={idx}
            className={`text-left px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              midiPort === name
                ? 'border-accent text-accent'
                : 'border-zone-border text-text-secondary hover:border-accent hover:text-text-primary'
            }`}
            style={midiPort === name ? { backgroundColor: 'rgb(var(--color-accent) / 0.15)' } : {}}
            onClick={() => handleSelectPort(idx, name)}
          >
            {midiPort === name && '● '}{name}
          </button>
        ))}
      </div>

      <button
        className="control-btn w-full text-xs"
        onClick={handleVirtual}
      >
        {t(locale, 'openVirtualPort')}
      </button>
    </div>
  )
}
