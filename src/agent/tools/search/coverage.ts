/** Per-field coverage over collected passages: decides whether the depth loop must keep looking. */

export interface Passage {
  sourceId: string
  heading: string
  body: string
}

export interface FieldAssessment {
  covered: boolean
  support: Passage[]
}

type FieldKind = 'price' | 'list' | 'other'

type FieldCategory = 'drink' | 'food' | 'dessert'

/** Price wins over list: "drink prices" is a price field. */
export function fieldKind(field: string): FieldKind {
  const lowered = field.toLowerCase()
  if (/price|prices|cost|fee|charge|値段|料金|価格|いくら|yen|¥|円|\$/.test(lowered)) return 'price'
  if (/menu|item|list|dish|attraction|メニュー/.test(lowered)) return 'list'
  return 'other'
}

const DRINK_WORDS = [
  'coffee',
  'コーヒー',
  '珈琲',
  'blend',
  'ブレンド',
  'latte',
  'ラテ',
  'au lait',
  'カフェオレ',
  'tea',
  '紅茶',
  '緑茶',
  '烏龍茶',
  'ウーロン茶',
  'juice',
  'ジュース',
  'soda',
  'ソーダ',
  'cocoa',
  'ココア',
  'espresso',
  'エスプレッソ',
  'mocha',
  'モカ',
  'cappuccino',
  'カプチーノ',
  'matcha',
  '抹茶',
  'americano',
  'アメリカーノ',
  'drink',
  'ドリンク',
  'beverage',
  'milk',
  'ミルク'
]

const FOOD_WORDS = [
  'food',
  'フード',
  'sandwich',
  'サンド',
  'サンドイッチ',
  'toast',
  'トースト',
  'egg',
  '卵',
  '玉子',
  'タマゴ',
  'tamago',
  'curry',
  'カレー',
  'pancake',
  'hotcake',
  'ホットケーキ',
  'pudding',
  'プリン',
  'cake',
  'ケーキ',
  'parfait',
  'パフェ',
  'ice cream',
  'アイス',
  'donut',
  'doughnut',
  'ドーナツ',
  'rice',
  'ライス',
  'ご飯',
  'ごはん',
  'noodle',
  '麺',
  'うどん',
  'そば',
  'ラーメン',
  'soup',
  'スープ',
  'salad',
  'サラダ',
  'cheese',
  'チーズ',
  'ham',
  'ハム',
  'cucumber',
  'potato',
  'ポテト',
  'fries',
  'custard',
  'カスタード',
  'mont blanc',
  'モンブラン',
  'dish',
  'dishes',
  'meal',
  'breakfast',
  'morning',
  'モーニング',
  'lunch',
  'ランチ',
  'brunch',
  'omelet',
  'omelette',
  'オムレツ',
  'dashi',
  'sweets',
  'スイーツ',
  'dessert',
  'デザート',
  'bread',
  'パン',
  'fruit',
  'フルーツ',
  'chocolate',
  'チョコ',
  'strawberry',
  'いちご',
  'イチゴ'
]

const DESSERT_WORDS = [
  'dessert',
  'デザート',
  'sweets',
  'スイーツ',
  'cake',
  'ケーキ',
  'pudding',
  'プリン',
  'parfait',
  'パフェ',
  'ice cream',
  'アイス',
  'mont blanc',
  'モンブラン',
  'pancake',
  'ホットケーキ',
  'custard',
  'カスタード',
  'donut',
  'ドーナツ',
  'chocolate',
  'チョコ'
]

function categoryWords(category: FieldCategory): readonly string[] {
  if (category === 'drink') return DRINK_WORDS
  if (category === 'food') return FOOD_WORDS
  return DESSERT_WORDS
}

/** Category words name a kind, not an item: "Food 74" on a listing is a photo count, never a dish. */
const GENERIC_WORDS = new Set([
  'food',
  'フード',
  'drink',
  'ドリンク',
  'beverage',
  'dish',
  'dishes',
  'meal',
  'breakfast',
  'morning',
  'モーニング',
  'lunch',
  'ランチ',
  'brunch',
  'sweets',
  'スイーツ',
  'dessert',
  'デザート'
])

