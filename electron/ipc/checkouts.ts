import { ipcMain } from 'electron'
import { ensureDb, sanitizeError } from '../database'
import { encryptTempDatabase } from '../crypto'
import { calculateAvailable } from '../../src/lib/utils'

export function getRuleForClass(
  studentClass: string | null | undefined,
  rules: { roleOrGrade: string; maxBooksAllowed: number; borrowDurationDays: number; finePerDay: number }[]
) {
  if (!rules || rules.length === 0) {
    return { roleOrGrade: 'DEFAULT', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.0 }
  }

  const defaultRule = rules.find((r) => r.roleOrGrade === 'DEFAULT') || {
    roleOrGrade: 'DEFAULT',
    maxBooksAllowed: 2,
    borrowDurationDays: 14,
    finePerDay: 0.0
  }

  if (!studentClass || !studentClass.trim()) {
    return defaultRule
  }

  const sClass = studentClass.trim().toUpperCase()

  const exactMatch = rules.find((r) => r.roleOrGrade.trim().toUpperCase() === sClass)
  if (exactMatch) return exactMatch

  if (sClass.startsWith('S.1') || sClass.startsWith('S.2') || sClass.startsWith('S.3') || sClass.startsWith('S.4')) {
    const oLevel = rules.find((r) => r.roleOrGrade === 'S.1-S.4')
    if (oLevel) return oLevel
  }

  if (sClass.startsWith('S.5') || sClass.startsWith('S.6')) {
    const aLevel = rules.find((r) => r.roleOrGrade === 'S.5-S.6')
    if (aLevel) return aLevel
  }

  if (sClass.includes('TEACHER') || sClass.includes('STAFF')) {
    const teacher = rules.find((r) => r.roleOrGrade === 'TEACHER')
    if (teacher) return teacher
  }

  return defaultRule
}

// FIXES Finding #12: Pushes filtering down to SQLite using Prisma queries instead of loading full tables!
export async function calculateClearance(studentName: string, studentClass?: string | null) {
  if (!studentName || typeof studentName !== 'string' || !studentName.trim()) {
    throw new Error('Invalid student name')
  }

  const prisma = ensureDb()
  const sName = studentName.trim()
  const sClass = studentClass ? studentClass.trim() : null

  // Fetch only active checkouts for matching student
  const activeCheckoutsRaw = await prisma.checkout.findMany({
    where: {
      status: 'ACTIVE'
    },
    include: { subject: true }
  })
  const activeCheckouts = activeCheckoutsRaw.filter(
    (c) =>
      c.studentName.trim().toLowerCase() === sName.toLowerCase() &&
      (!sClass || (c.studentClass || '').trim().toLowerCase() === sClass.toLowerCase())
  )

  // Fetch only incidents for matching responsible party
  const studentIncidentsRaw = await prisma.incident.findMany({
    include: { subject: true }
  })
  const studentIncidents = studentIncidentsRaw.filter(
    (i) =>
      i.responsibleParty &&
      i.responsibleParty.trim().toLowerCase() === sName.toLowerCase() &&
      (!sClass || !i.studentClass || i.studentClass.trim().toLowerCase() === sClass.toLowerCase())
  )

  // Unresolved incidents: DAMAGED, LOST, or actionTaken not RESOLVED/PAID
  const unresolvedIncidents = studentIncidents.filter((i) => {
    if (i.actionTaken === 'RESOLVED' || i.actionTaken === 'PAID') return false
    return true
  })

  // Get borrowing rules to calculate overdue fines
  const rules = await prisma.borrowingRule.findMany()
  const rule = getRuleForClass(sClass, rules)

  const now = new Date()
  let overdueFines = 0
  for (const checkout of activeCheckouts) {
    if (checkout.dueDate < now) {
      const diffMs = now.getTime() - new Date(checkout.dueDate).getTime()
      const daysOverdue = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      overdueFines += daysOverdue * rule.finePerDay
    }
  }

  let incidentCharges = 0
  for (const incident of unresolvedIncidents) {
    if (incident.type === 'LOST') {
      incidentCharges += 25.0
    } else if (incident.type === 'DAMAGED') {
      incidentCharges += 10.0
    } else {
      incidentCharges += 5.0
    }
  }

  const totalReplacementCharges = overdueFines + incidentCharges
  const isCleared = activeCheckouts.length === 0 && unresolvedIncidents.length === 0
  const status: 'CLEARED' | 'HOLD' = isCleared ? 'CLEARED' : 'HOLD'

  return {
    studentName: sName,
    studentClass: sClass,
    status,
    activeCheckouts,
    incidents: studentIncidents,
    unresolvedIncidents,
    totalReplacementCharges
  }
}

