import { closeDb, getDb } from '../src/storage/database.js'
import { migrateMemoryItems } from '../src/storage/memoryItemBackfill.js'
import { logger } from '../src/utils/logger.js'

async function main(): Promise<void> {
  logger.level = 'fatal'
  try {
    const report = migrateMemoryItems(getDb())
    console.log(JSON.stringify({ status: 'ok', ...report }))
  } catch (error) {
    const failedChecks =
      error instanceof Error
        ? Number(/^Memory item backfill verification failed \((\d+) checks\)$/.exec(error.message)?.[1] ?? 0)
        : 0
    console.error(JSON.stringify({ status: 'failed', checks_failed: failedChecks }))
    process.exitCode = 1
  } finally {
    closeDb()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main()
