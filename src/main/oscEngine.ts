/**
 * OSC Engine — Main Process
 * Node.js dgram (UDP)를 사용한 OSC 출력. 외부 패키지 불필요.
 *
 * OSC message wire format:
 *  [address]\0 (padded to 4-byte)
 *  [typetag]\0 (padded to 4-byte, starts with ',')
 *  [arg0][arg1]... (each 4 bytes, big-endian)
 */
import { ipcMain } from 'electron'
import * as dgram from 'dgram'

let udpSocket: dgram.Socket | null = null
let oscHost = '127.0.0.1'
let oscPort = 8000

// ── OSC binary encoding ───────────────────────────────────────────
function padTo4(len: number): number {
  return Math.ceil(len / 4) * 4
}

function encodeOscString(s: string): Buffer {
  const raw = Buffer.from(s + '\0', 'ascii')
  const padded = Buffer.alloc(padTo4(raw.length), 0)
  raw.copy(padded)
  return padded
}

function encodeInt32(n: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeInt32BE(n, 0)
  return buf
}

function encodeFloat32(f: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeFloatBE(f, 0)
  return buf
}

/**
 * OSC メッセージをビルド
 * args: array of { type: 'i'|'f', value: number }
 */
function buildOscMessage(
  address: string,
  args: Array<{ type: 'i' | 'f'; value: number }>
): Buffer {
  const addrBuf = encodeOscString(address)
  const typeTag = ',' + args.map((a) => a.type).join('')
  const tagBuf = encodeOscString(typeTag)
  const argBufs = args.map((a) =>
    a.type === 'i' ? encodeInt32(Math.round(a.value)) : encodeFloat32(a.value)
  )
  return Buffer.concat([addrBuf, tagBuf, ...argBufs])
}

function sendOsc(address: string, args: Array<{ type: 'i' | 'f'; value: number }>) {
  if (!udpSocket) return
  const msg = buildOscMessage(address, args)
  udpSocket.send(msg, 0, msg.length, oscPort, oscHost, (err) => {
    if (err) console.warn('[OSC] send error:', err.message)
  })
}

export function initOscEngine() {
  // Config handler
  ipcMain.handle('osc-set-config', (_event, config: { host: string; port: number }) => {
    oscHost = config.host || '127.0.0.1'
    oscPort = config.port || 8000

    // Re-create socket on config change
    if (udpSocket) {
      udpSocket.close()
      udpSocket = null
    }
    udpSocket = dgram.createSocket('udp4')
    udpSocket.on('error', (err) => {
      console.warn('[OSC] socket error:', err.message)
    })
    return { ok: true, host: oscHost, port: oscPort }
  })

  // Send OSC note message: /trackpad/note <channel:i> <note:i> <velocity:i> <on:i>
  ipcMain.handle('osc-note', (_event, { channel, note, velocity, on }) => {
    if (!udpSocket) return { error: 'OSC not configured' }
    sendOsc('/trackpad/note', [
      { type: 'i', value: channel },
      { type: 'i', value: note },
      { type: 'i', value: velocity },
      { type: 'i', value: on ? 1 : 0 },
    ])
    return { ok: true }
  })

  // Send OSC zone trigger: /trackpad/zone/<id> <on:i> <pressure:f>
  ipcMain.handle('osc-zone', (_event, { zoneId, on, pressure }) => {
    if (!udpSocket) return { error: 'OSC not configured' }
    sendOsc(`/trackpad/zone/${zoneId}`, [
      { type: 'i', value: on ? 1 : 0 },
      { type: 'f', value: pressure ?? 1.0 },
    ])
    return { ok: true }
  })

  // Send custom OSC message (for zone action type 'osc')
  ipcMain.handle('osc-custom', (_event, { address, args }: { address: string; args?: Array<{ type: 'i' | 'f'; value: number }> }) => {
    if (!udpSocket) return { error: 'OSC not configured' }
    if (!address) return { error: 'No address' }
    sendOsc(address, args ?? [])
    return { ok: true }
  })

  // Default socket (localhost:8000)
  udpSocket = dgram.createSocket('udp4')
  udpSocket.on('error', (err) => {
    console.warn('[OSC] socket error:', err.message)
  })

  console.log('[OSC] Engine initialized → udp://' + oscHost + ':' + oscPort)
}

export function cleanupOsc() {
  if (udpSocket) {
    udpSocket.close()
    udpSocket = null
  }
}
