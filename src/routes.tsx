import { lazy } from 'react'

export const Dashboard = lazy(() => import('./pages/Dashboard'))
export const Inventory = lazy(() => import('./pages/Inventory'))
export const Incidents = lazy(() => import('./pages/Incidents'))
export const Settings = lazy(() => import('./pages/Settings'))
export const Overdue = lazy(() => import('./pages/Overdue'))
export const Clearance = lazy(() => import('./pages/Clearance'))
export const StockAudit = lazy(() => import('./pages/StockAudit'))
export const Analytics = lazy(() => import('./pages/Analytics'))
