import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Book, AlertTriangle, Settings as SettingsIcon, Clock } from 'lucide-react'
import { ThemeProvider } from './hooks/ThemeContext'
import Login from './pages/Login'

function App() {
  const [isUnlocked, setIsUnlocked] = useState(false)

  if (!isUnlocked) {
    return (
      <ThemeProvider>
        <div className="absolute top-0 left-0 w-full h-8 [webkit-app-region:drag] z-50"></div>
        <Login onUnlock={() => setIsUnlocked(true)} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 pt-8 flex items-center space-x-3 [webkit-app-region:drag]">
          <img src="/quantlib.svg" alt="QuantLib Logo" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-blue-400">QuantLib</h1>
            <p className="text-sm text-slate-400 mt-1">Library Tracker</p>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <NavLink 
            to="/" 
            className={({ isActive }) => `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors [webkit-app-region:no-drag] ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">Dashboard</span>
          </NavLink>
          <NavLink 
            to="/inventory" 
            className={({ isActive }) => `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors [webkit-app-region:no-drag] ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Book size={20} />
            <span className="font-medium">Inventory</span>
          </NavLink>
          <NavLink 
            to="/incidents" 
            className={({ isActive }) => `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors [webkit-app-region:no-drag] ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <AlertTriangle size={20} />
            <span className="font-medium">Incident Log</span>
          </NavLink>
          <NavLink 
            to="/overdue" 
            className={({ isActive }) => `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors [webkit-app-region:no-drag] ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Clock size={20} />
            <span className="font-medium">Overdue</span>
          </NavLink>
          <NavLink 
            to="/settings" 
            className={({ isActive }) => `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors mt-auto [webkit-app-region:no-drag] ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <SettingsIcon size={20} />
            <span className="font-medium">Settings</span>
          </NavLink>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Draggable Top Bar for frameless window */}
        <div className="h-8 bg-slate-50 dark:bg-slate-900 [webkit-app-region:drag] w-full flex-shrink-0 transition-colors duration-200"></div>
        <div className="flex-1 overflow-auto p-8 pt-4">
          <Outlet />
        </div>
      </main>
    </div>
    </ThemeProvider>
  )
}

export default App
