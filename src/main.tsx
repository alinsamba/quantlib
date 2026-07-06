import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Incidents from './pages/Incidents'
import Settings from './pages/Settings'
import Overdue from './pages/Overdue'
import { ErrorBoundary } from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ErrorBoundary><App /></ErrorBoundary>}>
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="settings" element={<Settings />} />
          <Route path="overdue" element={<Overdue />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
