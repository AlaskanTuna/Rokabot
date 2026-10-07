import '../tests/harness/env.js'
import type { PrefetchMeasurementCase } from '../tests/harness/prefetchMeasurement.js'

function quietAdk(write: typeof console.log): typeof console.log {
  return (...args) => {
    if (args.some((argument) => String(argument).includes('[ADK INFO]'))) return
    write(...args)
  }
}

console.info = quietAdk(console.info.bind(console))
console.log = quietAdk(console.log.bind(console))

interface Options {
  live: boolean
  prefetch: 'off' | 'on'
  trials: number
  out: string
}

function parseOptions(args: string[]): Options {
  let live = false
  let prefetch: 'off' | 'on' | undefined
  let trials = 3
  let out: string | undefined

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--live') {
      live = true
    } else if (argument === '--prefetch') {
      const value = args[++index]
      if (value !== 'off' && value !== 'on') throw new Error('--prefetch must be off or on')
      prefetch = value
    } else if (argument === '--trials') {
      const value = Number(args[++index])
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('--trials must be a positive integer')
      trials = value
    } else if (argument === '--out') {
      const value = args[++index]
      if (!value) throw new Error('--out requires a path')
      out = value
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (!live) throw new Error('Live measurement requires --live')
  if (!prefetch) throw new Error('Choose an arm with --prefetch off|on')
  if (!out) throw new Error('--out is required')
  return { live, prefetch, trials, out }
}

interface MeasurementAnomaly {
  type: string
  caseId: string
  trial: number
  kind?: string
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  process.env.JEV_PREFETCH = options.prefetch
  process.env.LOG_LEVEL = 'error'