const ALL_ITEM_WORDS: readonly string[] = [...DRINK_WORDS, ...FOOD_WORDS].filter((word) => !GENERIC_WORDS.has(word))

/** The category the field itself names, if any: "drink prices" is about drinks, "food prices" about food. */
function fieldCategory(field: string): FieldCategory | null {
  const lowered = field.toLowerCase()
  if (matchesAny(lowered, DRINK_WORDS)) return 'drink'
  if (matchesAny(lowered, FOOD_WORDS)) return 'food'
  if (matchesAny(lowered, DESSERT_WORDS)) return 'dessert'
  return null
}

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One lexicon word found in the text: plain Latin words need boundaries (the RM in "firm" never pays), symbols and CJK match by inclusion. */
function wordFound(word: string, hay: string): boolean {
  if (/^[a-z\s]+$/.test(word)) return new RegExp(`\\b${escapeRegExp(word)}(?:es|s)?\\b`).test(hay)
  return hay.includes(word)
}

function matchesAny(hay: string, words: readonly string[]): boolean {
  return words.some((word) => wordFound(word, hay))
}

/**
 * Hint terms that cover an "other" field. Currency marks cover a price field, the local words cover
 * menu, hours and drink fields — a Japanese page carries the fact without ever using the English word.
 */
const FIELD_HINTS: Record<string, string[]> = {
  price: ['¥', '円', '$', 'rm', 'yen', 'price'],
  menu: ['メニュー', 'menu'],
  hours: ['営業時間', 'open', 'hours'],
  drink: ['coffee', 'ドリンク', 'ブレンド', 'blend', 'tea', 'drink']
}

/** A hint found in the text: plain Latin words need word boundaries, symbols and CJK match by inclusion. */
function hintFound(hint: string, hay: string): boolean {
  if (/^[a-z]+$/.test(hint)) return new RegExp(`\\b${hint}\\b`).test(hay)
  return hay.includes(hint)
}

/** Filler words that never decide coverage: the field's load-bearing words name the price, menu or hours kind. */
const FIELD_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'and',
  'or',
  'items',
  'item',
  'list',
  'lists',
  'details',
  'detail',
  'number',
  'numbers',
  'specific',
  'several',
  'full'
])

/** Whether one field word is covered by the text. */
function wordCovered(word: string, hay: string): boolean {
  if (FIELD_STOPWORDS.has(word)) return true
  if (hintFound(word, hay)) return true
  for (const [kind, hints] of Object.entries(FIELD_HINTS)) {
    // An inflected form names the kind too: "opening" carries the "open" hint, "prices" the price kind.
    const names = word.includes(kind) || hints.some((hint) => hint.length >= 3 && word.includes(hint))
    if (names && hints.some((hint) => hintFound(hint, hay))) return true
  }
  return false
}

/** Whether an "other" field is covered by one passage body: every load-bearing word is. */
function otherCovered(field: string, body: string): boolean {
  const hay = body.toLowerCase()
  const words = field
    .toLowerCase()
    .split(/[^a-z0-9぀-ヿ一-龯]+/)
    .filter(Boolean)
  return words.length > 0 && words.every((word) => wordCovered(word, hay))
}

const PRICE_SOURCE =
  '(?:¥|￥)\\s*[\\d,]+(?:\\.\\d+)?|[\\d,]+(?:\\.\\d+)?\\s*(?:円|yen)|JPY\\s*[\\d,]+(?:\\.\\d+)?|\\$\\s*[\\d,]+(?:\\.\\d+)?|RM\\s*[\\d,]+(?:\\.\\d+)?'

/** A bound on either side of a price: the nearest item or category mention it belongs to. */
const BIND_WINDOW = 40

/** Splits running text into candidate item segments: bullets, table cells and comma/、 enumerations. */
const SEGMENT_DELIMITER = /\n|[.!?…。！？；;：:|｜★※●○■◆◇・]|[,，、/／|｜&+＋]|(?:\band\b|\bor\b|\bwith\b)/i

