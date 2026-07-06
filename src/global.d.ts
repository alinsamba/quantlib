export {}

declare global {
  interface Window {
    ipcRenderer: {
      on(channel: string, listener: (...args: any[]) => void): void
      off(channel: string, ...omit: any[]): void
      send(channel: string, ...args: any[]): void
      invoke(channel: string, ...args: any[]): Promise<any>
    }
  }
}
