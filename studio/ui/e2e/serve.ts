import { createServer } from 'node:http'
import { join } from 'node:path'
import { REPO, SANDBOX, resetSandbox, sandboxPaths } from './sandbox'
import { applyDataset, datasetFromEnv } from './worst-case'

const root = SANDBOX
const port = Number(process.env.E2E_PORT)
const token = process.env.E2E_TOKEN as string
resetSandbox(root)
// Dev and test only: E2E_DATA=worst|empty|one swaps the sandbox files for a stress dataset.
const dataset = datasetFromEnv()
if (dataset) applyDataset(root, dataset)

const paths = sandboxPaths(root)
process.env.ROKABOT_CONFIG_PATH = paths.configPath
Reflect.deleteProperty(process.env, 'CHARACTER_DIR')

const { createApp } = await import('../../server/app.js')
const app = createApp({
  token,
  port,
  ...paths,
  env: { ...process.env },
  uiDir: join(REPO, 'studio', 'ui', 'dist'),
  templateDir: join(REPO, 'studio', 'template')
})

createServer(app).listen(port, '127.0.0.1', () => {
  console.log(`Persona Studio e2e server on http://127.0.0.1:${port} (sandbox ${root})`)
})
