/**
 * MIDI Engine — Main Process
 * node-midi 기반 MIDI Note On/Off, 포트 관리, MIDI Clock 마스터/슬레이브
 */
import { ipcMain, BrowserWindow } from 'electron'

let midiOutput: InstanceType<typeof import('midi').Output> | null = null
let midiInput: InstanceType<typeof import('midi').Input> | null = null

// MIDI Clock master
let clockInterval: ReturnType<typeof setInterval> | null = null
let clockMode: 'off' | 'master' | 'slave' = 'off'
let slaveBeatCount = 0

function stopClock() {
  if (clockInterval) {
    clearInterval(clockInterval)
    clockInterval = null
  }
  // Send MIDI Stop message
  if (midiOutput) {
    try { midiOutput.sendMessage([0xFC]) } catch (_) {}
  }
}

function startMasterClock(bpm: number) {
  stopClock()
  if (!midiOutput) return

  // MIDI Clock: 24 pulses per quarter note
  const intervalMs = (60000 / bpm) / 24

  // Send MIDI Start
  try { midiOutput.sendMessage([0xFA]) } catch (_) {}

  clockInterval = setInterval(() => {
    if (midiOutput) {
      try { midiOutput.sendMessage([0xF8]) } catch (_) {}
    }
  }, intervalMs)
}