  const [
    { mkdir, writeFile },
    { dirname, resolve },
    { config },
    { generateResponse },
    { destroySession },
    { startTurnEntryWork },
    { loadCaseSet },
    { TRIAL_PACING_MS, seedWorld },
    { summarizePrefetchMeasurement }
  ] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
    import('../src/config.js'),
    import('../src/agent/roka.js'),
    import('../src/agent/session.js'),
    import('../src/agent/turnContext.js'),
    import('../tests/harness/toolTriggerScoring.js'),
    import('../tests/harness/toolTrigger.js'),
    import('../tests/harness/prefetchMeasurement.js')
  ])

  if (!config.jev.apiKey || !process.env.TAVILY_API_KEY) {
    throw new Error('Live prefetch measurement requires TYPESAFE_API_KEY and TAVILY_API_KEY in .env')
  }

  const { header, cases } = await loadCaseSet('tests/harness/tool-trigger/search-web.jsonl')
  const membersById = new Map(header.members.map((member) => [member.id, member]))
  const measuredCases: PrefetchMeasurementCase[] = cases.map((testCase) => ({
    id: testCase.id,
    shouldFire: testCase.shouldFire,
    trials: []
  }))
  const anomalies: MeasurementAnomaly[] = []
  const totalTurns = cases.length * options.trials
  let completedTurns = 0
  let prefetchFireCount = 0
  let stoppedForTransientHttp = false

  for (const [caseIndex, testCase] of cases.entries()) {
    const speaker = membersById.get(testCase.speakerId)
    if (!speaker) throw new Error(`Case "${testCase.id}" references an unknown speaker`)

    for (let trial = 0; trial < options.trials; trial++) {
      if (completedTurns > 0) await new Promise((resolveSleep) => setTimeout(resolveSleep, TRIAL_PACING_MS))

      const channelId = `prefetch-${options.prefetch}-${testCase.id}-${trial}`
      let turnEntryWork: ReturnType<typeof startTurnEntryWork> | undefined
      try {
        await seedWorld(header, channelId)
        turnEntryWork = startTurnEntryWork({
          channelId,
          guildId: header.guildId,
          userId: speaker.id,
          speakerName: speaker.displayName,
          message: testCase.message,
          lookupQuery: testCase.message,
          mentionedUserIds: [],
          includeEpisodeRecall: Boolean(header.guildId)
        })

        const result = await generateResponse({
          channelId,
          guildId: header.guildId,
          userMessage: testCase.message,
          displayName: speaker.displayName,
          username: speaker.username,
          userId: speaker.id,
          memory: true,
          turnEntryWork
        })
        const prefetchResult = await turnEntryWork.prefetch
        const prefetchFired = prefetchResult.decision.fire
        if (prefetchFired) prefetchFireCount++

        const measurement = {
          searched: result.prefetchUsed || result.toolsUsed.includes('search_web'),
          prefetchUsed: result.prefetchUsed,
          geminiCalledSearch: result.geminiCalledSearch,
          llmCalls: result.modelCalls,
          generateMs: result.metrics.generateMs,
          outcome: result.metrics.outcome
        }
        measuredCases[caseIndex]!.trials.push(measurement)
        completedTurns++

        if (prefetchFired && result.geminiCalledSearch) {
          anomalies.push({ type: 'prefetch_fired_but_gemini_searched_again', caseId: testCase.id, trial: trial + 1 })
        }
        if (prefetchFired && !result.prefetchUsed) {
          anomalies.push({
            type: 'prefetch_fired_but_not_used',
            caseId: testCase.id,
            trial: trial + 1,
            kind: prefetchResult.outcome?.status ?? 'no_result'
          })
        }
        if (result.metrics.outcome !== 'ok') {
          anomalies.push({
            type: 'model_turn_error',
            caseId: testCase.id,
            trial: trial + 1,
            kind: result.metrics.kind ?? result.metrics.outcome
          })
        }
        if (result.metrics.kind === 'transient_http') {
          anomalies.push({ type: 'transient_http_stopped_run', caseId: testCase.id, trial: trial + 1 })
          stoppedForTransientHttp = true
        }

        console.log(
          `[measure:prefetch] ${options.prefetch} ${completedTurns}/${totalTurns} ${testCase.id} trial=${trial + 1} ` +
            `searched=${measurement.searched} prefetchUsed=${measurement.prefetchUsed} ` +
            `geminiCalledSearch=${measurement.geminiCalledSearch} llmCalls=${measurement.llmCalls} ` +
            `generateMs=${measurement.generateMs} outcome=${measurement.outcome}`
        )
      } catch (error) {
        const kind = error instanceof Error ? error.name : typeof error
        anomalies.push({ type: 'turn_threw', caseId: testCase.id, trial: trial + 1, kind })
        console.error(`[measure:prefetch] ${testCase.id} trial=${trial + 1} threw (${kind}); stopping this arm`)
        stoppedForTransientHttp = true
      } finally {
        turnEntryWork?.cancel()
        await destroySession(channelId)
      }

      if (stoppedForTransientHttp) break
    }
    if (stoppedForTransientHttp) break
  }

  const report = {
    prefetch: options.prefetch,
    trialsPerCase: options.trials,
    pacingMs: TRIAL_PACING_MS,
    complete: !stoppedForTransientHttp && completedTurns === totalTurns,
    cases: measuredCases,
    aggregates: summarizePrefetchMeasurement(measuredCases, prefetchFireCount),
    anomalies
  }
  const outPath = resolve(options.out)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`)

  const { aggregates } = report
  const percent = (rate: number | null) => (rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`)
  console.log(`\nPrefetch ${report.prefetch} summary`)
  console.log(
    `Search recall ${percent(aggregates.searchRecall.rate)} ` +
      `(${aggregates.searchRecall.searched}/${aggregates.searchRecall.eligible})`
  )
  console.log(
    `False-search rate ${percent(aggregates.falseSearchRate.rate)} ` +
      `(${aggregates.falseSearchRate.searched}/${aggregates.falseSearchRate.eligible})`
  )
  console.log(
    `Should-search generateMs p50/p95 ` + `${aggregates.generateMs.p50 ?? 'n/a'}/${aggregates.generateMs.p95 ?? 'n/a'}`
  )
  console.log(`Mean should-search llmCalls ${aggregates.meanLlmCalls?.toFixed(2) ?? 'n/a'}`)
  console.log(`Prefetch fires ${aggregates.prefetchFireCount}; anomalies ${anomalies.length}`)
  console.log(`JSON ${outPath}`)
  if (!report.complete) process.exitCode = 1
}

await main()
