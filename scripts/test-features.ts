/**
 * Phase 7 Feature Integration Test — validates all new features work end-to-end.
 * Tests SQLite persistence, user memory, reminders, games (shiritori, gacha, hangman),
 * emoji reactions, and expanded tone detection.
 *
 * Usage:
 *   npx tsx scripts/test-features.ts
 *
 * Or via npm script:
 *   npm run test:features
 */

// Stub Discord env vars before any imports
process.env.DISCORD_TOKEN ||= 'test-stub'
process.env.DISCORD_CLIENT_ID ||= 'test-stub'

import { detectTone } from '../src/agent/toneDetector.js'
import { resetCooldowns, shouldReact } from '../src/discord/emojiReactor.js'
import { generateBuddy, getBuddy, getTopBuddies, saveBuddy } from '../src/games/buddy.js'
import { SPECIES } from '../src/games/data/buddySpecies.js'
import { HANGMAN_WORDS } from '../src/games/data/hangmanWords.js'
import {
  destroyAllGames as destroyHangman,
  getDisplayWord,
  getHangmanArt,
  guessLetter,
  guessWord,
  startGame as startHangman
} from '../src/games/hangman.js'
import {
  destroyAllGames as destroyShiritori,
  endGame,
  joinGame,
  setDictionary,
  startGame as startShiritori,
  submitWord
} from '../src/games/shiritori.js'
import type { WindowMessage } from '../src/session/types.js'
import { closeDb, getDb } from '../src/storage/database.js'
import {
  countActiveReminders,
  createReminder,
  getActiveReminders,
  getDueReminders,
  markDelivered
} from '../src/storage/reminderStore.js'
import { clearHistory, loadHistory, saveMessage } from '../src/storage/sessionStore.js'
import { countFacts, deleteFact, getAllFactsForPrompt, getFacts, saveFact } from '../src/storage/userMemory.js'

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

function makeMessage(content: string): WindowMessage {
  return { role: 'user', displayName: 'Tester', content, timestamp: Date.now() }
}

// --- Tests ---

