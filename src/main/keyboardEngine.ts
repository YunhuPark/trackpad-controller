/**
 * Keyboard Output Engine — Main Process
 * uiohook-napi / robotjs 기반 키보드 단축키 출력
 * script: child_process.exec 기반 스크립트 실행
 */
import { ipcMain } from 'electron'
import { exec } from 'child_process'

export function initKeyboardEngine() {
  ipcMain.handle('keyboard-send', async (_event, keys: string[]) => {
    try {
      // robotjs 우선 시도
      const robot = require('robotjs')
      const modifiers = keys.filter(k => ['control', 'alt', 'shift', 'command'].includes(k.toLowerCase()))
      const mainKey = keys.find(k => !['control', 'alt', 'shift', 'command', 'ctrl', 'cmd'].includes(k.toLowerCase()))

      const robotModifiers = modifiers.map(m => {
        if (m === 'ctrl' || m === 'control') return 'control'
        if (m === 'cmd' || m === 'command') return 'command'
        return m.toLowerCase()
      })

      if (mainKey) {
        robot.keyTap(mainKey.toLowerCase(), robotModifiers)
        return { ok: true }
      }
    } catch (_) {
      // robotjs 없으면 시스템 레벨 키 입력 스킵
      console.warn('[Keyboard] robotjs not available, skipping key output')
    }
    return { ok: false, error: 'No keyboard backend available' }
  })

  // 키 시퀀스 실행 (각 키 조합 사이에 딜레이)
  ipcMain.handle('keyboard-sequence', async (_event, sequence: Array<{ keys: string[]; delayMs: number }>) => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    for (const step of sequence) {
      if (step.keys.length === 0) {
        await sleep(step.delayMs)
        continue
      }
      try {
        const robot = require('robotjs')
        const modifiers = step.keys.filter(k => ['control', 'alt', 'shift', 'command', 'ctrl', 'cmd'].includes(k.toLowerCase()))
        const mainKey = step.keys.find(k => !['control', 'alt', 'shift', 'command', 'ctrl', 'cmd'].includes(k.toLowerCase()))
        const robotMods = modifiers.map(m => (m === 'ctrl' ? 'control' : m === 'cmd' ? 'command' : m.toLowerCase()))
        if (mainKey) robot.keyTap(mainKey.toLowerCase(), robotMods)
      } catch (_) {}
      await sleep(step.delayMs)
    }
    return { ok: true }
  })

  // 미디어 키 전송
  ipcMain.handle('media-key', async (_event, action: string) => {
    // robotjs 미디어 키 이름 매핑
    const robotKeyMap: Record<string, string> = {
      play: 'audio_play', pause: 'audio_play',
      stop: 'audio_stop',
      next: 'audio_next', prev: 'audio_prev',
      mute: 'audio_mute',
      volumeUp: 'audio_vol_up', volumeDown: 'audio_vol_down',
    }
    try {
      const robot = require('robotjs')
      const key = robotKeyMap[action]
      if (key) { robot.keyTap(key); return { ok: true } }
    } catch (_) {}

    // PowerShell fallback (Windows) — WScript VK 코드
    if (process.platform === 'win32') {
      const psMap: Record<string, number> = {
        play: 179, pause: 179, stop: 178,
        next: 176, prev: 177,
        mute: 173, volumeUp: 175, volumeDown: 174,
      }
      const vk = psMap[action]
      if (vk) {
        return new Promise((resolve) => {
          exec(
            `powershell.exe -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]${vk})"`,
            { timeout: 3000 },
            (err) => resolve(err ? { ok: false, error: err.message } : { ok: true })
          )
        })
      }
    }

    // osascript fallback (macOS)
    if (process.platform === 'darwin') {
      const macMap: Record<string, string> = {
        play: 'key code 49', pause: 'key code 49',
        next: 'key code 124 using {command down}',
        prev: 'key code 123 using {command down}',
        stop: 'key code 49',
        mute: 'key code 74',
        volumeUp: 'key code 72', volumeDown: 'key code 73',
      }
      const osa = macMap[action]
      if (osa) {
        return new Promise((resolve) => {
          exec(`osascript -e 'tell application "System Events" to ${osa}'`, { timeout: 3000 },
            (err) => resolve(err ? { ok: false, error: err.message } : { ok: true })
          )
        })
      }
    }
    return { ok: false, error: 'Unsupported media action' }
  })

  // 스크립트 실행 (Windows: PowerShell / macOS: bash)
  ipcMain.handle('script-exec', async (_event, script: string) => {
    if (!script || script.trim().length === 0) {
      return { ok: false, error: 'Empty script' }
    }
    return new Promise<{ ok: boolean; output?: string; error?: string }>((resolve) => {
      const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
      const flag = process.platform === 'win32' ? '-Command' : '-c'
      exec(`${shell} ${flag} "${script.replace(/"/g, '\\"')}"`, { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve({ ok: false, error: err.message })
        } else {
          resolve({ ok: true, output: stdout.trim() })
        }
      })
    })
  })

  console.log('[Keyboard] Engine initialized')
}
