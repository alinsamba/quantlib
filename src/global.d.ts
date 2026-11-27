export {}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>
      [key: string]: unknown
    }
  }
}
