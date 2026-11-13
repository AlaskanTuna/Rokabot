import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CacheMode, ProviderBudgets } from './cache.js'
import type { PrivacyMode, StoreMode } from './routes.js'
import { runMemsim } from './sim.js'
import type { MemsimReport } from './types.js'

interface CliArgs {
  mode: CacheMode
  store: StoreMode
  privacy: PrivacyMode
  seedDbPath?: string
  cacheDir?: string
  maxDays?: number
  dropLegacyAtDay?: number
  scale?: number
  budgets?: Partial<ProviderBudgets>
  pruneUnused: boolean
  jsonOut?: string
}

export function parseBudgetArg(raw: string): Partial<ProviderBudgets> {
  const budgets: Partial<ProviderBudgets> = {}
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const [key, val] = trimmed.split('=')
    const parsed = Number.parseInt(val ?? '', 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`Invalid --budget entry: ${trimmed}`)
    }
    if (key === 'river' || key === 'embeddings' || key === 'typesafe') {
      budgets[key] = parsed
    } else {
      throw new Error(`Unknown provider in --budget: ${key}`)
    }
  }
  return budgets
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    mode: 'replay',
    store: 'dual',
    privacy: 'balanced',
    pruneUnused: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = argv[i + 1]
    if (token === '--record') args.mode = 'record'
    else if (token === '--replay') args.mode = 'replay'
    else if (token === '--prune-unused') args.pruneUnused = true
    else if (token === '--seed' && next) {
      args.seedDbPath = next
      i += 1
    } else if (token === '--cache-dir' && next) {
      args.cacheDir = next
      i += 1
    } else if (token === '--store' && next) {
      if (next !== 'legacy' && next !== 'dual' && next !== 'item') {
        throw new Error(`Invalid --store value: ${next}`)
      }
      args.store = next
      i += 1
    } else if (token === '--privacy' && next) {
      if (next !== 'relaxed' && next !== 'balanced' && next !== 'strict' && next !== 'off') {
        throw new Error(`Invalid --privacy value: ${next}`)
      }
      args.privacy = next
      i += 1
    } else if (token === '--days' && next) {
      args.maxDays = Number.parseInt(next, 10)
      i += 1
    } else if (token === '--drop-legacy-at-day' && next) {
      args.dropLegacyAtDay = Number.parseInt(next, 10)
      i += 1
    } else if (token === '--scale' && next) {
      args.scale = Number.parseInt(next, 10)
      i += 1
    } else if (token === '--budget' && next) {
      args.budgets = parseBudgetArg(next)
      i += 1
    } else if (token?.startsWith('--budget=')) {
      args.budgets = parseBudgetArg(token.slice('--budget='.length))
    } else if (token === '--json' && next) {
      args.jsonOut = next
      i += 1
    }
  }
  return args
}

export function formatReportTable(report: MemsimReport): string {
  const lines: string[] = [
    `memsim | mode=${report.mode} store=${report.store} privacy=${report.privacy} seeded=${report.seeded} days=${report.daysSimulated}`,
    `calls  | river=${report.providerCalls.river.live}/${report.providerCalls.river.total} (budget ${report.providerCalls.river.budget}) emb=${report.providerCalls.embeddings.live}/${report.providerCalls.embeddings.total} (budget ${report.providerCalls.embeddings.budget}) jev=${report.providerCalls.typesafe.live}/${report.providerCalls.typesafe.total} (budget ${report.providerCalls.typesafe.budget})`,
    `gates  | integrity=${report.integrity.status} (drift ${report.integrity.finalDrift.fact}/${report.integrity.finalDrift.episode}/${report.integrity.finalDrift.media}) triggers=${report.triggerCoverage.status} (pipe=${report.triggerCoverage.firedPipeline.length} script=${report.triggerCoverage.firedScripted.length} all=${report.triggerCoverage.firedAll.length}/${report.triggerCoverage.expectedWriters.length}) parity=${report.phase4Parity.status} (${report.phase4Parity.mismatches}/${report.phase4Parity.turnsChecked}) privacy=${report.privacyGate.status} (privItems=${report.privacyGate.privateOnlyItemsCount} pubLeaks=${report.privacyGate.privateTokensLeaked} dmTurns=${report.privacyGate.dmTurnsChecked} dmLeaks=${report.privacyGate.dmMemoryBlockLeaks}) crash=${report.crashSafety.status} (${report.crashSafety.restartsTotal} restarts)`,
    `counts | msgs=${report.counts.messagesProcessed} eps=${report.counts.episodesStored} activeUser=${report.counts.activeUserClaims} past=${report.counts.pastUserClaims} retracted=${report.counts.retractedUserClaims} activeGuild=${report.counts.activeGuildClaims} media=${report.counts.mediaDigestsStored} overallRecall=${report.quality.overallRecall} overallPrec=${report.quality.overallPrecision}`,
    'label          | planted | matched |  fp | recall |  prec | turnRec | turnPrec'
  ]
  for (const row of report.quality.byLabel) {
    lines.push(
      `${row.label.padEnd(14)} | ${String(row.planted).padStart(7)} | ${String(row.matched).padStart(7)} | ${String(row.falsePositives).padStart(3)} | ${row.recall.toFixed(2).padStart(6)} | ${row.precision.toFixed(2).padStart(5)} | ${row.turnRecall.toFixed(2).padStart(7)} | ${row.turnPrecision.toFixed(2).padStart(8)}`
    )
  }
  if (report.crashSafety.perRestart.length > 0) {
    for (const r of report.crashSafety.perRestart) {
      lines.push(
        `restart | ${r.id} (${r.mode}): open=${r.openLinesBefore} restored=${r.restoredLines} flushed=${r.flushedLines} rem=${r.remainingLinesAfterFlush} stuckReset=${r.stuckReset} stuckDone=${r.stuckJobsCompleted} passed=${r.passed}`
      )
    }
  }
  if (report.performance.scale10k) {
    lines.push(`scale10k items=${report.performance.scale10k.actualItems}`)
    for (const key of ['userFacts', 'guildFacts', 'episodes', 'media', 'recallUser'] as const) {
      const l = report.performance.scale10k.legacy[key]
      const it = report.performance.scale10k.item[key]
      lines.push(
        `  ${key.padEnd(10)} | legacy p50=${l.p50Ms}ms p95=${l.p95Ms}ms | item p50=${it.p50Ms}ms p95=${it.p95Ms}ms`
      )
    }
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))
  const report = await runMemsim({
    mode: args.mode,
    store: args.store,
    privacy: args.privacy,
    seedDbPath: args.seedDbPath,
    cacheDir: args.cacheDir,
    maxDays: args.maxDays,
    dropLegacyAtDay: args.dropLegacyAtDay,
    scale: args.scale,
    budgets: args.budgets,
    pruneUnused: args.pruneUnused
  })

  if (args.jsonOut) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(resolve(args.jsonOut), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  console.log(formatReportTable(report))
  console.log(JSON.stringify(report))
  if (!report.gatesPassed) {
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
