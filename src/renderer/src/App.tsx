import TitleBar from './components/TitleBar'
import ZonePad from './components/ZonePad'
import ControlPanel from './components/ControlPanel'
import StatusBar from './components/StatusBar'
import SettingsPanel from './components/SettingsPanel'
import PianoRollPanel from './components/PianoRollPanel'
import useStore from './store/useStore'
import { useEffect, useCallback, useState } from 'react'

export default function App() {
  const { setTouchpadMode, setLayer, setGrid, cycleQuantize, cycleNoteRepeat, toggleMetronome, setBpm, theme, absPadMode } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)

  // Apply theme to document root whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Absolute Pad Mode: cursor 숨김 + Pointer Lock (커서가 화면에서 움직이지 않게)
  useEffect(() => {
    if (absPadMode) {
      document.body.style.cursor = 'none'
      // Pointer Lock: OS 레벨에서 커서 이동 차단
      // Electron은 사용자 제스처 없이도 허용
      document.documentElement.requestPointerLock?.()
    } else {
      document.body.style.cursor = ''
      if (document.pointerLockElement) document.exitPointerLock?.()
    }
  }, [absPadMode])

  // Sync absPadMode on app start
  useEffect(() => {
    const { absPadMode } = useStore.getState()
    window.electronAPI?.setAbsPadMode?.(absPadMode)
  }, [])

  // Listen for touchpad mode changes from main
  useEffect(() => {
    const cleanup = window.electronAPI?.onTouchpadMode?.((mode) => {
      setTouchpadMode(mode as 'precision' | 'legacy' | 'none')
    })
    return cleanup
  }, [setTouchpadMode])

  // Native HID 실패 시: ABS 모드 자동 해제 (uiohook fallback은 커서 이동 필요)
  useEffect(() => {
    const cleanup = (window.electronAPI as any)?.onNativeHidFailed?.(() => {
      const { absPadMode, setAbsPadMode } = useStore.getState()
      if (absPadMode) {
        setAbsPadMode(false)
        console.log('[App] Native HID failed → ABS mode auto-disabled')
      }
    })
    return cleanup
  }, [])

  // 전역 단축키 Alt+1~4: layer 전환
  useEffect(() => {
    const cleanup = window.electronAPI?.onGlobalLayer?.((n) => setLayer(n as 1 | 2 | 3 | 4))
    return cleanup
  }, [setLayer])

  // Global keyboard shortcuts (PRD shortcut spec)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if focused in an input
    if ((e.target as HTMLElement).tagName === 'INPUT') return

    switch (e.key) {
      case '1': setLayer(1); break
      case '2': setLayer(2); break
      case '3': setLayer(3); break
      case '4': setLayer(4); break
      case 'g':
      case 'G': {
        const grids = ['2x2', '3x3', '4x4'] as const
        const { grid } = useStore.getState()
        const next = grids[(grids.indexOf(grid) + 1) % grids.length]
        setGrid(next)
        break
      }
      case 'q':
      case 'Q': cycleQuantize(); break
      case 'n':
      case 'N': cycleNoteRepeat(); break
      case 'm':
      case 'M': toggleMetronome(); break
      case 't':
      case 'T': {
        window.dispatchEvent(new CustomEvent('tap-tempo'))
        break
      }
      case 'r':
      case 'R': {
        // 현재 세션 초기화 (PRD §6 R키)
        if (e.ctrlKey || e.metaKey) break  // Ctrl+R 브라우저 새로고침 방지
        window.dispatchEvent(new CustomEvent('session-reset'))
        break
      }
      case 'Escape': {
        // 패드 비활성화 — 모든 active zone 해제 (PRD §6 Esc키)
        window.dispatchEvent(new CustomEvent('pad-deactivate'))
        useStore.getState().setAbsPadMode(false)
        break
      }
    }
  }, [setLayer, setGrid, cycleQuantize, cycleNoteRepeat, toggleMetronome, setBpm])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <TitleBar onSettings={() => setSettingsOpen(true)} onTimeline={() => setTimelineOpen(true)} />
      <div className="flex flex-1 gap-4 p-4 pt-2 overflow-hidden">
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <ZonePad />
        </div>
        <div className="w-72 flex flex-col">
          <ControlPanel />
        </div>
      </div>
      <StatusBar />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {timelineOpen && <PianoRollPanel onClose={() => setTimelineOpen(false)} />}
    </div>
  )
}
