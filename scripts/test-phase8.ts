/**
 * Phase 8 Feature Integration Test — validates all new Phase 7 continued + Phase 8 features.
 * Tests: sharp image processing, buddy pet system, session pruning, reminder store
 * enhancements, stale reminder dropping, and getReminderById.
 *
 * Usage:
 *   npx tsx scripts/test-phase8.ts
 *
 * Or via npm script:
 *   npm run test:phase8
 */

// Stub Discord env vars before any imports
process.env.DISCORD_TOKEN ||= 'test-stub'
process.env.DISCORD_CLIENT_ID ||= 'test-stub'

import sharp from 'sharp'
import { generateBuddy, getBuddy, getTopBuddies, saveBuddy } from '../src/games/buddy.js'
import { EYE_STYLES, HAT_STYLES, RARITY_WEIGHTS, SPECIES, STAT_NAMES } from '../src/games/data/buddySpecies.js'
import { closeDb, getDb } from '../src/storage/database.js'
import {
  countActiveReminders,
  createReminder,
  deleteReminder,
  getActiveReminders,
  getDueReminders,
  getReminderById,
  markDelivered
} from '../src/storage/reminderStore.js'
import { clearHistory, loadHistory, pruneOldHistory, saveMessage } from '../src/storage/sessionStore.js'
import { processImageForGemini } from '../src/utils/imageProcessor.js'

// --- Test Harness ---

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL'
  detail: string
}

const results: TestResult[] = []

function pass(name: string, detail: string): void {
  results.push({ name, status: 'PASS', detail })
  console.log(`  \x1b[32mPASS\x1b[0m  ${name} — ${detail}`)
}

