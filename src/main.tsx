import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
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
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="inventory" element={<ErrorBoundary><Inventory /></ErrorBoundary>} />
          <Route path="audit" element={<ErrorBoundary><StockAudit /></ErrorBoundary>} />
          <Route path="analytics" element={<ErrorBoundary><Analytics /></ErrorBoundary>} />
          <Route path="incidents" element={<ErrorBoundary><Incidents /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
          <Route path="overdue" element={<ErrorBoundary><Overdue /></ErrorBoundary>} />
          <Route path="clearance" element={<ErrorBoundary><Clearance /></ErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
