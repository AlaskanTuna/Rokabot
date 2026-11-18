/** Regenerates expected-coverage.json from the recorded fixtures. Run from the repo root with no live calls. */

process.env.SEARCH_PROVIDER = 'exa'
process.env.EXA_API_KEY ??= 'coverage-dummy-key'
process.env.GEMINI_API_KEY ??= 'coverage-dummy-key'
process.env.DISCORD_TOKEN ??= 'coverage-discord-token'
process.env.DISCORD_CLIENT_ID ??= 'coverage-discord-client-id'
process.env.ROKABOT_DB_PATH ??= ':memory:'
process.env.LOG_LEVEL ??= 'error'

const { writeFileSync } = await import('node:fs')
const { EXPECTED_PATH, loadExpected, loadFacts, loadFixtures, matchFacts, replayFixture } = await import('./replay.js')

const facts = loadFacts()
const previous = loadExpected()
const fixtures = new Map(loadFixtures().map((f) => [f.caseId, f]))
const next: Record<string, { covered: string[]; missing: string[] }> = {}

for (const [caseId, caseFacts] of Object.entries(facts)) {
  const fixture = fixtures.get(caseId)
  if (!fixture) {
    next[caseId] = previous[caseId] ?? { covered: [], missing: caseFacts.facts.map((f) => f.text) }
    continue
  }
  const evidence = await replayFixture(fixture)
  const { covered, missing } = matchFacts(evidence, caseFacts.facts)
  next[caseId] = { covered, missing }
}

writeFileSync(EXPECTED_PATH, `${JSON.stringify(next, null, 2)}\n`)
console.log(`wrote ${EXPECTED_PATH} from ${fixtures.size} fixture(s), ${Object.keys(next).length} case(s)`)
process.exit(0)
