/**
 * Touchpad Input Manager — Main Process
 *
 * ◆ 동작 원리
 *   1. Native addon (touchpad.node) 로드 시도 → HID Raw Input
 *   2. 3초 내 HID 이벤트 없으면 → uiohook Legacy 자동 fallback
 *      (+ native 마우스 훅 해제하여 uiohook 이벤트 흐르게 함)
 *   3. 아예 없으면 → uiohook만 사용
 *
 * ◆ Fallback 시 ABS 모드 제한
 *   - native HID 없으면 진정한 1:1 절대 좌표 불가
 *   - 커서 이동 기반 매핑 (화면 전체 = 터치패드 전체)
 *   - 캘리브레이션으로 정확도 향상 가능
 */
import { BrowserWindow, ipcMain, screen, app } from 'electron'
import { join } from 'path'

export interface TouchEvent {
  type: 'down' | 'move' | 'up'
  x: number
  y: number
  pressure: number
  id: number
  mode: 'precision' | 'legacy'
}

let screenW = 1920
let screenH = 1080
let inputSensitivity = 1.0
let inputDeadZone = 0.02
let absPadMode = false
let lockX = 0
let lockY = 0
let touchActive = false
let lastX = -1
let lastY = -1
let touchId = 0

// native HID fallback 상태 (true = native HID 실패, uiohook 사용 중)
let nativeHidFailed = false