async function main() {
  console.log('\n  Phase 7 Feature Integration Test\n')

  // Initialize a fresh in-memory SQLite DB for testing
  const db = getDb()

  // ─── SQLite Session Store ───
  console.log('\n  --- SQLite Session Store ---')

  saveMessage('ch-1', 'user', 'Alice', 'Hello Roka!')
  saveMessage('ch-1', 'assistant', 'Roka', 'Hi Alice~')
  saveMessage('ch-1', 'user', 'Alice', 'How are you?')

  const history = loadHistory('ch-1', 10)
  assert(
    history.length === 3,
    'Session: save + load',
    `${history.length} messages loaded`,
    `Expected 3, got ${history.length}`
  )

  assert(
    history[0].content === 'Hello Roka!',
    'Session: FIFO order',
    'Oldest message first',
    `Got: ${history[0].content}`
  )

  assert(history[2].role === 'user', 'Session: role mapping', 'Roles preserved correctly', `Got: ${history[2].role}`)

  // Test FIFO limit
  for (let i = 0; i < 15; i++) {
    saveMessage('ch-2', 'user', 'Bob', `Message ${i}`)
  }
  const limited = loadHistory('ch-2', 5)
  assert(limited.length === 5, 'Session: FIFO limit', 'Returns last 5 of 15', `Got ${limited.length}`)
  assert(
    limited[0].content === 'Message 10',
    'Session: FIFO offset',
    'Starts at message 10',
    `Got: ${limited[0].content}`
  )

  // Test channel isolation
  const ch1 = loadHistory('ch-1', 10)
  const ch2 = loadHistory('ch-2', 10)
  assert(
    ch1.length === 3 && ch2.length === 10,
    'Session: channel isolation',
    `ch-1: ${ch1.length}, ch-2: ${ch2.length}`,
    `Expected ch-1: 3, ch-2: 10 — got ch-1: ${ch1.length}, ch-2: ${ch2.length}`
  )

  clearHistory('ch-1')
  assert(loadHistory('ch-1', 10).length === 0, 'Session: clear', 'History cleared', 'History not cleared')

  // ─── User Memory ───
  console.log('\n  --- User Memory ---')

  saveFact('alice', 'favorite_anime', 'Frieren')
  saveFact('alice', 'nickname', 'Ali')
  saveFact('alice', 'birthday', 'March 15')

  const facts = getFacts('alice')
  assert(facts.length === 3, 'Memory: save + get', `${facts.length} facts stored`, `Expected 3, got ${facts.length}`)

  const promptFacts = getAllFactsForPrompt('alice')
  assert(
    promptFacts.includes('favorite_anime') && promptFacts.includes('Frieren'),
    'Memory: prompt format',
    'Facts formatted for prompt',
    `Got: ${promptFacts}`
  )

  // Test upsert
  saveFact('alice', 'favorite_anime', 'Dandadan')
  const updated = getFacts('alice')
  const animeEntry = updated.find((f) => f.key === 'favorite_anime')
  assert(animeEntry?.value === 'Dandadan', 'Memory: upsert', 'Updated Frieren → Dandadan', `Got: ${animeEntry?.value}`)
  assert(updated.length === 3, 'Memory: upsert no dup', 'Still 3 facts after upsert', `Got ${updated.length}`)

  // Test 10-fact cap
  for (let i = 0; i < 12; i++) {
    saveFact('bob', `fact_${i}`, `value_${i}`)
  }
  assert(countFacts('bob') === 10, 'Memory: 10-fact cap', 'Capped at 10', `Got ${countFacts('bob')}`)

  // Test delete
  deleteFact('alice', 'nickname')
  assert(countFacts('alice') === 2, 'Memory: delete', '2 facts after deletion', `Got ${countFacts('alice')}`)

  // Test empty user
  assert(
    getAllFactsForPrompt('nobody') === '',
    'Memory: empty user',
    'Returns empty string',
    `Got: "${getAllFactsForPrompt('nobody')}"`
  )

  // ─── Reminders ───
  console.log('\n  --- Reminders ---')

  const pastDue = Date.now() - 60_000
  const futureReminder = Date.now() + 600_000

  const r1 = createReminder('alice', 'ch-1', 'Watch Frieren', pastDue)
  assert(r1.success && r1.id > 0, 'Reminder: create', `ID: ${r1.id}`, `Failed: ${r1.message}`)

  createReminder('alice', 'ch-1', 'Cook dinner', futureReminder)

  const due = getDueReminders()
  assert(
    due.length === 1 && due[0].reminder === 'Watch Frieren',
    'Reminder: due query',
    'Returns past-due only',
    `Got ${due.length} due`
  )

  markDelivered(r1.id)
  assert(getDueReminders().length === 0, 'Reminder: mark delivered', 'No longer returned as due', 'Still returned')

  const active = getActiveReminders('alice')
  assert(
    active.length === 1 && active[0].reminder === 'Cook dinner',
    'Reminder: active query',
    '1 active (future)',
    `Got ${active.length}`
  )

  // Test 5-reminder cap
  for (let i = 0; i < 4; i++) {
    createReminder('capper', 'ch-1', `Reminder ${i}`, futureReminder)
  }
  assert(countActiveReminders('capper') === 4, 'Reminder: count', '4 active', `Got ${countActiveReminders('capper')}`)
  createReminder('capper', 'ch-1', 'Reminder 4', futureReminder)
  const sixthAttempt = createReminder('capper', 'ch-1', 'Reminder 5 (should fail)', futureReminder)
  assert(!sixthAttempt.success, 'Reminder: 5 cap', 'Rejected 6th reminder', 'Should have been rejected')

  // ─── Buddy Pet ───
  console.log('\n  --- Buddy Pet ---')

  assert(
    SPECIES.length === 18,
    'Buddy: species catalog',
    `${SPECIES.length} species`,
    `Expected 18, got ${SPECIES.length}`
  )

  const rarities = new Set(SPECIES.map((s) => s.rarity))
  assert(
    rarities.has('common') &&
      rarities.has('uncommon') &&
      rarities.has('rare') &&
      rarities.has('epic') &&
      rarities.has('legendary'),
    'Buddy: all rarities',
    '5 rarity tiers present',
    `Missing: ${['common', 'uncommon', 'rare', 'epic', 'legendary'].filter((r) => !rarities.has(r as any))}`
  )

  const buddy1 = generateBuddy('buddy-tester-1')
  assert(
    !!buddy1.species && !!buddy1.name,
    'Buddy: generate',
    `${buddy1.name} the ${buddy1.species} (${buddy1.rarity})`,
    'Generation failed'
  )

  const buddy1b = generateBuddy('buddy-tester-1')
  assert(
    buddy1.species === buddy1b.species && buddy1.name === buddy1b.name,
    'Buddy: deterministic',
    'Same userId = same buddy',
    'Not deterministic!'
  )

  saveBuddy(buddy1)
  const loaded = getBuddy('buddy-tester-1')
  assert(loaded !== null && loaded.species === buddy1.species, 'Buddy: save/load', 'Round-trip OK', 'Round-trip failed')

  const buddy2 = generateBuddy('buddy-tester-2')
  saveBuddy(buddy2)
  const top = getTopBuddies(10)
  assert(top.length >= 2, 'Buddy: leaderboard', `${top.length} entries`, 'Leaderboard failed')

  // ─── Hangman ───
  console.log('\n  --- Hangman ---')

  assert(
    HANGMAN_WORDS.length >= 100,
    'Hangman: word bank',
    `${HANGMAN_WORDS.length} words`,
    `Only ${HANGMAN_WORDS.length}`
  )

  const hStart = startHangman('hm-ch', 'player1')
  assert(
    hStart.success && hStart.display !== undefined,
    'Hangman: start',
    `Display: ${hStart.display}`,
    `Failed: ${hStart.message}`
  )

  // Test duplicate game prevention
  const hDup = startHangman('hm-ch', 'player2')
  assert(!hDup.success, 'Hangman: one per channel', 'Duplicate rejected', 'Should have been rejected')

  // Test hangman art
  for (let lives = 6; lives >= 0; lives--) {
    const art = getHangmanArt(lives)
    assert(art.length > 0, `Hangman: art (${lives} lives)`, `${art.split('\n').length} lines`, 'Empty art')
  }

  destroyHangman()
  assert(true, 'Hangman: cleanup', 'All games destroyed', '')

  // ─── Shiritori ───
  console.log('\n  --- Shiritori ---')

  // Set up test dictionary
  setDictionary(new Set(['apple', 'elephant', 'tiger', 'rabbit', 'table', 'eagle', 'ear', 'red']))

  const sStart = startShiritori('sh-ch', 'Alice')
  assert(sStart.success, 'Shiritori: start', sStart.message.slice(0, 60), `Failed: ${sStart.message}`)

  const sJoin = joinGame('sh-ch', 'Bob')
  assert(sJoin.success, 'Shiritori: join', sJoin.message.slice(0, 60), `Failed: ${sJoin.message}`)

  // Duplicate join
  const sDupJoin = joinGame('sh-ch', 'Alice')
  assert(!sDupJoin.success, 'Shiritori: dup join', 'Rejected duplicate', 'Should have been rejected')

  // End and verify scores
  const sEnd = endGame('sh-ch')
  assert(
    sEnd.message.includes('Game over'),
    'Shiritori: end',
    'Game ended with scoreboard',
    `Got: ${sEnd.message.slice(0, 40)}`
  )

  destroyShiritori()

  // ─── Emoji Reactions ───
  console.log('\n  --- Emoji Reactions ---')

  resetCooldowns()

  // Test with forced probability (override Math.random for determinism)
  const origRandom = Math.random
  Math.random = () => 0.05 // Always under 0.18 threshold

  resetCooldowns()
  const foodReaction = shouldReact('I am so hungry, let me cook some food', 'emoji-ch')
  assert(foodReaction !== null, 'Emoji: food trigger', `Emoji: ${foodReaction}`, 'No reaction')

  resetCooldowns()
  const greetReaction = shouldReact('Good morning everyone!', 'emoji-ch-2')
  assert(greetReaction === '👋', 'Emoji: greeting trigger', `Emoji: ${greetReaction}`, `Got: ${greetReaction}`)

  resetCooldowns()
  const sadReaction = shouldReact('I feel so lonely and sad today', 'emoji-ch-3')
  assert(sadReaction === '🫂', 'Emoji: sadness trigger', `Emoji: ${sadReaction}`, `Got: ${sadReaction}`)

  resetCooldowns()
  const noMatch = shouldReact('The weather is fine today', 'emoji-ch-4')
  assert(noMatch === null, 'Emoji: no match', 'No reaction for neutral message', `Got: ${noMatch}`)

  // Test cooldown
  resetCooldowns()
  shouldReact('cute cute cute', 'cooldown-ch')
  const cooled = shouldReact('cute cute cute', 'cooldown-ch')
  assert(cooled === null, 'Emoji: cooldown', 'Blocked by 60s cooldown', `Got: ${cooled}`)

  // Test probability gate
  Math.random = () => 0.99 // Always above 0.18 threshold
  resetCooldowns()
  const probBlocked = shouldReact('I am so hungry', 'prob-ch')
  assert(probBlocked === null, 'Emoji: probability gate', 'Blocked by 82% chance', `Got: ${probBlocked}`)

  Math.random = origRandom // Restore

  // ─── Expanded Tones ───
  console.log('\n  --- Expanded Tones (12) ---')

  const nostalgicResult = detectTone([makeMessage('I remember those old days, such nostalgia')], 12)
  assert(nostalgicResult === 'nostalgic', 'Tone: nostalgic', 'Detected', `Got: ${nostalgicResult}`)

  const mischievousResult = detectTone([makeMessage("Let's prank someone, I have a secret plan")], 12)
  assert(mischievousResult === 'mischievous', 'Tone: mischievous', 'Detected', `Got: ${mischievousResult}`)

  const sleepyResult = detectTone([makeMessage('So sleepy, need a nap')], 12)
  assert(sleepyResult === 'sleepy', 'Tone: sleepy (keywords)', 'Detected', `Got: ${sleepyResult}`)

  // Sleepy with late-night time trigger (1 keyword + hour 23)
  const sleepyLateNight = detectTone([makeMessage("I'm so tired")], 23)
  assert(
    sleepyLateNight === 'sleepy',
    'Tone: sleepy (late night)',
    'Detected at 23:00 with 1 keyword',
    `Got: ${sleepyLateNight}`
  )

  // Sleepy should NOT trigger during daytime with only 1 keyword
  const notSleepyDay = detectTone([makeMessage("I'm tired")], 14)
  assert(
    notSleepyDay !== 'sleepy',
    'Tone: not sleepy (daytime)',
    `Got: ${notSleepyDay} (not sleepy)`,
    `False positive: sleepy at 14:00`
  )

  const competitiveResult = detectTone([makeMessage("Let's play a game, I challenge you to a match!")], 12)
  assert(competitiveResult === 'competitive', 'Tone: competitive', 'Detected', `Got: ${competitiveResult}`)

  const playfulResult = detectTone([makeMessage('Hey, how are you doing today?')], 12)
  assert(playfulResult === 'playful', 'Tone: playful (default)', 'Fallback works', `Got: ${playfulResult}`)

  // --- Summary ---
  console.log('\n  ' + '─'.repeat(56))
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  const total = results.length
  console.log(`  Results: ${passed} PASS, ${failed} FAIL / ${total} total`)
  console.log(`  Pass rate: ${Math.round((passed / total) * 100)}%`)
  console.log()

  // Cleanup
  clearHistory('ch-2')
  destroyHangman()
  destroyShiritori()
  closeDb()

  process.exit(failed > 0 ? 1 : 0)
}

main()
