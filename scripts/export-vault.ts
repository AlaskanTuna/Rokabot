import { exportVault } from '../src/agent/memory/obsidianExport.js'
import { config } from '../src/config.js'

const result = await exportVault()
console.log(
  `Exported ${result.notes} notes from ${result.claims} active claims and ${result.episodes} episodes to ${config.memory.vaultExportDir}`
)
