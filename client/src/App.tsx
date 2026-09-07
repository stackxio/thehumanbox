import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { useSimulation } from './simulation/useSimulation'
import {
  getWorldSource,
  reloadAppSafely,
  resolvePlayerWorldKind,
  shouldUseSimulationApi,
} from './simulation/worldSource'
import { SimulationDataProvider } from './simulation/SimulationDataProvider'
import { SandboxToolbar } from './components/SandboxToolbar'
import type { LineageStrategy, SandboxTool } from './simulation/sandbox'
import { DesktopDownloadToast } from './components/DesktopDownloadToast'
import { CommandPalette } from './components/CommandPalette'
import { HeadlineTicker } from './components/HeadlineTicker'
import { trackEvent } from './lib/observability'
import { reconcileViewerSelection } from './lib/viewerSelection'
import { useUIStore } from './stores/store'
import { IS_LOCAL_SERVER } from './lib/config'
import { getDesktop, type SimMode } from './lib/desktop'
import {
  DESKTOP_PAUSE_WHEN_HIDDEN_EVENT,
  isDesktopWindowInactive,
  parsePauseWhenHiddenPreference,
  shouldPauseDesktopRenderer,
} from './lib/desktopVisibility'

import { WorldView } from './2d/world/WorldView'
import { EventLog } from './components/EventLog'
import { HistoryGrid } from './components/HistoryGrid'
import { LineagesList } from './components/LineagesList'
import { WorldFooter } from './components/WorldFooter'
import { AppHeader } from './components/AppHeader'
import { RightPanel } from './components/RightPanel'
import { ModalRouter } from './components/ModalRouter'
import { ThreeDLoading } from './components/ThreeDLoading'
import { ThreeDErrorBoundary } from './components/ThreeDErrorBoundary'
import { webglAvailable } from './lib/webgl'
import { MobileBanner } from './components/MobileBanner'
import { WelcomeModal } from './components/WelcomeModal'
import { UpdateToast } from './components/UpdateToast'
import { DesktopUpdateToast } from './components/DesktopUpdateToast'
import { useCurrentScene } from './stores/scene'
import type { OrganismState } from './types'
import { TILE_ID } from './world/terrain-ids'
import clsx from 'clsx'
import './App.css'

const WorldView3D = lazyWithRetry(() => import('./3d/world/WorldView3D'))
const SceneView = lazyWithRetry(() =>
  import('./scenes/components/SceneView').then((m) => ({ default: m.SceneView })),
)
function App() {
  return <LiveApp />
}

