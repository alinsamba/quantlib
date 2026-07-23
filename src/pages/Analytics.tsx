import React, { useEffect, useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  Clock,
  BookOpen,
  Users,
  DollarSign,
  AlertOctagon,
  RefreshCw,
  Award,
  Layers
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'
import { db } from '../lib/ipc-client'
import type { CirculationInsights, DepreciationAnalytics } from '../lib/types'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6']

export default function AnalyticsPage() {
  const [circulation, setCirculation] = useState<CirculationInsights | null>(null)
  const [depreciation, setDepreciation] = useState<DepreciationAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'CIRCULATION' | 'DEPRECIATION'>('CIRCULATION')

  useEffect(() => {
    fetchAnalytics()
  }, [])

  async function fetchAnalytics() {
    try {
      setLoading(true)
      setError(null)
      const [circData, depData] = await Promise.all([
        db.getCirculationInsights(),
        db.getDepreciationAnalytics()
      ])
      setCirculation(circData)
      setDepreciation(depData)
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }

  // Decay projections line chart data transformation
  const decayChartData = React.useMemo(() => {
    if (!depreciation?.decayProjections) return []
    const points = [0, 10, 25, 50, 100]
    return points.map((chk) => {
      const row: Record<string, any> = { checkouts: `+${chk} Loans` }
      depreciation.decayProjections.slice(0, 5).forEach((sub) => {
        const proj = sub.projections.find((p) => p.futureCheckouts === chk)
        row[sub.subjectName] = proj ? proj.projectedCondition : sub.averageCondition
      })
      return row
    })
  }, [depreciation])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Analytics & Circulation Insights</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Circulation patterns, peak borrowing times, book lifespan decay & cost replacement projections
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('CIRCULATION')}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition ${
                activeTab === 'CIRCULATION'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Circulation Insights
            </button>
            <button
              onClick={() => setActiveTab('DEPRECIATION')}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition ${
                activeTab === 'DEPRECIATION'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Lifespan & Depreciation
            </button>
          </div>

          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg flex items-center space-x-3">
          <AlertOctagon className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {activeTab === 'CIRCULATION' ? (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Checkouts</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {circulation?.monthlyTrends.reduce((acc, m) => acc + m.checkouts, 0) || 0}
                </p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Peak Day</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {circulation?.peakDays.reduce((max, d) => (d.count > max.count ? d : max), { day: 'None', count: 0 }).day || 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Popular Category</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 truncate max-w-[150px]">
                  {circulation?.popularCategories[0]?.category || 'General'}
                </p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-lg">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Top Reader</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 truncate max-w-[150px]">
                  {circulation?.topReaders[0]?.studentName || 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trends Chart */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span>Monthly Borrowing & Return Trends</span>
              </h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={circulation?.monthlyTrends || []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                    <Legend />
                    <Bar dataKey="checkouts" fill="#3b82f6" name="Checkouts" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="returns" fill="#10b981" name="Returns" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Peak Days Chart */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                <span>Peak Borrowing Days</span>
              </h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={circulation?.peakDays || []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                    <Bar dataKey="count" fill="#6366f1" name="Borrowing Activity" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Category Distribution Chart */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 lg:col-span-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <span>Popular Subject Categories</span>
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={circulation?.popularCategories || []}
                      dataKey="count"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, value }: any) => `${name} (${value})`}
                    >
                      {(circulation?.popularCategories || []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Readers Leaderboard */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 lg:col-span-2 overflow-hidden">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <Award className="w-4 h-4 text-purple-500" />
                <span>Top Readers Leaderboard</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase">
                      <th className="p-3">Rank</th>
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Class / Form</th>
                      <th className="p-3 text-right">Total Checkouts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                    {(!circulation?.topReaders || circulation.topReaders.length === 0) ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500">
                          No circulation history available yet.
                        </td>
                      </tr>
                    ) : (
                      circulation.topReaders.map((reader, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3 font-bold text-slate-500">#{idx + 1}</td>
                          <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{reader.studentName}</td>
                          <td className="p-3 text-slate-500">{reader.studentClass || 'N/A'}</td>
                          <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">
                            {reader.totalCheckouts} books
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Lifespan & Depreciation Tab */
        <div className="space-y-6">
          {/* Depreciation Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Est. Total Replacement Cost
                </p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  ${depreciation?.replacementCostAnalysis.totalReplacementCost.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Damaged Items
                </p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {depreciation?.replacementCostAnalysis.totalDamaged || 0}
                </p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-lg">
                <AlertOctagon className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Near End-of-Life Books
                </p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                  {depreciation?.replacementCostAnalysis.totalNearEndLife || 0}
                </p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 rounded-lg">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Condition Decay Projection Chart */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span>Condition Decay Score Projections (3.0 Good → 1.0 Damaged)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Projected physical condition decay curve over future checkout loans per subject
              </p>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={decayChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="checkouts" stroke="#94a3b8" />
                  <YAxis domain={[1, 3]} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                  <Legend />
                  {depreciation?.decayProjections.slice(0, 5).map((sub, idx) => (
                    <Line
                      key={sub.subjectId}
                      type="monotone"
                      dataKey={sub.subjectName}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cost Replacement Forecast Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-4">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Replacement Cost Projections</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Estimated budget required to replace damaged and worn near-end-of-life books per subject
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase">
                    <th className="p-4">Subject Name</th>
                    <th className="p-4">Category</th>
                    <th className="p-4 text-center">Avg Condition</th>
                    <th className="p-4 text-center">Total Stock</th>
                    <th className="p-4 text-center">Damaged</th>
                    <th className="p-4 text-center">Near End-of-Life</th>
                    <th className="p-4 text-right">Est. Replacement Cost ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {(!depreciation?.replacementCostAnalysis.subjects ||
                    depreciation.replacementCostAnalysis.subjects.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No subject depreciation records found.
                      </td>
                    </tr>
                  ) : (
                    depreciation.replacementCostAnalysis.subjects.map((sub) => (
                      <tr key={sub.subjectId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-4 font-medium text-slate-900 dark:text-slate-100">{sub.name}</td>
                        <td className="p-4 text-slate-500">{sub.category}</td>
                        <td className="p-4 text-center">
                          <span
                            className={`px-2.5 py-1 text-xs rounded-full font-bold ${
                              sub.averageCondition >= 2.5
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : sub.averageCondition >= 1.8
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}
                          >
                            {sub.averageCondition.toFixed(2)} / 3.0
                          </span>
                        </td>
                        <td className="p-4 text-center text-slate-700 dark:text-slate-300">{sub.totalBooks}</td>
                        <td className="p-4 text-center font-semibold text-red-600 dark:text-red-400">{sub.damagedCount}</td>
                        <td className="p-4 text-center font-semibold text-purple-600 dark:text-purple-400">
                          {sub.nearEndLifeCount}
                        </td>
                        <td className="p-4 text-right font-bold text-slate-900 dark:text-slate-100">
                          ${sub.estimatedCost.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