export function initMidiEngine(win: BrowserWindow) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let midi: any = null
  try {
    midi = require('midi')
  } catch (e) {
    console.warn('[MIDI] midi package not available:', e)
  }

  // MIDI 출력 포트 목록 조회 — midi 없으면 빈 배열 반환
  ipcMain.handle('midi-get-ports', () => {
    if (!midi) return []
    try {
      const output = new midi.Output()
      const count = output.getPortCount()
      const ports: string[] = []
      for (let i = 0; i < count; i++) {
        ports.push(output.getPortName(i))
      }
      output.closePort()
      return ports
    } catch { return [] }
  })

  // Pitch Bend (-8192 ~ 8191, 0 = center)
  ipcMain.handle('midi-pitchbend', (_event, { channel, value }: { channel: number; value: number }) => {
    if (!midiOutput) return { error: 'No MIDI output open' }
    try {
      const clamped = Math.max(-8192, Math.min(8191, value))
      const shifted = clamped + 8192   // 0 ~ 16383
      const lsb = shifted & 0x7F
      const msb = (shifted >> 7) & 0x7F
      midiOutput.sendMessage([0xE0 + (channel - 1), lsb, msb])
      return { ok: true }
    } catch (e) { return { error: String(e) } }
  })

  // MIDI Learn: 다음 MIDI 입력 메시지를 캐치해서 렌더러로 전송
  let learnActive = false
  ipcMain.handle('midi-learn-start', () => {
    if (!midi) return { error: 'MIDI not available' }
    learnActive = true
    if (!midiInput) {
      try {
        const input = new midi.Input()
        midiInput = input
        if (input.getPortCount() === 0) { midiInput = null; return { error: 'No MIDI input' } }
        input.openPort(0)
        input.on('message', (_dt: number, msg: number[]) => {
          if (!learnActive) return
          const status = msg[0] & 0xF0
          if (status === 0x90 || status === 0xB0) {
            learnActive = false
            win.webContents.send('midi-learn-event', {
              type: status === 0x90 ? 'note' : 'cc',
              channel: (msg[0] & 0x0F) + 1,
              number: msg[1],
            })
          }
        })
      } catch (e) { return { error: String(e) } }
    }
    return { ok: true }
  })
  ipcMain.handle('midi-learn-stop', () => { learnActive = false; return { ok: true } })

  // MIDI CC (Control Change)
  ipcMain.handle('midi-cc', (_event, { channel, cc, value }) => {
    if (!midiOutput) return { error: 'No MIDI output open' }
    try {
      const status = 0xB0 + (channel - 1)
      midiOutput.sendMessage([status, Math.max(0, Math.min(127, cc)), Math.max(0, Math.min(127, value))])
      return { ok: true }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // MIDI Note On/Off
  ipcMain.handle('midi-note', (_event, { channel, note, velocity, on }) => {
    if (!midiOutput) return { error: 'No MIDI output open' }
    try {
      const status = on ? 0x90 + (channel - 1) : 0x80 + (channel - 1)
      midiOutput.sendMessage([status, note, on ? velocity : 0])
      return { ok: true }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // 기본 포트 자동 연결
  ipcMain.handle('midi-open-port', (_event, portIndex: number) => {
    if (!midi) return { error: 'MIDI not available' }
    try {
      if (midiOutput) {
        midiOutput.closePort()
      }
      midiOutput = new midi.Output()
      midiOutput!.openPort(portIndex)
      win.webContents.send('midi-port-changed', midiOutput!.getPortName(portIndex))
      return { ok: true }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // 가상 포트 열기 (loopMIDI 없을 때)
  ipcMain.handle('midi-open-virtual', () => {
    if (!midi) return { error: 'MIDI not available' }
    try {
      if (midiOutput) midiOutput.closePort()
      midiOutput = new midi.Output()
      midiOutput!.openVirtualPort('TrackPad Controller')
      win.webContents.send('midi-port-changed', 'TrackPad Controller (Virtual)')
      return { ok: true }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // ── MIDI Clock ───────────────────────────────────────────────
  ipcMain.handle('midi-clock-set', (_event, { mode, bpm }: { mode: 'off' | 'master' | 'slave'; bpm: number }) => {
    if (!midi) return { error: 'MIDI not available' }
    clockMode = mode

    // Stop any existing clock/input
    stopClock()
    if (midiInput) {
      try { midiInput.closePort() } catch (_) {}
      midiInput = null
    }

    if (mode === 'master') {
      startMasterClock(bpm)
      return { ok: true, mode: 'master' }
    }

    if (mode === 'slave') {
      try {
        const input = new midi.Input()
        midiInput = input
        const inputCount = input.getPortCount()
        if (inputCount === 0) {
          midiInput = null
          return { error: 'No MIDI input ports available for slave mode' }
        }
        // Open first available input port
        input.openPort(0)
        slaveBeatCount = 0
        let lastClockTime = 0

        input.on('message', (_deltaTime: number, message: number[]) => {
          const status = message[0]
          if (status === 0xF8) {
            // MIDI Clock pulse
            slaveBeatCount++
            if (slaveBeatCount % 24 === 0) {
              // One quarter note elapsed
              const now = Date.now()
              if (lastClockTime > 0) {
                const elapsed = now - lastClockTime
                const bpmCalc = Math.round(60000 / elapsed)
                win.webContents.send('midi-clock-bpm', bpmCalc)
              }
              lastClockTime = now
            }
          } else if (status === 0xFA) {
            // MIDI Start
            slaveBeatCount = 0
            lastClockTime = 0
            win.webContents.send('midi-clock-slave-start')
          } else if (status === 0xFC) {
            // MIDI Stop
            win.webContents.send('midi-clock-slave-stop')
          }
        })
        return { ok: true, mode: 'slave' }
      } catch (e) {
        return { error: String(e) }
      }
    }

    // mode === 'off'
    return { ok: true, mode: 'off' }
  })

  // ── MIDI Thru ────────────────────────────────────────────────────
  // 외부 MIDI 입력 → 출력으로 그대로 전달
  let thruActive = false
  // midiInput is shared with learn/slave mode, so re-enabling thru without
  // going through the disabled branch must not stack a second forwarding
  // listener on top of the first — track and remove our own listener first.
  let thruListener: ((deltaTime: number, message: number[]) => void) | null = null
  ipcMain.handle('midi-thru-set', (_event, enabled: boolean) => {
    thruActive = enabled
    if (enabled && midi) {
      if (!midiInput) {
        try {
          const input = new midi.Input()
          midiInput = input
          if (input.getPortCount() === 0) { midiInput = null; return { error: 'No MIDI input' } }
          input.openPort(0)
        } catch (e) { return { error: String(e) } }
      }
      if (!midiInput) return { error: 'No MIDI input' }
      if (thruListener) midiInput.removeListener('message', thruListener)
      thruListener = (_dt: number, msg: number[]) => {
        if (!thruActive || !midiOutput) return
        try { midiOutput.sendMessage(msg) } catch (_) {}
      }
      midiInput.on('message', thruListener)
      return { ok: true, enabled: true }
    }
    // disabled: close thru input if not used by learn/slave
    if (!enabled && midiInput) {
      if (thruListener) { try { midiInput.removeListener('message', thruListener) } catch (_) {} }
      try { midiInput.closePort() } catch (_) {}
      midiInput = null
    }
    thruListener = null
    return { ok: true, enabled: false }
  })

  // Update master clock BPM without restarting
  ipcMain.handle('midi-clock-update-bpm', (_event, bpm: number) => {
    if (clockMode === 'master') {
      startMasterClock(bpm)
    }
    return { ok: true }
  })

  if (midi) {
    console.log('[MIDI] Engine initialized')
  } else {
    console.log('[MIDI] Engine initialized (no MIDI hardware — handlers registered)')
  }
}

export function cleanupMidi() {
  stopClock()
  if (midiInput) {
    try { midiInput.closePort() } catch (_) {}
    midiInput = null
  }
  if (midiOutput) {
    midiOutput.closePort()
    midiOutput = null
  }
}
