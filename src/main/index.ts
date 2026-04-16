import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import { join } from 'path'
import { initMidiEngine, cleanupMidi } from './midiEngine'
import { initTouchpadInput, cleanupTouchpad } from './touchpadInput'
import { initKeyboardEngine } from './keyboardEngine'
import { initSessionManager } from './sessionManager'
import { initOscEngine } from './oscEngine'
import { initPluginLoader } from './pluginLoader'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 660,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0f0f13',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // 창 닫기 시 트레이로 숨기기 (앱 종료 아님)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    cleanupMidi()
    cleanupTouchpad()
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.trackpad.controller')
  }

  app.on('browser-window-created', (_e, window) => {
    window.webContents.on('before-input-event', (_ev, input) => {
      if (input.type === 'keyDown' && input.key === 'F5') window.reload()
      if (input.type === 'keyDown' && input.key === 'F12') window.webContents.toggleDevTools()
    })
  })

  // Window control IPC
  ipcMain.on('window-minimize', () => mainWindow?.minimize())
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window-close', () => mainWindow?.close())

  // Overlay mode: always-on-top + compact size
  let overlayActive = false
  ipcMain.handle('window-overlay-toggle', () => {
    if (!mainWindow) return { overlay: false }
    overlayActive = !overlayActive
    if (overlayActive) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
      mainWindow.setOpacity(0.88)
      mainWindow.setSize(400, 340, true)
      mainWindow.setResizable(false)
    } else {
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setOpacity(1.0)
      mainWindow.setSize(960, 660, true)
      mainWindow.setResizable(true)
    }
    mainWindow.webContents.send('overlay-state', overlayActive)
    return { overlay: overlayActive }
  })

  // 시스템 트레이 설정
  const iconPath = join(__dirname, '../../resources/icon.png')
  let trayIcon = nativeImage.createEmpty()
  try { trayIcon = nativeImage.createFromPath(iconPath) } catch (_) {}

  tray = new Tray(trayIcon)
  tray.setToolTip('TrackPad Controller')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ]))
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  // ── 전역 단축키 등록 ────────────────────────────────────────────
  // Alt+1~4: Layer 전환, Alt+0: 앱 Show/Hide 토글
  const layerKeys = ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4'] as const
  layerKeys.forEach((accel, i) => {
    globalShortcut.register(accel, () => {
      mainWindow?.webContents.send('global-layer', i + 1)
    })
  })
  globalShortcut.register('Alt+0', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else { mainWindow?.show(); mainWindow?.focus() }
  })

  // IPC: 전역 단축키 on/off 토글 (설정 패널에서 제어)
  ipcMain.handle('global-shortcuts-set', (_event, enabled: boolean) => {
    if (enabled) {
      layerKeys.forEach((accel, i) => {
        if (!globalShortcut.isRegistered(accel)) {
          globalShortcut.register(accel, () => {
            mainWindow?.webContents.send('global-layer', i + 1)
          })
        }
      })
      if (!globalShortcut.isRegistered('Alt+0')) {
        globalShortcut.register('Alt+0', () => {
          if (mainWindow?.isVisible()) mainWindow.hide()
          else { mainWindow?.show(); mainWindow?.focus() }
        })
      }
    } else {
      layerKeys.forEach((a) => globalShortcut.unregister(a))
      globalShortcut.unregister('Alt+0')
    }
    return { ok: true, enabled }
  })

  // IPC: 자동 실행 (로그인 시 시작)
  ipcMain.handle('autostart-get', () => {
    const settings = app.getLoginItemSettings()
    return { enabled: settings.openAtLogin }
  })
  ipcMain.handle('autostart-set', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return { ok: true, enabled }
  })

  createWindow()
  // 엔진 초기화: createWindow() 직후 실행하여 renderer가 IPC 호출하기 전에 핸들러 등록
  initMidiEngine(mainWindow!)
  initTouchpadInput(mainWindow!)
  initKeyboardEngine()
  initSessionManager()
  initOscEngine()
  initPluginLoader(mainWindow!)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true
    app.quit()
  }
})