/** Lines that start a new branch scope: a markdown heading naming a branch, shop or store. Prose that merely mentions one never splits. */
const BRANCH_HEADING = /^#{1,4}\s.*(?:支店|本店|分店|店舗|店|branch|shop|store)/i

const MAX_ITEM_CHARS = 32

/** Width, case and punctuation folded away, so "Hot Coffee" and "Ｈｏｔ・Ｃｏｆｆｅｅ" count once. */
function normalizeItem(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^(?:the|a|an)\s+/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function itemIn(text: string, words: readonly string[]): string | undefined {
  const lowered = text.normalize('NFKC').toLowerCase()
  return words.find((word) => wordFound(word, lowered))
}

interface PricePair {
  key: string
  category: FieldCategory | null
}

/**
 * The item-price pairs of one line. A price binds to the nearest food or drink mention within the window,
 * so the coffee's price never pays for the toast beside it; its identity is that anchor plus the number.
 */
function pairsInLine(line: string): PricePair[] {
  const pairs: PricePair[] = []
  const matches = line.matchAll(new RegExp(PRICE_SOURCE, 'gi'))
  for (const match of matches) {
    const index = match.index ?? 0
    const before = line.slice(Math.max(0, index - BIND_WINDOW), index)
    const after = line.slice(index + match[0].length, index + match[0].length + BIND_WINDOW)
    let nearest: { word: string; category: FieldCategory } | undefined
    let nearestDistance = BIND_WINDOW + 1
    for (const category of ['drink', 'food', 'dessert'] as const) {
      for (const word of categoryWords(category)) {
        const pattern = /^[a-z\s]+$/.test(word)
          ? new RegExp(`\\b${escapeRegExp(word)}(?:es|s)?\\b`, 'gi')
          : new RegExp(escapeRegExp(word), 'g')
        for (const scope of [before, after]) {
          for (const found of scope.matchAll(pattern)) {
            const at = scope === before ? before.length - ((found.index ?? 0) + found[0].length) : (found.index ?? 0)
            if (at <= BIND_WINDOW && at < nearestDistance) {
              nearestDistance = at
              nearest = { word, category }
            }
          }
        }
      }
    }
    if (!nearest) continue
    const number = match[0].replace(/[^\d.]/g, '')
    pairs.push({ key: `${nearest.word} ${number}`, category: nearest.category })
  }
  return pairs
}

/** The named items of one block: each short segment carrying a food or drink word. */
function itemsInBlock(block: string): string[] {
  const items: string[] = []
  for (const segment of block.split(SEGMENT_DELIMITER)) {
    const cleaned = normalizeItem(segment)
    if (cleaned.length === 0 || cleaned.length > MAX_ITEM_CHARS) continue
    if (itemIn(cleaned, ALL_ITEM_WORDS)) items.push(cleaned)
  }
  for (const line of block.split('\n')) {
    for (const pair of pairsInLine(line)) {
      const name = pair.key.slice(0, pair.key.lastIndexOf(' '))
      if (!items.includes(name)) items.push(name)
    }
  }
  return items
}

/** A bullet, numbered or table-row line: a list entry of any kind ("attractions"), named by its first cell. */
const ENTRY_LINE = /^(?:[-*•・]|\d+[.)]|\|)\s*(.+)$/

function entriesInBlock(block: string): string[] {
  const entries: string[] = []
  for (const line of block.split('\n')) {
    const match = ENTRY_LINE.exec(line.trim())
    const name = normalizeItem((match?.[1] ?? '').split(/[|:：–—]/)[0] ?? '')
    if (name.length > 0 && name.length <= MAX_ITEM_CHARS * 2 && !/^-+$/.test(name)) entries.push(name)
  }
  return entries
}

interface Scope {
  items: Set<string>
  entries: Set<string>
  pairs: PricePair[]
}

