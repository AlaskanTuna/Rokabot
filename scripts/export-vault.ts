import { exportVault } from '../src/agent/memory/obsidianExport.js'
import { config } from '../src/config.js'

const result = await exportVault()
console.log(`Exported ${result.notes} notes from ${result.claims} active claims to ${config.memory.vaultExportDir}`)
