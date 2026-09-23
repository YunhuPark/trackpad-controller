/**
 * Session Manager — Main Process
 * JSON 파일로 세션 설정 저장/복원 + 프리셋 파일(.tpz) 내보내기/가져오기
 */
import { ipcMain, app, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'

export function initSessionManager() {
  const SESSION_PATH = join(app.getPath('userData'), 'session.json')
  ipcMain.handle('session-save', (_event, data: unknown) => {
    try {
      writeFileSync(SESSION_PATH, JSON.stringify(data, null, 2), 'utf-8')
      return { ok: true }
    } catch (e) {
      return { error: String(e) }
    }
  })

  ipcMain.handle('session-load', () => {
    try {
      if (!existsSync(SESSION_PATH)) return null
      const raw = readFileSync(SESSION_PATH, 'utf-8')
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  })

  // ── Preset Export (.tpz) ──────────────────────────────────────
  ipcMain.handle('preset-export', async (_event, data: unknown) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: '프리셋 내보내기',
        defaultPath: 'my-preset.tpz',
        filters: [
          { name: 'TrackPad Controller Preset', extensions: ['tpz'] },
          { name: 'JSON', extensions: ['json'] },
        ],
      })
      if (canceled || !filePath) return { canceled: true }
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { ok: true, filePath }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // ── Preset Import (.tpz) ──────────────────────────────────────
  ipcMain.handle('preset-import', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '프리셋 불러오기',
        filters: [
          { name: 'TrackPad Controller Preset', extensions: ['tpz'] },
          { name: 'JSON', extensions: ['json'] },
        ],
        properties: ['openFile'],
      })
      if (canceled || filePaths.length === 0) return { canceled: true }
      const raw = readFileSync(filePaths[0], 'utf-8')
      const preset = JSON.parse(raw)
      return { ok: true, preset }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // ── Built-in Preset List ──────────────────────────────────────
  ipcMain.handle('preset-list-builtin', () => {
    try {
      const dir = process.env['ELECTRON_RENDERER_URL']
        ? join(app.getAppPath(), 'resources', 'presets')
        : join(process.resourcesPath, 'presets')
      if (!existsSync(dir)) return []
      return readdirSync(dir)
        .filter((f) => f.endsWith('.tpz') || f.endsWith('.json'))
        .map((f) => ({ name: f.replace(/\.(tpz|json)$/, ''), file: f }))
    } catch (_) {
      return []
    }
  })

  // ── Built-in Preset Load ──────────────────────────────────────
  ipcMain.handle('preset-load-builtin', (_event, filename: string) => {
    try {
      const dir = process.env['ELECTRON_RENDERER_URL']
        ? join(app.getAppPath(), 'resources', 'presets')
        : join(process.resourcesPath, 'presets')
      const raw = readFileSync(join(dir, filename), 'utf-8')
      return { ok: true, preset: JSON.parse(raw) }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // ── MIDI File Export (.mid) ───────────────────────────────────
  ipcMain.handle('midi-export', async (_event, data: number[]) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'MIDI 파일 내보내기',
        defaultPath: `session-${Date.now()}.mid`,
        filters: [{ name: 'MIDI File', extensions: ['mid'] }],
      })
      if (canceled || !filePath) return { canceled: true }
      writeFileSync(filePath, Buffer.from(data))
      return { ok: true, filePath }
    } catch (e) {
      return { error: String(e) }
    }
  })

  console.log('[Session] Manager initialized, path:', SESSION_PATH)
}
