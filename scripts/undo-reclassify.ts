import { undoReclassify } from '../src/agent/memory/reclassify.js'
import { closeDb } from '../src/storage/database.js'

const oldClaimId = Number(process.argv[2])
if (!Number.isInteger(oldClaimId) || oldClaimId <= 0) {
  console.error('Usage: npm run memory:undo-reclassify -- <old claim id>')
  process.exit(1)
}

const undone = undoReclassify(oldClaimId)
console.info(undone ? 'undone' : 'nothing to undo')
closeDb()
process.exit(undone ? 0 : 1)
