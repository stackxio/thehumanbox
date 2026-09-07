export function worldRenderScale(zoom: number, dpr: number, lowPerf: boolean): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1
  const density = Math.min(lowPerf ? 1 : 2, Math.max(1, dpr || 1))
  return Math.min(1, Math.max(lowPerf ? 0.125 : 0.25, Math.ceil(zoom * density * 8) / 8))
}

export function interpolationFactor(now: number, receivedAt: number, interval: number): number {
  return Math.max(0, Math.min(2, (now - receivedAt) / Math.max(50, interval)))
}

export function shouldRenderFrame(now: number, previous: number, fps: number): boolean {
  return now - previous >= 1000 / fps - 0.5
}
