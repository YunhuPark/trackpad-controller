// `midi` (node-midi) ships no types; this declares just the surface this app uses.
declare module 'midi' {
  class Port {
    getPortCount(): number
    getPortName(port: number): string
    openPort(port: number): void
    openVirtualPort(name: string): void
    closePort(): void
  }

  export class Output extends Port {
    sendMessage(message: number[]): void
  }

  export class Input extends Port {
    on(event: 'message', listener: (deltaTime: number, message: number[]) => void): this
  }
}
