import { pathToFileURL } from 'node:url'
import type { TurnJudgment, TurnJudgmentInput } from '../src/agent/jev/judgments.js'
import { loadJevReplayTurns, renderJevReplayReport, runJevReplay } from '../tests/harness/jevReplay.js'

export function parseReplayArgs(argv: string[]): { databasePath: string; maxTurns: number } {
  const databasePath = argv[0]
  if (!databasePath) throw new Error('Usage: npm run replay:jev -- data/rokabot.db --max-turns 100')
  const optionIndex = argv.indexOf('--max-turns')
  const rawMaxTurns = optionIndex === -1 ? '100' : argv[optionIndex + 1]
  if (!rawMaxTurns || !/^\d+$/.test(rawMaxTurns)) {
    throw new Error('--max-turns must be an integer from 1 through 100')
  }
  const maxTurns = Number(rawMaxTurns)
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 100) {
    throw new Error('--max-turns must be an integer from 1 through 100')
  }
  return { databasePath, maxTurns }
}

export async function runReplayCli(
  argv: string[],
  apiKey: string | undefined,
  loadJudge: () => Promise<(input: TurnJudgmentInput) => Promise<TurnJudgment | null>> = async () =>
    (await import('../src/agent/jev/judgments.js')).judgeTurn
): Promise<number> {
  const parsed = parseReplayArgs(argv)
  if (!apiKey) {
    process.stderr.write('TYPESAFE_API_KEY is required to run the live Jev replay.\n')
    return 1
  }
  process.env.DISCORD_TOKEN ??= 'replay-unused'
  process.env.DISCORD_CLIENT_ID ??= 'replay-unused'
  process.env.GEMINI_API_KEY ??= 'replay-unused'
  const judge = await loadJudge()
  const turns = await loadJevReplayTurns(parsed.databasePath, 'tests/harness/transcripts', parsed.maxTurns)
  const report = await runJevReplay(turns, judge)
  process.stdout.write(`${renderJevReplayReport(report)}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import('dotenv/config')
  try {
    process.exitCode = await runReplayCli(process.argv.slice(2), process.env.TYPESAFE_API_KEY)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
