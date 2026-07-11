import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding dummy data...')
  
  // Create subjects
  const subjects = [
    { name: 'Mathematics', category: 'Sciences', openingCount: 550, recovered: 0, issued: 40, damaged: 5, lost: 5 },
    { name: 'English', category: 'Languages', openingCount: 420, recovered: 5, issued: 20, damaged: 2, lost: 3 },
    { name: 'Physics', category: 'Sciences', openingCount: 350, recovered: 0, issued: 45, damaged: 1, lost: 4 },
    { name: 'Chemistry', category: 'Sciences', openingCount: 360, recovered: 0, issued: 30, damaged: 8, lost: 2 },
    { name: 'Biology', category: 'Sciences', openingCount: 310, recovered: 2, issued: 25, damaged: 4, lost: 3 },
    { name: 'History', category: 'Humanities', openingCount: 210, recovered: 0, issued: 10, damaged: 0, lost: 0 },
  ]

  for (const s of subjects) {
    await prisma.subject.upsert({
      where: { name: s.name },
      update: {},
      create: s
    })
  }
  
  console.log('Seeding completed.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
