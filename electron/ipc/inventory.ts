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
          name: data.name.trim(),
          category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : 'General',
          openingCount: typeof data.openingCount === 'number' ? Math.max(0, data.openingCount) : 0,
          notes: typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : null
        }
      })
      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

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
            actionTaken: data.actionTaken || 'PENDING'
          },
          include: { subject: true }
        })

        if (data.subjectId && subject) {
          const updateData: Record<string, unknown> = {}
          if (data.type === IncidentType.DAMAGED) updateData.damaged = { increment: 1 }
          if (data.type === IncidentType.LOST) updateData.lost = { increment: 1 }
          if (data.type === IncidentType.RECOVERED) updateData.recovered = { increment: 1 }
          if (data.type === IncidentType.NEW || data.type === IncidentType.DONATION) {
            updateData.openingCount = { increment: 1 }
          }

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
                : data.type === IncidentType.NEW || data.type === IncidentType.DONATION
                ? 'openingCount'
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

  ipcMain.handle('resolve-incident', async (_, data: { id: number; resolutionNotes?: string }) => {
    try {
      const prisma = ensureDb()
      if (!data?.id || typeof data.id !== 'number') throw new Error('Invalid incident ID')

      const res = await prisma.$transaction(async (tx) => {
        const incident = await tx.incident.findUnique({ where: { id: data.id } })
        if (!incident) throw new Error('Incident not found')
        if (incident.actionTaken === 'RESOLVED') throw new Error('Incident is already resolved')

        const newComment = data.resolutionNotes
          ? incident.comment
            ? `${incident.comment} | Resolved: ${data.resolutionNotes}`
            : `Resolved: ${data.resolutionNotes}`
          : incident.comment

        const updatedIncident = await tx.incident.update({
          where: { id: data.id },
          data: {
            actionTaken: 'RESOLVED',
            comment: newComment
          },
          include: { subject: true }
        })

        if (incident.subjectId) {
          const subject = await tx.subject.findUnique({ where: { id: incident.subjectId } })
          if (subject) {
            if (incident.type === IncidentType.DAMAGED && subject.damaged > 0) {
              const newDamaged = Math.max(0, subject.damaged - 1)
              await tx.subject.update({
                where: { id: subject.id },
                data: { damaged: newDamaged }
              })
              await tx.auditLog.create({
                data: {
                  subjectId: subject.id,
                  field: 'damaged',
                  oldValue: String(subject.damaged),
                  newValue: String(newDamaged),
                  changedBy: 'INCIDENT_RESOLVED'
                }
              })
            } else if (incident.type === IncidentType.LOST) {
              const newRecovered = subject.recovered + 1
              await tx.subject.update({
                where: { id: subject.id },
                data: { recovered: newRecovered }
              })
              await tx.auditLog.create({
                data: {
                  subjectId: subject.id,
                  field: 'recovered',
                  oldValue: String(subject.recovered),
                  newValue: String(newRecovered),
                  changedBy: 'INCIDENT_RESOLVED'
                }
              })
            }
          }
        }

        return updatedIncident
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

        const updatePayload: Record<string, unknown> = {}
        const logs: { field: string; oldValue: string; newValue: string }[] = []

        if (typeof data.data?.name === 'string' && data.data.name.trim()) {
          const nextName = data.data.name.trim()
          updatePayload.name = nextName
          if (nextName !== oldSubject.name) {
            logs.push({ field: 'name', oldValue: oldSubject.name, newValue: nextName })
          }
        }
        if (typeof data.data?.category === 'string') {
          const nextCat = data.data.category.trim() || 'General'
          updatePayload.category = nextCat
          if (nextCat !== (oldSubject.category || '')) {
            logs.push({ field: 'category', oldValue: oldSubject.category || '', newValue: nextCat })
          }
        }
        if (data.data?.notes !== undefined) {
          const nextNotes = typeof data.data.notes === 'string' && data.data.notes.trim() ? data.data.notes.trim() : null
          updatePayload.notes = nextNotes
          if ((nextNotes || '') !== (oldSubject.notes || '')) {
            logs.push({ field: 'notes', oldValue: oldSubject.notes || '', newValue: nextNotes || '' })
          }
        }

        const numericFields = ['openingCount', 'recovered', 'issued', 'damaged', 'lost'] as const
        for (const field of numericFields) {
          const val = data.data?.[field]
          if (typeof val === 'number' && !Number.isNaN(val)) {
            const safeVal = Math.max(0, Math.floor(val))
            updatePayload[field] = safeVal
            if (safeVal !== oldSubject[field]) {
              logs.push({
                field,
                oldValue: String(oldSubject[field]),
                newValue: String(safeVal)
              })
            }
          }
        }

        const updated = await tx.subject.update({
          where: { id: data.id },
          data: updatePayload
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

  ipcMain.handle('delete-subject', async (_, id: number) => {
    try {
      const prisma = ensureDb()
      if (!id || typeof id !== 'number') throw new Error('Invalid subject ID')

      await prisma.$transaction(async (tx) => {
        const subject = await tx.subject.findUnique({ where: { id } })
        if (!subject) throw new Error('Subject not found')

        const activeCheckouts = await tx.checkout.count({
          where: { subjectId: id, status: 'ACTIVE' }
        })
        if (activeCheckouts > 0) {
          throw new Error('Cannot delete a subject with active student loans. Return all active checkouts first.')
        }

        await tx.stockAuditItem.deleteMany({ where: { subjectId: id } })
        await tx.incident.deleteMany({ where: { subjectId: id } })
        await tx.auditLog.deleteMany({ where: { subjectId: id } })
        await tx.checkout.deleteMany({ where: { subjectId: id } })
        await tx.subject.delete({ where: { id } })
      })

      await encryptTempDatabase()
      return { success: true }
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

  ipcMain.handle('get-school-info', async () => {
    try {
      const prisma = ensureDb()
      const school = await prisma.school.findFirst()
      return {
        success: true,
        data: school || {
          name: 'Mentor High School - Kitende',
          motto: 'Education is the Key',
          academicYear: '2026',
          address: '',
          contactPhone: ''
        }
      }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle(
    'save-school-info',
    async (
      _event,
      data: {
        name: string
        motto?: string | null
        academicYear?: string | null
        address?: string | null
        contactPhone?: string | null
        logoPath?: string | null
      }
    ) => {
      try {
        const prisma = ensureDb()
        const existing = await prisma.school.findFirst()
        const payload = {
          name: data.name,
          motto: data.motto ?? null,
          academicYear: data.academicYear ?? null,
          address: data.address ?? null,
          contactPhone: data.contactPhone ?? null,
          logoPath: data.logoPath ?? null
        }
        let updated
        if (existing) {
          updated = await prisma.school.update({
            where: { id: existing.id },
            data: payload
          })
        } else {
          updated = await prisma.school.create({
            data: payload
          })
        }
        await encryptTempDatabase()
        return { success: true, data: updated }
      } catch (err: unknown) {
        return { success: false, error: sanitizeError(err) }
      }
    }
  )
}
