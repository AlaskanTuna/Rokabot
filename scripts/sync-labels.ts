import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'

interface Label {
  name: string
  color: string
  description: string
}

const raw = readFileSync(new URL('../.github/labels.yml', import.meta.url), 'utf8')
const labels = yaml.load(raw) as Label[]
for (const label of labels) {
  execFileSync(
    'gh',
    ['label', 'create', label.name, '--force', '--color', label.color, '--description', label.description],
    {
      stdio: 'inherit'
    }
  )
}
console.log(`Synced ${labels.length} labels`)
