import useStore from '../store/useStore'
import { t } from '../i18n'

export default function StatusBar() {
  const { touchpadMode, midiPort, bpm, quantize, locale } = useStore()

  const padStatus =
    touchpadMode === 'precision'
      ? { label: t(locale, 'precisionTP'), color: 'text-zone-active' }
      : touchpadMode === 'legacy'
      ? { label: t(locale, 'legacyHID'), color: 'text-yellow-400' }
      : { label: t(locale, 'noTouchpad'), color: 'text-red-400' }

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t border-zone-border bg-bg-secondary">
      {/* Device */}
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${
          touchpadMode !== 'none' ? 'bg-zone-active' : 'bg-zone-border'
        }`} />
        <span className={`text-xs font-mono ${padStatus.color}`}>
          {padStatus.label}
        </span>
      </div>

      <span className="text-zone-border">|</span>

      {/* MIDI */}
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${midiPort ? 'bg-zone-active' : 'bg-zone-border'}`} />
        <span className="text-xs font-mono text-text-secondary">
          {t(locale, 'midiOut')}: {midiPort || 'N/A'}
        </span>
      </div>

      <span className="text-zone-border">|</span>

      {/* BPM */}
      <span className="text-xs font-mono text-text-secondary">
        {bpm} BPM
      </span>

      <span className="text-zone-border">|</span>

      {/* Quantize */}
      <span className="text-xs font-mono text-text-secondary">
        Q: {quantize === 'off' ? t(locale, 'off') : quantize}
      </span>

      {/* Version */}
      <span className="ml-auto text-xs font-mono text-zone-border">v0.1.0</span>
    </div>
  )
}
