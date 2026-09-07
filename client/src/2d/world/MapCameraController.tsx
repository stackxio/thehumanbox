import { useEffect, useRef, type MutableRefObject } from 'react'
import { useUIStore } from '../../stores/store'
import { clampMapCamera, isMapControl, zoomMapAt, type MapCamera, type MapCommand } from './camera-controls'

interface Props {
  worldW: number
  worldH: number
  containerW: number
  containerH: number
  containerEl: HTMLDivElement | null
  cameraStateRef: MutableRefObject<MapCamera>
  commandRef: MutableRefObject<MapCommand | null>
  followTarget: { x: number; y: number } | null
}
export function MapCameraController({
  worldW,
  worldH,
  containerW,
  containerH,
  containerEl,
  cameraStateRef,
  commandRef,
  followTarget,
}: Props) {
  const initialized = useRef(false)
  const previousFollow = useRef(false)
  const minZoom = Math.min(containerW / worldW, containerH / worldH) * 0.85
  const apply = (next: MapCamera) => {
    const bounded = clampMapCamera(next, { w: worldW, h: worldH }, { w: containerW, h: containerH })
    cameraStateRef.current = bounded
  }
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      const zoom = Math.min(containerW / worldW, containerH / worldH) * 0.95
      applyRef.current({ x: worldW / 2, y: worldH / 2, zoom })
    } else applyRef.current(cameraStateRef.current)
  }, [worldW, worldH, containerW, containerH, cameraStateRef])

  useEffect(() => {
    if (followTarget)
      applyRef.current({ ...followTarget, zoom: previousFollow.current ? cameraStateRef.current.zoom : 3.5 })
    previousFollow.current = !!followTarget
  }, [followTarget, cameraStateRef])

  useEffect(() => {
    if (!containerEl) return
    let drag: { px: number; py: number; camera: MapCamera; id: number } | null = null
    const keys = new Set<string>()
    const stopFollow = () => {
      const ui = useUIStore.getState()
      if (ui.followOrgId) ui.followOrg(null)
    }
    const zoom = (factor: number, point = { x: containerW / 2, y: containerH / 2 }) => {
      const current = cameraStateRef.current
      const next = Math.max(minZoom, Math.min(8, current.zoom * factor))
      applyRef.current(zoomMapAt(current, next, point, { w: containerW, h: containerH }))
    }
    const onDown = (e: PointerEvent) => {
      if (isMapControl(e.target) || (e.button !== 0 && e.button !== 1)) return
      if (drag) {
        drag = null
        return
      }
      drag = { px: e.clientX, py: e.clientY, camera: { ...cameraStateRef.current }, id: e.pointerId }
      containerEl.focus({ preventScroll: true })
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.px,
        dy = e.clientY - drag.py
      if (dx * dx + dy * dy < 36) return
      stopFollow()
      applyRef.current({
        ...drag.camera,
        x: drag.camera.x - dx / drag.camera.zoom,
        y: drag.camera.y - dy / drag.camera.zoom,
      })
    }
    const onUp = () => {
      drag = null
    }
    const onWheel = (e: WheelEvent) => {
      if (isMapControl(e.target)) return
      e.preventDefault()
      const rect = containerEl.getBoundingClientRect()
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? containerH : 1)
      stopFollow()
      zoom(Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.0025), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
    const onKey = (e: KeyboardEvent) => {
      if (
        isMapControl(e.target) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        !containerEl.contains(document.activeElement)
      )
        return
      const key = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault()
        stopFollow()
        keys.add(key)
      } else if (key === '+' || key === '=') {
        e.preventDefault()
        zoom(1.2)
      } else if (key === '-') {
        e.preventDefault()
        zoom(1 / 1.2)
      } else if (key === '0') {
        e.preventDefault()
        commandRef.current = { kind: 'fit' }
      }
    }
    const keyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    const reset = () => {
      keys.clear()
      drag = null
    }
    let raf = 0,
      last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const command = commandRef.current
      if (command) {
        commandRef.current = null
        stopFollow()
        if (command.kind === 'fit')
          applyRef.current({
            x: worldW / 2,
            y: worldH / 2,
            zoom: Math.min(containerW / worldW, containerH / worldH) * 0.95,
          })
        else if (command.kind === 'zoom') zoom(command.factor)
        else applyRef.current({ x: command.x, y: command.y, zoom: Math.max(cameraStateRef.current.zoom, 2) })
      }
      if (keys.size && document.activeElement === containerEl) {
        const x =
          Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))
        const y =
          Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'))
        const step = (480 * dt) / cameraStateRef.current.zoom / (Math.hypot(x, y) || 1)
        applyRef.current({
          ...cameraStateRef.current,
          x: cameraStateRef.current.x + x * step,
          y: cameraStateRef.current.y + y * step,
        })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    containerEl.addEventListener('pointerdown', onDown)
    containerEl.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', reset)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', reset)
    return () => {
      cancelAnimationFrame(raf)
      containerEl.removeEventListener('pointerdown', onDown)
      containerEl.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', reset)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', reset)
    }
  }, [cameraStateRef, commandRef, containerEl, containerW, containerH, minZoom, worldW, worldH])

  useEffect(() => {
    if (!containerEl) return
    let distance = 0
    const pinch = (e: TouchEvent) => {
      if (e.touches.length !== 2 || isMapControl(e.target)) {
        distance = 0
        return
      }
      e.preventDefault()
      const [a, b] = [e.touches[0], e.touches[1]]
      const next = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      if (distance > 0 && next > 0) {
        const current = cameraStateRef.current
        const rect = containerEl.getBoundingClientRect()
        useUIStore.getState().followOrg(null)
        applyRef.current(
          zoomMapAt(
            current,
            Math.max(minZoom, Math.min(8, (current.zoom * next) / distance)),
            { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top },
            { w: containerW, h: containerH },
          ),
        )
      }
      distance = next
    }
    const reset = () => {
      distance = 0
    }
    containerEl.addEventListener('touchstart', pinch, { passive: false })
    containerEl.addEventListener('touchmove', pinch, { passive: false })
    containerEl.addEventListener('touchend', reset)
    containerEl.addEventListener('touchcancel', reset)
    return () => {
      containerEl.removeEventListener('touchstart', pinch)
      containerEl.removeEventListener('touchmove', pinch)
      containerEl.removeEventListener('touchend', reset)
      containerEl.removeEventListener('touchcancel', reset)
    }
  }, [containerEl, cameraStateRef, minZoom, containerW, containerH])
  return null
}