/** One passage's branch scopes: a branch heading starts a new scope, so items under different branches never combine. */
function scopesIn(body: string): Scope[] {
  const scopes: Scope[] = [{ items: new Set(), entries: new Set(), pairs: [] }]
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    if (lines.some((line) => BRANCH_HEADING.test(line)))
      scopes.push({ items: new Set(), entries: new Set(), pairs: [] })
    const current = scopes[scopes.length - 1] as Scope
    for (const item of itemsInBlock(block)) current.items.add(item)
    for (const entry of entriesInBlock(block)) current.entries.add(entry)
    for (const line of lines) current.pairs.push(...pairsInLine(line))
  }
  return scopes
}

/** Menus and dishes are judged by food and drink names; any other list ("attractions") by its entry lines. */
const FOOD_LIST = /menu|dish|メニュー|料理/

function listCovered(field: string, scopes: readonly Scope[]): boolean {
  const category = fieldCategory(field)
  const words = category ? categoryWords(category) : null
  if (!words && !FOOD_LIST.test(field.toLowerCase())) return scopes.some((scope) => scope.entries.size >= 3)
  return scopes.some((scope) => {
    if (scope.items.size < 3) return false
    if (!words) return true
    return [...scope.items].some((item) => itemIn(item, words) !== undefined)
  })
}

function priceCovered(field: string, scopes: readonly Scope[]): boolean {
  const category = fieldCategory(field)
  const need = /\bprices\b|料金|値段|価格/.test(field.toLowerCase()) ? 2 : 1
  return scopes.some((scope) => {
    const keys = new Set<string>()
    for (const pair of scope.pairs) {
      if (category && pair.category !== category) continue
      keys.add(pair.key)
    }
    return keys.size >= need
  })
}

/**
 * Whether one field is covered by the passages, with the passages that evidence it. Titles never count:
 * a result titled "See our menu" carries no items. Coverage is per passage — evidence split across two
 * sources never combines — and for lists per branch scope within it.
 */
export function assessField(field: string, passages: readonly Passage[]): FieldAssessment {
  const kind = fieldKind(field)
  if (kind === 'other') {
    const support = passages.filter((passage) => otherCovered(field, passage.body))
    return { covered: support.length > 0, support }
  }
  const ranked: Array<{ passage: Passage; signals: number }> = []
  let covered = false
  for (const passage of passages) {
    const scopes = scopesIn(passage.body)
    const signals = scopes.reduce(
      (count, scope) => count + scope.items.size + scope.entries.size + scope.pairs.length,
      0
    )
    if (signals > 0) ranked.push({ passage, signals })
    if (kind === 'list' ? listCovered(field, scopes) : priceCovered(field, scopes)) covered = true
  }
  // Strongest evidence first, so the brief cites the covering passage before a partial one from the same source.
  ranked.sort((a, b) => b.signals - a.signals)
  return { covered, support: ranked.map(({ passage }) => passage) }
}

/** The blocks of a passage body that evidence a field, for the brief: item blocks, pair lines, or word hits. */
export function relevantBlocks(field: string, body: string): string[] {
  const kind = fieldKind(field)
  // A menu is evidenced by named food and drink; entry lines count only for other lists.
  const entriesCount = kind === 'list' && !fieldCategory(field) && !FOOD_LIST.test(field.toLowerCase())
  const kept: string[] = []
  for (const block of body.split(/\n\s*\n/)) {
    const trimmed = block.trim()
    if (trimmed.length === 0) continue
    if (kind === 'other') {
      if (otherCovered(field, block)) kept.push(trimmed)
      continue
    }
    // Lines stay whole (a list entry or table row); a long prose line keeps only its sentences naming an item or price.
    for (const line of trimmed.split('\n')) {
      const pieces = line.length > 200 ? line.split(/(?<=[.!?。！？])\s+/) : [line]
      for (const piece of pieces) {
        const evidences =
          kind === 'list'
            ? itemsInBlock(piece).length > 0 || (entriesCount && entriesInBlock(piece).length > 0)
            : pairsInLine(piece).length > 0
        if (evidences) kept.push(piece.trim())
      }
    }
  }
  return kept
}
