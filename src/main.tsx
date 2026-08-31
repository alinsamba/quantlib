import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingFallback } from './components/LoadingFallback'
import {
  Dashboard,
  Inventory,
  Incidents,
  Settings,
  Overdue,
  Clearance,
  StockAudit,
  Analytics
} from './routes'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ErrorBoundary><App /></ErrorBoundary>}>
          <Route index element={<ErrorBoundary><Suspense fallback={<LoadingFallback />}><Dashboard /></Suspense></ErrorBoundary>} />
          <Route path="inventory" element={<ErrorBoundary><Suspense fallback={<LoadingFallback />}><Inventory /></Suspense></ErrorBoundary>} />
          <Route path="audit" element={<ErrorBoundary><Suspense fallback={<LoadingFallback />}><StockAudit /></Suspense></ErrorBoundary>} />
          <Route path="analytics" element={<ErrorBoundary><Suspense fallback={<LoadingFallback />}><Analytics /></Suspense></ErrorBoundary>} />
          <Route path="incidents" element={<ErrorBoundary><Suspense fallback={<LoadingFallback />}><Incidents /></Suspense></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><Suspense fallback={<LoadingFallback />}><Settings /></Suspense></ErrorBoundary>} />
          <Route path="overdue" element={<ErrorBoundary><Suspense fallback={<LoadingFallback />}><Overdue /></Suspense></ErrorBoundary>} />
          <Route path="clearance" element={<ErrorBoundary><Suspense fallback={<LoadingFallback />}><Clearance /></Suspense></ErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
