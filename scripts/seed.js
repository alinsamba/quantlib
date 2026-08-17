import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding rich sample data for QuantLib...')

  // 1. Clear existing data in correct FK dependency order
  await prisma.stockAuditItem.deleteMany({})
  await prisma.stockAudit.deleteMany({})
  await prisma.auditLog.deleteMany({})
  await prisma.checkout.deleteMany({})
  await prisma.incident.deleteMany({})
  await prisma.subject.deleteMany({})
  await prisma.borrowingRule.deleteMany({})

  // 2. School Information
  const existingSchool = await prisma.school.findFirst()
  if (!existingSchool) {
    await prisma.school.create({
      data: {
        name: 'Mentor High School - Kitende',
        motto: 'Education is the Key to Success',
        logoPath: null,
        address: 'P.O. Box 1234, Kampala, Uganda',
        contactName: 'Head Librarian',
        contactPhone: '+256 700 000 000',
        academicYear: '2026',
        checkoutDuration: 14
      }
    })
    console.log('Seeded school profile.')
  }

  // 3. Subjects & Inventory (counts aligned with seeded checkouts and incidents)
  const subjectsData = [
    { name: 'Mathematics', category: 'Sciences', openingCount: 500, recovered: 0, issued: 1, damaged: 0, lost: 0, averageCondition: 2.9, notes: 'Core Senior Secondary syllabus books' },
    { name: 'English Literature', category: 'Languages', openingCount: 420, recovered: 0, issued: 1, damaged: 0, lost: 1, averageCondition: 2.9, notes: 'Anthologies & Shakespeare sets' },
    { name: 'Physics', category: 'Sciences', openingCount: 300, recovered: 0, issued: 1, damaged: 1, lost: 0, averageCondition: 2.7, notes: 'Includes practical lab manuals' },
    { name: 'Chemistry', category: 'Sciences', openingCount: 360, recovered: 1, issued: 0, damaged: 0, lost: 0, averageCondition: 2.8, notes: 'Organic & Inorganic textbooks' },
    { name: 'Biology', category: 'Sciences', openingCount: 310, recovered: 0, issued: 0, damaged: 0, lost: 0, averageCondition: 3.0, notes: 'Anatomy and Ecology series' },
    { name: 'World History', category: 'Humanities', openingCount: 280, recovered: 0, issued: 0, damaged: 0, lost: 0, averageCondition: 2.9, notes: 'Modern & Ancient history editions' },
    { name: 'Computer Science & IT', category: 'Technical', openingCount: 200, recovered: 0, issued: 0, damaged: 0, lost: 0, averageCondition: 3.0, notes: 'Programming & Web Dev fundamentals' },
    { name: 'Geography', category: 'Humanities', openingCount: 180, recovered: 0, issued: 0, damaged: 0, lost: 0, averageCondition: 2.8, notes: 'Physical geography & maps' }
  ]

  const createdSubjects = []
  for (const s of subjectsData) {
    const subject = await prisma.subject.create({ data: s })
    createdSubjects.push(subject)
  }
  console.log(`Seeded ${createdSubjects.length} subjects.`)

  // 4. Borrowing Rules
  const rules = [
    { roleOrGrade: 'DEFAULT', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.50 },
    { roleOrGrade: 'S.1-S.4', maxBooksAllowed: 2, borrowDurationDays: 14, finePerDay: 0.50 },
    { roleOrGrade: 'S.5-S.6', maxBooksAllowed: 4, borrowDurationDays: 21, finePerDay: 0.25 },
    { roleOrGrade: 'TEACHER', maxBooksAllowed: 10, borrowDurationDays: 60, finePerDay: 0.00 }
  ]

  for (const r of rules) {
    await prisma.borrowingRule.create({ data: r })
  }
  console.log('Seeded borrowing rules.')

  // 5. Sample Checkouts (Active, Overdue, Returned)
  const mathSubject = createdSubjects.find(s => s.name === 'Mathematics')
  const englishSubject = createdSubjects.find(s => s.name === 'English Literature')
  const physicsSubject = createdSubjects.find(s => s.name === 'Physics')
  const chemSubject = createdSubjects.find(s => s.name === 'Chemistry')
  if (!mathSubject || !englishSubject || !physicsSubject || !chemSubject) {
    throw new Error('Failed to locate created subjects for checkouts')
  }

  const now = new Date()
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
  const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
  const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)
  const inFourDays = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)
  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)

  await prisma.checkout.createMany({
    data: [
      {
        subjectId: mathSubject.id,
        studentName: 'John Doe',
        studentClass: 'S.4 North',
        checkoutDate: twentyDaysAgo,
        dueDate: sixDaysAgo, // OVERDUE
        status: 'OVERDUE',
        conditionOut: 3
      },
      {
        subjectId: englishSubject.id,
        studentName: 'Jane Smith',
        studentClass: 'S.6 West',
        checkoutDate: tenDaysAgo,
        dueDate: inFourDays, // ACTIVE
        status: 'ACTIVE',
        conditionOut: 3
      },
      {
        subjectId: physicsSubject.id,
        studentName: 'Alex Johnson',
        studentClass: 'S.3 East',
        checkoutDate: twentyDaysAgo,
        dueDate: sixDaysAgo, // OVERDUE
        status: 'OVERDUE',
        conditionOut: 2
      },
      {
        subjectId: chemSubject.id,
        studentName: 'Mary Williams',
        studentClass: 'S.5 South',
        checkoutDate: twentyDaysAgo,
        dueDate: fourDaysAgo,
        returnDate: fourDaysAgo, // RETURNED
        status: 'RETURNED',
        conditionOut: 3,
        conditionIn: 3
      }
    ]
  })
  console.log('Seeded checkouts.')

  // 6. Sample Incidents
  await prisma.incident.createMany({
    data: [
      {
        type: 'DAMAGED',
        date: fourDaysAgo,
        subjectId: physicsSubject.id,
        bookTitle: 'Physics Principles & Applications Vol. 1',
        condition: 'Damaged water damage to cover',
        comment: 'Book spilled on in cafeteria',
        reportedBy: 'Mr. David Miller',
        responsibleParty: 'John Doe',
        studentClass: 'S.4 North',
        actionTaken: 'Fine issued $5.00'
      },
      {
        type: 'LOST',
        date: tenDaysAgo,
        subjectId: englishSubject.id,
        bookTitle: 'Anthology of English Literature 5th Ed',
        condition: 'Lost',
        comment: 'Left on public transit',
        reportedBy: 'Mrs. Clara Vance',
        responsibleParty: 'Alex Johnson',
        studentClass: 'S.3 East',
        actionTaken: 'Replacement charge pending'
      },
      {
        type: 'RECOVERED',
        date: sixDaysAgo,
        subjectId: chemSubject.id,
        bookTitle: 'Advanced Chemistry Guide',
        condition: 'Good',
        comment: 'Returned to library drop-box after search',
        reportedBy: 'Sarah Jenkins',
        responsibleParty: 'Mary Williams',
        studentClass: 'S.5 South',
        actionTaken: 'Inventory restored'
      }
    ]
  })
  console.log('Seeded incident logs.')

  // 7. Sample Stock Audit (expectedCount matches calculated available stock)
  // mathSubject available = opening 500 - issued 1 = 499
  // physicsSubject available = opening 300 - issued 1 - damaged 1 = 298
  const audit = await prisma.stockAudit.create({
    data: {
      auditedBy: 'Sarah Jenkins',
      notes: 'Mid-term Term 1 Stock Reconciliation',
      status: 'IN_PROGRESS',
      items: {
        create: [
          {
            subjectId: mathSubject.id,
            expectedCount: 499,
            actualCount: 497,
            discrepancy: -2,
            notes: '2 copies missing from shelf B-4'
          },
          {
            subjectId: physicsSubject.id,
            expectedCount: 298,
            actualCount: 298,
            discrepancy: 0,
            notes: 'All verified against catalog'
          }
        ]
      }
    }
  })
  console.log('Seeded stock audit record:', audit.id)

  console.log('Full sample data seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
