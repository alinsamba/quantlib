import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

interface TitleBarProps {
  showBrand?: boolean
  transparent?: boolean
}

export function TitleBar({ showBrand = false, transparent = false }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    try {
      const win = getCurrentWindow()
      win.isMaximized().then(setIsMaximized).catch(() => {})
      win
        .onResized(() => {
          win.isMaximized().then(setIsMaximized).catch(() => {})
        })
        .then((fn) => {
          unlisten = fn
        })
        .catch(() => {})
    } catch {
      // Running outside Tauri (e.g. browser preview)
    }
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  const handleMinimize = () => {
    try {
      getCurrentWindow().minimize()
    } catch {
      // ignore outside Tauri
    }
  }

  const handleToggleMaximize = () => {
    try {
      getCurrentWindow().toggleMaximize()
    } catch {
      // ignore outside Tauri
    }
  }

  const handleClose = () => {
    try {
      getCurrentWindow().close()
    } catch {
      // ignore outside Tauri
    }
  }

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={handleToggleMaximize}
      className={`chalk-titlebar h-9 flex-shrink-0 flex items-center justify-between select-none print:hidden z-40 ${
        transparent
          ? 'bg-transparent'
          : 'chalk-titlebar-bordered bg-white dark:bg-[#191F1E] border-b border-[#E3E6DE] dark:border-[#27302E]'
      }`}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 pl-3 text-xs font-semibold text-slate-500 dark:text-slate-400 pointer-events-none"
      >
        {showBrand && (
          <>
            <img src="/quantlib.svg" alt="" className="w-3.5 h-3.5 object-contain" />
            <span>QuantLib</span>
          </>
        )}
      </div>

      <div className="flex items-center h-full">
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="Minimize"
          className="h-full px-3.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          className="h-full px-3.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="h-full px-3.5 text-slate-500 dark:text-slate-400 hover:bg-rose-600 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}
