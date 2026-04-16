/**
 * Plugin Loader — Main Process
 * {userData}/plugins/*.js 에서 플러그인을 로드
 *
 * 플러그인 인터페이스 (plugins/my-plugin.js 예시):
 * ```js
 * module.exports = {
 *   name: 'My Plugin',
 *   version: '1.0.0',
 *   actions: [
 *     {
 *       id: 'my-action',
 *       label: 'My Action',
 *       execute: (payload) => {
 *         // payload: { zoneId, pressure, velocity, layer }
 *         console.log('Action triggered!', payload)
 *       }
 *     }
 *   ]
 * }
 * ```
 */
import { ipcMain, app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { readdirSync, existsSync, mkdirSync } from 'fs'

export interface PluginAction {
  id: string
  label: string
  execute: (payload: PluginPayload) => void | Promise<void>
}

export interface Plugin {
  name: string
  version: string
  actions: PluginAction[]
}

export interface PluginPayload {
  zoneId: string
  pressure: number
  velocity: number
  layer: number
}

const loadedPlugins: Map<string, Plugin> = new Map()

function getPluginsDir() {
  return join(app.getPath('userData'), 'plugins')
}

function ensurePluginsDir() {
  const dir = getPluginsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function loadPlugin(filePath: string): Plugin | null {
  try {
    // Clear require cache to allow hot-reload
    delete require.cache[require.resolve(filePath)]
    const mod = require(filePath)
    if (!mod || typeof mod !== 'object' || !mod.name || !Array.isArray(mod.actions)) {
      console.warn('[Plugin] Invalid plugin format:', filePath)
      return null
    }
    return mod as Plugin
  } catch (e) {
    console.warn('[Plugin] Failed to load:', filePath, String(e))
    return null
  }
}

function loadAllPlugins() {
  const dir = ensurePluginsDir()
  loadedPlugins.clear()

  const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
  for (const file of files) {
    const fullPath = join(dir, file)
    const plugin = loadPlugin(fullPath)
    if (plugin) {
      loadedPlugins.set(file, plugin)
      console.log(`[Plugin] Loaded: ${plugin.name} v${plugin.version} (${plugin.actions.length} actions)`)
    }
  }
}

export function initPluginLoader(win: BrowserWindow) {
  ensurePluginsDir()
  loadAllPlugins()

  // List all loaded plugins + their actions
  ipcMain.handle('plugin-list', () => {
    const result: Array<{ file: string; name: string; version: string; actions: Array<{ id: string; label: string }> }> = []
    for (const [file, plugin] of loadedPlugins) {
      result.push({
        file,
        name: plugin.name,
        version: plugin.version,
        actions: plugin.actions.map((a) => ({ id: a.id, label: a.label })),
      })
    }
    return result
  })

  // Execute a plugin action
  ipcMain.handle('plugin-execute', async (_event, { pluginFile, actionId, payload }: {
    pluginFile: string
    actionId: string
    payload: PluginPayload
  }) => {
    const plugin = loadedPlugins.get(pluginFile)
    if (!plugin) return { error: `Plugin not found: ${pluginFile}` }
    const action = plugin.actions.find((a) => a.id === actionId)
    if (!action) return { error: `Action not found: ${actionId}` }
    try {
      await action.execute(payload)
      return { ok: true }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // Reload all plugins
  ipcMain.handle('plugin-reload', () => {
    loadAllPlugins()
    const names = Array.from(loadedPlugins.values()).map((p) => p.name)
    win.webContents.send('plugins-reloaded', names)
    return { ok: true, count: loadedPlugins.size }
  })

  // Open plugins directory in file explorer
  ipcMain.handle('plugin-open-dir', () => {
    const dir = getPluginsDir()
    shell.openPath(dir)
    return { ok: true, path: dir }
  })

  console.log('[Plugin] Loader initialized, dir:', getPluginsDir())
}
