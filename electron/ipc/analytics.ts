import { ipcMain } from 'electron'
import { ensureDb, sanitizeError } from '../database'

export function calculateConditionDecay(
  averageCondition: number,
  degradationRate: number,
  futureCheckouts: number
) {
  const currentCondition = Math.max(1.0, Math.min(3.0, averageCondition))
  const rate = degradationRate > 0 ? degradationRate : 0.02
  const projectedCondition = Math.max(1.0, Math.round((currentCondition - rate * futureCheckouts) * 100) / 100)
  const remainingCheckouts = Math.max(0, Math.floor((currentCondition - 1.0) / rate))

  return {
    currentCondition,
    degradationRate: rate,
    futureCheckouts,
    projectedCondition,
    remainingCheckouts
  }
}

export function calculateReplacementCost(
  subjects: Array<{
    id?: number
    name?: string
    category?: string | null
    averageCondition?: number
    degradationRate?: number
    openingCount?: number
    recovered?: number
    damaged?: number
    lost?: number
  }>,
  unitCost: number = 25.0
) {
  let totalCost = 0
  let totalDamaged = 0
  let totalNearEndLife = 0

  const items = subjects.map((sub) => {
    const totalBooks = Math.max(0, (sub.openingCount || 0) + (sub.recovered || 0))
    const damaged = Math.max(0, sub.damaged || 0)
    const lost = Math.max(0, sub.lost || 0)
    const activeAvailable = Math.max(0, totalBooks - damaged - lost)
    const cond = typeof sub.averageCondition === 'number' ? sub.averageCondition : 3.0

    let nearEndLife = 0
    if (cond <= 1.5) {
      nearEndLife = activeAvailable
    } else if (cond < 2.5) {
      const decayRatio = (2.5 - cond) / 1.5
      nearEndLife = Math.floor(activeAvailable * decayRatio)
    }

    const replaceCount = damaged + nearEndLife
    const estimatedCost = Math.round(replaceCount * unitCost * 100) / 100

    totalCost += estimatedCost
    totalDamaged += damaged
    totalNearEndLife += nearEndLife

    return {
      subjectId: sub.id,
      name: sub.name || 'Unknown',
      category: sub.category || 'General',
      totalBooks,
      damagedCount: damaged,
      nearEndLifeCount: nearEndLife,
      replacementCount: replaceCount,
      estimatedCost,
      averageCondition: cond
    }
  })

  const categoryMap = new Map<string, number>()
  for (const item of items) {
    const cat = item.category || 'General'
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + item.estimatedCost)
  }

  const categoryCosts = Array.from(categoryMap.entries()).map(([category, cost]) => ({
    category,
    cost: Math.round(cost * 100) / 100
  }))

  return {
    subjects: items,
    totalReplacementCost: Math.round(totalCost * 100) / 100,
    totalDamaged,
    totalNearEndLife,
    categoryCosts,
    unitCost
  }
}

export function aggregateCirculationTrends(
  checkouts: Array<{
    id?: number
    checkoutDate: Date | string
    returnDate?: Date | string | null
    status?: string
    studentName: string
    studentClass?: string | null
    subject?: { name?: string; category?: string | null } | null
  }>
) {
  const monthsMap = new Map<string, { month: string; checkouts: number; returns: number; timestamp: number }>()
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayMap = new Map<string, number>()
  dayNames.forEach((d) => dayMap.set(d, 0))

  const categoryMap = new Map<string, number>()
  const studentMap = new Map<string, { studentName: string; studentClass: string | null; totalCheckouts: number }>()

  for (const c of checkouts) {
    const cDate = new Date(c.checkoutDate)
    if (isNaN(cDate.getTime())) continue

    const monthKey = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`
    const monthLabel = cDate.toLocaleString('default', { month: 'short', year: 'numeric' })
    if (!monthsMap.has(monthKey)) {
      monthsMap.set(monthKey, {
        month: monthLabel,
        checkouts: 0,
        returns: 0,
        timestamp: new Date(cDate.getFullYear(), cDate.getMonth(), 1).getTime()
      })
    }
    monthsMap.get(monthKey)!.checkouts++

    if (c.returnDate) {
      const rDate = new Date(c.returnDate)
      if (!isNaN(rDate.getTime())) {
        const rMonthKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}`
        const rMonthLabel = rDate.toLocaleString('default', { month: 'short', year: 'numeric' })
        if (!monthsMap.has(rMonthKey)) {
          monthsMap.set(rMonthKey, {
            month: rMonthLabel,
            checkouts: 0,
            returns: 0,
            timestamp: new Date(rDate.getFullYear(), rDate.getMonth(), 1).getTime()
          })
        }
        monthsMap.get(rMonthKey)!.returns++
      }
    }

    const dayName = dayNames[cDate.getDay()]
    dayMap.set(dayName, (dayMap.get(dayName) || 0) + 1)

    const cat = c.subject?.category || 'General'
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1)

    const studentName = (c.studentName || '').trim()
    if (studentName) {
      const key = `${studentName.toLowerCase()}||${(c.studentClass || '').trim().toLowerCase()}`
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          studentName,
          studentClass: c.studentClass ? c.studentClass.trim() : null,
          totalCheckouts: 0
        })
      }
      studentMap.get(key)!.totalCheckouts++
    }
  }

  const monthlyTrends = Array.from(monthsMap.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(({ month, checkouts, returns }) => ({ month, checkouts, returns }))

  const peakDays = Array.from(dayMap.entries()).map(([day, count]) => ({ day, count }))

  const popularCategories = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const topReaders = Array.from(studentMap.values())
    .sort((a, b) => b.totalCheckouts - a.totalCheckouts)
    .slice(0, 10)

  return {
    monthlyTrends,
    peakDays,
    popularCategories,
    topReaders
  }
}

export function registerAnalyticsHandlers() {
  ipcMain.handle('get-depreciation-analytics', async () => {
    try {
      const prisma = ensureDb()
      const subjects = await prisma.subject.findMany({
        include: { checkouts: true }
      })

      const decayProjections = subjects.map((s) => {
        const projections = [0, 10, 25, 50, 100].map((checkouts) =>
          calculateConditionDecay(s.averageCondition, s.degradationRate, checkouts)
        )
        const currentDecay = calculateConditionDecay(s.averageCondition, s.degradationRate, 0)

        return {
          subjectId: s.id,
          subjectName: s.name,
          category: s.category || 'General',
          averageCondition: s.averageCondition,
          degradationRate: currentDecay.degradationRate,
          remainingCheckouts: currentDecay.remainingCheckouts,
          projections
        }
      })

      const replacementCostAnalysis = calculateReplacementCost(subjects, 25.0)

      return {
        success: true,
        data: {
          decayProjections,
          replacementCostAnalysis
        }
      }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-circulation-insights', async () => {
    try {
      const prisma = ensureDb()
      const checkouts = await prisma.checkout.findMany({
        include: { subject: true },
        orderBy: { checkoutDate: 'asc' }
      })

      const insights = aggregateCirculationTrends(checkouts)

      return {
        success: true,
        data: insights
      }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })
}