function LiveApp() {
  const worldSourceRef = useRef(getWorldSource())
  const desktop = getDesktop()
  const isLocalWebWorld = !desktop && worldSourceRef.current === 'wasm'
  const [desktopMode, setDesktopMode] = useState<SimMode | null>(desktop ? null : 'local')
  const [desktopPauseWhenHidden, setDesktopPauseWhenHidden] = useState(true)
  const [desktopRendererPaused, setDesktopRendererPaused] = useState(false)
  const desktopWindowInactiveRef = useRef(false)
  const {
    world,
    connected,
    interp,
    resume,
    sandboxAvailable,
    sendCommand,
    pauseSim,
    setSpeed,
    runtimeState,
    localSaveStatus,
    saveLocalWorld,
    loadLocalOrgDetail,
    loadLocalOrgLife,
  } = useSimulation(worldSourceRef.current)
  const localStartupFailed = !world && localSaveStatus.phase === 'error' && localSaveStatus.fatal === true
  const playerWorldKind = resolvePlayerWorldKind(worldSourceRef.current, {
    desktop: !!desktop,
    desktopMode,
    localServer: IS_LOCAL_SERVER,
  })
  const simulationApiEnabled = shouldUseSimulationApi(worldSourceRef.current)
  const simulationData = useMemo(
    () => ({ apiEnabled: simulationApiEnabled, playerWorldKind, loadLocalOrgDetail, loadLocalOrgLife }),
    [loadLocalOrgDetail, loadLocalOrgLife, playerWorldKind, simulationApiEnabled],
  )
  const currentScene = useCurrentScene()

  const [armedTool, setArmedTool] = useState<SandboxTool | null>(null)
  const [brush, setBrush] = useState(2)
  const [sandboxStatus, setSandboxStatus] = useState<string | null>(null)
  const sandboxStatusTimer = useRef<number | null>(null)
  const sandboxControlsEnabled = sandboxAvailable && (!desktop || desktopMode === 'local')

  const setTemporarySandboxStatus = useCallback((message: string | null, ms = 1800) => {
    if (sandboxStatusTimer.current !== null) window.clearTimeout(sandboxStatusTimer.current)
    setSandboxStatus(message)
    if (message) {
      sandboxStatusTimer.current = window.setTimeout(() => {
        setSandboxStatus(null)
        sandboxStatusTimer.current = null
      }, ms)
    } else {
      sandboxStatusTimer.current = null
    }
  }, [])

  useEffect(
    () => () => {
      if (sandboxStatusTimer.current !== null) window.clearTimeout(sandboxStatusTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!desktop) return
    let alive = true
    let settingsRevision = 0
    const applyInitialSettings = (settings: { mode: SimMode; pauseWhenHidden: boolean }) => {
      if (!alive) return
      setDesktopMode(settings.mode)
      setDesktopPauseWhenHidden(settings.pauseWhenHidden)
    }
    void desktop.settings
      .get()
      .then((settings) => {
        if (settingsRevision === 0) applyInitialSettings(settings)
      })
      .catch(() => undefined)
    const onPreferenceChange = (event: Event) => {
      const next = parsePauseWhenHiddenPreference((event as CustomEvent<unknown>).detail)
      if (next === null) return
      settingsRevision += 1
      if (alive) setDesktopPauseWhenHidden(next)
    }
    window.addEventListener(DESKTOP_PAUSE_WHEN_HIDDEN_EVENT, onPreferenceChange)
    return () => {
      alive = false
      window.removeEventListener(DESKTOP_PAUSE_WHEN_HIDDEN_EVENT, onPreferenceChange)
    }
  }, [desktop])

  useEffect(() => {
    if (sandboxControlsEnabled) return
    setArmedTool(null)
    setTemporarySandboxStatus(null)
  }, [sandboxControlsEnabled, setTemporarySandboxStatus])

  const onPickTool = useCallback(
    (tool: SandboxTool) => {
      if (tool.view) {
        setArmedTool(null)
        const ui = useUIStore.getState()
        let enabled: boolean
        if (tool.view.control === 'overlay') {
          enabled = ui.overlay !== tool.view.value
          ui.setOverlay(enabled ? tool.view.value : null)
        } else if (tool.view.value === 'territory') {
          enabled = !ui.viewFlags.territory
          ui.setTerritoryView(enabled)
        } else {
          enabled = !ui.viewFlags[tool.view.value]
          ui.setViewFlag(tool.view.value, enabled)
        }
        setTemporarySandboxStatus(`${tool.label} map ${enabled ? 'on' : 'off'}`)
        return
      }
      if (tool.mode === 'instant') {
        setSandboxStatus(`${tool.label}...`)
        let handled = true
        if (tool.time) {
          const result =
            tool.time.control === 'pause'
              ? pauseSim()
              : tool.time.control === 'resume'
                ? resume()
                : tool.time.control === 'speed' && tool.time.mult
                  ? setSpeed(tool.time.mult)
                  : Promise.resolve(false)
          void result.then((ok) =>
            setTemporarySandboxStatus(ok ? `${tool.label} applied` : `${tool.label} failed`),
          )
        } else if (tool.fire) {
          void sendCommand(tool.fire).then((ok) =>
            setTemporarySandboxStatus(ok ? `${tool.label} applied` : `${tool.label} failed`),
          )
        } else {
          handled = false
        }
        if (!handled) setTemporarySandboxStatus(null)
        return
      }
      setArmedTool((prev) => {
        const next = prev?.id === tool.id ? null : tool
        if (sandboxStatusTimer.current !== null) {
          window.clearTimeout(sandboxStatusTimer.current)
          sandboxStatusTimer.current = null
        }
        setSandboxStatus(next ? `${tool.label} armed - click the world to apply` : null)
        return next
      })
    },
    [pauseSim, resume, setSpeed, sendCommand, setTemporarySandboxStatus],
  )

  const handleSandboxApply = useCallback(
    (wx: number, wy: number) => {
      if (!sandboxControlsEnabled || !armedTool?.build) return
      const label = armedTool.label
      const x = Math.round(wx)
      const y = Math.round(wy)
      setSandboxStatus(`${label} -> ${x}, ${y}`)
      void sendCommand(armedTool.build(x, y, brush)).then((ok) => {
        setTemporarySandboxStatus(ok ? `${label} applied at ${x}, ${y}` : `${label} failed`)
      })
    },
    [armedTool, brush, sandboxControlsEnabled, sendCommand, setTemporarySandboxStatus],
  )

  const guideLineage = useCallback(
    async (lineage: string, strategy: LineageStrategy) => {
      if (!sandboxControlsEnabled) return false
      const ok = await sendCommand({
        cmd: 'guide',
        lineage,
        strategy,
        duration_ticks: 7200,
      })
      setTemporarySandboxStatus(ok ? `${strategy} guidance set` : 'guidance failed')
      return ok
    },
    [sandboxControlsEnabled, sendCommand, setTemporarySandboxStatus],
  )

  const [threeDIssue, setThreeDIssue] = useState<'crash' | 'unsupported' | 'context' | null>(null)

  const handleThreeDFailure = useCallback((reason: 'crash' | 'unsupported' | 'context') => {
    setThreeDIssue(reason)
    useUIStore.getState().setViewFlag('threeD', false)
  }, [])

  const retryThreeD = useCallback(() => {
    setThreeDIssue(null)
    useUIStore.getState().setViewFlag('threeD', true)
  }, [])

  const webglOk = useMemo(() => webglAvailable(), [])

  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const overlay = useUIStore((s) => s.overlay)
  const viewFlags = useUIStore((s) => s.viewFlags)
  const openDesktopSettings = useUIStore((s) => s.openDesktopSettings)

  useEffect(() => {
    if (viewFlags.threeD && !webglOk) handleThreeDFailure('unsupported')
  }, [viewFlags.threeD, webglOk, handleThreeDFailure])

  useEffect(() => {
    if (window.thbDesktop?.platform === 'darwin') {
      document.body.classList.add('thb-desktop-mac')
      return () => document.body.classList.remove('thb-desktop-mac')
    }
  }, [])

  useEffect(() => {
    const desk = window.thbDesktop
    if (!desk) return
    return desk.on('menu:openSettings', () => openDesktopSettings())
  }, [openDesktopSettings])

  useEffect(() => {
    if (!desktop) return
    const applyVisibility = (visibility: 'minimized' | 'hidden' | 'restored') => {
      desktopWindowInactiveRef.current = isDesktopWindowInactive(visibility)
      const paused = shouldPauseDesktopRenderer(desktopPauseWhenHidden, visibility)
      setDesktopRendererPaused(paused)
      document.body.classList.toggle('thb-app-minimized', paused)
    }
    const currentVisibility =
      desktopWindowInactiveRef.current || document.visibilityState === 'hidden' ? 'hidden' : 'restored'
    applyVisibility(currentVisibility)
    const stopListening = desktop.on('app:visibility', applyVisibility)
    return () => {
      stopListening()
      document.body.classList.remove('thb-app-minimized')
    }
  }, [desktop, desktopPauseWhenHidden])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== '[' && e.key !== ']') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.closest('input, textarea, select, button, [role="dialog"]') || target.isContentEditable)
      ) {
        return
      }
      const orgs = world?.organisms.filter((o) => o.alive)
      if (!orgs || orgs.length === 0) return
      e.preventDefault()
      const dir = e.key === '[' ? -1 : 1
      const currentIdx = selectedOrgId ? orgs.findIndex((o) => o.id === selectedOrgId) : -1
      const next = orgs[(currentIdx + dir + orgs.length) % orgs.length]
      if (next) {
        useUIStore.getState().selectOrg(next.id)
        useUIStore.getState().followOrg(next.id)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [world, selectedOrgId])

  useEffect(() => {
    const togglePlayback = (event: KeyboardEvent) => {
      if (!sandboxControlsEnabled) return
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (!(event.target instanceof HTMLElement) || !event.target.classList.contains('map2d-world')) return
      event.preventDefault()
      onPickTool({
        id: 'keyboard-playback',
        label: runtimeState.paused ? 'play' : 'pause',
        icon: '',
        mode: 'instant',
        time: { control: runtimeState.paused ? 'resume' : 'pause' },
      })
    }
    window.addEventListener('keydown', togglePlayback)
    return () => window.removeEventListener('keydown', togglePlayback)
  }, [onPickTool, runtimeState.paused, sandboxControlsEnabled])

  useEffect(() => {
    const clearTool = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setArmedTool(null)
        setTemporarySandboxStatus(null)
      }
    }
    window.addEventListener('keydown', clearTool)
    return () => window.removeEventListener('keydown', clearTool)
  }, [setTemporarySandboxStatus])

  useEffect(() => {
    // H toggles immersive mode (hides panels + bottom dock). Matches
    // the observation-mode option in the command palette.
    function onKey(e: KeyboardEvent): void {
      if (e.key.toLowerCase() !== 'h' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.closest('input, textarea, select, button, [role="dialog"]') || target.isContentEditable)
      ) {
        return
      }
      const ui = useUIStore.getState()
      ui.setViewFlag('hideUI', !ui.viewFlags.hideUI)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!world) return
    const reconciledSelection = reconcileViewerSelection(selectedOrgId, world)
    if (reconciledSelection !== selectedOrgId) {
      useUIStore.getState().selectOrg(reconciledSelection)
    }
  }, [world, selectedOrgId])

  const lastHeadlineTickRef = useRef<number>(0)
  useEffect(() => {
    const desk = window.thbDesktop
    if (!desk) return
    if (!world?.headlines || world.headlines.length === 0) return
    const newest = world.headlines[0]
    if (!newest || typeof newest.tick !== 'number') return
    if (newest.tick <= lastHeadlineTickRef.current) return
    lastHeadlineTickRef.current = newest.tick
    if (document.visibilityState !== 'visible' || desktopWindowInactiveRef.current) {
      void desk.app.notify({ title: 'The Human Box', body: newest.text })
    }
  }, [world?.headlines])

  const splashHiddenRef = useRef(false)
  useEffect(() => {
    if ((!world && !localStartupFailed) || splashHiddenRef.current) return
    splashHiddenRef.current = true
    window.dispatchEvent(new Event('thb-world-ready'))
    if (world) {
      trackEvent('world_first_loaded', {
        tick: world.tick,
        alive: world.organisms.filter((o) => o.alive).length,
      })
    }
  }, [localStartupFailed, world])

  useEffect(() => {
    if (viewFlags.threeD && viewFlags.hideUI) {
      document.body.classList.add('thb-3d-immersive')
    } else {
      document.body.classList.remove('thb-3d-immersive')
    }
    return () => {
      document.body.classList.remove('thb-3d-immersive')
    }
  }, [viewFlags.threeD, viewFlags.hideUI])

  useEffect(() => {
    if (viewFlags.photoMode) document.body.classList.add('thb-photo-mode')
    else document.body.classList.remove('thb-photo-mode')
    return () => {
      document.body.classList.remove('thb-photo-mode')
    }
  }, [viewFlags.photoMode])

  useEffect(() => {
    if (viewFlags.colorBlind) document.body.classList.add('thb-colorblind')
    else document.body.classList.remove('thb-colorblind')
    return () => {
      document.body.classList.remove('thb-colorblind')
    }
  }, [viewFlags.colorBlind])

  const selectedOrg = selectedOrgId ? (world?.organisms.find((o) => o.id === selectedOrgId) ?? null) : null

  const gridTiles = world?.grid.tiles
  const orgList = world?.organisms
  const fireTiles = useMemo(
    () => (gridTiles ? gridTiles.reduce((n, row) => n + row.filter((t) => t === TILE_ID.FIRE).length, 0) : 0),
    [gridTiles],
  )

  const sickOrgs = useMemo(
    () => (orgList ? orgList.filter((o) => o.alive && o.infection > 0.15).length : 0),
    [orgList],
  )

  const liveOrgs = useMemo(() => orgList?.filter((o) => o.alive) ?? [], [orgList])
  const deadOrgs = useMemo(() => orgList?.filter((o) => !o.alive) ?? [], [orgList])

  const liveOrgsRef = useRef<OrganismState[]>([])
  useEffect(() => {
    liveOrgsRef.current = liveOrgs
  }, [liveOrgs])
  useEffect(() => {
    if (!viewFlags.randomTour) return
    const tick = () => {
      const pool = liveOrgsRef.current
      if (pool.length === 0) return
      const pick = pool[Math.floor(Math.random() * pool.length)]
      useUIStore.getState().selectOrg(pick.id)
      useUIStore.getState().followOrg(pick.id)
    }
    tick()
    const id = window.setInterval(tick, 8000)
    return () => window.clearInterval(id)
  }, [viewFlags.randomTour])

  const lineages = useMemo(() => {
    const result: Record<string, { count: number; minGen: number; maxGen: number; orgs: OrganismState[] }> =
      {}
    if (!world) return result
    for (const org of liveOrgs) {
      if (!result[org.lineage_id]) {
        result[org.lineage_id] = { count: 0, minGen: org.generation, maxGen: org.generation, orgs: [] }
      }
      result[org.lineage_id].count++
      result[org.lineage_id].orgs.push(org)
      result[org.lineage_id].minGen = Math.min(result[org.lineage_id].minGen, org.generation)
      result[org.lineage_id].maxGen = Math.max(result[org.lineage_id].maxGen, org.generation)
    }
    return result
  }, [world, liveOrgs])

  return (
    <SimulationDataProvider value={simulationData}>
      <div className="app">
        <AppHeader world={world ?? null} connected={connected} fireTiles={fireTiles} sickOrgs={sickOrgs} />
        <HeadlineTicker world={world ?? null} enabled={viewFlags.headlineTicker} />

        {threeDIssue && (
          <div className="fallback-banner">
            {threeDIssue === 'unsupported'
              ? '⚠ 3D needs WebGL, which this browser does not support — showing the classic view.'
              : threeDIssue === 'context'
                ? '⚠ The 3D view lost its graphics context — returned to the classic view.'
                : '⚠ The 3D view hit a rendering error — returned to the classic view.'}{' '}
            {threeDIssue !== 'unsupported' && <button onClick={retryThreeD}>try 3D again</button>}{' '}
            <button onClick={() => setThreeDIssue(null)}>dismiss</button>
          </div>
        )}

        <DesktopDownloadToast />
        <CommandPalette />

        <main className="main" data-tour="world-canvas">
          {world ? (
            <div className="layout">
              {(!viewFlags.threeD || !viewFlags.hideUI) && (
                <>
                  {leftOpen && <div className="panel-overlay panel-overlay-left" onClick={toggleLeft} />}
                  <aside className={clsx('panel', 'panel-left', leftOpen && 'open')}>
                    {leftOpen && (
                      <>
                        <HistoryGrid />
                        <LineagesList />
                        <EventLog />
                        <WorldFooter world={world} />
                      </>
                    )}
                  </aside>
                </>
              )}

              {currentScene ? (
                <Suspense fallback={null}>
                  <SceneView world={world} />
                </Suspense>
              ) : viewFlags.threeD && webglOk ? (
                <ThreeDErrorBoundary onCrash={() => handleThreeDFailure('crash')}>
                  <Suspense fallback={<ThreeDLoading />}>
                    <WorldView3D
                      world={world}
                      hideUI={viewFlags.hideUI}
                      rendererPaused={desktopRendererPaused}
                      sandboxArmed={sandboxControlsEnabled && !!armedTool}
                      onSandboxApply={handleSandboxApply}
                      onContextLost={() => handleThreeDFailure('context')}
                    />
                  </Suspense>
                </ThreeDErrorBoundary>
              ) : (
                <WorldView
                  world={world}
                  interp={interp}
                  rendererPaused={desktopRendererPaused}
                  sandboxArmed={sandboxControlsEnabled && !!armedTool}
                  sandboxLabel={armedTool?.label}
                  sandboxStatus={sandboxStatus}
                  sandboxRadius={(() => {
                    const preview = armedTool?.build?.(0, 0, brush)
                    return preview && 'radius' in preview ? (preview.radius ?? 0) : 0
                  })()}
                  onSandboxApply={handleSandboxApply}
                />
              )}

              <RightPanel world={world} liveOrgs={liveOrgs} deadOrgs={deadOrgs} selectedOrg={selectedOrg} />
            </div>
          ) : (
            <div className="waiting">
              {!localStartupFailed && <div className="waiting-spinner" aria-hidden="true" />}
              <div className="waiting-title">
                {localStartupFailed ? 'local world could not start' : 'starting your world…'}
              </div>
              <div className="waiting-sub">
                {localStartupFailed
                  ? localSaveStatus.message
                  : desktop
                    ? 'starting the native simulation on this computer'
                    : 'loading the private WebAssembly simulation saved in this browser'}
              </div>
              {localStartupFailed && (
                <button className="lang-btn" onClick={() => reloadAppSafely()}>
                  retry local world
                </button>
              )}
            </div>
          )}
        </main>

        {world && sandboxControlsEnabled && !viewFlags.hideUI && (
          <SandboxToolbar
            armedToolId={armedTool?.id ?? null}
            armedToolLabel={armedTool?.label ?? null}
            brush={brush}
            status={sandboxStatus}
            runtimePaused={runtimeState.paused}
            runtimeSpeed={runtimeState.speed}
            activeOverlay={overlay}
            activeViewFlags={{
              territory: viewFlags.territory,
              history: viewFlags.history,
            }}
            onBrush={setBrush}
            onPick={onPickTool}
            onClearArmed={() => {
              setArmedTool(null)
              setTemporarySandboxStatus(null)
            }}
            onClearView={() => {
              const ui = useUIStore.getState()
              ui.setOverlay(null)
              ui.setTerritoryView(false)
              ui.setViewFlag('history', false)
              setTemporarySandboxStatus('map layers cleared')
            }}
            onSave={
              isLocalWebWorld || (desktop && desktopMode === 'local')
                ? () => void saveLocalWorld()
                : undefined
            }
            saveBusy={
              localSaveStatus.phase === 'loading' ||
              localSaveStatus.phase === 'retrying' ||
              localSaveStatus.phase === 'saving'
            }
            saveError={localSaveStatus.phase === 'error'}
            saveRetryable={localSaveStatus.phase === 'error' && localSaveStatus.retryable === true}
            saveStatus={
              localSaveStatus.phase === 'loading'
                ? 'loading local save…'
                : localSaveStatus.phase === 'retrying'
                  ? 'retrying local storage…'
                  : localSaveStatus.phase === 'ready'
                    ? localSaveStatus.restored
                      ? `world restored at tick ${localSaveStatus.tick.toLocaleString()}`
                      : 'new local world ready'
                    : localSaveStatus.phase === 'saving'
                      ? `saving tick ${localSaveStatus.tick.toLocaleString()}…`
                      : localSaveStatus.phase === 'saved'
                        ? `saved locally · tick ${localSaveStatus.tick.toLocaleString()}`
                        : localSaveStatus.phase === 'error'
                          ? localSaveStatus.message
                          : undefined
            }
          />
        )}

        {world && (
          <ModalRouter
            world={world}
            lineages={lineages}
            onGuide={sandboxControlsEnabled ? guideLineage : undefined}
          />
        )}

        <MobileBanner />
        {world && <WelcomeModal />}
        <UpdateToast />
        <DesktopUpdateToast />
      </div>
    </SimulationDataProvider>
  )
}

export default App