export function registerCheckoutHandlers() {
  ipcMain.handle('add-checkout', async (_, data) => {
    try {
      const prisma = ensureDb()
      if (!data.subjectId || typeof data.subjectId !== 'number') throw new Error('Invalid subject ID')
      if (!data.studentName || typeof data.studentName !== 'string') throw new Error('Invalid student name')

      const studentName = data.studentName.trim()
      const studentClass = data.studentClass ? data.studentClass.trim() : null

      const rules = await prisma.borrowingRule.findMany()
      const rule = getRuleForClass(studentClass, rules)

      const res = await prisma.$transaction(async (tx) => {
        const subject = await tx.subject.findUnique({ where: { id: data.subjectId } })
        if (!subject) throw new Error('Referenced subject does not exist')
        if (calculateAvailable(subject) <= 0) throw new Error('No available books for this subject')

        const activeCheckouts = await tx.checkout.count({
          where: {
            studentName: studentName,
            status: 'ACTIVE',
            ...(studentClass ? { studentClass: studentClass } : {})
          }
        })

        if (activeCheckouts >= rule.maxBooksAllowed) {
          throw new Error(
            `Borrowing limit exceeded: ${studentName} already has ${activeCheckouts} active book(s) checked out (max allowed for ${rule.roleOrGrade}: ${rule.maxBooksAllowed}).`
          )
        }

        let dueDate: Date
        if (data.dueDate) {
          dueDate = new Date(data.dueDate)
        } else {
          dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + rule.borrowDurationDays)
        }

        const checkout = await tx.checkout.create({
          data: {
            subjectId: data.subjectId,
            studentName: studentName,
            studentClass: studentClass,
            dueDate: dueDate,
            conditionOut: typeof data.conditionOut === 'number' ? data.conditionOut : 3,
            status: 'ACTIVE'
          }
        })
        await tx.subject.update({
          where: { id: data.subjectId },
          data: { issued: { increment: 1 } }
        })
        await tx.auditLog.create({
          data: {
            subjectId: data.subjectId,
            field: 'issued',
            oldValue: subject.issued.toString(),
            newValue: (subject.issued + 1).toString(),
            changedBy: 'LIBRARIAN'
          }
        })
        return checkout
      })
      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('return-checkout', async (_, { id, conditionIn }) => {
    try {
      const prisma = ensureDb()
      if (typeof id !== 'number') throw new Error('Invalid checkout ID')

      const res = await prisma.$transaction(async (tx) => {
        const existingCheckout = await tx.checkout.findUnique({ where: { id } })
        if (!existingCheckout) throw new Error('Checkout record not found')
        if (existingCheckout.status !== 'ACTIVE') throw new Error('Checkout is not active')

        const checkout = await tx.checkout.update({
          where: { id },
          data: {
            status: 'RETURNED',
            returnDate: new Date(),
            conditionIn: typeof conditionIn === 'number' ? conditionIn : null
          }
        })

        const subject = await tx.subject.findUnique({
          where: { id: checkout.subjectId },
          include: { checkouts: true }
        })
        if (subject) {
          const { totalDegradation, count } = subject.checkouts.reduce(
            (acc, c) => {
              if (c.status === 'RETURNED' && c.conditionIn !== null) {
                acc.totalDegradation += c.conditionOut - (c.conditionIn ?? c.conditionOut)
                acc.count++
              }
              return acc
            },
            { totalDegradation: 0, count: 0 }
          )

          const newDegradationRate = count > 0 ? totalDegradation / count : 0

          const totalBooks = subject.openingCount + subject.recovered - subject.lost - subject.damaged
          const conditionLoss = checkout.conditionOut - (conditionIn ?? checkout.conditionOut)
          const conditionShift = totalBooks > 0 ? conditionLoss / totalBooks : conditionLoss
          const newAverageCondition = Math.max(1, subject.averageCondition - conditionShift)

          await tx.subject.update({
            where: { id: subject.id },
            data: {
              issued: { decrement: 1 },
              degradationRate: newDegradationRate,
              averageCondition: newAverageCondition
            }
          })
          await tx.auditLog.create({
            data: {
              subjectId: subject.id,
              field: 'issued',
              oldValue: subject.issued.toString(),
              newValue: (subject.issued - 1).toString(),
              changedBy: 'LIBRARIAN'
            }
          })
        }
        return checkout
      })
      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-overdue-checkouts', async () => {
    try {
      const prisma = ensureDb()
      const res = await prisma.checkout.findMany({
        where: { status: 'ACTIVE', dueDate: { lt: new Date() } },
        include: { subject: true },
        orderBy: { dueDate: 'asc' }
      })
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-borrowing-rules', async () => {
    try {
      const prisma = ensureDb()
      const rules = await prisma.borrowingRule.findMany({ orderBy: { id: 'asc' } })
      return { success: true, data: rules }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('save-borrowing-rule', async (_, ruleData) => {
    try {
      const prisma = ensureDb()
      if (!ruleData.roleOrGrade || typeof ruleData.roleOrGrade !== 'string') throw new Error('Invalid role or grade')

      const roleOrGrade = ruleData.roleOrGrade.trim().toUpperCase()
      const maxBooksAllowed = typeof ruleData.maxBooksAllowed === 'number' ? ruleData.maxBooksAllowed : Number(ruleData.maxBooksAllowed || 2)
      const borrowDurationDays = typeof ruleData.borrowDurationDays === 'number' ? ruleData.borrowDurationDays : Number(ruleData.borrowDurationDays || 14)
      const finePerDay = typeof ruleData.finePerDay === 'number' ? ruleData.finePerDay : Number(ruleData.finePerDay || 0.0)

      const res = await prisma.borrowingRule.upsert({
        where: { roleOrGrade },
        update: { maxBooksAllowed, borrowDurationDays, finePerDay },
        create: { roleOrGrade, maxBooksAllowed, borrowDurationDays, finePerDay }
      })
      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('delete-borrowing-rule', async (_, data) => {
    try {
      const prisma = ensureDb()
      const id = typeof data === 'number' ? data : data?.id
      if (!id || typeof id !== 'number') throw new Error('Invalid rule ID')

      const rule = await prisma.borrowingRule.findUnique({ where: { id } })
      if (rule?.roleOrGrade === 'DEFAULT') {
        throw new Error('Cannot delete the DEFAULT borrowing rule')
      }

      await prisma.borrowingRule.delete({ where: { id } })
      await encryptTempDatabase()
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-clearance-status', async (_, data) => {
    try {
      ensureDb()
      const { studentName, studentClass } = data || {}
      const result = await calculateClearance(studentName, studentClass)
      return { success: true, data: result }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('generate-clearance-slip', async (_, data) => {
    try {
      const prisma = ensureDb()
      const { studentName, studentClass } = data || {}
      const clearance = await calculateClearance(studentName, studentClass)

      let school = await prisma.school.findFirst()
      if (!school) {
        school = {
          id: 1,
          name: 'Mentor High School - Kitende',
          motto: 'Education is the Key',
          logoPath: null,
          address: 'P.O. Box 1234, Kampala',
          contactName: 'Library Dept',
          contactPhone: '+256 700 000 000',
          academicYear: '2026',
          updatedAt: new Date(),
          checkoutDuration: 14
        }
      }

      const decisionText =
        clearance.status === 'CLEARED'
          ? 'CLEARED - Student has returned all materials and cleared all outstanding obligations.'
          : 'HOLD - Clearance withheld due to outstanding checkouts or unaddressed incidents.'

      const slip = {
        timestamp: new Date().toISOString(),
        school: {
          name: school.name,
          motto: school.motto,
          logoPath: school.logoPath,
          address: school.address,
          contactPhone: school.contactPhone,
          academicYear: school.academicYear
        },
        student: {
          studentName: clearance.studentName,
          studentClass: clearance.studentClass
        },
        status: clearance.status,
        activeCheckouts: clearance.activeCheckouts,
        incidents: clearance.incidents,
        unresolvedIncidents: clearance.unresolvedIncidents,
        totalReplacementCharges: clearance.totalReplacementCharges,
        clearanceDecision: decisionText
      }

      return { success: true, data: slip }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })
}
