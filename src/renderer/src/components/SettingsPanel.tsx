/**
 * SettingsPanel — 설정 패널 (단축키 + 테마/언어 + OSC + 압력커브 + 플러그인)
 */
import { useState, useEffect } from 'react'
import useStore from '../store/useStore'
import { t } from '../i18n'
import { DEFAULT_CURVE } from '@core/pressureCurve'
import PressureCurveEditor from './PressureCurveEditor'
import type { Theme } from '../store/useStore'
import type { Locale } from '../i18n'

interface SettingsPanelProps {
  onClose: () => void
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { locale, setLocale, theme, setTheme, pressureCurve, setPressureCurve,
          oscHost, oscPort, setOscConfig,
          sensitivity, deadZone, maxTouches, setSensitivity, setDeadZone, setMaxTouches,
          autostart, setAutostart, globalShortcutsEnabled, setGlobalShortcutsEnabled } = useStore()

  const [oscHostInput, setOscHostInput] = useState(oscHost)
  const [oscPortInput, setOscPortInput] = useState(String(oscPort))

  const [plugins, setPlugins] = useState<Array<{ file: string; name: string; version: string; actions: Array<{ id: string; label: string }> }>>([])

  useEffect(() => {
    window.electronAPI?.listPlugins?.().then(setPlugins).catch(() => {})
    // 실제 autostart 상태 동기화
    window.electronAPI?.getAutostart?.().then((r) => setAutostart(r.enabled)).catch(() => {})
  }, [setAutostart])

  const handleAutostartToggle = async () => {
    const next = !autostart
    await window.electronAPI?.setAutostart?.(next)
    setAutostart(next)
  }

  const handleGlobalShortcutsToggle = async () => {
    const next = !globalShortcutsEnabled
    await window.electronAPI?.setGlobalShortcuts?.(next)
    setGlobalShortcutsEnabled(next)
  }

  const handleOscApply = () => {
    const port = parseInt(oscPortInput, 10)
    if (isNaN(port)) return
    setOscConfig(oscHostInput, port)
    window.electronAPI?.setOscConfig?.(oscHostInput, port)
  }

  const handlePluginReload = async () => {
    await window.electronAPI?.reloadPlugins?.()
    const updated = await window.electronAPI?.listPlugins?.()
    if (updated) setPlugins(updated)
  }

  // 감도/데드존 변경 시 main process에도 동기화
  const handleSensitivityChange = (v: number) => {
    setSensitivity(v)
    window.electronAPI?.setInputConfig?.(v, deadZone)
  }

  const handleDeadZoneChange = (v: number) => {
    setDeadZone(v)
    window.electronAPI?.setInputConfig?.(sensitivity, v)
  }

  const shortcuts = [
    { key: '1 ~ 4', desc: t(locale, 'sc_layer') },
    { key: 'G', desc: t(locale, 'sc_grid') },
    { key: 'Q', desc: t(locale, 'sc_quantize') },
    { key: 'N', desc: t(locale, 'sc_noterepeat') },
    { key: 'T', desc: t(locale, 'sc_tap') },
    { key: 'M', desc: t(locale, 'sc_metronome') },
    { key: 'R', desc: t(locale, 'sc_reset') },
    { key: 'Esc', desc: t(locale, 'sc_esc') },
    { key: locale === 'ko' ? '더블클릭' : 'Dbl-Click', desc: t(locale, 'sc_dblclick') },
  ]

  const tips = [
    { title: t(locale, 'tip_midi'), desc: t(locale, 'tip_midi_desc') },
    { title: t(locale, 'tip_loopmidi'), desc: t(locale, 'tip_loopmidi_desc') },
    { title: t(locale, 'tip_touchpad'), desc: t(locale, 'tip_touchpad_desc') },
    { title: t(locale, 'tip_noterepeat'), desc: t(locale, 'tip_noterepeat_desc') },
    { title: t(locale, 'tip_quantize'), desc: t(locale, 'tip_quantize_desc') },
  ]

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-panel p-6 w-[520px] max-h-[85vh] overflow-y-auto flex flex-col gap-5 shadow-accent-glow">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h2 className="text-text-primary font-semibold text-base">{t(locale, 'settingsTitle')}</h2>
          </div>
          <button className="text-text-secondary hover:text-text-primary text-lg leading-none" onClick={onClose}>✕</button>
        </div>

