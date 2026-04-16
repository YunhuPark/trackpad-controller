/**
 * ZoneEngine — 트랙패드 좌표를 존 인덱스로 변환하는 핵심 로직
 * 플랫폼 독립적 (main process에서도, renderer에서도 사용 가능)
 */

export type GridSize = '2x2' | '3x3' | '4x4'

export interface ZoneConfig {
  id: string          // e.g. "zone-0-1"
  row: number
  col: number
  label: string
  color: string
  action: ZoneAction
}

export type MediaAction = 'play' | 'pause' | 'stop' | 'next' | 'prev' | 'mute' | 'volumeUp' | 'volumeDown'
export type ArpPattern = 'up' | 'down' | 'random' | 'updown'
export type ArpRate = '1/4' | '1/8' | '1/16' | '1/32'
export type ExpressionTarget = 'pitchbend' | 'mod' | 'aftertouch' | 'none'

export interface ZoneAction {
  type: 'midi' | 'keyboard' | 'script' | 'osc' | 'plugin' | 'cc' | 'media' | 'chord' | 'webhook' | 'none'

  // ── MIDI Note ───────────────────────────────────────────────────
  midiInstrument?: 'piano' | 'drum'
  midiNote?: number
  midiChannel?: number
  midiVelocity?: number
  midiVelocityMin?: number
  midiVelocityMax?: number

  // ── X/Y Expression (midi 타입에서 추가 활성화) ──────────────────
  expressionX?: ExpressionTarget   // X축 → pitchbend / mod / aftertouch
  expressionY?: ExpressionTarget   // Y축 → pitchbend / mod / aftertouch
  expressionChannel?: number

  // ── Arpeggiator ─────────────────────────────────────────────────
  arpEnabled?: boolean
  arpPattern?: ArpPattern
  arpRate?: ArpRate

  // ── Chord ───────────────────────────────────────────────────────
  chordNotes?: number[]     // MIDI note numbers
  chordChannel?: number

  // ── Webhook ─────────────────────────────────────────────────────
  webhookUrl?: string
  webhookMethod?: 'GET' | 'POST'
  webhookBody?: string      // JSON 템플릿 ({{on}}, {{zone}} 치환 가능)

  // ── MIDI CC ─────────────────────────────────────────────────────
  midiCC?: number
  midiCCChannel?: number
  ccAxis?: 'x' | 'y'

  // ── Keyboard ────────────────────────────────────────────────────
  keys?: string[]
  keySequence?: Array<{ keys: string[]; delayMs: number }>

  // ── Script / OSC / Plugin / Media ───────────────────────────────
  script?: string
  oscAddress?: string
  oscArgs?: Array<{ type: 'i' | 'f'; value: number }>
  pluginFile?: string
  pluginActionId?: string
  mediaAction?: MediaAction
}

