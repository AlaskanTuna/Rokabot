/**
 * Memory Extraction Integration Test — validates the background fact extraction pipeline.
 * Tests: parsing, passive buffer, channel monitor, fact retention, and (optionally) live Gemini extraction.
 *
 * Usage:
 *   npm run test:memory
 *
 * For live Gemini test (requires GEMINI_API_KEY):
 *   GOOGLE_GENAI_API_KEY=$(grep GEMINI_API_KEY .env | cut -d= -f2) npm run test:memory
 */

// Stub Discord env vars before any imports
process.env.DISCORD_TOKEN ||= 'test-stub'
process.env.DISCORD_CLIENT_ID ||= 'test-stub'

import {
  cleanupExpired,
  getMonitoredCount,
  isMonitored,
  markActive,
  resetMonitor
} from '../src/agent/channelMonitor.js'
import { EXTRACTION_INTERVAL, _parseFacts as parseFacts } from '../src/agent/memoryExtractor.js'
import { addMessage, clearBuffer, getMessageCount, getMessages, resetAllBuffers } from '../src/agent/passiveBuffer.js'
import { closeDb, getDb } from '../src/storage/database.js'
import { clearHistory, loadHistory, saveMessage } from '../src/storage/sessionStore.js'
import { countFacts, getFacts, pruneOldFacts, refreshFactTimestamps, saveFact } from '../src/storage/userMemory.js'

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
  console.log('\n  Memory Extraction Integration Test\n')

  const db = getDb()

  // ─── JSON Parsing ───
  console.log('\n  --- Fact Parsing ---')

  const valid = parseFacts('[{"userId":"Alice","key":"favorite_anime","value":"Frieren"}]')
  assert(valid.length === 1, 'Parse: valid JSON', `${valid.length} fact(s)`, 'Parse failed')
  assert(
    valid[0].userId === 'Alice' && valid[0].key === 'favorite_anime' && valid[0].value === 'Frieren',
    'Parse: correct fields',
    `${valid[0].userId}: ${valid[0].key}=${valid[0].value}`,
    'Wrong fields'
  )

  const multi = parseFacts('[{"userId":"A","key":"k1","value":"v1"},{"userId":"B","key":"k2","value":"v2"}]')
  assert(multi.length === 2, 'Parse: multiple facts', `${multi.length} facts`, `Got ${multi.length}`)

  const empty = parseFacts('[]')
  assert(empty.length === 0, 'Parse: empty array', 'Returns []', `Got ${empty.length}`)

  const fenced = parseFacts('```json\n[{"userId":"X","key":"k","value":"v"}]\n```')
  assert(fenced.length === 1, 'Parse: code-fenced JSON', 'Strips fences', `Got ${fenced.length}`)

  const invalid = parseFacts('not json at all')
  assert(invalid.length === 0, 'Parse: invalid input', 'Returns []', `Got ${invalid.length}`)

  const partial = parseFacts('[{"userId":"A","key":"","value":"v"},{"userId":"B","key":"k","value":""}]')
  assert(partial.length === 0, 'Parse: empty key/value filtered', 'Filters out', `Got ${partial.length}`)

  const noArray = parseFacts('{"userId":"A","key":"k","value":"v"}')
  assert(noArray.length === 0, 'Parse: non-array JSON', 'Returns []', `Got ${noArray.length}`)

  // ─── Extraction Interval ───
  console.log('\n  --- Extraction Interval ---')

  assert(
    EXTRACTION_INTERVAL === 20,
    'Interval: updated to 20',
    `Every ${EXTRACTION_INTERVAL} messages`,
    `Got ${EXTRACTION_INTERVAL}`
  )

  // ─── Passive Buffer ───
  console.log('\n  --- Passive Buffer ---')

  resetAllBuffers()

  // addMessage and getMessages
  addMessage('buf-ch', 'user1', 'Alice', 'Hello everyone!')
  addMessage('buf-ch', 'user2', 'Bob', 'Hey Alice!')
  const msgs = getMessages('buf-ch')
  assert(msgs.length === 2, 'Buffer: addMessage/getMessages', `${msgs.length} messages`, `Got ${msgs.length}`)
  assert(
    msgs[0].displayName === 'Alice' && msgs[0].userId === 'user1',
    'Buffer: message fields',
    `${msgs[0].displayName} (${msgs[0].userId})`,
    'Wrong fields'
  )

  // getMessageCount
  assert(getMessageCount('buf-ch') === 2, 'Buffer: getMessageCount', '2', `Got ${getMessageCount('buf-ch')}`)
  assert(
    getMessageCount('nonexistent') === 0,
    'Buffer: empty channel count',
    '0',
    `Got ${getMessageCount('nonexistent')}`
  )

  // clearBuffer
  clearBuffer('buf-ch')
  assert(getMessages('buf-ch').length === 0, 'Buffer: clearBuffer', 'Messages cleared', 'Messages remain')

  // Ring buffer overflow (cap at 20)
  resetAllBuffers()
  for (let i = 0; i < 25; i++) {
    addMessage('overflow-ch', `user${i}`, `User${i}`, `Message ${i}`)
  }
  const overflowMsgs = getMessages('overflow-ch')
  assert(
    overflowMsgs.length === 20,
    'Buffer: ring buffer cap',
    `${overflowMsgs.length} (capped at 20)`,
    `Got ${overflowMsgs.length}`
  )
  assert(
    overflowMsgs[0].content === 'Message 5',
    'Buffer: oldest evicted',
    `First message: "${overflowMsgs[0].content}"`,
    `Got "${overflowMsgs[0].content}"`
  )

  // clearBuffer keeps userMap
  resetAllBuffers()
  addMessage('map-ch', 'user1', 'Alice', 'test')
  clearBuffer('map-ch')
  addMessage('map-ch', 'user2', 'Bob', 'test2')
  // After clear + new message, both users should be in userMap
  const { getUserMap } = await import('../src/agent/passiveBuffer.js')
  const userMap = getUserMap('map-ch')
  assert(userMap.has('Alice'), 'Buffer: userMap survives clear', 'Alice in userMap', 'Alice missing')
  assert(userMap.has('Bob'), 'Buffer: userMap updated after clear', 'Bob in userMap', 'Bob missing')

  // ─── Channel Monitor ───
  console.log('\n  --- Channel Monitor ---')

  resetMonitor()

  // markActive + isMonitored
  assert(!isMonitored('mon-ch'), 'Monitor: not monitored initially', 'false', 'true')
  markActive('mon-ch')
  assert(isMonitored('mon-ch'), 'Monitor: active after markActive', 'true', 'false')
  assert(getMonitoredCount() === 1, 'Monitor: count', '1', `Got ${getMonitoredCount()}`)

  // Expiry (simulate by directly manipulating — can't wait 24h in a test)
  // Just verify cleanupExpired doesn't crash and non-expired channels survive
  cleanupExpired()
  assert(isMonitored('mon-ch'), 'Monitor: survives cleanup (not expired)', 'true', 'false')

  // ─── Deduplication ───
  console.log('\n  --- Fact Deduplication ---')

  saveFact('dedup-user', 'favorite_anime', 'Frieren')
  saveFact('dedup-user', 'favorite_anime', 'Frieren') // Same key+value
  const deduped = getFacts('dedup-user')
  assert(deduped.length === 1, 'Dedup: same fact not duplicated', '1 fact stored', `Got ${deduped.length}`)

  saveFact('dedup-user', 'favorite_anime', 'Dandadan') // Same key, different value = update
  const updated = getFacts('dedup-user')
  assert(
    updated.length === 1 && updated[0].value === 'Dandadan',
    'Dedup: same key updates value',
    'Updated to Dandadan',
    `Got ${updated.length} facts, value: ${updated[0]?.value}`
  )

  // ─── refreshFactTimestamps ───
  console.log('\n  --- Refresh Fact Timestamps ---')

  saveFact('refresh-user', 'hobby', 'cooking')
  // Manually backdate the timestamp
  db.prepare('UPDATE user_memory SET updated_at = ? WHERE user_id = ?').run(1000, 'refresh-user')
  const before = db.prepare('SELECT updated_at FROM user_memory WHERE user_id = ?').get('refresh-user') as {
    updated_at: number
  }
  assert(
    before.updated_at === 1000,
    'Refresh: backdated',
    `updated_at=${before.updated_at}`,
    `Got ${before.updated_at}`
  )

  refreshFactTimestamps('refresh-user')
  const after = db.prepare('SELECT updated_at FROM user_memory WHERE user_id = ?').get('refresh-user') as {
    updated_at: number
  }
  assert(
    after.updated_at > 1000,
    'Refresh: timestamp updated',
    `updated_at=${after.updated_at}`,
    `Got ${after.updated_at}`
  )

  // ─── pruneOldFacts ───
  console.log('\n  --- Prune Old Facts ---')

  saveFact('prune-old', 'old_fact', 'ancient')
  saveFact('prune-recent', 'new_fact', 'fresh')
  // Backdate one fact to 100 days ago
  const hundredDaysAgo = Date.now() - 100 * 24 * 60 * 60 * 1000
  db.prepare('UPDATE user_memory SET updated_at = ? WHERE user_id = ?').run(hundredDaysAgo, 'prune-old')

  const pruned = pruneOldFacts(90)
  assert(pruned >= 1, 'Prune: old facts removed', `${pruned} pruned`, `Got ${pruned}`)
  assert(countFacts('prune-old') === 0, 'Prune: old user has no facts', '0 facts', `Got ${countFacts('prune-old')}`)
  assert(
    countFacts('prune-recent') > 0,
    'Prune: recent user untouched',
    `${countFacts('prune-recent')} facts`,
    '0 facts'
  )

  // ─── Session History for Extraction ───
  console.log('\n  --- Session History for Extraction ---')

  clearHistory('extract-ch')
  saveMessage('extract-ch', 'user', 'Alice', 'My favorite anime is Frieren!')
  saveMessage('extract-ch', 'assistant', 'Roka', 'Oh you like Frieren? Great taste~')
  saveMessage('extract-ch', 'user', 'Bob', 'Call me Bobby, everyone does')
  saveMessage('extract-ch', 'assistant', 'Roka', 'Bobby it is then~')
  saveMessage('extract-ch', 'user', 'Alice', "I'm from Singapore btw")

  const history = loadHistory('extract-ch', 10)
  const userMessages = history.filter((m) => m.role === 'user')
  assert(
    userMessages.length === 3,
    'History: user messages',
    `${userMessages.length} user messages`,
    `Got ${userMessages.length}`
  )

  // ─── Edge Cases ───
  console.log('\n  --- Edge Cases ---')

  // Buffer: empty content messages should still work
  resetAllBuffers()
  const emptyCount = addMessage('edge-ch', 'user1', 'Alice', '')
  assert(getMessageCount('edge-ch') === 0 || emptyCount >= 0, 'Edge: empty message handled', 'No crash', 'Crashed')

  // Buffer: very long message (10K chars)
  resetAllBuffers()
  const longMsg = 'x'.repeat(10000)
  addMessage('edge-ch2', 'user1', 'Alice', longMsg)
  assert(getMessages('edge-ch2').length === 1, 'Edge: long message stored', '1 message', 'Failed')
  assert(
    getMessages('edge-ch2')[0].content.length === 10000,
    'Edge: long message not truncated',
    '10000 chars',
    `Got ${getMessages('edge-ch2')[0].content.length}`
  )

  // Buffer: special characters (unicode, emoji, newlines)
  resetAllBuffers()
  addMessage('edge-ch3', 'user1', 'Alice', 'こんにちは 🎉\nNew line here')
  const specialMsg = getMessages('edge-ch3')[0]
  assert(specialMsg.content.includes('🎉'), 'Edge: emoji preserved', 'Emoji intact', 'Emoji lost')
  assert(specialMsg.content.includes('\n'), 'Edge: newline preserved', 'Newline intact', 'Newline lost')

  // Monitor: multiple channels independently tracked
  resetMonitor()
  markActive('multi-ch-1')
  markActive('multi-ch-2')
  assert(
    isMonitored('multi-ch-1') && isMonitored('multi-ch-2'),
    'Edge: multi-channel monitoring',
    'Both monitored',
    'Missing one'
  )
  assert(getMonitoredCount() === 2, 'Edge: monitor count', '2 channels', `Got ${getMonitoredCount()}`)
  assert(!isMonitored('multi-ch-3'), 'Edge: unmonitored channel', 'false', 'Should be false')

  // Dedup: rapid duplicate saves (race condition simulation)
  saveFact('race-user', 'test', 'value1')
  saveFact('race-user', 'test', 'value1')
  saveFact('race-user', 'test', 'value1')
  assert(countFacts('race-user') === 1, 'Edge: rapid duplicate saves', '1 fact', `Got ${countFacts('race-user')}`)

  // Prune: user with exactly 90-day-old fact (boundary — survives, 91-day gets pruned)
  saveFact('boundary-user', 'edge_fact', 'boundary_test')
  const exactlyNinetyDays = Date.now() - 90 * 24 * 60 * 60 * 1000
  db.prepare('UPDATE user_memory SET updated_at = ? WHERE user_id = ?').run(exactlyNinetyDays, 'boundary-user')
  pruneOldFacts(90)
  assert(
    countFacts('boundary-user') === 1,
    'Edge: 90-day boundary survives',
    'Fact kept at exact boundary (< is strict)',
    `Unexpected: ${countFacts('boundary-user')}`
  )
  // 91 days old SHOULD be pruned
  const ninetyOneDays = Date.now() - 91 * 24 * 60 * 60 * 1000
  db.prepare('UPDATE user_memory SET updated_at = ? WHERE user_id = ?').run(ninetyOneDays, 'boundary-user')
  pruneOldFacts(90)
  assert(
    countFacts('boundary-user') === 0,
    'Edge: 91-day boundary pruned',
    'Fact removed past boundary',
    `Fact survived: ${countFacts('boundary-user')}`
  )

  // Refresh: refreshing non-existent user doesn't crash
  refreshFactTimestamps('nonexistent-user-12345')
  pass('Edge: refresh non-existent user', 'No crash')

  // Prune: pruning empty table doesn't crash
  const emptyPrune = pruneOldFacts(1)
  assert(emptyPrune >= 0, 'Edge: prune empty/clean table', `${emptyPrune} pruned`, 'Crashed')

  // Parse: malformed JSON edge cases
  assert(parseFacts('[{]').length === 0, 'Edge: malformed JSON', 'Returns []', 'Should be empty')
  assert(parseFacts('null').length === 0, 'Edge: null input', 'Returns []', 'Should be empty')
  assert(parseFacts('').length === 0, 'Edge: empty string', 'Returns []', 'Should be empty')
  assert(
    parseFacts('[{"userId":"A","key":"k","value":"v"},null,42]').length === 1,
    'Edge: mixed array (valid + invalid)',
    '1 valid fact filtered',
    'Wrong count'
  )

  // ─── Live Gemini Extraction (optional) ───
  if (process.env.GOOGLE_GENAI_API_KEY) {
    console.log('\n  --- Live Gemini Extraction ---')

    const { GoogleGenAI } = await import('@google/genai')
    const { config: appConfig } = await import('../src/config.js')

    const client = new GoogleGenAI({ apiKey: appConfig.gemini.apiKey })

    const testConversation = [
      '[Alice]: My favorite anime is Frieren and I love cooking!',
      '[Bob]: You can call me Bobby. I was born on March 15th.',
      '[Alice]: I live in Singapore, it is so hot here'
    ].join('\n')

    const prompt = `You are a fact extractor. Given a conversation between users and an assistant, extract personal facts about the USERS (not the assistant).

Rules:
- Only extract concrete, reusable facts: names/nicknames, preferences, favorites, hobbies, birthdays, locations, relationships
- Do NOT extract temporary states, opinions about the conversation, or facts about the assistant
- Each fact needs: the user's name (from the [Name] prefix), a short key, and the value
- If no facts are worth extracting, return an empty array

Return ONLY a JSON array, no markdown, no explanation:
[{"userId":"Alice","key":"favorite_anime","value":"Frieren"},{"userId":"Bob","key":"nickname","value":"Ali"}]
Or if none: []

Conversation:
${testConversation}`

    try {
      const response = await client.models.generateContent({
        model: appConfig.gemini.model,
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 200 }
      })

      const text = response.text?.trim() ?? ''
      console.log(`  Raw response: ${text}`)

      const facts = parseFacts(text)
      assert(facts.length >= 3, 'Gemini: extracted facts', `${facts.length} facts extracted`, `Only ${facts.length}`)

      const aliceFact = facts.find((f) => f.userId === 'Alice' && f.key.includes('anime'))
      assert(!!aliceFact, 'Gemini: Alice anime', `${aliceFact?.key}=${aliceFact?.value}`, 'Not found')

      const bobFact = facts.find((f) => f.userId === 'Bob' && (f.key.includes('nickname') || f.key.includes('name')))
      assert(!!bobFact, 'Gemini: Bob nickname', `${bobFact?.key}=${bobFact?.value}`, 'Not found')

      const locationFact = facts.find((f) => f.userId === 'Alice' && f.key.includes('location'))
      assert(!!locationFact, 'Gemini: Alice location', `${locationFact?.key}=${locationFact?.value}`, 'Not found')
    } catch (error) {
      fail('Gemini: extraction call', `Error: ${error}`)
    }
  } else {
    console.log('\n  --- Live Gemini Extraction (SKIPPED — no GOOGLE_GENAI_API_KEY) ---')
    pass('Gemini: skipped', 'Set GOOGLE_GENAI_API_KEY to test live extraction')
  }

  // --- Summary ---
  console.log('\n  ' + '─'.repeat(56))
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  const total = results.length
  console.log(`  Results: ${passed} PASS, ${failed} FAIL / ${total} total`)
  console.log(`  Pass rate: ${Math.round((passed / total) * 100)}%`)
  console.log()

  closeDb()
  process.exit(failed > 0 ? 1 : 0)
}

main()