        {/* App Settings */}
        <div className="flex flex-col gap-2.5">
          <span className="label-tag">{locale === 'ko' ? '앱 설정' : 'App Settings'}</span>
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-text-primary">{locale === 'ko' ? '시작 시 자동 실행' : 'Launch at login'}</span>
              <span className="text-[10px] text-text-secondary">{locale === 'ko' ? '로그인 시 자동으로 시작' : 'Start automatically on login'}</span>
            </div>
            <button
              className={`w-11 h-6 rounded-full transition-all relative ${autostart ? 'bg-accent' : 'bg-zone-border'}`}
              style={autostart ? { backgroundColor: 'rgb(var(--color-accent))' } : {}}
              onClick={handleAutostartToggle}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${autostart ? 'left-[calc(100%-22px)]' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-text-primary">{locale === 'ko' ? '전역 단축키 (Alt+1~4, Alt+0)' : 'Global shortcuts (Alt+1–4, Alt+0)'}</span>
              <span className="text-[10px] text-text-secondary">{locale === 'ko' ? '앱 밖에서도 Layer 전환 / 앱 토글' : 'Switch layers / toggle app from anywhere'}</span>
            </div>
            <button
              className={`w-11 h-6 rounded-full transition-all relative ${globalShortcutsEnabled ? 'bg-accent' : 'bg-zone-border'}`}
              style={globalShortcutsEnabled ? { backgroundColor: 'rgb(var(--color-accent))' } : {}}
              onClick={handleGlobalShortcutsToggle}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${globalShortcutsEnabled ? 'left-[calc(100%-22px)]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Theme & Language */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="label-tag">{t(locale, 'theme')}</span>
            <div className="flex gap-1.5">
              {(['dark', 'light'] as Theme[]).map((th) => (
                <button
                  key={th}
                  className={`px-3 py-1 rounded-lg text-xs border transition-all ${
                    theme === th ? 'border-accent text-accent' : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'
                  }`}
                  style={theme === th ? { backgroundColor: 'rgb(var(--color-accent) / 0.2)' } : {}}
                  onClick={() => setTheme(th)}
                >
                  {th === 'dark' ? `🌙 ${t(locale, 'dark')}` : `☀ ${t(locale, 'light')}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="label-tag">{t(locale, 'language')}</span>
            <div className="flex gap-1.5">
              {(['ko', 'en'] as Locale[]).map((l) => (
                <button
                  key={l}
                  className={`px-3 py-1 rounded-lg text-xs border transition-all ${
                    locale === l ? 'border-accent text-accent' : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'
                  }`}
                  style={locale === l ? { backgroundColor: 'rgb(var(--color-accent) / 0.2)' } : {}}
                  onClick={() => setLocale(l)}
                >
                  {l === 'ko' ? '한국어' : 'English'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pressure Curve */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label-tag">{t(locale, 'pressureCurve')}</span>
            <button
              className="text-[10px] text-text-secondary hover:text-accent underline"
              onClick={() => setPressureCurve(DEFAULT_CURVE)}
            >
              {t(locale, 'pressureCurveReset')}
            </button>
          </div>
          <PressureCurveEditor curve={pressureCurve} onChange={setPressureCurve} />
        </div>

        {/* OSC Config */}
        <div className="flex flex-col gap-2">
          <span className="label-tag">{t(locale, 'osc')}</span>
          <div className="flex gap-2 items-end">
            <div className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] text-text-secondary font-mono">{t(locale, 'oscHost')}</span>
              <input
                className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-accent"
                value={oscHostInput}
                onChange={(e) => setOscHostInput(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 w-20">
              <span className="text-[10px] text-text-secondary font-mono">{t(locale, 'oscPort')}</span>
              <input
                type="number"
                className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-accent"
                value={oscPortInput}
                onChange={(e) => setOscPortInput(e.target.value)}
              />
            </div>
            <button className="control-btn text-xs pb-1.5" onClick={handleOscApply}>
              {t(locale, 'oscApply')}
            </button>
          </div>
          <p className="text-[10px] text-text-secondary font-mono">
            /trackpad/note &lt;ch&gt; &lt;note&gt; &lt;vel&gt; &lt;on&gt;
            &nbsp;|&nbsp; /trackpad/zone/&lt;id&gt; &lt;on&gt; &lt;pressure&gt;
          </p>
        </div>

        {/* Input Settings */}
        <div className="flex flex-col gap-3">
          <span className="label-tag">{t(locale, 'inputSettings')}</span>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-text-primary">{t(locale, 'sensitivity')}</span>
                <span className="text-[10px] text-text-secondary">{t(locale, 'sensitivityDesc')}</span>
              </div>
              <span className="text-xs font-mono text-accent w-10 text-right">{sensitivity.toFixed(1)}</span>
            </div>
            <input
              type="range" min={0.1} max={3.0} step={0.1}
              value={sensitivity}
              onChange={(e) => handleSensitivityChange(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-text-primary">{t(locale, 'deadZone')}</span>
                <span className="text-[10px] text-text-secondary">{t(locale, 'deadZoneDesc')}</span>
              </div>
              <span className="text-xs font-mono text-accent w-12 text-right">{deadZone.toFixed(3)}</span>
            </div>
            <input
              type="range" min={0} max={0.15} step={0.005}
              value={deadZone}
              onChange={(e) => handleDeadZoneChange(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-text-primary">{locale === 'ko' ? '멀티터치 최대 인식 수' : 'Max simultaneous touches'}</span>
                <span className="text-[10px] text-text-secondary">{locale === 'ko' ? 'Precision TP 사용 시 동시 인식 손가락 수' : 'Max fingers tracked (Precision TP only)'}</span>
              </div>
              <span className="text-xs font-mono text-accent w-6 text-right">{maxTouches}</span>
            </div>
            <input
              type="range" min={1} max={10} step={1}
              value={maxTouches}
              onChange={(e) => setMaxTouches(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </div>

        {/* Plugins */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label-tag">{t(locale, 'plugins')}</span>
            <div className="flex gap-2">
              <button className="text-[10px] text-text-secondary hover:text-accent underline" onClick={handlePluginReload}>
                {t(locale, 'pluginReload')}
              </button>
              <button className="text-[10px] text-text-secondary hover:text-accent underline" onClick={() => window.electronAPI?.openPluginsDir?.()}>
                {t(locale, 'pluginOpenDir')}
              </button>
            </div>
          </div>
          {plugins.length === 0 ? (
            <p className="text-xs text-text-secondary font-mono">{t(locale, 'pluginNoPlugins')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {plugins.map((p) => (
                <div key={p.file} className="p-2.5 rounded-lg bg-bg-primary border border-zone-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-accent">{p.name}</span>
                    <span className="text-[10px] font-mono text-zone-border">v{p.version}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.actions.map((a) => (
                      <span key={a.id} className="px-1.5 py-0.5 rounded bg-bg-card border border-zone-border text-[10px] font-mono text-text-secondary">
                        {a.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts */}
        <div className="flex flex-col gap-2">
          <span className="label-tag">{t(locale, 'shortcuts')}</span>
          <div className="flex flex-col gap-1.5">
            {shortcuts.map((s) => (
              <div key={s.key} className="flex items-center justify-between py-1.5 border-b border-zone-border last:border-0">
                <kbd className="px-2 py-0.5 rounded bg-bg-primary border border-zone-border text-accent font-mono text-xs">
                  {s.key}
                </kbd>
                <span className="text-xs text-text-secondary text-right">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="flex flex-col gap-2">
          <span className="label-tag">{t(locale, 'tips')}</span>
          <div className="flex flex-col gap-2">
            {tips.map((tip) => (
              <div key={tip.title} className="flex flex-col gap-0.5 p-3 rounded-lg bg-bg-primary border border-zone-border">
                <span className="text-xs font-semibold text-accent">{tip.title}</span>
                <span className="text-xs text-text-secondary">{tip.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Version */}
        <div className="flex items-center justify-between pt-2 border-t border-zone-border">
          <span className="text-xs text-zone-border font-mono">TrackPad Controller v0.1.0</span>
          <span className="text-xs text-zone-border">Windows + macOS</span>
        </div>
      </div>
    </div>
  )
}
