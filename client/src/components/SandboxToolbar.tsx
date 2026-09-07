import { WorldToolSearch } from './WorldToolSearch'
import { ToolSprite } from './ToolSprite'
import { useState } from 'react'
import clsx from 'clsx'
import {
  SANDBOX_CATEGORIES,
  isSandboxViewControlActive,
  type SandboxTool,
  type SandboxViewFlag,
} from '../simulation/sandbox'
import { isRuntimeControlActive } from '../simulation/runtimeControls'

const CATEGORY_STORAGE_KEY = 'thb-sandbox-category'

interface Props {
  armedToolId: string | null
  armedToolLabel?: string | null
  brush: number
  status?: string | null
  runtimePaused?: boolean
  runtimeSpeed?: number
  activeOverlay?: string | null
  activeViewFlags?: Partial<Record<SandboxViewFlag, boolean>>
  onBrush: (n: number) => void
  onPick: (tool: SandboxTool) => void
  onClearArmed: () => void
  onClearView?: () => void
  onSave?: () => void
  saveStatus?: string
  saveBusy?: boolean
  saveError?: boolean
  saveRetryable?: boolean
}

function formatSpeed(speed: number): string {
  return `${Number.isInteger(speed) ? speed.toFixed(0) : speed}×`
}

function readInitialCategory(): string {
  if (typeof window === 'undefined') return SANDBOX_CATEGORIES[0].id
  try {
    const saved = window.localStorage.getItem(CATEGORY_STORAGE_KEY)
    if (saved && SANDBOX_CATEGORIES.some((category) => category.id === saved)) return saved
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }
  return SANDBOX_CATEGORIES[0].id
}

