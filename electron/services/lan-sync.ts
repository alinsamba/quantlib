import http from 'node:http'
import os from 'node:os'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { encryptTempDatabase } from '../crypto'
import { getPrisma, ensureDb } from '../database'
interface LanSyncSubject {
  id?: number
  name: string
  category?: string | null
  openingCount?: number
  recovered?: number
  issued?: number
  damaged?: number
  lost?: number
  notes?: string | null
  averageCondition?: number
  degradationRate?: number
}

interface LanSyncCheckout {
  id?: number
  subjectId?: number
  subjectName?: string
  studentName: string
  studentClass?: string | null
  checkoutDate: string | Date
  dueDate: string | Date
  returnDate?: string | Date | null
  status?: string
  conditionOut?: number
  conditionIn?: number | null
}

interface LanSyncIncident {
  id?: number
  type: string
  date: string | Date
  subjectId?: number | null
  subjectName?: string
  bookTitle: string
  condition?: string | null
  comment?: string | null
  reportedBy?: string | null
  responsibleParty?: string | null
  studentClass?: string | null
  actionTaken?: string | null
}

interface LanSyncBorrowingRule {
  roleOrGrade: string
  maxBooksAllowed: number
  borrowDurationDays: number
  finePerDay: number
}

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

export async function packageLanSyncPayload(client: PrismaClient) {
  const [subjects, checkouts, incidents, borrowingRules] = await Promise.all([
    client.subject.findMany(),
    client.checkout.findMany({ include: { subject: { select: { name: true } } } }),
    client.incident.findMany({ include: { subject: { select: { name: true } } } }),
    client.borrowingRule.findMany()
  ])

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects,
    checkouts: checkouts.map(c => ({
      ...c,
      subjectName: c.subject?.name
    })),
    incidents: incidents.map(i => ({
      ...i,
      subjectName: i.subject?.name
    })),
    borrowingRules
  }
}

