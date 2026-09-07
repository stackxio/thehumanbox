import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ToolSprite } from './ToolSprite'
import type { SandboxTool } from '../simulation/sandbox'
import { searchWorldTools } from './tool-search'
import './world-tool-search.css'

export function WorldToolSearch({ onPick }: { onPick: (tool: SandboxTool) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const results = searchWorldTools(query)
  useEffect(() => {
    if (open) {
      dialog.current?.showModal()
      input.current?.focus()
    } else dialog.current?.close()
  }, [open])
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const pick = (tool: SandboxTool) => {
    onPick(tool)
    close()
  }
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="sandbox-playback"
        aria-label="Search all world tools"
        title="Search all world tools"
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 6 6" />
        </svg>
        <span>tools</span>
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <dialog
            ref={dialog}
            className="world-tool-search"
            aria-labelledby="tool-search-title"
            onCancel={(e) => {
              e.preventDefault()
              close()
            }}
            onClose={() => setOpen(false)}
          >
            <header>
              <div>
                <span>WORLD CONTROLS</span>
                <h2 id="tool-search-title">What would you like to do?</h2>
              </div>
              <button onClick={close} aria-label="Close tool search">
                ×
              </button>
            </header>
            <input
              ref={input}
              type="search"
              placeholder="Try water, heal, grass, pause…"
              aria-label="Find a world tool"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim() && results.length === 1) {
                  e.preventDefault()
                  pick(results[0].tool)
                }
              }}
            />
            <p className="tool-search-count" role="status">
              {results.length} tools{query ? ' found' : ' available'} · choose a tool to continue
            </p>
            <div className="tool-search-results">
              {results.map(({ category, tool }) => (
                <button key={tool.id} onClick={() => pick(tool)}>
                  <span className="tool-search-icon" aria-hidden="true">
                    <ToolSprite icon={tool.icon} />
                  </span>
                  <span>
                    <strong>{tool.label}</strong>
                    <small>
                      {category} · {tool.mode === 'point' ? 'place on the map' : 'apply immediately'}
                    </small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            {!results.length && (
              <p className="tool-search-empty">
                No matching tools. Try a terrain type, animal, map layer, or time control.
              </p>
            )}
          </dialog>,
          document.body,
        )}
    </>
  )
}
