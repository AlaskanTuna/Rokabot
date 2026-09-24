import { pruneActiveClaimOverflow } from '../src/agent/memory/memoryClaims.js'
import { closeDb } from '../src/storage/database.js'

const evicted = pruneActiveClaimOverflow()
console.info(`Rejected ${evicted} overflow memory claims`)
closeDb()
