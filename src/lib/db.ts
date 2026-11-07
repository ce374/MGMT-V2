import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// query logging is disabled: in dev the server pipes stdout through `tee` into
// dev.log, so logging every query dominated I/O and slowed every request.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
