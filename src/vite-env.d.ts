/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    __UNIVERS__?: {
      ready: boolean
    setView: (name: string) => void
    warpTo: (id: string) => void
    debug?: () => unknown
    }
  }
}