export async function mergeLanSyncPayload(client: PrismaClient, payload: unknown) {
  const p = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : null
  if (!p) return { mergedCounts: { subjects: 0, checkouts: 0, incidents: 0, rules: 0 } }

  const hasRules = Array.isArray(p.borrowingRules) && p.borrowingRules.length > 0
  const hasSubjects = Array.isArray(p.subjects) && p.subjects.length > 0
  const hasCheckouts = Array.isArray(p.checkouts) && p.checkouts.length > 0
  const hasIncidents = Array.isArray(p.incidents) && p.incidents.length > 0

  if (!hasRules && !hasSubjects && !hasCheckouts && !hasIncidents) {
    return { mergedCounts: { subjects: 0, checkouts: 0, incidents: 0, rules: 0 } }
  }

  let subjectsMerged = 0
  let checkoutsMerged = 0
  let incidentsMerged = 0
  let rulesMerged = 0

  await client.$transaction(async (tx) => {
    // 1. Borrowing Rules
    if (Array.isArray(p.borrowingRules)) {
      for (const rule of (p.borrowingRules as LanSyncBorrowingRule[])) {
        if (rule.roleOrGrade) {
          await tx.borrowingRule.upsert({
            where: { roleOrGrade: rule.roleOrGrade },
            update: {
              maxBooksAllowed: rule.maxBooksAllowed,
              borrowDurationDays: rule.borrowDurationDays,
              finePerDay: rule.finePerDay
            },
            create: {
              roleOrGrade: rule.roleOrGrade,
              maxBooksAllowed: rule.maxBooksAllowed,
              borrowDurationDays: rule.borrowDurationDays,
              finePerDay: rule.finePerDay
            }
          })
          rulesMerged++
        }
      }
    }

    // 2. Subjects & Peer-to-Local Subject ID Mapping (Fixes Finding #2 & #5)
    const peerToLocalSubjectIdMap = new Map<number, number>()

    if (Array.isArray(p.subjects)) {
      for (const sub of (p.subjects as LanSyncSubject[])) {
        if (sub.name) {
          const existing = await tx.subject.findUnique({ where: { name: sub.name } })
          let localSubjectId: number

          if (existing) {
            localSubjectId = existing.id
            const updated = await tx.subject.update({
              where: { id: existing.id },
              data: {
                category: sub.category ?? existing.category,
                openingCount: Math.max(existing.openingCount, sub.openingCount || 0),
                recovered: Math.max(existing.recovered, sub.recovered || 0),
                issued: Math.max(existing.issued, sub.issued || 0),
                damaged: Math.max(existing.damaged, sub.damaged || 0),
                lost: Math.max(existing.lost, sub.lost || 0),
                notes: sub.notes ?? existing.notes
              }
            })
            localSubjectId = updated.id
          } else {
            const created = await tx.subject.create({
              data: {
                name: sub.name,
                category: sub.category || 'General',
                openingCount: sub.openingCount || 0,
                recovered: sub.recovered || 0,
                issued: sub.issued || 0,
                damaged: sub.damaged || 0,
                lost: sub.lost || 0,
                notes: sub.notes || null,
                averageCondition: sub.averageCondition ?? 3.0,
                degradationRate: sub.degradationRate ?? 0.0
              }
            })
            localSubjectId = created.id
          }

          if (typeof sub.id === 'number') {
            peerToLocalSubjectIdMap.set(sub.id, localSubjectId)
          }
          subjectsMerged++
        }
      }
    }

    // 3. Checkouts with mapped local subject ID (Fixes Finding #2)
    if (Array.isArray(p.checkouts)) {
      for (const c of (p.checkouts as LanSyncCheckout[])) {
        let mappedSubjectId: number | null = null

        if (c.subjectId && peerToLocalSubjectIdMap.has(c.subjectId)) {
          mappedSubjectId = peerToLocalSubjectIdMap.get(c.subjectId)!
        } else if (c.subjectName) {
          const s = await tx.subject.findUnique({ where: { name: c.subjectName } })
          if (s) mappedSubjectId = s.id
        } else if (c.subjectId) {
          mappedSubjectId = c.subjectId
        }

        if (c.studentName && mappedSubjectId !== null) {
          const existing = await tx.checkout.findFirst({
            where: {
              studentName: c.studentName,
              subjectId: mappedSubjectId,
              checkoutDate: new Date(c.checkoutDate)
            }
          })

          if (!existing) {
            await tx.checkout.create({
              data: {
                subjectId: mappedSubjectId,
                studentName: c.studentName,
                studentClass: c.studentClass || null,
                checkoutDate: new Date(c.checkoutDate),
                dueDate: new Date(c.dueDate),
                returnDate: c.returnDate ? new Date(c.returnDate) : null,
                status: c.status || 'ACTIVE',
                conditionOut: c.conditionOut ?? 3,
                conditionIn: c.conditionIn ?? null
              }
            })
            checkoutsMerged++
          }
        }
      }
    }

    // 4. Incidents with mapped local subject ID (Fixes Finding #2)
    if (Array.isArray(p.incidents)) {
      for (const inc of (p.incidents as LanSyncIncident[])) {
        let mappedSubjectId: number | null = null

        if (inc.subjectId && peerToLocalSubjectIdMap.has(inc.subjectId)) {
          mappedSubjectId = peerToLocalSubjectIdMap.get(inc.subjectId)!
        } else if (inc.subjectName) {
          const s = await tx.subject.findUnique({ where: { name: inc.subjectName } })
          if (s) mappedSubjectId = s.id
        }

        if (inc.bookTitle) {
          const existing = await tx.incident.findFirst({
            where: {
              bookTitle: inc.bookTitle,
              date: new Date(inc.date)
            }
          })

          if (!existing) {
            await tx.incident.create({
              data: {
                type: inc.type,
                date: new Date(inc.date),
                subjectId: mappedSubjectId,
                bookTitle: inc.bookTitle,
                condition: inc.condition || null,
                comment: inc.comment || null,
                reportedBy: inc.reportedBy || null,
                responsibleParty: inc.responsibleParty || null,
                studentClass: inc.studentClass || null,
                actionTaken: inc.actionTaken || null
              }
            })
            incidentsMerged++
          }
        }
      }
    }
  })

  try { await encryptTempDatabase() } catch {}

  return {
    mergedCounts: {
      subjects: subjectsMerged,
      checkouts: checkoutsMerged,
      incidents: incidentsMerged,
      rules: rulesMerged
    }
  }
}