export function initTouchpadInput(win: BrowserWindow) {
  try {
    const d = screen.getPrimaryDisplay()
    screenW = d.size.width
    screenH = d.size.height
    console.log(`[Touchpad] Screen: ${screenW}x${screenH}`)
  } catch (_) {}

  // IPC: 설정 변경
  ipcMain.on('input-set-config', (_e, cfg: { sensitivity?: number; deadZone?: number }) => {
    if (cfg.sensitivity !== undefined) inputSensitivity = Math.max(0.1, Math.min(3.0, cfg.sensitivity))
    if (cfg.deadZone !== undefined) inputDeadZone = Math.max(0, Math.min(0.15, cfg.deadZone))
  })

  // IPC: ABS 모드 토글 → Precision / Click 모드 전환
  ipcMain.on('set-abs-pad-mode', (_e, enabled: boolean) => {
    absPadMode = enabled
    console.log(`[Touchpad] Absolute Pad Mode: ${enabled ? 'ON' : 'OFF'}`)
    const nm = (global as any).__nativeTouchpad
    if (enabled && nativeLoaded) {
      // Precision 모드: native HID 이벤트 활성, uiohook 이벤트 차단
      nativeEventsEnabled = true
      uiohookEventEnabled = false
      if (nm?.setAbsMode) nm.setAbsMode(true)
      win.webContents.send('touchpad-mode', 'precision')
      console.log('[Touchpad] → Precision mode (native HID)')
    } else {
      // Click 모드: uiohook 이벤트 활성, native 이벤트 차단
      nativeEventsEnabled = false
      uiohookEventEnabled = true
      lockX = 0; lockY = 0
      if (nm?.setAbsMode) nm.setAbsMode(false)
      win.webContents.send('touchpad-mode', 'legacy')
      console.log('[Touchpad] → Click mode (uiohook)')
    }
  })

  // ── 모드 플래그 ──────────────────────────────────────────────
  // 기본: 클릭 모드 (uiohook). ABS ON + nativeLoaded → Precision 모드
  let uiohookEventEnabled = true
  let nativeEventsEnabled = false  // ABS ON 시에만 true

  // ── uiohook-napi ────────────────────────────────────────────────
  function startUiohookHandlers() {
    try {
      const { uiohook, UiohookMouseButton } = require('uiohook-napi')

      uiohook.on('mousedown', (e: { button: number; x: number; y: number }) => {
        if (e.button !== UiohookMouseButton.LEFT) return
        touchActive = true
        touchId++
        lastX = e.x
        lastY = e.y

        if (absPadMode && !nativeHidFailed) {
          lockX = Math.floor(screenW / 2)
          lockY = Math.floor(screenH / 2)
        }

        if (!uiohookEventEnabled) return

        const norm = normalize(e.x, e.y)
        win.webContents.send('touch-event', {
          type: 'down', ...norm,
          pressure: Math.min(1.0, 0.8 * inputSensitivity),
          id: touchId, mode: 'legacy',
        } satisfies TouchEvent)
      })

      uiohook.on('mousemove', (e: { x: number; y: number }) => {
        if (!touchActive) return

        if (absPadMode && !nativeHidFailed) {
          try { require('robotjs').moveMouse(lockX, lockY) } catch (_) {}
        }

        if (!uiohookEventEnabled) return

        const deadPx = Math.max(2, inputDeadZone * Math.min(screenW, screenH))
        if (Math.abs(e.x - lastX) < deadPx && Math.abs(e.y - lastY) < deadPx) return
        lastX = e.x
        lastY = e.y

        const norm = normalize(e.x, e.y)
        win.webContents.send('touch-event', {
          type: 'move', ...norm,
          pressure: Math.min(1.0, 0.8 * inputSensitivity),
          id: touchId, mode: 'legacy',
        } satisfies TouchEvent)
      })

      uiohook.on('mouseup', (e: { button: number; x: number; y: number }) => {
        if (e.button !== UiohookMouseButton.LEFT) return
        touchActive = false

        if (absPadMode && !nativeHidFailed) {
          try { require('robotjs').moveMouse(lockX, lockY) } catch (_) {}
        }

        if (!uiohookEventEnabled) return

        win.webContents.send('touch-event', {
          type: 'up', ...normalize(e.x, e.y),
          pressure: 0, id: touchId, mode: 'legacy',
        } satisfies TouchEvent)
      })

      uiohook.start()
      console.log('[Touchpad] uiohook-napi started')
    } catch (e) {
      console.warn('[Touchpad] uiohook-napi not available:', e)
    }
  }

  // ── Native addon (선택적) ────────────────────────────────────────
  let nativeLoaded = false

  try {
    const nativePath = app.isPackaged
      ? join(process.resourcesPath, 'touchpad.node')
      : join(app.getAppPath(), 'build', 'Release', 'touchpad.node')

    console.log(`[Touchpad] Loading native addon: ${nativePath}`)
    const nm = require(nativePath)

    nm.start((event: TouchEvent) => {
      if (!nativeEventsEnabled) return  // ABS 모드 OFF 시 native 이벤트 무시
      win.webContents.send('touch-event', {
        type: event.type ?? 'down',
        x: Math.max(0, Math.min(1, event.x)),
        y: Math.max(0, Math.min(1, event.y)),
        pressure: Math.min(1.0, (event.pressure ?? 0.8) * inputSensitivity),
        id: event.id ?? 1,
        mode: 'precision',
      } satisfies TouchEvent)
    })

    ;(global as any).__nativeTouchpad = nm
    nativeLoaded = true
    // native 로드해도 uiohook은 유지 (기본 클릭 모드용)
    // ABS 모드 ON 시에만 native 이벤트 활성화 (set-abs-pad-mode 핸들러에서 처리)
    console.log('[Touchpad] Native Precision addon ready (ABS mode OFF → click mode active)')

  } catch (err) {
    console.log('[Touchpad] Native addon load failed:', (err as Error).message)
  }

  // uiohook 항상 시작 (커서 잠금 + fallback)
  startUiohookHandlers()

  if (!nativeLoaded) {
    win.webContents.send('touchpad-mode', 'legacy')
  }

  // ── WM_POINTER 훅: 탭 감지 (클릭 없이 터치만 해도 이벤트 발생) ──────
  // Windows 8+ Precision Touchpad는 WM_POINTER 메시지를 전송함
  // "탭으로 클릭" 설정 OFF여도 탭 이벤트를 직접 캐치
  function hookPointerMessages(w: BrowserWindow) {
    const WM_POINTERDOWN   = 0x0246
    const WM_POINTERUPDATE = 0x0245
    const WM_POINTERUP     = 0x0247

    const pointerActive = new Map<number, boolean>()

    function makeHandler(msgType: 'down' | 'move' | 'up') {
      return (wParamBuf: Buffer, lParamBuf: Buffer) => {
        const pointerId = wParamBuf.readUInt16LE(0)
        const px = lParamBuf.readInt16LE(0)
        const py = lParamBuf.readInt16LE(2)
        if (!uiohookEventEnabled) return

        if (msgType === 'down') {
          pointerActive.set(pointerId, true)
          touchId++
          w.webContents.send('touch-event', {
            type: 'down', ...normalize(px, py),
            pressure: Math.min(1.0, 0.8 * inputSensitivity),
            id: pointerId, mode: 'legacy',
          } satisfies TouchEvent)
        } else if (msgType === 'move') {
          if (!pointerActive.get(pointerId)) return
          w.webContents.send('touch-event', {
            type: 'move', ...normalize(px, py),
            pressure: Math.min(1.0, 0.8 * inputSensitivity),
            id: pointerId, mode: 'legacy',
          } satisfies TouchEvent)
        } else {
          if (!pointerActive.get(pointerId)) return
          pointerActive.delete(pointerId)
          w.webContents.send('touch-event', {
            type: 'up', ...normalize(px, py),
            pressure: 0, id: pointerId, mode: 'legacy',
          } satisfies TouchEvent)
        }
      }
    }

    try {
      w.hookWindowMessage(WM_POINTERDOWN,   makeHandler('down'))
      w.hookWindowMessage(WM_POINTERUPDATE, makeHandler('move'))
      w.hookWindowMessage(WM_POINTERUP,     makeHandler('up'))
      console.log('[Touchpad] WM_POINTER hook registered')
    } catch (e) {
      console.warn('[Touchpad] WM_POINTER hook failed:', e)
    }
  }
  hookPointerMessages(win)

  ipcMain.on('zone-triggered', (_e, d: { zoneId: string; action: unknown; on: boolean }) => {
    console.log('[Zone] Triggered:', d.zoneId, d.on ? 'ON' : 'OFF')
  })
}

export function cleanupTouchpad() {
  const nm = (global as any).__nativeTouchpad
  if (nm) { try { nm.stop() } catch (_) {} }
  try { require('uiohook-napi').uiohook.stop() } catch (_) {}
}

function normalize(x: number, y: number) {
  return {
    x: Math.max(0, Math.min(1, x / screenW)),
    y: Math.max(0, Math.min(1, y / screenH)),
  }
}
