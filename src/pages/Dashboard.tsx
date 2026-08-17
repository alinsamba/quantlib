import { useState, useEffect, useMemo } from 'react'
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip as RechartsTooltip 
} from 'recharts'
import { 
  Book, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Clock, 
  Printer, 
  PlusCircle, 
  FileCheck, 
  BookOpen, 
  Layers, 
  Sparkles,
  ExternalLink
} from 'lucide-react'
import { db } from '../lib/ipc-client'
import { useTheme } from '../hooks/ThemeContext'
import { calculateAvailable } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { StatCard } from '../components/StatCard'
import type { DashboardSummary, SubjectSummary } from '../lib/types'

const PALETTE = [
  '#2563eb', // Blue (Primary)
  '#10b981', // Emerald (Available)
  '#f59e0b', // Amber (Issued)
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#64748b'  // Slate
]

export default function Dashboard() {
  const [summaryData, setSummaryData] = useState<DashboardSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const navigate = useNavigate()

  useEffect(() => {
    async function loadData() {
      try {
        const data = await db.getSummary()
        setSummaryData(data)
      } catch (err: unknown) {
        console.error(err)
        setErrorMsg(err instanceof Error ? err.message : String(err))
      }
    }
    loadData()
  }, [])

  // Rank subjects from highest total stock to lowest
  const subjectData = useMemo(() => {
    if (!summaryData?.subjects) return []
    const mapped = summaryData.subjects.map((s: SubjectSummary) => {
      const available = calculateAvailable(s)
      const total = s.openingCount + s.recovered
      const percentOfTotal = summaryData.totalBooks > 0 
        ? Math.round((total / summaryData.totalBooks) * 100) 
        : 0
      const availPercent = total > 0 ? Math.round((available / total) * 100) : 0
      return {
        id: s.id,
        name: s.name,
        category: s.category || 'General',
        available,
        total,
        issued: s.issued || 0,
        damaged: s.damaged || 0,
        lost: s.lost || 0,
        percentOfTotal,
        availPercent
      }
    })

    return mapped.sort((a, b) => b.total - a.total)
  }, [summaryData])

  if (errorMsg) {
    return (
      <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl max-w-xl mx-auto my-12">
        <AlertTriangle size={36} className="mx-auto text-rose-500 mb-2" />
        <h3 className="text-lg font-bold text-rose-800 dark:text-rose-200">Error Loading Dashboard</h3>
        <p className="text-sm text-rose-600 dark:text-rose-400 mt-1">{errorMsg}</p>
        <Button 
          variant="secondary" 
          className="mt-4" 
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    )
  }

  if (!summaryData) {
    return (
      <div className="flex flex-col h-96 items-center justify-center space-y-3 text-slate-500">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Loading Dashboard Data...</p>
      </div>
    )
  }

  const hasInventory = summaryData.totalBooks > 0 && subjectData.length > 0
  const totalAvailablePercent = summaryData.totalBooks > 0 
    ? Math.round((summaryData.available / summaryData.totalBooks) * 100) 
    : 0

  const maxSubjectTotal = subjectData.length > 0 ? Math.max(...subjectData.map(s => s.total), 1) : 1

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-12">
      {/* 1. Header & Primary Action Hierarchy */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Dashboard Overview
            </h1>
            <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              Live Vault
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time operational summary, circulation metrics, and book availability.
          </p>
        </div>

        {/* Global Action Button Hierarchy */}
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {/* Primary Action Button (Solid Fill) */}
          <Button
            variant="primary"
            icon={<PlusCircle size={17} />}
            onClick={() => navigate('/inventory', { state: { openAdd: true } })}
          >
            + Add Book
          </Button>

          {/* Secondary Actions (Outlined) */}
          <Button
            variant="secondary"
            icon={<BookOpen size={17} />}
            onClick={() => navigate('/inventory')}
          >
            Issue / Return
          </Button>

          <Button
            variant="secondary"
            icon={<FileCheck size={17} />}
            onClick={() => navigate('/clearance')}
          >
            Clearance
          </Button>

          {/* Ghost / Utility Trigger */}
          <Button
            variant="ghost"
            icon={<Printer size={18} />}
            onClick={() => window.print()}
            title="Print Dashboard Report"
          />
        </div>
      </div>

      {/* 2. Standardized KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {/* Total Books */}
        <StatCard
          label="Total Books"
          value={summaryData.totalBooks.toLocaleString()}
          icon={<Book size={20} />}
          variant="primary"
          subtext={`Across ${summaryData.subjects.length} subject${summaryData.subjects.length === 1 ? '' : 's'}`}
          badgeText="Collection"
        />

        {/* Available in Stock */}
        <StatCard
          label="Available in Stock"
          value={summaryData.available.toLocaleString()}
          icon={<CheckCircle2 size={20} />}
          variant="success"
          subtext={`${totalAvailablePercent}% ready to borrow`}
          badgeText={`${totalAvailablePercent}% In Stock`}
        />

        {/* Currently Issued */}
        <StatCard
          label="Currently Issued"
          value={summaryData.issued.toLocaleString()}
          icon={<TrendingUp size={20} />}
          variant="warning"
          subtext="Active student loans"
          badgeText="Active"
        />

        {/* Damaged / Lost */}
        <StatCard
          label="Damaged & Lost"
          value={summaryData.damagedLost.toLocaleString()}
          icon={<AlertTriangle size={20} />}
          variant="critical"
          subtext="Pending repair / audit write-off"
          badgeText={summaryData.damagedLost > 0 ? "Review" : "Clean"}
        />

        {/* Overdue Returns (Interactive Drilldown) */}
        <StatCard
          label="Overdue Books"
          value={summaryData.overdueCount.toLocaleString()}
          icon={<Clock size={20} />}
          variant={summaryData.overdueCount > 0 ? "critical" : "success"}
          subtext={summaryData.overdueCount > 0 ? "Fines accruing" : "All books on time"}
          badgeText={summaryData.overdueCount > 0 ? "Action" : "Clear"}
          onClick={() => navigate('/overdue')}
          drillDownLabel="View Overdue"
        />
      </div>

      {/* 3. Main Visualizations & Horizontal Bar Breakdown */}
      {!hasInventory ? (
        /* Standardized Global Empty State */
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-700/80 p-12 text-center">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100 dark:border-blue-900/50">
            <Layers size={28} />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            No stock data categorized yet
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1.5">
            Add your textbook subjects, assign initial opening copies, and start issuing books to see real-time horizontal rankings and collection breakdowns.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Button
              variant="primary"
              icon={<PlusCircle size={17} />}
              onClick={() => navigate('/inventory', { state: { openAdd: true } })}
            >
              + Add First Book
            </Button>
            <Button
              variant="secondary"
              icon={<Sparkles size={17} />}
              onClick={() => navigate('/settings')}
            >
              Configure Borrowing Rules
            </Button>
          </div>
        </div>
      ) : (
        /* Charts Grid with 60/40 Proportion Split */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (60%): Horizontal Stock by Subject with Micro-Metrics & Drilldown */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                  Stock by Subject
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ranked by total copies. Click any row to view filtered inventory.
                </p>
              </div>
              <div className="flex items-center space-x-3 text-xs font-medium">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                  <span className="text-slate-600 dark:text-slate-300">Available</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                  <span className="text-slate-600 dark:text-slate-300">Issued</span>
                </div>
              </div>
            </div>

            {/* Horizontal Bar Breakdown Rows */}
            <div className="space-y-4 overflow-y-auto max-h-[420px] pr-1">
              {subjectData.map((sub, idx) => {
                const totalBarWidthPercent = Math.max(8, Math.round((sub.total / maxSubjectTotal) * 100))
                const availableRatio = sub.total > 0 ? (sub.available / sub.total) : 0
                const issuedRatio = sub.total > 0 ? (sub.issued / sub.total) : 0

                return (
                  <div
                    key={sub.id || sub.name}
                    onClick={() => navigate('/inventory', { state: { filterSubject: sub.name } })}
                    className="group p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/40 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-150 cursor-pointer"
                    title={`Click to filter inventory for ${sub.name}`}
                  >
                    {/* Row Header: Subject Name, Rank, and Micro-Metrics */}
                    <div className="flex items-center justify-between text-xs mb-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {sub.name}
                        </span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity flex-shrink-0" />
                      </div>

                      {/* Micro-Metrics (e.g., "240 copies (28%)") */}
                      <div className="flex items-center space-x-2 font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {sub.total.toLocaleString()} copies
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 font-normal">
                          ({sub.percentOfTotal}%)
                        </span>
                      </div>
                    </div>

                    {/* Proportional Horizontal Bar with Stacked Segments */}
                    <div className="w-full bg-slate-100 dark:bg-slate-700/60 rounded-full h-3 overflow-hidden flex">
                      <div
                        style={{ width: `${totalBarWidthPercent}%` }}
                        className="h-full flex rounded-full overflow-hidden transition-all duration-500"
                      >
                        {/* Available Segment (Emerald) */}
                        <div 
                          style={{ width: `${availableRatio * 100}%` }}
                          className="bg-emerald-500 h-full"
                          title={`Available: ${sub.available}`}
                        />
                        {/* Issued Segment (Amber) */}
                        <div 
                          style={{ width: `${issuedRatio * 100}%` }}
                          className="bg-amber-500 h-full"
                          title={`Issued: ${sub.issued}`}
                        />
                        {/* Remainder / Damaged / Lost (Crimson) */}
                        {sub.damaged + sub.lost > 0 && (
                          <div 
                            style={{ width: `${((sub.damaged + sub.lost) / sub.total) * 100}%` }}
                            className="bg-rose-500 h-full"
                            title={`Damaged/Lost: ${sub.damaged + sub.lost}`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Row Micro-Footer Breakdown */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 px-0.5">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {sub.available} available ({sub.availPercent}%)
                      </span>
                      <span>
                        {sub.issued} issued &bull; {sub.damaged + sub.lost} lost/damaged
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Column (40%): Collection Share Breakdown Donut */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between">
            <div className="mb-3">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                Collection Share
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Proportional distribution across all categorized subjects
              </p>
            </div>

            {/* Donut Chart Visualization */}
            <div className="h-52 w-full flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subjectData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={82}
                    paddingAngle={3}
                    dataKey="total"
                  >
                    {subjectData.map((_: unknown, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={PALETTE[index % PALETTE.length]} 
                        strokeWidth={2} 
                        stroke={isDark ? '#1e293b' : '#ffffff'} 
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{
                      borderRadius: '12px', 
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: '12px',
                      padding: '8px 12px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center donut metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {summaryData.totalBooks.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Copies
                </span>
              </div>
            </div>

            {/* Custom Interactive Legend List with direct drill-down */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {subjectData.map((sub, index) => (
                <div 
                  key={sub.id || sub.name} 
                  onClick={() => navigate('/inventory', { state: { filterSubject: sub.name } })}
                  className="flex items-center justify-between text-xs py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 px-2.5 rounded-lg transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span 
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {sub.name}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 font-semibold flex-shrink-0">
                    <span className="text-slate-800 dark:text-slate-200">{sub.total.toLocaleString()}</span>
                    <span className="text-slate-400 dark:text-slate-500 font-normal">({sub.percentOfTotal}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
