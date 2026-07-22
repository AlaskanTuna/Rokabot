/** Species catalog, rarity tiers, cosmetics, and stat definitions for the buddy pet system. */

export type BuddyRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface SpeciesInfo {
  id: string
  name: string
  emoji: string
  rarity: BuddyRarity
  description: string
  spriteUrl: string
}

export const SPECIES: SpeciesInfo[] = [
  // Common (7 species — 60%)
  {
    id: 'mochi',
    name: 'Mochi',
    emoji: '\uD83C\uDF61',
    rarity: 'common',
    description: 'A squishy rice cake blob that bounces around happily~',
    spriteUrl: 'https://files.catbox.moe/nxw4ry.png'
  },
  {
    id: 'chibi',
    name: 'Chibi',
    emoji: '\uD83D\uDC76',
    rarity: 'common',
    description: 'A tiny human companion with oversized sparkling eyes~',
    spriteUrl: 'https://files.catbox.moe/vx82rl.png'
  },
  {
    id: 'kodama',
    name: 'Kodama',
    emoji: '\uD83C\uDF33',
    rarity: 'common',
    description: 'A gentle tree spirit that rattles its head when happy~',
    spriteUrl: 'https://files.catbox.moe/5lynbp.png'
  },
  {
    id: 'usagi',
    name: 'Usagi',
    emoji: '\uD83D\uDC30',
    rarity: 'common',
    description: 'A fluffy moon rabbit who dreams of mochi pounding~',
    spriteUrl: 'https://files.catbox.moe/n0iive.png'
  },
  {
    id: 'obake',
    name: 'Obake',
    emoji: '\uD83D\uDC7B',
    rarity: 'common',
    description: 'A shapeshifter ghost that can never quite hold a form~',
    spriteUrl: 'https://files.catbox.moe/oouj42.png'
  },
  {
    id: 'sakura',
    name: 'Sakura',
    emoji: '\uD83C\uDF38',
    rarity: 'common',
    description: 'A cherry blossom fairy who dances on spring breezes~',
    spriteUrl: 'https://files.catbox.moe/l4zbu8.png'
  },
  {
    id: 'tsukimi',
    name: 'Tsukimi',
    emoji: '\uD83C\uDF19',
    rarity: 'common',
    description: 'A moon watcher spirit who stays up way too late~',
    spriteUrl: 'https://files.catbox.moe/31nh5y.png'
  },

  // Uncommon (4 species — 25%)
  {
    id: 'tanuki',
    name: 'Tanuki',
    emoji: '\uD83E\uDD9D',
    rarity: 'uncommon',
    description: 'A mischievous raccoon dog with a talent for disguises~',
    spriteUrl: 'https://files.catbox.moe/bb3n5z.png'
  },
  {
    id: 'bakeneko',
    name: 'Bakeneko',
    emoji: '\uD83D\uDC31',
    rarity: 'uncommon',
    description: 'A cat yokai who walks on two legs when nobody is looking~',
    spriteUrl: 'https://files.catbox.moe/yzcjb4.png'
  },
  {
    id: 'yuki',
    name: 'Yuki',
    emoji: '\u2744\uFE0F',
    rarity: 'uncommon',
    description: 'A snow spirit who melts a little when flustered~',
    spriteUrl: 'https://files.catbox.moe/2bu9e6.png'
  },
  {
    id: 'inugami',
    name: 'Inugami',
    emoji: '\uD83D\uDC15',
    rarity: 'uncommon',
    description: 'A loyal dog spirit who guards you with fierce devotion~',
    spriteUrl: 'https://files.catbox.moe/5giyyk.png'
  },

  // Rare (3 species — 10%)
  {
    id: 'kitsune',
    name: 'Kitsune',
    emoji: '\uD83E\uDD8A',
    rarity: 'rare',
    description: 'A mischievous fox spirit with multiple tails~',
    spriteUrl: 'https://files.catbox.moe/dqv1vj.png'
  },
  {
    id: 'kappa',
    name: 'Kappa',
    emoji: '\uD83E\uDD9C',
    rarity: 'rare',
    description: 'A water imp obsessed with cucumbers and politeness~',
    spriteUrl: 'https://files.catbox.moe/jjx1wu.png'
  },
  {
    id: 'tengu',
    name: 'Tengu',
    emoji: '\uD83E\uDDB9',
    rarity: 'rare',
    description: 'A proud crow spirit with a very long nose~',
    spriteUrl: 'https://files.catbox.moe/7n2eew.png'
  },

  // Epic (2 species — 4%)
  {
    id: 'nekomata',
    name: 'Nekomata',
    emoji: '\uD83D\uDC08\u200D\u2B1B',
    rarity: 'epic',
    description: 'A ghost cat with twin tails and eerie supernatural powers~',
    spriteUrl: 'https://files.catbox.moe/sslbtt.png'
  },
  {
    id: 'tatsu',
    name: 'Tatsu',
    emoji: '\uD83D\uDC09',
    rarity: 'epic',
    description: 'A baby dragon still learning to breathe fire without sneezing~',
    spriteUrl: 'https://files.catbox.moe/t1je58.png'
  },

  // Legendary (2 species — 1%)
  {
    id: 'oni',
    name: 'Oni',
    emoji: '\uD83D\uDC79',
    rarity: 'legendary',
    description: 'A fearsome demon child whose tantrums shake the earth~',
    spriteUrl: 'https://files.catbox.moe/4o8qig.png'
  },
  {
    id: 'kaiju',
    name: 'Kaiju',
    emoji: '\uD83E\uDD96',
    rarity: 'legendary',
    description: 'A tiny monster with city-destroying dreams and a squeaky roar~',
    spriteUrl: 'https://files.catbox.moe/rjuuc1.png'
  }
]

export const RARITY_WEIGHTS: Record<BuddyRarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1
}

export const RARITY_COLORS: Record<BuddyRarity, number> = {
  common: 0xaaaaaa,
  uncommon: 0x55cc55,
  rare: 0x5555ff,
  epic: 0xaa55ff,
  legendary: 0xffaa00
}

export const RARITY_EMOJI: Record<BuddyRarity, string> = {
  common: '\u26AA',
  uncommon: '\uD83D\uDFE2',
  rare: '\uD83D\uDD35',
  epic: '\uD83D\uDFE3',
  legendary: '\uD83C\uDF1F'
}

/** Stat floors/ceilings by rarity tier. */
export const RARITY_STAT_RANGE: Record<BuddyRarity, { floor: number; max: number }> = {
  common: { floor: 1, max: 6 },
  uncommon: { floor: 2, max: 7 },
  rare: { floor: 3, max: 8 },
  epic: { floor: 4, max: 9 },
  legendary: { floor: 5, max: 10 }
}

export const EYE_STYLES = ['\u00B7', '\u2666', '\u2605', '\u25C9', '@', '\u00B0']

export const HAT_STYLES = ['crown', 'ribbon', 'cat ears', 'fox ears', 'halo', 'wizard hat', 'flower crown', 'none']

export const STAT_NAMES = [
  { key: 'charm', display: 'CHARM/\u9B45\u529B' },
  { key: 'wit', display: 'WIT/\u6A5F\u77E5' },
  { key: 'dere', display: 'DERE/\u30C7\u30EC' },
  { key: 'drama', display: 'DRAMA/\u4FEE\u7F85\u5834' },
  { key: 'luck', display: 'LUCK/\u904B\u547D' }
]