export function SandboxToolbar({
  armedToolId,
  armedToolLabel,
  brush,
  status,
  runtimePaused = false,
  runtimeSpeed = 1,
  activeOverlay = null,
  activeViewFlags = {},
  onBrush,
  onPick,
  onClearArmed,
  onClearView,
  onSave,
  saveStatus,
  saveBusy = false,
  saveError = false,
  saveRetryable = false,
}: Props) {
  const [catId, setCatId] = useState(readInitialCategory)
  const cat = SANDBOX_CATEGORIES.find((c) => c.id === catId) ?? SANDBOX_CATEGORIES[0]
  const hasPointTools = cat.tools.some((t) => t.mode === 'point')
  const hasActiveView = cat.tools.some((tool) =>
    isSandboxViewControlActive(tool.view, activeOverlay, activeViewFlags),
  )
  const hasActiveMapLayer =
    SANDBOX_CATEGORIES.find((category) => category.id === 'maps')?.tools.some((tool) =>
      isSandboxViewControlActive(tool.view, activeOverlay, activeViewFlags),
    ) ?? false
  const runtimeStatus = `${runtimePaused ? 'paused' : 'running'} · ${formatSpeed(runtimeSpeed)}`
  const toggleTime = () =>
    onPick({
      id: runtimePaused ? 'play' : 'pause',
      label: runtimePaused ? 'play' : 'pause',
      icon: runtimePaused ? '▶' : 'Ⅱ',
      mode: 'instant',
      time: { control: runtimePaused ? 'resume' : 'pause' },
    })
  const selectCategory = (id: string) => {
    setCatId(id)
    try {
      window.localStorage.setItem(CATEGORY_STORAGE_KEY, id)
    } catch {
      // The toolbar still works when browser storage is unavailable.
    }
  }
  const clearCurrentTool = () => {
    onClearArmed()
    if (cat.tools.some((tool) => tool.view)) onClearView?.()
  }
  const saveActionLabel = saveBusy ? 'saving' : saveError && saveRetryable ? '↻ retry save' : 'save world'
  const saveTitle = saveStatus
    ? `${saveActionLabel} · ${saveStatus}`
    : saveError && saveRetryable
      ? 'Retry saving this world on this device'
      : saveBusy
        ? 'Saving this world on this device'
        : 'Save this world on this device now'

  return (
    <section className="sandbox-bar" aria-label="World controls">
      <div className="sandbox-dock">
        <nav className="sandbox-tabs" aria-label="World tools">
          {SANDBOX_CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              className={clsx(
                'sandbox-tab',
                c.id === catId && 'active',
                c.id === 'maps' && hasActiveMapLayer && 'engaged',
              )}
              aria-pressed={c.id === catId}
              onClick={() => selectCategory(c.id)}
              title={c.id === 'maps' && hasActiveMapLayer ? 'maps · layer active' : c.label}
            >
              <span className="sandbox-tab-icon" aria-hidden="true">
                <ToolSprite icon={c.icon} />
              </span>
              <span className="sandbox-tab-label">{c.label}</span>
            </button>
          ))}
        </nav>
        <span className="sandbox-divider" aria-hidden="true" />
        <div className="sandbox-tools" role="group" aria-label={`${cat.label} tools`}>
          <button
            type="button"
            className={clsx('sandbox-tool', !armedToolId && !hasActiveView && 'active')}
            aria-label={cat.tools.some((tool) => tool.view) ? 'Clear map layers' : 'Cursor — stop placing'}
            aria-pressed={!armedToolId && !hasActiveView}
            onClick={clearCurrentTool}
            title={cat.tools.some((tool) => tool.view) ? 'Clear map layers' : 'Cursor — stop placing'}
          >
            <span className="sandbox-tool-icon" aria-hidden="true">
              <ToolSprite icon="🖱️" />
            </span>
            <span className="sandbox-tool-label">
              {cat.tools.some((tool) => tool.view) ? 'clear' : 'cursor'}
            </span>
          </button>
          {cat.tools.map((t) => {
            const active =
              armedToolId === t.id ||
              isRuntimeControlActive(t.time, runtimePaused, runtimeSpeed) ||
              isSandboxViewControlActive(t.view, activeOverlay, activeViewFlags)
            return (
              <button
                type="button"
                key={t.id}
                className={clsx('sandbox-tool', active && 'active')}
                aria-pressed={
                  t.time
                    ? isRuntimeControlActive(t.time, runtimePaused, runtimeSpeed)
                    : t.view
                      ? isSandboxViewControlActive(t.view, activeOverlay, activeViewFlags)
                      : armedToolId === t.id
                }
                onClick={() => onPick(t)}
                title={t.label}
              >
                <span className="sandbox-tool-icon" aria-hidden="true">
                  <ToolSprite icon={t.icon} />
                </span>
                <span className="sandbox-tool-label">{t.label}</span>
              </button>
            )
          })}
          {hasPointTools && (
            <label className="sandbox-brush" title="Brush size">
              <span>brush</span>
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={brush}
                onChange={(e) => onBrush(parseInt(e.target.value, 10))}
              />
              <span className="sandbox-brush-val">{brush}</span>
            </label>
          )}
        </div>
        <div className={clsx('sandbox-utility', onSave && 'has-save')}>
          <WorldToolSearch onPick={onPick} />
          <button
            type="button"
            className={clsx('sandbox-playback', runtimePaused && 'paused')}
            onClick={toggleTime}
            aria-label={runtimePaused ? 'Resume simulation' : 'Pause simulation'}
            title={runtimePaused ? 'Resume simulation' : 'Pause simulation'}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
              {runtimePaused ? <path d="M6 3l11 7-11 7z" /> : <path d="M4 3h4v14H4zM12 3h4v14h-4z" />}
            </svg>
            <span>{runtimePaused ? 'paused' : formatSpeed(runtimeSpeed)}</span>
          </button>
          {(armedToolId || status || runtimeStatus) && (
            <div className="sandbox-status" role="status" aria-live="polite">
              {status ??
                (armedToolId
                  ? `${armedToolLabel ?? 'tool'} armed - click the world to apply`
                  : runtimeStatus)}
            </div>
          )}
          {onSave && (
            <div className={clsx('sandbox-save', saveError && 'error')}>
              <button
                type="button"
                className={clsx('sandbox-save-button', saveBusy && 'busy')}
                onClick={onSave}
                disabled={saveBusy || (saveError && !saveRetryable)}
                aria-label={saveActionLabel}
                aria-busy={saveBusy}
                title={saveTitle}
              >
                <span className="sandbox-save-icon" aria-hidden="true">
                  {saveError && saveRetryable ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M20 11a8 8 0 0 0-14.7-4.3L4 8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 13a8 8 0 0 0 14.7 4.3L20 16" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M20 20v-4h-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : saveBusy ? (
                    <span className="sandbox-save-busy">…</span>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M5 4.5h11.2L19.5 7.8v11.7H5z" strokeLinejoin="round" />
                      <path d="M8 4.5v5h7v-5M8.5 19.5v-5h7v5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="sandbox-save-label">
                  {saveBusy ? 'saving' : saveError && saveRetryable ? 'retry save' : 'save world'}
                </span>
              </button>
              {saveStatus && (
                <span className="sandbox-save-status" role="status">
                  {saveStatus}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
