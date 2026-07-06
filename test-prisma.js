import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const subjects = await prisma.subject.findMany()
    console.log('SUCCESS, fetched:', subjects.length)
  } catch (err) {
    console.error('ERROR FETCHING:', err)
  }
}

main()
