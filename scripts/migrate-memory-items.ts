import { closeDb, getDb } from '../src/storage/database.js'
import { exportMemoryItemsToLegacy, migrateMemoryItems } from '../src/storage/memoryItemBackfill.js'
import { logger } from '../src/utils/logger.js'

async function main(): Promise<void> {
  logger.level = 'fatal'
  try {
    const args = process.argv.slice(2)
    if (args.length > 1 || (args.length === 1 && args[0] !== '--to-legacy')) {
      throw new Error('Usage: npm run migrate:memory-items [-- --to-legacy]')
    }
    if (args[0] === '--to-legacy') {
      const report = exportMemoryItemsToLegacy(getDb())
      console.log(
        JSON.stringify({
          status: 'ok',
          exported_items: report.exported_items,
          exported_evidence: report.exported_evidence,
          exported_occurrences: report.exported_occurrences,
          checks_passed: report.forward_check.checks_passed,
          checks_failed: report.forward_check.checks_failed
        })
      )
    } else {
      const report = migrateMemoryItems(getDb())
      console.log(JSON.stringify({ status: 'ok', ...report }))
    }
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
