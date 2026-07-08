// Electron preload가 노출하는 window.tray API (Plan 2 소유 — Plan 1은 존재할 때만 호출)
export {}

declare global {
  interface Window {
    tray?: {
      hide(): void
      resize(w: number, h: number): void
      setOpacity(v: number, persist?: boolean): void
      setTheme(mode: 'light' | 'dark'): void
      onOpacity(cb: (v: number) => void): () => void
      onTheme(cb: (theme: 'light' | 'dark') => void): () => void
    }
  }
}
