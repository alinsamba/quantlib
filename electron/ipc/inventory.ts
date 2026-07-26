import { ipcMain } from 'electron'
import { ensureDb, sanitizeError } from '../database'
import { encryptTempDatabase } from '../crypto'
import { calculateAvailable, IncidentType } from '../../src/lib/utils'

const ALLOWED_INCIDENT_TYPES = Object.values(IncidentType)

export function registerInventoryHandlers() {
  ipcMain.handle('get-subjects', async () => {
    try {
      const prisma = ensureDb()
      return { success: true, data: await prisma.subject.findMany() }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-incidents', async () => {
    try {
      const prisma = ensureDb()
      return {
        success: true,
        data: await prisma.incident.findMany({
          include: { subject: true },
          orderBy: { date: 'desc' }
        })
      }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-summary', async () => {
    try {
      const prisma = ensureDb()

      const [subjects, overdueCount] = await Promise.all([
        prisma.subject.findMany(),
        prisma.checkout.count({
          where: { status: 'ACTIVE', dueDate: { lt: new Date() } }
        })
      ])

      const { totalBooks, available, issued, damagedLost } = subjects.reduce(
        (acc, s) => {
          acc.totalBooks += s.openingCount + s.recovered
          acc.issued += s.issued
          acc.damagedLost += s.damaged + s.lost
          acc.available += calculateAvailable(s)
          return acc
        },
        { totalBooks: 0, available: 0, issued: 0, damagedLost: 0 }
      )

      return {
        success: true,
        data: { totalBooks, available, issued, damagedLost, subjects, overdueCount }
      }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('add-subject', async (_, data) => {
    try {
      const prisma = ensureDb()
      if (!data.name || typeof data.name !== 'string') throw new Error('Invalid subject name')

      const res = await prisma.subject.create({
        data: {
          name: data.name,
          category: typeof data.category === 'string' ? data.category : 'General',
          openingCount: typeof data.openingCount === 'number' ? data.openingCount : 0
        }
      })
      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  // FIXES Finding #1: Hoists subject variable so it is accessible in the audit log creation!
  ipcMain.handle('add-incident', async (_, data) => {
    try {
      const prisma = ensureDb()
      if (!data.bookTitle || typeof data.bookTitle !== 'string') throw new Error('Invalid book title')
      if (!ALLOWED_INCIDENT_TYPES.includes(data.type as IncidentType)) throw new Error('Invalid incident type')
      if (data.subjectId && typeof data.subjectId !== 'number') throw new Error('Invalid subject ID')

      const res = await prisma.$transaction(async (tx) => {
        let subject: Record<string, unknown> | null = null
        if (data.subjectId) {
          subject = await tx.subject.findUnique({ where: { id: data.subjectId } })
          if (!subject) throw new Error('Referenced subject does not exist')
        }

        const incident = await tx.incident.create({
          data: {
            type: data.type,
            date: data.date ? new Date(data.date) : new Date(),
            subjectId: data.subjectId || null,
            bookTitle: data.bookTitle,
            condition: data.condition || null,
            comment: data.comment || null,
            reportedBy: data.reportedBy || null,
            responsibleParty: data.responsibleParty || null,
            studentClass: data.studentClass || null,
            actionTaken: data.actionTaken || null
          }
        })

        if (data.subjectId && subject) {
          const updateData: Record<string, unknown> = {}
          if (data.type === IncidentType.DAMAGED) updateData.damaged = { increment: 1 }
          if (data.type === IncidentType.LOST) updateData.lost = { increment: 1 }
          if (data.type === IncidentType.RECOVERED) updateData.recovered = { increment: 1 }

          if (Object.keys(updateData).length > 0) {
            await tx.subject.update({
              where: { id: data.subjectId },
              data: updateData
            })

            const field =
              data.type === IncidentType.DAMAGED
                ? 'damaged'
                : data.type === IncidentType.LOST
                ? 'lost'
                : data.type === IncidentType.RECOVERED
                ? 'recovered'
                : null

            if (field) {
              const oldValueStr = String(subject[field] ?? 0)
              const newValueStr = String(Number(subject[field] ?? 0) + 1)
              await tx.auditLog.create({
                data: {
                  subjectId: data.subjectId,
                  field,
                  oldValue: oldValueStr,
                  newValue: newValueStr,
                  changedBy: 'LIBRARIAN'
                }
              })
            }
          }
        }
        return incident
      })
      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('update-subject', async (_, data) => {
    try {
      const prisma = ensureDb()
      if (!data.id || typeof data.id !== 'number') throw new Error('Invalid subject ID')

      const res = await prisma.$transaction(async (tx) => {
        const oldSubject = await tx.subject.findUnique({ where: { id: data.id } })
        if (!oldSubject) throw new Error('Referenced subject does not exist')

        const updated = await tx.subject.update({
          where: { id: data.id },
          data: {
            name: typeof data.data?.name === 'string' ? data.data.name : undefined,
            category: typeof data.data?.category === 'string' ? data.data.category : undefined,
            openingCount: typeof data.data?.openingCount === 'number' ? data.data.openingCount : undefined
          }
        })

        const logs = []
        if (data.data?.name && data.data.name !== oldSubject.name)
          logs.push({ field: 'name', oldValue: oldSubject.name, newValue: data.data.name })
        if (data.data?.category && data.data.category !== oldSubject.category)
          logs.push({ field: 'category', oldValue: oldSubject.category || '', newValue: data.data.category })
        if (
          typeof data.data?.openingCount === 'number' &&
          data.data.openingCount !== oldSubject.openingCount
        )
          logs.push({
            field: 'openingCount',
            oldValue: oldSubject.openingCount.toString(),
            newValue: data.data.openingCount.toString()
          })

        if (logs.length > 0) {
          await tx.auditLog.createMany({
            data: logs.map((l) => ({ subjectId: data.id, changedBy: 'LIBRARIAN', ...l }))
          })
        }
        return updated
      })
      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-audit-logs', async () => {
    try {
      const prisma = ensureDb()
      const res = await prisma.auditLog.findMany({
        include: { subject: true },
        orderBy: { changedAt: 'desc' },
        take: 100
      })
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })
}
