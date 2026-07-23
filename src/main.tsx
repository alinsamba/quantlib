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
import Clearance from './pages/Clearance'
import StockAudit from './pages/StockAudit'
import Analytics from './pages/Analytics'
import { ErrorBoundary } from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ErrorBoundary><App /></ErrorBoundary>}>
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="audit" element={<StockAudit />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="settings" element={<Settings />} />
          <Route path="overdue" element={<Overdue />} />
          <Route path="clearance" element={<Clearance />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)

