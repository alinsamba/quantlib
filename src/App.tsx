import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  BookOpen, 
  AlertTriangle, 
  Settings as SettingsIcon, 
  Clock, 
  FileCheck, 
  ClipboardCheck, 
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon
} from 'lucide-react'

import { ThemeProvider, useTheme } from './hooks/ThemeContext'
import Login from './pages/Login'

function AppLayout() {
  const { theme, setTheme } = useTheme()
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('quantlib_sidebar_collapsed') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('quantlib_sidebar_collapsed', String(isCollapsed))
  }, [isCollapsed])

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/inventory', label: 'Inventory', icon: BookOpen },
    { to: '/audit', label: 'Stock Audit', icon: ClipboardCheck },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/incidents', label: 'Incident Log', icon: AlertTriangle },
    { to: '/overdue', label: 'Overdue Books', icon: Clock },
    { to: '/clearance', label: 'Clearance', icon: FileCheck },
  ]

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Sidebar (64px collapsed, 240px expanded) */}
      <aside 
        className={`${
          isCollapsed ? 'w-16' : 'w-60'
        } transition-all duration-300 ease-in-out bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-r border-slate-200/80 dark:border-slate-800 flex flex-col whitespace-nowrap print:hidden shadow-xs relative z-30 select-none flex-shrink-0`}
      >
        {/* App Branding */}
        <div className={`p-3.5 pt-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} [webkit-app-region:drag]`}>
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-600 dark:text-blue-400">
              <img src="/quantlib.svg" alt="QuantLib Logo" className="w-5 h-5 object-contain" />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden transition-all duration-200">
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent tracking-tight">
                  QuantLib
                </h1>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Library Management</p>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <button 
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors [webkit-app-region:no-drag]"
              title="Collapse Sidebar (64px)"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {isCollapsed && (
          <div className="flex justify-center my-1 [webkit-app-region:no-drag]">
            <button 
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Expand Sidebar (240px)"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Navigation List */}
        <nav className="flex-1 px-2 space-y-1.5 mt-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center ${
                    isCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
                  } rounded-xl transition-all duration-150 [webkit-app-region:no-drag] font-medium text-sm group ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <Icon size={19} className="flex-shrink-0" />
                {!isCollapsed && (
                  <span className="ml-3 truncate">{item.label}</span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom Actions: Theme Toggle & Settings */}
        <div className="p-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
          {/* Quick Theme Toggle */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={isCollapsed ? `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode` : undefined}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
            } rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white transition-colors [webkit-app-region:no-drag] text-sm font-medium`}
          >
            {theme === 'dark' ? (
              <Sun size={19} className="flex-shrink-0 text-amber-400" />
            ) : (
              <Moon size={19} className="flex-shrink-0 text-slate-500" />
            )}
            {!isCollapsed && (
              <span className="ml-3 truncate">{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
            )}
          </button>

          {/* Settings Nav */}
          <NavLink
            to="/settings"
            title={isCollapsed ? "Settings" : undefined}
            className={({ isActive }) =>
              `flex items-center ${
                isCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
              } rounded-xl transition-all duration-150 [webkit-app-region:no-drag] font-medium text-sm ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
              }`
            }
          >
            <SettingsIcon size={19} className="flex-shrink-0" />
            {!isCollapsed && <span className="ml-3 truncate">Settings</span>}
          </NavLink>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Draggable Top Bar for frameless window */}
        <div className="h-8 bg-white dark:bg-slate-950 border-b border-slate-200/50 dark:border-slate-800/50 [webkit-app-region:drag] w-full flex-shrink-0 transition-colors duration-200 print:hidden flex items-center justify-between px-4">
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-widest pointer-events-none select-none">
            QuantLib &bull; School Library Tracker
          </div>
        </div>
        <div className="flex-1 overflow-auto p-8 pt-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function App() {
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return sessionStorage.getItem('quantlib_unlocked') === 'true'
  })

  const handleUnlock = () => {
    sessionStorage.setItem('quantlib_unlocked', 'true')
    setIsUnlocked(true)
  }

  if (!isUnlocked) {
    return (
      <ThemeProvider>
        <div className="absolute top-0 left-0 w-full h-8 [webkit-app-region:drag] z-50"></div>
        <Login onUnlock={handleUnlock} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <AppLayout />
    </ThemeProvider>
  )
}

export default App
