/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    __UNIVERS__?: {
      ready: boolean
      setView: (name: string) => void
      warpTo: (id: string) => void
      viewSystem?: () => void
      toggleFollow?: () => void
      debug?: () => {
        mode: string
        follow: boolean
        dist: number
        tilt: number
        cam: number[]
        pivot: number[]
      }
    }
  }
}
