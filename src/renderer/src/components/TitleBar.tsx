import { useEffect, useState } from 'react'
import useStore from '../store/useStore'

interface TitleBarProps {
  onSettings: () => void
  onTimeline: () => void
}

function ShortcutModal({ onClose, locale }: { onClose: () => void; locale: string }) {
  const isKo = locale === 'ko'
  const shortcuts = [
    { keys: 'Alt + 0',    desc: isKo ? '앱 표시 / 숨기기' : 'Show / Hide app' },
    { keys: 'Alt + 1~4', desc: isKo ? '레이어 1~4 전환' : 'Switch Layer 1–4' },
    { keys: 'Esc',       desc: isKo ? '캘리브레이션 취소' : 'Cancel calibration' },
    { keys: isKo ? '더블클릭 / 우클릭' : 'Dbl-click / R-click', desc: isKo ? '존 편집' : 'Edit zone' },
    { keys: 'TAP',       desc: isKo ? 'TAP 버튼으로 BPM 설정' : 'Set BPM via TAP button' },
  ]
  const features = [
    { icon: '🎹', name: isKo ? '피아노 MIDI' : 'Piano MIDI', desc: isKo ? '존 더블클릭 → 액션: MIDI → 악기: Piano' : 'Dbl-click zone → Action: MIDI → Instrument: Piano' },
    { icon: '🥁', name: isKo ? '드럼 MIDI' : 'Drum MIDI',   desc: isKo ? '헤더 🥁 드럼 버튼으로 전체 존 드럼 배치 적용' : 'Click 🥁 Drum in header to apply GM drum layout' },
    { icon: '🎛', name: isKo ? '1:1 ABS 모드' : '1:1 ABS Mode', desc: isKo ? 'ABS 토글 ON → 터치패드 직접 1:1 매핑' : 'Toggle ABS ON → Direct 1:1 touchpad mapping' },
    { icon: '📐', name: isKo ? '캘리브레이션' : 'Calibration', desc: isKo ? '헤더 캘리브레이션 버튼 → 좌상단, 우하단 탭' : 'Header Calibration → Tap top-left, bottom-right' },
    { icon: '🔀', name: isKo ? '레이아웃 편집' : 'Layout Edit', desc: isKo ? '레이아웃 버튼 → 존 경계선 드래그로 크기 조절' : 'Layout button → Drag dividers to resize zones' },
    { icon: '🎚', name: 'MIDI CC',  desc: isKo ? '존 액션: CC → X/Y축이 CC 값으로 전송' : 'Zone action: CC → X/Y axis sends CC value' },
    { icon: '🔊', name: isKo ? '오버레이' : 'Overlay',      desc: isKo ? '타이틀바 ⊞ → 앱 항상 위 + 소형화' : 'Titlebar ⊞ → Always-on-top + compact' },
  ]
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="glass-panel p-5 w-[440px] max-h-[80vh] overflow-y-auto flex flex-col gap-4 shadow-accent-glow">
        <div className="flex items-center justify-between">
          <h2 className="text-text-primary font-semibold text-sm">{isKo ? '단축키 & 기능 안내' : 'Shortcuts & Features'}</h2>
          <button className="text-text-secondary hover:text-text-primary text-lg" onClick={onClose}>✕</button>
        </div>

        {/* 단축키 */}
        <div className="flex flex-col gap-1">
          <span className="label-tag">{isKo ? '키보드 단축키' : 'Keyboard Shortcuts'}</span>
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1 border-b border-zone-border/30">
              <kbd className="px-2 py-0.5 rounded bg-bg-primary border border-zone-border text-[10px] font-mono text-accent">{s.keys}</kbd>
              <span className="text-xs text-text-secondary">{s.desc}</span>
            </div>
          ))}
        </div>

        {/* 기능 목록 */}
        <div className="flex flex-col gap-1">
          <span className="label-tag">{isKo ? '기능 목록' : 'Features'}</span>
          {features.map((f) => (
            <div key={f.name} className="flex gap-2 items-start py-1 border-b border-zone-border/30">
              <span className="text-base leading-none mt-0.5">{f.icon}</span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-text-primary">{f.name}</span>
                <span className="text-[10px] text-text-secondary">{f.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 새 기능 */}
        <div className="flex flex-col gap-1 border-t border-zone-border/30 pt-2">
          <span className="label-tag">{isKo ? '고급 기능' : 'Advanced Features'}</span>
          {[
            { icon: '↔', name: isKo ? '제스처 레이어 전환' : 'Gesture Layer Switch', desc: isKo ? '2손가락 스와이프 → 레이어 전환, 3손가락 탭 → 메트로놈' : '2-finger swipe → layer, 3-finger tap → metronome' },
            { icon: '♩', name: isKo ? '스케일 락' : 'Scale Lock', desc: isKo ? '존 헤더 스케일 버튼 → 모든 존 노트 자동 배치' : 'Scale button in header → auto-assign scale notes to zones' },
            { icon: '✨', name: 'X/Y Expression', desc: isKo ? '존 편집 → X/Y Expression → 핑거 위치로 Pitch/Mod 제어' : 'Zone edit → X/Y Expression → finger position controls pitch/mod' },
            { icon: '🎶', name: 'Arpeggiator', desc: isKo ? '존 편집 → Arpeggiator ON → BPM 동기 노트 반복' : 'Zone edit → Arpeggiator ON → BPM-synced note repeat' },
            { icon: '♫', name: isKo ? '코드 (Chord)' : 'Chord', desc: isKo ? '존 액션: Chord → 동시 여러 노트 전송' : 'Zone action: Chord → send multiple notes simultaneously' },
            { icon: '⏺', name: isKo ? '루프 레코더' : 'Loop Recorder', desc: isKo ? '존 헤더 ⏺ 버튼 → BPM 동기 MIDI 루프 녹음/재생' : 'Header ⏺ → BPM-quantized MIDI loop record/playback' },
            { icon: '🎛', name: 'MIDI Learn', desc: isKo ? '존 편집 → MIDI Learn → 외부 MIDI 입력으로 자동 매핑' : 'Zone edit → MIDI Learn → auto-map from external MIDI' },
            { icon: '🎹', name: isKo ? '세션 타임라인' : 'Session Timeline', desc: isKo ? '타이틀바 🎹 → 피아노 롤 시각화 + .mid 내보내기' : 'Titlebar 🎹 → Piano roll visualization + .mid export' },
          ].map((f) => (
            <div key={f.name} className="flex gap-2 items-start py-1 border-b border-zone-border/20">
              <span className="text-sm leading-none mt-0.5 w-5 text-center">{f.icon}</span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-text-primary">{f.name}</span>
                <span className="text-[10px] text-text-secondary">{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function TitleBar({ onSettings, onTimeline }: TitleBarProps) {
  const { theme, setTheme, locale, setLocale, overlayMode, setOverlayMode } = useStore()
  const [helpOpen, setHelpOpen] = useState(false)
  const [overlayActive, setOverlayActive] = useState(overlayMode)

  useEffect(() => {
    const cleanup = window.electronAPI?.onOverlayState?.((active) => {
      setOverlayActive(active)
      setOverlayMode(active)
    })
    return cleanup
  }, [setOverlayMode])

  const handleOverlay = async () => {
    const result = await window.electronAPI?.toggleOverlay?.()
    if (result) setOverlayActive(result.overlay)
  }

  const minimize = () => window.electronAPI?.minimize()
  const maximize = () => window.electronAPI?.maximize()
  const close = () => window.electronAPI?.close()

  return (
    <div className="titlebar-drag flex items-center justify-between h-11 px-4 border-b border-zone-border bg-bg-secondary">
      <div className="flex items-center gap-4 titlebar-no-drag px-2">
        {/* Window controls (Windows style) */}
        <button
          className="text-text-secondary hover:text-text-primary transition-colors text-xs font-bold px-1"
          onClick={minimize}
          title={locale === 'ko' ? '최소화' : 'Minimize'}
        >
          ─
        </button>
        <button
          className="text-text-secondary hover:text-text-primary transition-colors text-xs font-bold px-1"
          onClick={maximize}
          title={locale === 'ko' ? '최대화 / 원래크기' : 'Maximize / Restore'}
        >
          ☐
        </button>
        <button
          className="text-text-secondary hover:text-red-500 transition-colors text-sm font-bold px-1"
          onClick={close}
          title={locale === 'ko' ? '닫기' : 'Close'}
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        <span className="text-text-primary text-sm font-semibold tracking-wide">
          TrackPad Controller
        </span>
      </div>

      {/* Theme + Locale + Overlay toggles */}
      <div className="flex items-center gap-2 titlebar-no-drag">
        {/* Locale toggle */}
        <button
          className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all"
          onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
          title={locale === 'ko' ? 'Switch to English' : '한국어로 전환'}
        >
          {locale === 'ko' ? 'EN' : 'KO'}
        </button>

        {/* Theme toggle */}
        <button
          className="px-2 py-0.5 rounded text-[10px] font-mono border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>

          {/* Help */}
        <button
          className="px-2 py-0.5 rounded text-[10px] font-mono border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all"
          onClick={() => setHelpOpen(true)}
          title={locale === 'ko' ? '단축키 & 기능 안내' : 'Shortcuts & Features'}
        >
          ?
        </button>

        {/* Timeline */}
        <button
          className="px-2 py-0.5 rounded text-[10px] font-mono border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all"
          onClick={onTimeline}
          title={locale === 'ko' ? '세션 타임라인 (피아노 롤)' : 'Session Timeline (Piano Roll)'}
        >
          🎹
        </button>

        {/* Settings */}
        <button
          className="px-2 py-0.5 rounded text-[10px] font-mono border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all"
          onClick={onSettings}
          title={locale === 'ko' ? '설정' : 'Settings'}
        >
          ⚙
        </button>

        {helpOpen && <ShortcutModal onClose={() => setHelpOpen(false)} locale={locale} />}

        {/* Overlay toggle */}
        <button
          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
            overlayActive
              ? 'border-zone-active text-zone-active'
              : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'
          }`}
          onClick={handleOverlay}
          title={overlayActive ? '오버레이 모드 OFF' : '오버레이 모드 ON (항상 위)'}
        >
          ⊞
        </button>
      </div>
    </div>
  )
}
