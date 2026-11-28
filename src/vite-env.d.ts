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
    __BENCH__?: {
      view: string
      fps: number
      low: number
      ms: number
      p99ms: number
      maxMs: number
      over16: number
      over33: number
      warmupFrames: number
      warmupMs: number
      warmupMaxMs: number
    }[]
  }
}
