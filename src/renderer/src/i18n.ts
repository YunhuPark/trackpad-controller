export type Locale = 'ko' | 'en'

const translations = {
  ko: {
    // Phase 4
    overlay: '오버레이 모드',
    overlayOn: '항상 위 (투명)',
    overlayOff: '일반 모드',
    pressureCurve: '압력 커브',
    pressureCurveReset: '초기화',
    osc: 'OSC 출력',
    oscHost: 'Host',
    oscPort: 'Port',
    oscApply: '적용',
    plugins: '플러그인',
    pluginReload: '다시 로드',
    pluginOpenDir: '폴더 열기',
    pluginNoPlugins: '플러그인 없음',
    // BPM / Metronome
    bpm: 'BPM',
    metronomeOn: '🎵 메트로놈 ON',
    metronomeOff: '🔇 메트로놈 OFF',
    // Layer / Grid
    layer: 'Layer',
    grid: 'Grid',
    // Quantize
    loopQuantize: 'Loop Quantize',
    noteRepeat: 'Note Repeat',
    // MIDI Clock
    midiClock: 'MIDI Clock',
    master: 'Master',
    slave: 'Slave',
    off: 'OFF',
    // Preset
    preset: '프리셋',
    exportPreset: '내보내기',
    importPreset: '불러오기',
    // MIDI Out
    midiOut: 'MIDI Out',
    refresh: '새로고침',
    noPortsFound: '포트 없음',
    openVirtualPort: '+ 가상 포트 열기',
    // Status
    precisionTP: 'Precision TP ✓',
    legacyHID: 'Legacy HID (제한)',
    noTouchpad: '트랙패드 없음',
    // Settings
    settingsTitle: '설정 & 도움말',
    shortcuts: '키보드 단축키',
    tips: '사용 팁',
    theme: '테마',
    dark: '다크',
    light: '라이트',
    language: '언어',
    // Tips content
    tip_midi: 'MIDI 포트',
    tip_midi_desc: '우측 패널 → MIDI Out → 포트 선택 또는 가상 포트 열기',
    tip_loopmidi: 'loopMIDI',
    tip_loopmidi_desc: 'Windows에서 가상 MIDI 포트 필요 시 loopMIDI 설치 필요',
    tip_touchpad: '터치패드',
    tip_touchpad_desc: '현재 uiohook 마우스 훅 (레거시 모드). 앱 포커스 상태에서 동작',
    tip_noterepeat: 'Note Repeat',
    tip_noterepeat_desc: '존을 누르고 있으면 BPM에 맞춰 반복 트리거',
    tip_quantize: 'Quantize',
    tip_quantize_desc: 'Note On을 다음 그리드 경계에 맞춰 지연 발사',
    // Shortcut descriptions
    sc_layer: 'Layer 전환',
    sc_grid: 'Grid 순환 (2×2 → 3×3 → 4×4)',
    sc_quantize: 'Loop Quantize 순환 (OFF → 1/8 → 1/16)',
    sc_noterepeat: 'Note Repeat 순환 (OFF → 1/8 → 1/16)',
    sc_tap: 'Tap Tempo',
    sc_metronome: '메트로놈 ON/OFF',
    sc_dblclick: '존 편집 모달 열기',
    sc_reset: '세션 초기화 (활성 존 전체 해제)',
    sc_esc: '패드 비활성화',
    // Input settings
    inputSettings: '입력 설정',
    sensitivity: '감도',
    deadZone: '데드존',
    sensitivityDesc: '압력 배율 (0.1 ~ 3.0)',
    deadZoneDesc: '최소 이동 임계값 (0 ~ 0.15)',
    // loopMIDI guide
    loopMidiGuide: 'loopMIDI 설치 필요',
    loopMidiGuideDesc: 'Windows에서 MIDI를 사용하려면 loopMIDI 가상 포트 드라이버를 설치하세요. (tobias-erichsen.de)',
    // IAC Driver guide
    iacDriverGuide: 'IAC Driver 활성화 필요',
    iacDriverGuideDesc: 'macOS에서 MIDI를 사용하려면 Audio MIDI 설정 → IAC 드라이버 → "장치가 온라인 상태입니다" 활성화하세요.',
  },
  en: {
    // Phase 4
    overlay: 'Overlay Mode',
    overlayOn: 'Always on Top (Transparent)',
    overlayOff: 'Normal Mode',
    pressureCurve: 'Pressure Curve',
    pressureCurveReset: 'Reset',
    osc: 'OSC Output',
    oscHost: 'Host',
    oscPort: 'Port',
    oscApply: 'Apply',
    plugins: 'Plugins',
    pluginReload: 'Reload',
    pluginOpenDir: 'Open Folder',
    pluginNoPlugins: 'No plugins found',
    // BPM / Metronome
    bpm: 'BPM',
    metronomeOn: '🎵 Metronome ON',
    metronomeOff: '🔇 Metronome OFF',
    // Layer / Grid
    layer: 'Layer',
    grid: 'Grid',
    // Quantize
    loopQuantize: 'Loop Quantize',
    noteRepeat: 'Note Repeat',
    // MIDI Clock
    midiClock: 'MIDI Clock',
    master: 'Master',
    slave: 'Slave',
    off: 'OFF',
    // Preset
    preset: 'Preset',
    exportPreset: 'Export',
    importPreset: 'Import',
    // MIDI Out
    midiOut: 'MIDI Out',
    refresh: 'Refresh',
    noPortsFound: 'No ports found',
    openVirtualPort: '+ Open Virtual Port',
    // Status
    precisionTP: 'Precision TP ✓',
    legacyHID: 'Legacy HID (limited)',
    noTouchpad: 'No touchpad',
    // Settings
    settingsTitle: 'Settings & Help',
    shortcuts: 'Keyboard Shortcuts',
    tips: 'Tips',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    language: 'Language',
    // Tips content
    tip_midi: 'MIDI Port',
    tip_midi_desc: 'Right panel → MIDI Out → Select port or open virtual port',
    tip_loopmidi: 'loopMIDI',
    tip_loopmidi_desc: 'Install loopMIDI on Windows for virtual MIDI port support',
    tip_touchpad: 'Touchpad',
    tip_touchpad_desc: 'Uses uiohook mouse hook (legacy mode). Works when app is focused',
    tip_noterepeat: 'Note Repeat',
    tip_noterepeat_desc: 'Holding a zone triggers repeated notes in sync with BPM',
    tip_quantize: 'Quantize',
    tip_quantize_desc: 'Delays Note On to snap to the next grid boundary',
    // Shortcut descriptions
    sc_layer: 'Switch Layer',
    sc_grid: 'Cycle Grid (2×2 → 3×3 → 4×4)',
    sc_quantize: 'Cycle Quantize (OFF → 1/8 → 1/16)',
    sc_noterepeat: 'Cycle Note Repeat (OFF → 1/8 → 1/16)',
    sc_tap: 'Tap Tempo',
    sc_metronome: 'Metronome ON/OFF',
    sc_dblclick: 'Open Zone Edit Modal',
    sc_reset: 'Session Reset (clear all active zones)',
    sc_esc: 'Deactivate Pad',
    // Input settings
    inputSettings: 'Input Settings',
    sensitivity: 'Sensitivity',
    deadZone: 'Dead Zone',
    sensitivityDesc: 'Pressure multiplier (0.1 – 3.0)',
    deadZoneDesc: 'Minimum movement threshold (0 – 0.15)',
    // loopMIDI guide
    loopMidiGuide: 'loopMIDI Required',
    loopMidiGuideDesc: 'Install the loopMIDI virtual port driver to use MIDI on Windows. (tobias-erichsen.de)',
    // IAC Driver guide
    iacDriverGuide: 'IAC Driver Required',
    iacDriverGuideDesc: 'Enable the IAC Driver in macOS: Audio MIDI Setup → IAC Driver → check "Device is online".',
  },
} as const

export type TranslationKey = keyof typeof translations.ko

export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale][key]
}
