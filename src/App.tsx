import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { 
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

import { ThemeProvider } from './hooks/ThemeContext'
import { ToastProvider } from './hooks/ToastContext'
import Login from './pages/Login'
import { TitleBar } from './components/TitleBar'
import { ChalkGlyph, type ChalkGlyphName } from './components/theme/ChalkGlyph'
import { db } from './lib/ipc-client'

function AppLayout({ onLock }: { onLock: () => void }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('quantlib_sidebar_collapsed') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('quantlib_sidebar_collapsed', String(isCollapsed))
  }, [isCollapsed])

  const dailyNavItems: { to: string; label: string; glyph: ChalkGlyphName; end?: boolean }[] = [
    { to: '/', label: 'Circulation Desk', glyph: 'desk', end: true },
    { to: '/log', label: 'Borrow & Return Log', glyph: 'log' },
    { to: '/students', label: 'Students & Staff', glyph: 'students' },
    { to: '/inventory', label: 'Inventory', glyph: 'inventory' },
    { to: '/overdue', label: 'Overdue Books', glyph: 'overdue' },
    { to: '/clearance', label: 'Clearance', glyph: 'clearance' },
  ]

  const managementNavItems: { to: string; label: string; glyph: ChalkGlyphName }[] = [
    { to: '/dashboard', label: 'Dashboard', glyph: 'dashboard' },
    { to: '/incidents', label: 'Incident Log', glyph: 'incidents' },
    { to: '/audit', label: 'Stock Audit', glyph: 'audit' },
    { to: '/analytics', label: 'Analytics', glyph: 'analytics' },
  ]

  return (
    <div className="chalk-shell flex h-screen overflow-hidden bg-[#fbf8f1] text-[#2b3a35]">
      {/* Sidebar (64px collapsed, 240px expanded) */}
      <aside 
        className={`chalk-sidebar ${
          isCollapsed ? 'w-16' : 'w-60'
        } transition-all duration-300 ease-in-out flex flex-col whitespace-nowrap print:hidden relative z-30 select-none flex-shrink-0`}
      >
        {/* App Branding (Draggable region for frameless window) */}
        <div
          data-tauri-drag-region
          className={`p-3.5 pt-4 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-[#182120] border-[1.5px] border-[#2b3a35] shadow-[2px_2px_0_#2b3a35] flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img
                src="/assets/unslop/quantlib-desk-emblem.webp"
                alt="QuantLib"
                className="w-full h-full object-cover scale-110"
                draggable={false}
              />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden transition-all duration-200">
                <h1 className="chalk-ink text-base font-extrabold tracking-tight leading-tight">
                  QuantLib
                </h1>
                <p className="chalk-slate text-[11px] font-semibold">School Library</p>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <button 
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-lg text-[#2f5749] hover:text-[#2b3a35] hover:bg-[#e9dcc0] transition-colors cursor-pointer"
              title="Collapse Sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {isCollapsed && (
          <div className="flex justify-center my-1">
            <button 
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="p-1 rounded-lg text-[#2f5749] hover:text-[#2b3a35] hover:bg-[#e9dcc0] transition-colors cursor-pointer"
              title="Expand Sidebar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Navigation List */}
        <nav className="flex-1 px-2.5 space-y-3 mt-1 overflow-y-auto">
          <div className="space-y-1">
            {!isCollapsed && (
              <p className="chalk-sidebar-section-label px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.08em]">
                Daily Desk
              </p>
            )}
            {dailyNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `chalk-nav-item ${isActive ? 'chalk-nav-active' : ''} flex items-center ${
                    isCollapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5'
                  } font-medium text-sm group`
                }
              >
                <ChalkGlyph name={item.glyph} size={20} />
                {!isCollapsed && (
                  <span className="ml-2.5 truncate">{item.label}</span>
                )}
              </NavLink>
            ))}
          </div>

          <div className="chalk-sidebar-divider space-y-1 pt-2.5 border-t">
            {!isCollapsed && (
              <p className="chalk-sidebar-section-label px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.08em]">
                Management
              </p>
            )}
            {managementNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `chalk-nav-item ${isActive ? 'chalk-nav-active' : ''} flex items-center ${
                    isCollapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5'
                  } font-medium text-sm group`
                }
              >
                <ChalkGlyph name={item.glyph} size={20} />
                {!isCollapsed && (
                  <span className="ml-2.5 truncate">{item.label}</span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Bottom Actions: Settings & Lock Vault */}
        <div className="chalk-sidebar-divider p-2 border-t space-y-1">
          <NavLink
            to="/settings"
            title={isCollapsed ? "Settings" : undefined}
            className={({ isActive }) =>
              `chalk-nav-item ${isActive ? 'chalk-nav-active' : ''} flex items-center ${
                isCollapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5'
              } font-medium text-sm`
            }
          >
            <ChalkGlyph name="settings" size={20} />
            {!isCollapsed && <span className="ml-2.5 truncate">Settings</span>}
          </NavLink>

          <button
            type="button"
            onClick={onLock}
            title={isCollapsed ? "Lock Encrypted Vault" : undefined}
            className={`chalk-nav-item w-full flex items-center ${
              isCollapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5'
            } text-[#a82c1d] font-medium text-sm cursor-pointer`}
          >
            <ChalkGlyph name="lock" size={20} />
            {!isCollapsed && <span className="ml-2.5 truncate">Lock Vault</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <TitleBar transparent />
        <div className="flex-1 overflow-auto px-6 pb-6 sm:px-8 sm:pb-8 pt-1">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function App() {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  useEffect(() => {
    let mounted = true
    async function verifyAuth() {
      try {
        if (sessionStorage.getItem('quantlib_unlocked') === 'true') {
          try {
            await db.getSubjects()
            if (mounted) setIsUnlocked(true)
          } catch {
            sessionStorage.removeItem('quantlib_unlocked')
            if (mounted) setIsUnlocked(false)
          }
        } else {
          if (mounted) setIsUnlocked(false)
        }
      } catch {
        if (mounted) setIsUnlocked(false)
      } finally {
        if (mounted) setIsCheckingAuth(false)
      }
    }
    verifyAuth()
    return () => {
      mounted = false
    }
  }, [])

  const handleUnlock = () => {
    sessionStorage.setItem('quantlib_unlocked', 'true')
    setIsUnlocked(true)
  }

  const handleLock = async () => {
    try {
      await db.lockDb()
    } catch {
      // Ignore backend lock errors and enforce client lock screen
    }
    sessionStorage.removeItem('quantlib_unlocked')
    setIsUnlocked(false)
  }

  if (isCheckingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!isUnlocked) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
            <TitleBar showBrand />
            <div className="flex-1 overflow-auto">
              <Login onUnlock={handleUnlock} />
            </div>
          </div>
        </ToastProvider>
      </ThemeProvider>
    )
  }
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppLayout onLock={handleLock} />
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
