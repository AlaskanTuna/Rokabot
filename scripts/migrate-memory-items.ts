import { config } from '../src/config.js'
import { closeDb, getDb } from '../src/storage/database.js'
import { exportMemoryItemsToLegacy, migrateMemoryItems } from '../src/storage/memoryItemBackfill.js'
import { LegacyMemoryDropRefusal, dropLegacyMemoryTables } from '../src/storage/memoryLegacyDrop.js'
import { logger } from '../src/utils/logger.js'

const USAGE = 'Usage: npm run migrate:memory-items [-- --to-legacy | --drop-legacy --backup <path>]'

async function main(): Promise<void> {
  logger.level = 'fatal'
  try {
    // npm strips its own `--` separator before tsx sees it; a direct tsx call does not.
    const args = process.argv.slice(2).filter((arg) => arg !== '--')
    if (args.includes('--drop-legacy')) {
      const backupIndex = args.indexOf('--backup')
      const backupPath = backupIndex === -1 ? undefined : args[backupIndex + 1]
      const extra = args.filter(
        (arg, index) =>
          arg !== '--drop-legacy' && arg !== '--backup' && !(backupIndex !== -1 && index === backupIndex + 1)
      )
      if (extra.length > 0 || backupPath === undefined) throw new Error(USAGE)
      const report = dropLegacyMemoryTables(getDb(), { store: config.memory.store, backupPath })
      console.log(JSON.stringify({ status: 'ok', ...report }))
    } else if (args.length > 1 || (args.length === 1 && args[0] !== '--to-legacy')) {
      throw new Error(USAGE)
    } else if (args[0] === '--to-legacy') {
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
    if (error instanceof LegacyMemoryDropRefusal) {
      console.error(JSON.stringify({ status: 'refused', error: error.message }))
    } else {
      const failedChecks =
        error instanceof Error
          ? Number(/^Memory item backfill verification failed \((\d+) checks\)$/.exec(error.message)?.[1] ?? 0)
          : 0
      console.error(JSON.stringify({ status: 'failed', checks_failed: failedChecks }))
    }
    process.exitCode = 1
  } finally {
    closeDb()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main()