let lanServer: http.Server | null = null
let lanServerPort = 8085
let lanServerPasscode = ''

export function generateSecurePasscode(): string {
  return crypto.randomBytes(8).toString('hex')
}

export function getLanServerInstance() {
  return lanServer
}

export function startLanSyncServer(
  port: number = 8085,
  passcode?: string
) {
  stopLanSyncServer()

  lanServerPort = port
  lanServerPasscode = passcode || generateSecurePasscode()

  lanServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://localhost:${port}`)

    if (req.method === 'GET' && url.pathname === '/status') {
      res.writeHead(200)
      res.end(JSON.stringify({
        status: 'ok',
        serverName: 'QuantLib LAN Sync',
        port: lanServerPort,
        timestamp: new Date().toISOString()
      }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/sync') {
      let bodyStr = ''
      let bodyLength = 0
      const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024 // 10MB payload size cap (Fixes Finding #4)

      req.on('data', chunk => {
        bodyLength += chunk.length
        if (bodyLength > MAX_PAYLOAD_BYTES) {
          req.destroy()
          res.writeHead(413)
          res.end(JSON.stringify({ success: false, error: 'Payload exceeds maximum allowed size of 10MB' }))
          return
        }
        bodyStr += chunk
      })

      req.on('end', async () => {
        try {
          const body = bodyStr ? JSON.parse(bodyStr) : {}
          const headerPasscode = req.headers['x-sync-passcode'] as string
          const providedPasscode = body.passcode || headerPasscode

          if (lanServerPasscode) {
            const expectedBuf = Buffer.from(lanServerPasscode)
            const providedBuf = Buffer.from(typeof providedPasscode === 'string' ? providedPasscode : '')
            const isMatch = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)
            if (!isMatch) {
              res.writeHead(401)
              res.end(JSON.stringify({ success: false, error: 'Invalid sync passcode' }))
              return
            }
          }

          // Fetch database reference dynamically
          const prisma = getPrisma()
          if (!prisma) {
            res.writeHead(503)
            res.end(JSON.stringify({ success: false, error: 'Database is locked on server machine' }))
            return
          }

          let mergedCounts = {}
          if (body.payload) {
            const mergeRes = await mergeLanSyncPayload(prisma, body.payload)
            mergedCounts = mergeRes.mergedCounts
          }

          const localPayload = await packageLanSyncPayload(prisma)

          res.writeHead(200)
          res.end(JSON.stringify({
            success: true,
            syncedAt: new Date().toISOString(),
            mergedCounts,
            payload: localPayload
          }))
        } catch (err: unknown) {
          res.writeHead(500)
          res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }))
  })

  lanServer.listen(port, () => {
    console.log(`QuantLib LAN Sync server running on port ${port}`)
  })
}

export function stopLanSyncServer() {
  if (lanServer) {
    try {
      lanServer.close()
    } catch {}
    lanServer = null
  }
}

export async function syncWithLanPeer(
  peerIp: string,
  peerPort: number = 8085,
  passcode?: string
) {
  const prisma = ensureDb()

  if (!peerIp || !peerIp.trim()) throw new Error('Peer IP address is required')

  const localPayload = await packageLanSyncPayload(prisma)

  const response = await fetch(`http://${peerIp.trim()}:${peerPort}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-passcode': passcode || ''
    },
    body: JSON.stringify({
      passcode: passcode || '',
      payload: localPayload
    })
  })

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(errorJson.error || `LAN Sync failed with HTTP status ${response.status}`)
  }

  const data = await response.json() as { success: boolean; payload?: unknown; mergedCounts?: unknown }
  if (data.payload) {
    await mergeLanSyncPayload(prisma, data.payload)
  }

  return data
}
