import { ipcMain } from 'electron'
import { ensureDb, sanitizeError } from '../database'
import { encryptTempDatabase } from '../crypto'
import { calculateAvailable } from '../../src/lib/utils'

export function calculateStockAuditDiscrepancy(expectedCount: number, actualCount: number) {
  const exp = typeof expectedCount === 'number' && !isNaN(expectedCount) ? Math.max(0, expectedCount) : 0
  const act = typeof actualCount === 'number' && !isNaN(actualCount) ? Math.max(0, actualCount) : 0
  const discrepancy = act - exp
  return {
    expectedCount: exp,
    actualCount: act,
    discrepancy,
    hasDiscrepancy: discrepancy !== 0,
    isMissing: discrepancy < 0,
    isMisplaced: discrepancy > 0,
    discrepancyAmount: Math.abs(discrepancy)
  }
}

function computeAuditSummary(items: Array<{ expectedCount: number; actualCount: number; discrepancy: number }>) {
  let totalExpected = 0
  let totalActual = 0
  let totalDiscrepancy = 0
  let missingItems = 0
  let misplacedItems = 0

  for (const item of items) {
    totalExpected += item.expectedCount
    totalActual += item.actualCount
    totalDiscrepancy += item.discrepancy
    if (item.discrepancy < 0) missingItems += Math.abs(item.discrepancy)
    if (item.discrepancy > 0) misplacedItems += item.discrepancy
  }

  return {
    totalSubjects: items.length,
    totalExpected,
    totalActual,
    totalDiscrepancy,
    missingItems,
    misplacedItems
  }
}

