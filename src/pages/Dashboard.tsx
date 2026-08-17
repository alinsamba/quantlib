import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
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
  PackageOpen, 
  ArrowRight,
  Sparkles
} from 'lucide-react'
import { db } from '../lib/ipc-client'
import { useTheme } from '../hooks/ThemeContext'
import { calculateAvailable } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import type { DashboardSummary, SubjectSummary } from '../lib/types'

const PALETTE = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
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

  if (errorMsg) {
    return (
      <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl">
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

  const subjectData = summaryData.subjects.map((s: SubjectSummary) => ({
    name: s.name,
    available: calculateAvailable(s),
    total: s.openingCount + s.recovered,
    issued: s.issued,
    damaged: s.damaged,
    lost: s.lost
  }))

  const hasInventory = summaryData.totalBooks > 0 && subjectData.length > 0
  const availablePercent = summaryData.totalBooks > 0 
    ? Math.round((summaryData.available / summaryData.totalBooks) * 100) 
    : 0

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-12">
      {/* Header & Quick Action Hierarchy */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Dashboard Overview
            </h1>
            <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              Live Tracker
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time operational summary, circulation metrics, and book availability.
          </p>
        </div>

        {/* Primary Operational Tools */}
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <Button
            variant="primary"
            icon={<PlusCircle size={18} />}
            onClick={() => navigate('/inventory', { state: { openAdd: true } })}
          >
            + Add Book
          </Button>

          <Button
            variant="secondary"
            icon={<BookOpen size={18} />}
            onClick={() => navigate('/inventory')}
          >
            Issue / Return
          </Button>

          <Button
            variant="secondary"
            icon={<FileCheck size={18} />}
            onClick={() => navigate('/clearance')}
          >
            Clearance
          </Button>

          <button
            onClick={() => window.print()}
            title="Print Dashboard Report"
            className="p-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Printer size={18} />
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {/* Total Books */}
        <div className="bg-white dark:bg-slate-800/90 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between transition-all duration-200 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 truncate">
              Total Books
            </span>
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Book size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {summaryData.totalBooks.toLocaleString()}
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 truncate">
              Across {summaryData.subjects.length} subject{summaryData.subjects.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Available in Stock */}
        <div className="bg-white dark:bg-slate-800/90 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between transition-all duration-200 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 truncate">
              Available
            </span>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {summaryData.available.toLocaleString()}
            </div>
            <div className="flex items-center space-x-1.5 mt-1">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {availablePercent}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">ready to borrow</span>
            </div>
          </div>
        </div>

        {/* Currently Issued */}
        <div className="bg-white dark:bg-slate-800/90 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between transition-all duration-200 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 truncate">
              Currently Issued
            </span>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {summaryData.issued.toLocaleString()}
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 truncate">
              Active student loans
            </p>
          </div>
        </div>

        {/* Damaged / Lost */}
        <div className="bg-white dark:bg-slate-800/90 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between transition-all duration-200 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 truncate">
              Damaged / Lost
            </span>
            <div className="p-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {summaryData.damagedLost.toLocaleString()}
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 truncate">
              Pending repair / write-off
            </p>
          </div>
        </div>

        {/* Overdue Returns (Clickable) */}
        <div 
          onClick={() => navigate('/overdue')}
          className="bg-white dark:bg-slate-800/90 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between transition-all duration-200 hover:shadow-md cursor-pointer hover:border-rose-300 dark:hover:border-rose-600 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 truncate">
              Overdue Books
            </span>
            <div className="p-2.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl group-hover:scale-105 transition-transform">
              <Clock size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {summaryData.overdueCount.toLocaleString()}
            </div>
            <div className="flex items-center space-x-1 mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <span>{summaryData.overdueCount > 0 ? 'Fines Accruing' : 'All On Time'}</span>
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts & Visualizations */}
      {!hasInventory ? (
        /* Empty State & Onboarding UX when 0 inventory */
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700 p-12 text-center">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PackageOpen size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            No inventory recorded yet
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2">
            Start cataloging your school library by adding textbook subjects, setting initial opening quantities, and issuing books to students.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Button
              variant="primary"
              icon={<PlusCircle size={18} />}
              onClick={() => navigate('/inventory', { state: { openAdd: true } })}
            >
              + Add Your First Book
            </Button>
            <Button
              variant="secondary"
              icon={<Sparkles size={18} />}
              onClick={() => navigate('/settings')}
            >
              Configure Borrowing Rules
            </Button>
          </div>
        </div>
      ) : (
        /* Charts Grid with 60/40 Proportion Split */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Stock by Subject Bar Chart (60% split = 7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                  Stock by Subject
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Available in-stock vs. total capacity by subject
                </p>
              </div>
              <div className="flex items-center space-x-4 text-xs font-semibold">
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded bg-blue-600 inline-block"></span>
                  <span className="text-slate-600 dark:text-slate-300">Available</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-700 inline-block"></span>
                  <span className="text-slate-500 dark:text-slate-400">Capacity</span>
                </div>
              </div>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid 
                    strokeDasharray="3 3" 
                    vertical={false} 
                    stroke={isDark ? '#334155' : '#f1f5f9'} 
                  />
                  <XAxis 
                    dataKey="name" 
                    axisLine={{ stroke: isDark ? '#334155' : '#e2e8f0' }} 
                    tickLine={false} 
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                    angle={-15}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 12 }} 
                    allowDecimals={false}
                  />
                  <Tooltip 
                    cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }}
                    contentStyle={{
                      borderRadius: '12px', 
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      padding: '10px 14px'
                    }}
                  />
                  <Bar dataKey="available" fill="#2563eb" radius={[6, 6, 0, 0]} name="Available" />
                  <Bar dataKey="total" fill={isDark ? '#334155' : '#e2e8f0'} radius={[6, 6, 0, 0]} name="Total Capacity" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Collection Share Donut Chart (40% split = 5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                Collection Share
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Proportional distribution of books across subjects
              </p>
            </div>

            <div className="h-56 w-full flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subjectData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="total"
                  >
                    {subjectData.map((_: unknown, index: number) => (
                      <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} strokeWidth={2} stroke={isDark ? '#1e293b' : '#ffffff'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      borderRadius: '12px', 
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      color: isDark ? '#f8fafc' : '#0f172a'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center donut metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-800 dark:text-white">
                  {summaryData.totalBooks}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Total Items
                </span>
              </div>
            </div>

            {/* Custom Interactive Legend List */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 max-h-36 overflow-y-auto space-y-2 pr-1">
              {subjectData.map((sub, index) => {
                const percent = summaryData.totalBooks > 0 
                  ? Math.round((sub.total / summaryData.totalBooks) * 100) 
                  : 0
                return (
                  <div key={sub.name} className="flex items-center justify-between text-xs py-1 hover:bg-slate-50 dark:hover:bg-slate-700/30 px-2 rounded-lg transition-colors">
                    <div className="flex items-center space-x-2 truncate">
                      <span 
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
                      ></span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                        {sub.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 font-semibold flex-shrink-0">
                      <span>{sub.total} books</span>
                      <span className="text-slate-400 dark:text-slate-500 font-normal">({percent}%)</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