function fail(name: string, detail: string): void {
  results.push({ name, status: 'FAIL', detail })
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name} — ${detail}`)
}

function assert(condition: boolean, name: string, passDetail: string, failDetail: string): void {
  if (condition) pass(name, passDetail)
  else fail(name, failDetail)
}

// --- Tests ---

async function main() {
  console.log('\n  Phase 8 Feature Integration Test\n')

  const db = getDb()

  // ─── Sharp Image Processing ───
  console.log('\n  --- Sharp Image Processing ---')

  // Create a large test image (2000x1500 PNG)
  const largeImage = await sharp({
    create: { width: 2000, height: 1500, channels: 3, background: { r: 128, g: 64, b: 200 } }
  })
    .png()
    .toBuffer()

  const largeResult = await processImageForGemini(largeImage)
  assert(largeResult.mimeType === 'image/jpeg', 'Sharp: output format', 'Outputs JPEG', `Got: ${largeResult.mimeType}`)
  assert(
    largeResult.data.length < largeImage.length,
    'Sharp: compression',
    `${largeImage.length} → ${largeResult.data.length} bytes (${Math.round((1 - largeResult.data.length / largeImage.length) * 100)}% smaller)`,
    'Not smaller'
  )

  // Verify dimensions were capped
  const largeMeta = await sharp(largeResult.data).metadata()
  assert(
    (largeMeta.width ?? 0) <= 1024 && (largeMeta.height ?? 0) <= 1024,
    'Sharp: resize large',
    `${largeMeta.width}x${largeMeta.height} (capped from 2000x1500)`,
    `Got: ${largeMeta.width}x${largeMeta.height}`
  )

  // Create a small test image (100x80 PNG)
  const smallImage = await sharp({
    create: { width: 100, height: 80, channels: 3, background: { r: 50, g: 150, b: 50 } }
  })
    .png()
    .toBuffer()

  const smallResult = await processImageForGemini(smallImage)
  const smallMeta = await sharp(smallResult.data).metadata()
  assert(
    (smallMeta.width ?? 0) >= 512 || (smallMeta.height ?? 0) >= 512,
    'Sharp: upscale small',
    `${smallMeta.width}x${smallMeta.height} (upscaled from 100x80)`,
    `Got: ${smallMeta.width}x${smallMeta.height}`
  )

  // Normal-sized image should pass through without major resize
  const normalImage = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 100, g: 100, b: 100 } }
  })
    .png()
    .toBuffer()

  const normalResult = await processImageForGemini(normalImage)
  const normalMeta = await sharp(normalResult.data).metadata()
  assert(
    (normalMeta.width ?? 0) >= 512 && (normalMeta.width ?? 0) <= 1024,
    'Sharp: normal pass-through',
    `${normalMeta.width}x${normalMeta.height}`,
    `Got: ${normalMeta.width}x${normalMeta.height}`
  )

  // ─── Buddy Pet System ───
  console.log('\n  --- Buddy Pet System ---')

  assert(SPECIES.length === 18, 'Buddy: 18 species', `${SPECIES.length} species`, `Got ${SPECIES.length}`)
  assert(STAT_NAMES.length === 5, 'Buddy: 5 stats', `${STAT_NAMES.length} stats`, `Got ${STAT_NAMES.length}`)
  assert(EYE_STYLES.length === 6, 'Buddy: 6 eye styles', `${EYE_STYLES.length} eyes`, `Got ${EYE_STYLES.length}`)
  assert(HAT_STYLES.length === 8, 'Buddy: 8 hat styles', `${HAT_STYLES.length} hats`, `Got ${HAT_STYLES.length}`)

  // Rarity distribution check
  const rarities = new Set(SPECIES.map((s) => s.rarity))
  assert(rarities.size === 5, 'Buddy: 5 rarity tiers', [...rarities].join(', '), `Only ${rarities.size}`)

  // Deterministic generation
  const b1 = generateBuddy('test-user-alpha')
  const b2 = generateBuddy('test-user-alpha')
  assert(
    b1.species === b2.species && b1.name === b2.name && b1.eyes === b2.eyes && b1.hat === b2.hat,
    'Buddy: deterministic',
    `${b1.name} the ${b1.species} (same both times)`,
    'Not deterministic'
  )

  // Different users get different buddies
  const b3 = generateBuddy('test-user-beta')
  assert(
    b1.species !== b3.species || b1.name !== b3.name,
    'Buddy: unique per user',
    `${b1.name} vs ${b3.name}`,
    'Same buddy for different users'
  )

  // Stats within bounds
  const stats = b1.stats as Record<string, number>
  const allStatsValid = Object.values(stats).every((v) => v >= 1 && v <= 10)
  assert(
    allStatsValid,
    'Buddy: stats bounds',
    `All stats 1-10: ${JSON.stringify(stats)}`,
    `Out of bounds: ${JSON.stringify(stats)}`
  )

  // Stats have all 5 keys
  const statKeys = Object.keys(stats)
  assert(statKeys.length === 5, 'Buddy: stat keys', statKeys.join(', '), `Expected 5, got ${statKeys.length}`)

  // SQLite round-trip
  saveBuddy(b1)
  const loaded = getBuddy('test-user-alpha')
  assert(
    loaded !== null && loaded.species === b1.species && loaded.name === b1.name,
    'Buddy: SQLite save/load',
    `${loaded?.name} round-tripped OK`,
    'Round-trip failed'
  )

  // Leaderboard
  saveBuddy(b3)
  const top = getTopBuddies(10)
  assert(top.length >= 2, 'Buddy: leaderboard', `${top.length} entries`, `Got ${top.length}`)

  // Shiny field exists
  assert(typeof b1.shiny === 'boolean', 'Buddy: shiny field', `shiny=${b1.shiny}`, 'Missing shiny field')

  // Name and personality generated
  assert(!!b1.name && b1.name.length > 0, 'Buddy: has name', `Name: ${b1.name}`, 'No name')
  assert(
    !!b1.personality && b1.personality.length > 0,
    'Buddy: has personality',
    `Personality: ${b1.personality.slice(0, 50)}...`,
    'No personality'
  )

  // ─── Session Pruning ───
  console.log('\n  --- Session Pruning ---')

  // Insert old messages (8 days ago)
  const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
  db.prepare(
    'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
  ).run('prune-ch', 'user', 'OldUser', 'Old message', eightDaysAgo)

  // Insert recent message
  saveMessage('prune-ch', 'user', 'NewUser', 'Recent message')

  const beforePrune = loadHistory('prune-ch', 100)
  assert(beforePrune.length === 2, 'Prune: before', `${beforePrune.length} messages`, `Expected 2`)

  const pruned = pruneOldHistory(7)
  assert(pruned === 1, 'Prune: deleted old', `Pruned ${pruned} old message(s)`, `Expected 1, got ${pruned}`)

  const afterPrune = loadHistory('prune-ch', 100)
  assert(afterPrune.length === 1, 'Prune: kept recent', `${afterPrune.length} remaining`, `Expected 1`)
  assert(
    afterPrune[0].content === 'Recent message',
    'Prune: correct survivor',
    'Recent message kept',
    `Got: ${afterPrune[0].content}`
  )

  // ─── Reminder Enhancements ───
  console.log('\n  --- Reminder Enhancements ---')

  // getReminderById
  const r1 = createReminder('rem-user', 'rem-ch', 'Test reminder', Date.now() + 300_000)
  assert(r1.success, 'Reminder: create for ID test', `ID: ${r1.id}`, r1.message)

  const found = getReminderById(r1.id)
  assert(
    found !== null && found.reminder === 'Test reminder',
    'Reminder: getReminderById',
    `Found: "${found?.reminder}"`,
    'Not found'
  )

  // getReminderById returns null for delivered
  markDelivered(r1.id)
  const notFound = getReminderById(r1.id)
  assert(notFound === null, 'Reminder: delivered not found', 'Returns null after delivery', 'Still found')

  // getReminderById returns null for non-existent
  const bogus = getReminderById(99999)
  assert(bogus === null, 'Reminder: bogus ID', 'Returns null for non-existent', 'Should be null')

  // deleteReminder
  const r2 = createReminder('rem-user', 'rem-ch', 'To be cancelled', Date.now() + 300_000)
  deleteReminder(r2.id)
  const afterDelete = getReminderById(r2.id)
  assert(afterDelete === null, 'Reminder: delete', 'Deleted successfully', 'Still exists')

  // Stale reminder dropping (>5 min past due get auto-dropped)
  const staleDue = Date.now() - 6 * 60 * 1000 // 6 minutes ago
  createReminder('stale-user', 'stale-ch', 'Stale reminder', staleDue)
  const dueReminders = getDueReminders()
  const staleFound = dueReminders.some((r) => r.reminder === 'Stale reminder')
  assert(!staleFound, 'Reminder: stale dropped', 'Stale (>5min) auto-dropped by getDueReminders', 'Stale not dropped')

  // ─── Species Rarity Weights ───
  console.log('\n  --- Species Rarity Weights ---')

  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  assert(totalWeight === 100, 'Rarity: weights sum to 100', `Sum: ${totalWeight}`, `Expected 100, got ${totalWeight}`)
  assert(
    RARITY_WEIGHTS.common === 60,
    'Rarity: common 60%',
    `${RARITY_WEIGHTS.common}%`,
    `Got ${RARITY_WEIGHTS.common}`
  )
  assert(
    RARITY_WEIGHTS.legendary === 1,
    'Rarity: legendary 1%',
    `${RARITY_WEIGHTS.legendary}%`,
    `Got ${RARITY_WEIGHTS.legendary}`
  )

  // --- Summary ---
  console.log('\n  ' + '─'.repeat(56))
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  const total = results.length
  console.log(`  Results: ${passed} PASS, ${failed} FAIL / ${total} total`)
  console.log(`  Pass rate: ${Math.round((passed / total) * 100)}%`)
  console.log()

  // Cleanup
  clearHistory('prune-ch')
  closeDb()

  process.exit(failed > 0 ? 1 : 0)
}

main()