export function registerAuditHandlers() {
  ipcMain.handle('create-stock-audit', async (_, data) => {
    try {
      const prisma = ensureDb()
      const auditedBy = typeof data?.auditedBy === 'string' && data.auditedBy.trim() ? data.auditedBy.trim() : 'LIBRARIAN'
      const notes = typeof data?.notes === 'string' && data.notes.trim() ? data.notes.trim() : null

      const subjects = await prisma.subject.findMany()

      const audit = await prisma.$transaction(async (tx) => {
        const createdAudit = await tx.stockAudit.create({
          data: {
            auditedBy,
            notes,
            status: 'IN_PROGRESS'
          }
        })

        if (subjects.length > 0) {
          const itemsData = subjects.map((s) => {
            const exp = calculateAvailable(s)
            return {
              auditId: createdAudit.id,
              subjectId: s.id,
              expectedCount: exp,
              actualCount: exp,
              discrepancy: 0
            }
          })

          await tx.stockAuditItem.createMany({
            data: itemsData
          })
        }

        const full = await tx.stockAudit.findUnique({
          where: { id: createdAudit.id },
          include: { items: { include: { subject: true } } }
        })
        return full ? { ...full, summary: computeAuditSummary(full.items) } : full
      })

      await encryptTempDatabase()
      return { success: true, data: audit }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('save-stock-audit-item', async (_, data) => {
    try {
      const prisma = ensureDb()
      const { auditId, subjectId, actualCount, notes } = data || {}
      if (!auditId || typeof auditId !== 'number') throw new Error('Invalid audit ID')
      if (!subjectId || typeof subjectId !== 'number') throw new Error('Invalid subject ID')
      if (typeof actualCount !== 'number') throw new Error('Invalid actual count')

      const res = await prisma.$transaction(async (tx) => {
        const audit = await tx.stockAudit.findUnique({ where: { id: auditId } })
        if (!audit) throw new Error('Stock audit not found')
        if (audit.status === 'COMPLETED') throw new Error('Cannot edit a completed audit')

        const subject = await tx.subject.findUnique({ where: { id: subjectId } })
        if (!subject) throw new Error('Referenced subject does not exist')

        const expectedCount = calculateAvailable(subject)
        const discrepancyInfo = calculateStockAuditDiscrepancy(expectedCount, actualCount)

        const item = await tx.stockAuditItem.upsert({
          where: {
            auditId_subjectId: { auditId, subjectId }
          },
          create: {
            auditId,
            subjectId,
            expectedCount,
            actualCount: discrepancyInfo.actualCount,
            discrepancy: discrepancyInfo.discrepancy,
            notes: notes || null
          },
          update: {
            expectedCount,
            actualCount: discrepancyInfo.actualCount,
            discrepancy: discrepancyInfo.discrepancy,
            notes: notes !== undefined ? notes : undefined
          },
          include: { subject: true }
        })

        return item
      })

      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('complete-stock-audit', async (_, data) => {
    try {
      const prisma = ensureDb()
      const { auditId, notes } = data || {}
      if (!auditId || typeof auditId !== 'number') throw new Error('Invalid audit ID')

      const res = await prisma.$transaction(async (tx) => {
        const audit = await tx.stockAudit.findUnique({
          where: { id: auditId },
          include: { items: { include: { subject: true } } }
        })
        if (!audit) throw new Error('Stock audit not found')
        if (audit.status === 'COMPLETED') throw new Error('Stock audit is already completed')

        const updatedAudit = await tx.stockAudit.update({
          where: { id: auditId },
          data: {
            status: 'COMPLETED',
            notes: notes !== undefined ? notes : audit.notes,
            updatedAt: new Date()
          },
          include: { items: { include: { subject: true } } }
        })

        for (const item of updatedAudit.items) {
          if (item.discrepancy < 0 && item.subject) {
            const lostQty = Math.abs(item.discrepancy)
            await tx.subject.update({
              where: { id: item.subjectId },
              data: { lost: { increment: lostQty } }
            })
            await tx.auditLog.create({
              data: {
                subjectId: item.subjectId,
                field: 'lost',
                oldValue: item.subject.lost.toString(),
                newValue: (item.subject.lost + lostQty).toString(),
                changedBy: 'AUDIT_AUTO'
              }
            })
          } else if (item.discrepancy > 0 && item.subject) {
            const recoveredQty = item.discrepancy
            await tx.subject.update({
              where: { id: item.subjectId },
              data: { recovered: { increment: recoveredQty } }
            })
            await tx.incident.create({
              data: {
                type: 'RECOVERED',
                date: new Date(),
                subjectId: item.subjectId,
                bookTitle: `${item.subject.name} (x${recoveredQty})`,
                condition: 'Good',
                comment: `Auto-logged surplus from Stock Audit #${auditId}`,
                reportedBy: 'Stock Audit System',
                actionTaken: 'STOCK_ADJUSTED'
              }
            })
            await tx.auditLog.create({
              data: {
                subjectId: item.subjectId,
                field: 'recovered',
                oldValue: item.subject.recovered.toString(),
                newValue: (item.subject.recovered + recoveredQty).toString(),
                changedBy: 'AUDIT_AUTO'
              }
            })
          }
        }

        return {
          ...updatedAudit,
          summary: computeAuditSummary(updatedAudit.items)
        }
      })

      await encryptTempDatabase()
      return { success: true, data: res }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })

  ipcMain.handle('get-stock-audits', async (_, data) => {
    try {
      const prisma = ensureDb()
      const id = typeof data === 'number' ? data : data?.id

      if (id) {
        const audit = await prisma.stockAudit.findUnique({
          where: { id },
          include: { items: { include: { subject: true } } }
        })
        return {
          success: true,
          data: audit ? { ...audit, summary: computeAuditSummary(audit.items) } : null
        }
      }

      const audits = await prisma.stockAudit.findMany({
        orderBy: { auditDate: 'desc' },
        include: { items: { include: { subject: true } } }
      })
      return {
        success: true,
        data: audits.map((a) => ({
          ...a,
          summary: computeAuditSummary(a.items)
        }))
      }
    } catch (err: unknown) {
      return { success: false, error: sanitizeError(err) }
    }
  })
}