// ── Scale Lock ──────────────────────────────────────────────────────
export const SCALE_INTERVALS: Record<string, number[]> = {
  'Major':           [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24],
  'Minor':           [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24],
  'Pentatonic Maj':  [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33],
  'Pentatonic Min':  [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34],
  'Blues':           [0, 3, 5, 6, 7, 10, 12, 15, 17, 18, 19, 22, 24, 27, 29],
  'Dorian':          [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22, 24],
  'Mixolydian':      [0, 2, 4, 5, 7, 9, 10, 12, 14, 16, 17, 19, 21, 22, 24],
  'Lydian':          [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24],
  'Phrygian':        [0, 1, 3, 5, 7, 8, 10, 12, 13, 15, 17, 19, 20, 22, 24],
  'Chromatic':       [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** 스케일 락: 존 인덱스 → MIDI 노트 계산 (root = MIDI 번호, octave는 root 기준) */
export function scaleNoteAt(root: number, scaleName: string, index: number): number {
  const intervals = SCALE_INTERVALS[scaleName] ?? SCALE_INTERVALS['Major']
  const octaveOffset = Math.floor(index / intervals.length) * 12
  const semitone = intervals[index % intervals.length]
  return Math.min(127, root + semitone + octaveOffset)
}

export interface TouchPoint {
  x: number     // 0.0 ~ 1.0 normalized
  y: number
  pressure: number
  id: number
  mode: 'precision' | 'legacy'
}

export interface ZoneBounds {
  x: number  // 0-1 normalized
  y: number  // 0-1 normalized
  w: number  // 0-1 normalized
  h: number  // 0-1 normalized
}

export interface ZoneLayout {
  colWidths: number[]   // length = cols, each 0-1, sum = 1
  rowHeights: number[]  // length = rows, each 0-1, sum = 1
}

/** 그리드 기본 레이아웃 생성 (equal sizes) */
export function createDefaultLayout(grid: GridSize): ZoneLayout {
  const { rows, cols } = getGridDimensions(grid)
  return {
    colWidths: Array(cols).fill(1 / cols),
    rowHeights: Array(rows).fill(1 / rows),
  }
}

/** row/col + 레이아웃 → 절대 bounds (0-1 정규화) */
export function getZoneBounds(row: number, col: number, layout: ZoneLayout): ZoneBounds {
  const x = layout.colWidths.slice(0, col).reduce((a, b) => a + b, 0)
  const y = layout.rowHeights.slice(0, row).reduce((a, b) => a + b, 0)
  return { x, y, w: layout.colWidths[col] ?? 0, h: layout.rowHeights[row] ?? 0 }
}

/** 정규화 좌표 (x,y) → 해당 존 반환 (레이아웃 기반) */
export function getZoneAtPoint(
  x: number,
  y: number,
  zones: ZoneConfig[],
  layout: ZoneLayout
): ZoneConfig | null {
  let cumX = 0
  let col = layout.colWidths.length - 1
  for (let c = 0; c < layout.colWidths.length; c++) {
    if (x < cumX + layout.colWidths[c]) { col = c; break }
    cumX += layout.colWidths[c]
  }
  let cumY = 0
  let row = layout.rowHeights.length - 1
  for (let r = 0; r < layout.rowHeights.length; r++) {
    if (y < cumY + layout.rowHeights[r]) { row = r; break }
    cumY += layout.rowHeights[r]
  }
  const id = zoneId(row, col)
  return zones.find((z) => z.id === id) ?? null
}

export function getGridDimensions(grid: GridSize): { rows: number; cols: number } {
  const map: Record<GridSize, { rows: number; cols: number }> = {
    '2x2': { rows: 2, cols: 2 },
    '3x3': { rows: 3, cols: 3 },
    '4x4': { rows: 4, cols: 4 },
  }
  return map[grid]
}

/**
 * 터치 좌표(0~1 정규화) → 존 row/col 반환
 */
export function getTouchedZone(
  x: number,
  y: number,
  grid: GridSize
): { row: number; col: number } {
  const { rows, cols } = getGridDimensions(grid)
  const col = Math.min(Math.floor(x * cols), cols - 1)
  const row = Math.min(Math.floor(y * rows), rows - 1)
  return { row, col }
}

/**
 * row, col → zone id 문자열
 */
export function zoneId(row: number, col: number): string {
  return `zone-${row}-${col}`
}

/**
 * 기본 존 설정 생성
 */
export function createDefaultZones(grid: GridSize): ZoneConfig[] {
  const { rows, cols } = getGridDimensions(grid)
  const noteBase = 36 // C2
  const zones: ZoneConfig[] = []

  const colors = [
    '#7c6af7', '#5ee7b4', '#f7a066', '#f76c6c',
    '#6cf7f7', '#f7d96c', '#c46cf7', '#6ca8f7',
  ]

  let noteIdx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      zones.push({
        id: zoneId(r, c),
        row: r,
        col: c,
        label: `${noteIdx + 1}`,
        color: colors[noteIdx % colors.length],
        action: {
          type: 'midi',
          midiNote: noteBase + noteIdx,
          midiChannel: 1,
          midiVelocity: 100,
        }
      })
      noteIdx++
    }
  }
  return zones
}
