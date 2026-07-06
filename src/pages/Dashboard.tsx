import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Book, AlertTriangle, CheckCircle, TrendingUp, Clock } from 'lucide-react'
import { db } from '../lib/ipc-client'
import { useTheme } from '../hooks/ThemeContext'
import { calculateAvailable } from '../lib/utils'
import { useNavigate } from 'react-router-dom'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function Dashboard() {
  const [summaryData, setSummaryData] = useState<any>(null)
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

  if (errorMsg) return <div className="p-8 text-red-500 font-bold bg-white rounded-lg shadow">Error Loading Dashboard: {errorMsg}</div>
  if (!summaryData) return <div className="flex h-full items-center justify-center text-slate-500">Loading Dashboard Data...</div>

  const subjectData = summaryData.subjects.map((s: any) => ({
    name: s.name,
    available: calculateAvailable(s),
    total: s.openingCount + s.recovered
  }))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Welcome back! Here's the current status of your library.</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center space-x-4 transition-colors duration-200">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <Book size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Books</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{summaryData.totalBooks}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center space-x-4 transition-colors duration-200">
          <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Available</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{summaryData.available}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center space-x-4 transition-colors duration-200">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Issued</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{summaryData.issued}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center space-x-4 transition-colors duration-200">
          <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Damaged / Lost</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{summaryData.damagedLost}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center space-x-4 transition-colors duration-200 cursor-pointer hover:border-red-300" onClick={() => navigate('/overdue')}>
          <div className="p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Overdue Books</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{summaryData.overdueCount}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors duration-200">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Stock by Subject</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: isDark ? '#cbd5e1' : '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: isDark ? '#cbd5e1' : '#94a3b8'}} />
                <Tooltip 
                  cursor={{fill: isDark ? '#1e293b' : '#f8fafc'}}
                  contentStyle={{
                    borderRadius: '8px', 
                    border: isDark ? '1px solid #334155' : 'none', 
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', 
                    backgroundColor: isDark ? '#0f172a' : '#fff',
                    color: isDark ? '#f8fafc' : '#0f172a'
                  }}
                />
                <Bar dataKey="available" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Available" />
                <Bar dataKey="total" fill="#e2e8f0" radius={[4, 4, 0, 0]} name="Total Capacity" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors duration-200">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Collection Share</h2>
          <div className="h-80 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={subjectData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="total"
                >
                  {subjectData.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
