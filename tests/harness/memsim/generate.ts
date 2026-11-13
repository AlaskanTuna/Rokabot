import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { type CacheMode, MemsimCache, type ProviderBudgets } from './cache.js'
import { callRiverChatCompletion } from './routes.js'
import type {
  GroundTruthFile,
  GroundTruthItem,
  SimDay,
  SimDayEvent,
  SimEpisodeEvent,
  SimGuild,
  SimPersona,
  SimScenario
} from './types.js'

const BASE_TIME_MS = Date.UTC(2026, 9, 1, 10, 0, 0)
const BOT_USER_ID = 'sim-roka-bot'
const BOT_DISPLAY_NAME = 'Roka'

const GUILDS: SimGuild[] = [
  {
    id: 'sim-guild-north',
    name: 'Northgate Commons',
    channels: [
      { id: 'sim-north-general', name: 'general', visibility: 'public' },
      { id: 'sim-north-craft', name: 'craft-shop', visibility: 'public' },
      { id: 'sim-north-vault', name: 'mod-vault', visibility: 'private' }
    ]
  },
  {
    id: 'sim-guild-south',
    name: 'Southbay Club',
    channels: [
      { id: 'sim-south-lounge', name: 'lounge', visibility: 'public' },
      { id: 'sim-south-events', name: 'events', visibility: 'public' },
      { id: 'sim-south-secret', name: 'backstage-private', visibility: 'private' }
    ]
  }
]

const DM_CHANNELS = [
  { id: 'sim-dm-alice', userId: 'sim-user-alice' },
  { id: 'sim-dm-dave', userId: 'sim-user-dave' },
  { id: 'sim-dm-carol', userId: 'sim-user-carol' }
]

const PERSONAS: SimPersona[] = [
  { id: 'sim-user-alice', username: 'alice_k', displayName: 'Alice' },
  { id: 'sim-user-bob', username: 'bob_r', displayName: 'Bob' },
  { id: 'sim-user-carol', username: 'carol_m', displayName: 'Carol' },
  { id: 'sim-user-dave', username: 'dave_t', displayName: 'Dave' },
  { id: 'sim-user-erin', username: 'erin_v', displayName: 'Erin' },
  { id: 'sim-user-frank', username: 'frank_l', displayName: 'Frank' },
  { id: 'sim-user-grace', username: 'grace_h', displayName: 'Grace' }
]

interface RokaTurnSpec {
  userId: string
  promptHint: string
  expectedRecallGtIds?: string[]
}

interface EpisodeBlueprint {
  id: string
  day: number
  offsetMs: number
  guildId: string | null
  channelId: string
  isDm?: boolean
  leaveOpen?: boolean
  topic: string
  requiredLines: Array<{
    userId: string
    lineHint: string
    mustContainTokens?: string[]
  }>
  rokaTurns?: RokaTurnSpec[]
}

const GROUND_TRUTH_ITEMS: GroundTruthItem[] = [
  // new_fact (5)
  {
    id: 'gt-alice-job',
    label: 'new_fact',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: 'sim-user-alice',
    predicates: ['general_occupation'],
    expectedTokens: ['botanist'],
    expectedPeriod: 'current',
    introducedDay: 1,
    checkAfterDay: 2
  },
  {
    id: 'gt-bob-pet',
    label: 'new_fact',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-bob',
    predicates: ['pets'],
    expectedTokens: ['shiba'],
    expectedPeriod: 'current',
    introducedDay: 2,
    checkAfterDay: 3
  },
  {
    id: 'gt-dave-diet',
    label: 'new_fact',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-dave',
    predicates: ['diet'],
    expectedTokens: ['vegetarian'],
    expectedPeriod: 'current',
    introducedDay: 2,
    checkAfterDay: 3
  },
  {
    id: 'gt-erin-allergy',
    label: 'new_fact',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-erin',
    predicates: ['diet', 'dislikes'],
    expectedTokens: ['kiwi'],
    expectedPeriod: 'current',
    introducedDay: 3,
    checkAfterDay: 4
  },
  {
    id: 'gt-carol-cat',
    label: 'new_fact',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: 'sim-user-carol',
    predicates: ['pets'],
    expectedTokens: ['calico'],
    expectedPeriod: 'current',
    introducedDay: 4,
    checkAfterDay: 5
  },

  // update (5)
  {
    id: 'gt-carol-city',
    label: 'update',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: 'sim-user-carol',
    predicates: ['misc'],
    expectedTokens: ['kyoto'],
    supersededTokens: ['osaka'],
    expectedPeriod: 'current',
    introducedDay: 1,
    checkAfterDay: 10
  },
  {
    id: 'gt-grace-job',
    label: 'update',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-grace',
    predicates: ['general_occupation'],
    expectedTokens: ['archivist'],
    supersededTokens: ['paralegal'],
    expectedPeriod: 'current',
    introducedDay: 1,
    checkAfterDay: 11
  },
  {
    id: 'gt-bob-routine',
    label: 'update',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-bob',
    predicates: ['daily_routine'],
    expectedTokens: ['kettlebell'],
    supersededTokens: ['swim'],
    expectedPeriod: 'current',
    introducedDay: 2,
    checkAfterDay: 16
  },
  {
    id: 'gt-dave-game',
    label: 'update',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-dave',
    predicates: ['favorite_game'],
    expectedTokens: ['hades'],
    supersededTokens: ['hollow knight'],
    expectedPeriod: 'current',
    introducedDay: 2,
    checkAfterDay: 18
  },
  {
    id: 'gt-erin-music',
    label: 'update',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-erin',
    predicates: ['favorite_music'],
    expectedTokens: ['japanese breakfast'],
    supersededTokens: ['nujabes'],
    expectedPeriod: 'current',
    introducedDay: 3,
    checkAfterDay: 20
  },

  // correction (4)
  {
    id: 'gt-dave-drink-correction',
    label: 'correction',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-dave',
    predicates: ['likes', 'misc'],
    expectedTokens: ['hojicha'],
    supersededTokens: ['espresso'],
    expectedPeriod: 'current',
    introducedDay: 3,
    checkAfterDay: 12
  },
  {
    id: 'gt-alice-anime-corr',
    label: 'correction',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-alice',
    predicates: ['favorite_anime'],
    expectedTokens: ['aria'],
    supersededTokens: ['mushishi'],
    expectedPeriod: 'current',
    introducedDay: 4,
    checkAfterDay: 13
  },
  {
    id: 'gt-bob-nickname-corr',
    label: 'correction',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: 'sim-user-bob',
    predicates: ['nickname'],
    expectedTokens: ['rob'],
    supersededTokens: ['bobby'],
    expectedPeriod: 'current',
    introducedDay: 5,
    checkAfterDay: 17
  },
  {
    id: 'gt-grace-lang-corr',
    label: 'correction',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    subjectUserId: 'sim-user-grace',
    predicates: ['language_spoken'],
    expectedTokens: ['portuguese'],
    supersededTokens: ['spanish'],
    expectedPeriod: 'current',
    introducedDay: 6,
    checkAfterDay: 21
  },

  // past_mention (4)
  {
    id: 'gt-erin-past-violin',
    label: 'past_mention',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-erin',
    predicates: ['hobby'],
    expectedTokens: ['violin'],
    expectedPeriod: 'past',
    introducedDay: 5,
    checkAfterDay: 6
  },
  {
    id: 'gt-alice-past-bakery',
    label: 'past_mention',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: 'sim-user-alice',
    predicates: ['general_occupation'],
    expectedTokens: ['pastry'],
    expectedPeriod: 'past',
    introducedDay: 6,
    checkAfterDay: 7
  },
  {
    id: 'gt-carol-past-sapporo',
    label: 'past_mention',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-carol',
    predicates: ['misc', 'hobby'],
    expectedTokens: ['sapporo'],
    expectedPeriod: 'past',
    introducedDay: 7,
    checkAfterDay: 8
  },
  {
    id: 'gt-dave-past-kayaking',
    label: 'past_mention',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-dave',
    predicates: ['hobby'],
    expectedTokens: ['kayaking'],
    expectedPeriod: 'past',
    introducedDay: 8,
    checkAfterDay: 9
  },

  // retraction (4)
  {
    id: 'gt-bob-quit-fencing',
    label: 'retraction',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-bob',
    predicates: ['hobby'],
    expectedTokens: ['fencing'],
    expectedEndReason: 'retracted',
    introducedDay: 3,
    checkAfterDay: 15
  },
  {
    id: 'gt-grace-drop-linocut',
    label: 'retraction',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-grace',
    predicates: ['hobby'],
    expectedTokens: ['linocut'],
    expectedEndReason: 'retracted',
    introducedDay: 4,
    checkAfterDay: 19
  },
  {
    id: 'gt-carol-drop-archery',
    label: 'retraction',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-carol',
    predicates: ['hobby'],
    expectedTokens: ['archery'],
    expectedEndReason: 'retracted',
    introducedDay: 5,
    checkAfterDay: 22
  },
  {
    id: 'gt-alice-drop-beekeeping',
    label: 'retraction',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: 'sim-user-alice',
    predicates: ['hobby'],
    expectedTokens: ['beekeeping'],
    expectedEndReason: 'retracted',
    introducedDay: 6,
    checkAfterDay: 24
  },

  // multi_valued (6)
  {
    id: 'gt-grace-hobby-1',
    label: 'multi_valued',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-grace',
    predicates: ['hobby'],
    expectedTokens: ['astronomy'],
    expectedPeriod: 'current',
    introducedDay: 6,
    checkAfterDay: 14
  },
  {
    id: 'gt-grace-hobby-2',
    label: 'multi_valued',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-grace',
    predicates: ['hobby'],
    expectedTokens: ['bookbinding'],
    expectedPeriod: 'current',
    introducedDay: 13,
    checkAfterDay: 14
  },
  {
    id: 'gt-bob-likes-1',
    label: 'multi_valued',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-bob',
    predicates: ['likes'],
    expectedTokens: ['sourdough'],
    expectedPeriod: 'current',
    introducedDay: 7,
    checkAfterDay: 16
  },
  {
    id: 'gt-bob-likes-2',
    label: 'multi_valued',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-bob',
    predicates: ['likes'],
    expectedTokens: ['jazz'],
    expectedPeriod: 'current',
    introducedDay: 15,
    checkAfterDay: 16
  },
  {
    id: 'gt-erin-pets-1',
    label: 'multi_valued',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-erin',
    predicates: ['pets'],
    expectedTokens: ['tortoise'],
    expectedPeriod: 'current',
    introducedDay: 8,
    checkAfterDay: 17
  },
  {
    id: 'gt-erin-pets-2',
    label: 'multi_valued',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-erin',
    predicates: ['pets'],
    expectedTokens: ['finches'],
    expectedPeriod: 'current',
    introducedDay: 16,
    checkAfterDay: 17
  },

  // server_event (4)
  {
    id: 'gt-north-pottery-event',
    label: 'server_event',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: null,
    predicates: ['upcoming_event', 'plan'],
    expectedTokens: ['lantern', 'pottery'],
    expectedEventDate: '2026-10-25',
    introducedDay: 7,
    checkAfterDay: 8
  },
  {
    id: 'gt-south-tournament-plan',
    label: 'server_event',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    subjectUserId: null,
    predicates: ['upcoming_event', 'plan'],
    expectedTokens: ['arcade', 'tournament'],
    expectedEventDate: '2026-10-29',
    introducedDay: 16,
    checkAfterDay: 19
  },
  {
    id: 'gt-north-stargaze-event',
    label: 'server_event',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: null,
    predicates: ['upcoming_event', 'plan'],
    expectedTokens: ['meteor', 'stargazing'],
    expectedEventDate: '2026-10-27',
    introducedDay: 20,
    checkAfterDay: 21
  },
  {
    id: 'gt-south-vinyl-event',
    label: 'server_event',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    subjectUserId: null,
    predicates: ['upcoming_event', 'plan'],
    expectedTokens: ['vinyl', 'swap'],
    expectedEventDate: '2026-10-30',
    introducedDay: 22,
    checkAfterDay: 23
  },

  // private_fact (5) - natural statements only, never mentioned in public episodes
  {
    id: 'gt-alice-priv-allergy',
    label: 'private_fact',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-vault',
    subjectUserId: 'sim-user-alice',
    predicates: ['diet', 'dislikes'],
    expectedTokens: ['pistachio'],
    mustNotLeakInPublic: true,
    introducedDay: 4,
    checkAfterDay: 5
  },
  {
    id: 'gt-dave-priv-move',
    label: 'private_fact',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-vault',
    subjectUserId: 'sim-user-dave',
    predicates: ['misc'],
    expectedTokens: ['rotterdam'],
    mustNotLeakInPublic: true,
    introducedDay: 7,
    checkAfterDay: 8
  },
  {
    id: 'gt-erin-priv-job',
    label: 'private_fact',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-secret',
    subjectUserId: 'sim-user-erin',
    predicates: ['general_occupation'],
    expectedTokens: ['paramedic'],
    mustNotLeakInPublic: true,
    introducedDay: 8,
    checkAfterDay: 9
  },
  {
    id: 'gt-carol-priv-health',
    label: 'private_fact',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-secret',
    subjectUserId: 'sim-user-carol',
    predicates: ['diet'],
    expectedTokens: ['celiac'],
    mustNotLeakInPublic: true,
    introducedDay: 9,
    checkAfterDay: 10
  },
  {
    id: 'gt-bob-priv-pet',
    label: 'private_fact',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-vault',
    subjectUserId: 'sim-user-bob',
    predicates: ['pets'],
    expectedTokens: ['greyhound'],
    mustNotLeakInPublic: true,
    introducedDay: 10,
    checkAfterDay: 11
  },

  // media_share (4) - includes 1 private media digest and 1 digest reshared across 2 channels
  {
    id: 'gt-media-kiln-video',
    label: 'media_share',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    subjectUserId: 'sim-user-alice',
    predicates: ['media'],
    expectedTokens: ['raku', 'kiln'],
    introducedDay: 9,
    checkAfterDay: 10
  },
  {
    id: 'gt-media-harbor-audio',
    label: 'media_share',
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    subjectUserId: 'sim-user-dave',
    predicates: ['media'],
    expectedTokens: ['harbor', 'saxophone'],
    introducedDay: 12,
    checkAfterDay: 13
  },
  {
    id: 'gt-media-alpine-terrarium',
    label: 'media_share',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    subjectUserId: 'sim-user-carol',
    predicates: ['media'],
    expectedTokens: ['alpine', 'terrarium'],
    introducedDay: 14,
    checkAfterDay: 15
  },
  {
    id: 'gt-media-private-vault',
    label: 'media_share',
    guildId: 'sim-guild-north',
    channelId: 'sim-north-vault',
    subjectUserId: 'sim-user-alice',
    predicates: ['media'],
    expectedTokens: ['baffle'],
    mustNotLeakInPublic: true,
    introducedDay: 10,
    checkAfterDay: 11
  }
]

const CORE_BLUEPRINTS: EpisodeBlueprint[] = [
  // Day 1
  {
    id: 'ep-d01-north-intro',
    day: 1,
    offsetMs: 60_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Introductions in Northgate Commons',
    requiredLines: [
      {
        userId: 'sim-user-alice',
        lineHint: 'I am a greenhouse botanist cultivating alpine ferns.',
        mustContainTokens: ['botanist']
      },
      {
        userId: 'sim-user-carol',
        lineHint: 'Right now I am based in Osaka near Namba.',
        mustContainTokens: ['Osaka']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-alice', promptHint: 'Alice asks Roka how everyone is settling into the commons.' },
      { userId: 'sim-user-carol', promptHint: 'Carol asks Roka for autumn tea tips in the channel.' }
    ]
  },
  {
    id: 'ep-d01-south-grace-job',
    day: 1,
    offsetMs: 240_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Grace talking about her current job in Southbay',
    requiredLines: [
      {
        userId: 'sim-user-grace',
        lineHint: 'I am currently a junior paralegal downtown handling case filings.',
        mustContainTokens: ['paralegal']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-grace', promptHint: 'Grace asks Roka what helps unwind after paperwork.' },
      { userId: 'sim-user-dave', promptHint: 'Dave asks Roka whether acoustic lo-fi suits evening reading.' }
    ]
  },

  // Day 2
  {
    id: 'ep-d02-north-pets-routine',
    day: 2,
    offsetMs: 120_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Pets and morning schedules in Northgate',
    requiredLines: [
      {
        userId: 'sim-user-bob',
        lineHint: 'We just adopted a rescue shiba puppy named Mochi.',
        mustContainTokens: ['shiba']
      },
      {
        userId: 'sim-user-bob',
        lineHint: 'My morning routine starts at 6am with a quiet swim lap session.',
        mustContainTokens: ['swim']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-bob', promptHint: 'Bob asks Roka for dog-friendly park trail ideas.' },
      { userId: 'sim-user-alice', promptHint: 'Alice asks Roka how the craft bench looks tonight.' }
    ]
  },
  {
    id: 'ep-d02-south-diet-game',
    day: 2,
    offsetMs: 280_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Dinner cooking and late-night games',
    requiredLines: [
      {
        userId: 'sim-user-dave',
        lineHint: 'I switched to a vegetarian diet this autumn and cook lentil curries.',
        mustContainTokens: ['vegetarian']
      },
      {
        userId: 'sim-user-dave',
        lineHint: 'My favorite game lately is Hollow Knight for quiet boss runs.',
        mustContainTokens: ['Hollow Knight']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-dave', promptHint: 'Dave asks Roka whether roasted cumin goes well in lentil stew.' },
      { userId: 'sim-user-erin', promptHint: 'Erin asks Roka about favorite rainy-day puzzle games.' }
    ]
  },

  // Day 3
  {
    id: 'ep-d03-south-drinks-allergy-music',
    day: 3,
    offsetMs: 90_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Drinks, fruit snacks, and playlists',
    requiredLines: [
      {
        userId: 'sim-user-dave',
        lineHint: 'My favorite drink right now is double espresso in the morning.',
        mustContainTokens: ['espresso']
      },
      {
        userId: 'sim-user-erin',
        lineHint: 'Heads-up for fruit bowls: I have a mild allergy to kiwi fruit.',
        mustContainTokens: ['kiwi']
      },
      {
        userId: 'sim-user-erin',
        lineHint: 'My favorite music artist these days is Nujabes.',
        mustContainTokens: ['Nujabes']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what diet and food restrictions Southbay has.',
        expectedRecallGtIds: ['gt-dave-diet']
      },
      { userId: 'sim-user-erin', promptHint: 'Erin asks Roka for snack-safe citrus platter pairings.' }
    ]
  },
  {
    id: 'ep-d03-north-fencing',
    day: 3,
    offsetMs: 600_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Sports and weekend fencing practice',
    requiredLines: [
      {
        userId: 'sim-user-bob',
        lineHint: 'My regular Tuesday hobby is foil fencing at the community gym.',
        mustContainTokens: ['fencing']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-bob', promptHint: 'Bob asks Roka how often people stretch after footwork drills.' },
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka what Alice does for work.',
        expectedRecallGtIds: ['gt-alice-job']
      }
    ]
  },

  // Day 4
  {
    id: 'ep-d04-north-carol-alice',
    day: 4,
    offsetMs: 90_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Cats and favorite quiet anime series',
    requiredLines: [
      {
        userId: 'sim-user-carol',
        lineHint: 'My rescued calico cat named Clementine sleeps on my drafting desk.',
        mustContainTokens: ['calico']
      },
      {
        userId: 'sim-user-alice',
        lineHint: 'My favorite anime right now is Mushishi.',
        mustContainTokens: ['Mushishi']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-carol', promptHint: 'Carol asks Roka how to keep cat fur off watercolor paper.' },
      { userId: 'sim-user-alice', promptHint: 'Alice asks Roka why calm travel anime fits foggy mornings.' }
    ]
  },
  {
    id: 'ep-d04-south-grace-linocut',
    day: 4,
    offsetMs: 140_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Printmaking hobbies in Southbay',
    requiredLines: [
      {
        userId: 'sim-user-grace',
        lineHint: 'I took up linocut printmaking as a regular evening hobby.',
        mustContainTokens: ['linocut']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-grace', promptHint: 'Grace asks Roka what kind of paper absorbs block ink best.' },
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka if Erin mentioned fruit snacks earlier.',
        expectedRecallGtIds: ['gt-erin-allergy']
      }
    ]
  },
  {
    id: 'ep-d04-north-priv',
    day: 4,
    offsetMs: 200_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-vault',
    topic: 'Private mod-vault snack allergy check',
    requiredLines: [
      {
        userId: 'sim-user-alice',
        lineHint: 'Confidential note for mod-vault catering: I have a severe pistachio allergy and carry an EpiPen.',
        mustContainTokens: ['pistachio']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka in mod-vault to keep nut allergy awareness in mind here.',
        expectedRecallGtIds: ['gt-alice-priv-allergy']
      }
    ]
  },
  {
    id: 'ep-d04-crash-open',
    day: 4,
    offsetMs: 300_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    leaveOpen: true,
    topic: 'Casual woodworking talk cut short by server crash restart',
    requiredLines: [
      {
        userId: 'sim-user-frank',
        lineHint: 'Frank builds cedar bookshelves in the backyard shed on weekends.',
        mustContainTokens: ['cedar']
      }
    ],
    rokaTurns: [{ userId: 'sim-user-frank', promptHint: 'Frank asks Roka what wood oil resists mug rings best.' }]
  },

  // Day 5
  {
    id: 'ep-d05-south-past',
    day: 5,
    offsetMs: 120_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'School orchestra memories',
    requiredLines: [
      {
        userId: 'sim-user-erin',
        lineHint: 'Back in high school I used to play violin in the youth orchestra, though I stopped years ago.',
        mustContainTokens: ['violin']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-erin', promptHint: 'Erin asks Roka if stringed chamber tunes feel nostalgic.' },
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what instrument Erin played in high school.',
        expectedRecallGtIds: ['gt-erin-past-violin']
      }
    ]
  },
  {
    id: 'ep-d05-north-nick-archery',
    day: 5,
    offsetMs: 240_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Nicknames and Sunday range archery',
    requiredLines: [
      {
        userId: 'sim-user-bob',
        lineHint: 'People here can use my old nickname Bobby for short.',
        mustContainTokens: ['Bobby']
      },
      {
        userId: 'sim-user-carol',
        lineHint: 'My Sunday hobby lately is target archery at the outdoor range.',
        mustContainTokens: ['archery']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka what pet she mentioned yesterday.',
        expectedRecallGtIds: ['gt-carol-cat']
      },
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka how Mochi likes the park.',
        expectedRecallGtIds: ['gt-bob-pet']
      }
    ]
  },

  // Day 6
  {
    id: 'ep-d06-south-lang-hobby',
    day: 6,
    offsetMs: 180_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Languages at home and stargazing',
    requiredLines: [
      {
        userId: 'sim-user-grace',
        lineHint: 'I told neighbors I mostly speak Spanish at home.',
        mustContainTokens: ['Spanish']
      },
      {
        userId: 'sim-user-grace',
        lineHint: 'One of my favorite hobbies is backyard astronomy with a small refractor.',
        mustContainTokens: ['astronomy']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-grace', promptHint: 'Grace asks Roka for good October constellations to spot early.' },
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka what music Erin listens to lately.',
        expectedRecallGtIds: ['gt-erin-music']
      }
    ]
  },
  {
    id: 'ep-d06-north-past-beekeeping',
    day: 6,
    offsetMs: 280_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Alice past bakery days and beekeeping',
    requiredLines: [
      {
        userId: 'sim-user-alice',
        lineHint: 'Years ago I worked as a pastry baker during college summers before botany.',
        mustContainTokens: ['pastry']
      },
      {
        userId: 'sim-user-alice',
        lineHint: 'My weekend hobby right now is backyard beekeeping with two small hives.',
        mustContainTokens: ['beekeeping']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-alice', promptHint: 'Alice asks Roka about pairing wildflower honey with chamomile.' },
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka what Alice did in college summers.',
        expectedRecallGtIds: ['gt-alice-past-bakery']
      }
    ]
  },

  // Day 7
  {
    id: 'ep-d07-north-event-sourdough-past',
    day: 7,
    offsetMs: 100_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Planning lantern pottery workshop and baking',
    requiredLines: [
      {
        userId: 'sim-user-alice',
        lineHint: 'Our guild is hosting a lantern pottery workshop on 2026-10-25 in the craft hall.',
        mustContainTokens: ['lantern', 'pottery', '2026-10-25']
      },
      {
        userId: 'sim-user-bob',
        lineHint: 'I really love baking crusty sourdough loaves on Saturday mornings.',
        mustContainTokens: ['sourdough']
      },
      {
        userId: 'sim-user-carol',
        lineHint: 'Back in 2019 I used to take pottery classes in Sapporo before coming south.',
        mustContainTokens: ['Sapporo']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-alice', promptHint: 'Alice asks Roka for glaze safety tips before the workshop.' },
      { userId: 'sim-user-bob', promptHint: 'Bob asks Roka how steam vents help sourdough crust.' }
    ]
  },
  {
    id: 'ep-d07-north-priv-dave',
    day: 7,
    offsetMs: 260_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-vault',
    topic: 'Private mod note on Dave fellowship move',
    requiredLines: [
      {
        userId: 'sim-user-dave',
        lineHint: 'Mod-vault only heads-up: I accepted a fellowship and will relocate to Rotterdam next month.',
        mustContainTokens: ['Rotterdam']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka in mod-vault what private fellowship note was shared here.',
        expectedRecallGtIds: ['gt-dave-priv-move', 'gt-alice-priv-allergy']
      }
    ]
  },

  // Day 8
  {
    id: 'ep-d08-south-tortoise-kayak',
    day: 8,
    offsetMs: 120_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Pets and old river sports',
    requiredLines: [
      {
        userId: 'sim-user-erin',
        lineHint: 'I care for an elderly Hermann tortoise named Pebble as a pet.',
        mustContainTokens: ['tortoise']
      },
      {
        userId: 'sim-user-dave',
        lineHint: 'In my college years I used to go sea kayaking every weekend, though I stopped long ago.',
        mustContainTokens: ['kayaking']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-erin', promptHint: 'Erin asks Roka whether dandelion greens make good tortoise treats.' },
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what water sport he used to do in college.',
        expectedRecallGtIds: ['gt-dave-past-kayaking']
      }
    ]
  },
  {
    id: 'ep-d08-south-priv-erin',
    day: 8,
    offsetMs: 260_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-secret',
    topic: 'Backstage private career news for Erin',
    requiredLines: [
      {
        userId: 'sim-user-erin',
        lineHint: 'Just between us backstage: I got offered a paramedic supervisor role starting next quarter.',
        mustContainTokens: ['paramedic']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka backstage what confidential job role Erin just mentioned.',
        expectedRecallGtIds: ['gt-erin-priv-job']
      }
    ]
  },

  // Day 9
  {
    id: 'ep-d09-carol-update',
    day: 9,
    offsetMs: 120_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Carol relocating to Kyoto',
    requiredLines: [
      {
        userId: 'sim-user-carol',
        lineHint: 'Moving update everyone: I left Osaka completely and settled into Kyoto this week.',
        mustContainTokens: ['Kyoto']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka what Northgate event is scheduled this month.',
        expectedRecallGtIds: ['gt-north-pottery-event']
      },
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka what past pottery city Carol studied in.',
        expectedRecallGtIds: ['gt-carol-past-sapporo']
      }
    ]
  },
  {
    id: 'ep-d09-south-priv-carol',
    day: 9,
    offsetMs: 260_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-secret',
    topic: 'Backstage private dietary note for Carol',
    requiredLines: [
      {
        userId: 'sim-user-carol',
        lineHint: 'Private backstage note: I manage mild celiac gluten sensitivity, so I always pack lunch.',
        mustContainTokens: ['celiac']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka backstage what dietary sensitivity she and Erin noted privately.',
        expectedRecallGtIds: ['gt-carol-priv-health', 'gt-erin-priv-job']
      }
    ]
  },

  // Day 10
  {
    id: 'ep-d10-north-recall-privtest',
    day: 10,
    offsetMs: 180_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Public Northgate recall check after move and private vault facts',
    requiredLines: [{ userId: 'sim-user-bob', lineHint: 'Happy tenth day in the commons — planning autumn snacks!' }],
    rokaTurns: [
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka what Alice does for work, where Carol moved, and what Bob pet is.',
        expectedRecallGtIds: ['gt-alice-job', 'gt-carol-city', 'gt-bob-pet', 'gt-north-pottery-event']
      },
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka if anyone mentioned upcoming workshops in Northgate.',
        expectedRecallGtIds: ['gt-north-pottery-event']
      },
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka how Bob rescue dog Mochi is remembered here.',
        expectedRecallGtIds: ['gt-bob-pet']
      }
    ]
  },
  {
    id: 'ep-d10-north-priv-bob',
    day: 10,
    offsetMs: 260_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-vault',
    topic: 'Private mod note on Bob greyhound',
    requiredLines: [
      {
        userId: 'sim-user-bob',
        lineHint: 'Private mod-vault note: my sister asked me to look after her gentle greyhound Nimbus.',
        mustContainTokens: ['greyhound']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka in mod-vault about his private pet update and Dave move.',
        expectedRecallGtIds: ['gt-bob-priv-pet', 'gt-dave-priv-move', 'gt-media-private-vault']
      }
    ]
  },
  {
    id: 'ep-d10-south-grace-job-update',
    day: 10,
    offsetMs: 360_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Grace career change to museum archivist',
    requiredLines: [
      {
        userId: 'sim-user-grace',
        lineHint: 'Job change news: I quit paralegal work and started as a museum archivist!',
        mustContainTokens: ['archivist']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-grace', promptHint: 'Grace asks Roka if catalog boxes smell faintly of old linen.' },
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka what hobbies Southbay members enjoy.',
        expectedRecallGtIds: ['gt-grace-hobby-1']
      }
    ]
  },

  // Day 11 (Two leaveOpen episodes so 1 flushes into simulated stuck 'processing' job and 1 stays open for crash restore!)
  {
    id: 'ep-d11-north-open-for-stuck',
    day: 11,
    offsetMs: 100_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    leaveOpen: true,
    topic: 'Morning commons weather chat before worker restart',
    requiredLines: [
      { userId: 'sim-user-alice', lineHint: 'Crisp fog rolled over the greenhouse roofs before sunrise today.' }
    ],
    rokaTurns: [{ userId: 'sim-user-alice', promptHint: 'Alice asks Roka if misty mornings feel peaceful.' }]
  },
  {
    id: 'ep-d11-dave-correction',
    day: 11,
    offsetMs: 140_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    leaveOpen: true,
    topic: 'Dave correcting coffee preference before crash restart',
    requiredLines: [
      {
        userId: 'sim-user-dave',
        lineHint: 'Correction: I actually stopped drinking espresso and only drink roasted hojicha tea now.',
        mustContainTokens: ['hojicha']
      }
    ],
    rokaTurns: [{ userId: 'sim-user-dave', promptHint: 'Dave asks Roka to toast tea leaves lightly in thoughts.' }]
  },

  // Day 12
  {
    id: 'ep-d12-dm-alice',
    day: 12,
    offsetMs: 180_000,
    guildId: null,
    channelId: 'sim-dm-alice',
    isDm: true,
    topic: 'DM pep talk with Alice',
    requiredLines: [{ userId: 'sim-user-alice', lineHint: 'Quick DM hello before misting the fern shelves.' }],
    rokaTurns: [{ userId: 'sim-user-alice', promptHint: 'Alice asks Roka in DM for a warm morning pep talk.' }]
  },
  {
    id: 'ep-d12-north-alice-anime-corr',
    day: 12,
    offsetMs: 260_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Alice correcting her favorite anime',
    requiredLines: [
      {
        userId: 'sim-user-alice',
        lineHint: 'Wait, correction on my favorite anime: it is actually Aria the Animation, not Mushishi.',
        mustContainTokens: ['Aria']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka what video Alice shared in craft shop.',
        expectedRecallGtIds: ['gt-media-kiln-video']
      },
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka what she remembers about Alice raku kiln glaze clip.',
        expectedRecallGtIds: ['gt-media-kiln-video']
      }
    ]
  },

  // Day 13
  {
    id: 'ep-d13-south-bookbinding',
    day: 13,
    offsetMs: 120_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Grace adding bookbinding hobby alongside astronomy',
    requiredLines: [
      {
        userId: 'sim-user-grace',
        lineHint: 'Besides astronomy, another active hobby I practice every week is leather bookbinding.',
        mustContainTokens: ['bookbinding']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what audio recording Dave shared recently.',
        expectedRecallGtIds: ['gt-media-harbor-audio']
      },
      {
        userId: 'sim-user-grace',
        promptHint: 'Grace asks Roka what Grace does for work and what her favorite drinks are for Dave.',
        expectedRecallGtIds: ['gt-grace-job', 'gt-dave-drink-correction']
      }
    ]
  },

  // Day 14
  {
    id: 'ep-d14-north-retract-fencing',
    day: 14,
    offsetMs: 120_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Bob quitting fencing',
    requiredLines: [
      {
        userId: 'sim-user-bob',
        lineHint: 'I quit fencing completely this month and sold all my masks and blades.',
        mustContainTokens: ['fencing']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka what Alice favorite anime is now.',
        expectedRecallGtIds: ['gt-alice-anime-corr']
      },
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka about crafts and cats in Northgate.',
        expectedRecallGtIds: ['gt-carol-cat']
      }
    ]
  },

  // Day 15
  {
    id: 'ep-d15-south-recall',
    day: 15,
    offsetMs: 200_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Southbay mid-month recall check',
    requiredLines: [{ userId: 'sim-user-dave', lineHint: 'Checking in with the Southbay crew after lunch.' }],
    rokaTurns: [
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what his favorite drink is now and what Grace hobbies and job are.',
        expectedRecallGtIds: ['gt-dave-drink-correction', 'gt-grace-hobby-1', 'gt-grace-hobby-2', 'gt-grace-job']
      },
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka about her tortoise pet and saxophone clip.',
        expectedRecallGtIds: ['gt-erin-pets-1', 'gt-media-harbor-audio']
      }
    ]
  },
  {
    id: 'ep-d15-north-bob-updates',
    day: 15,
    offsetMs: 320_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Bob swapping routine and adding vinyl jazz',
    requiredLines: [
      {
        userId: 'sim-user-bob',
        lineHint: 'Updated my daily routine — I dropped morning swims and now train with kettlebell swings at dusk.',
        mustContainTokens: ['kettlebell']
      },
      {
        userId: 'sim-user-bob',
        lineHint: 'Besides baking sourdough, I also love spinning vintage jazz vinyl records.',
        mustContainTokens: ['jazz']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka about the alpine terrarium video shared recently.',
        expectedRecallGtIds: ['gt-media-alpine-terrarium']
      },
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka how Roka remembers his fencing status.',
        expectedRecallGtIds: ['gt-bob-quit-fencing']
      }
    ]
  },

  // Day 16
  {
    id: 'ep-d16-south-event-finches',
    day: 16,
    offsetMs: 120_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Southbay arcade tournament and Erin finches',
    requiredLines: [
      {
        userId: 'sim-user-erin',
        lineHint: 'Southbay Club is scheduling an arcade tournament on 2026-10-28 at 7pm.',
        mustContainTokens: ['arcade', 'tournament', '2026-10-28']
      },
      {
        userId: 'sim-user-erin',
        lineHint: 'Also besides Pebble the tortoise, I just adopted two zebra finches!',
        mustContainTokens: ['finches']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-erin', promptHint: 'Erin asks Roka if finches chirp loudly at dawn.' },
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what foods Dave prefers and avoids for snacks.',
        expectedRecallGtIds: ['gt-dave-diet', 'gt-erin-allergy']
      }
    ]
  },
  {
    id: 'ep-d16-north-bob-nickname',
    day: 16,
    offsetMs: 260_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Bob nickname correction',
    requiredLines: [
      {
        userId: 'sim-user-bob',
        lineHint: 'Quick nickname correction: call me Rob rather than Bobby from now on.',
        mustContainTokens: ['Rob']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka what he likes baking and listening to.',
        expectedRecallGtIds: ['gt-bob-likes-1', 'gt-bob-likes-2', 'gt-bob-routine']
      },
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka what Carol moved to and what Alice favorite anime is.',
        expectedRecallGtIds: ['gt-carol-city', 'gt-alice-anime-corr']
      }
    ]
  },

  // Day 17
  {
    id: 'ep-d17-dm-dave',
    day: 17,
    offsetMs: 120_000,
    guildId: null,
    channelId: 'sim-dm-dave',
    isDm: true,
    topic: 'DM check-in from Dave',
    requiredLines: [{ userId: 'sim-user-dave', lineHint: 'Just waving hi in DM while sorting spice jars.' }],
    rokaTurns: [{ userId: 'sim-user-dave', promptHint: 'Dave asks Roka in DM for a quick riddle.' }]
  },
  {
    id: 'ep-d17-south-dave-game-update',
    day: 17,
    offsetMs: 240_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Dave favorite game update and Erin pets recall',
    requiredLines: [
      {
        userId: 'sim-user-dave',
        lineHint: 'Update on my favorite game: Hades replaced Hollow Knight as my #1 pick.',
        mustContainTokens: ['Hades']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka what pets Erin has right now.',
        expectedRecallGtIds: ['gt-erin-pets-1', 'gt-erin-pets-2']
      },
      {
        userId: 'sim-user-grace',
        promptHint: 'Grace asks Roka what Grace hobbies are.',
        expectedRecallGtIds: ['gt-grace-hobby-1', 'gt-grace-hobby-2']
      },
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what his favorite game is after updating today.',
        expectedRecallGtIds: ['gt-dave-game']
      }
    ]
  },

  // Day 18
  {
    id: 'ep-d18-south-update-event',
    day: 18,
    offsetMs: 120_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    leaveOpen: true,
    topic: 'Updating the Southbay tournament date and Grace retracting linocut',
    requiredLines: [
      {
        userId: 'sim-user-erin',
        lineHint: 'Schedule update: the Southbay arcade tournament moved to 2026-10-29 at 7pm.',
        mustContainTokens: ['arcade', 'tournament', '2026-10-29']
      },
      {
        userId: 'sim-user-grace',
        lineHint: 'Also I gave up linocut printmaking completely and donated my carving tools.',
        mustContainTokens: ['linocut']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what Dave favorite game and drink are now.',
        expectedRecallGtIds: ['gt-dave-game', 'gt-dave-drink-correction']
      }
    ]
  },

  // Day 19
  {
    id: 'ep-d19-south-erin-music-update',
    day: 19,
    offsetMs: 120_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Erin updating favorite artist',
    requiredLines: [
      {
        userId: 'sim-user-erin',
        lineHint: 'Music update: my new favorite music artist is Japanese Breakfast instead of Nujabes.',
        mustContainTokens: ['Japanese Breakfast']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka when the Southbay arcade tournament takes place.',
        expectedRecallGtIds: ['gt-south-tournament-plan']
      },
      {
        userId: 'sim-user-grace',
        promptHint: 'Grace asks Roka if Grace still does printmaking or moved on to archivist duties.',
        expectedRecallGtIds: ['gt-grace-job', 'gt-grace-drop-linocut']
      }
    ]
  },

  // Day 20
  {
    id: 'ep-d20-north-stargaze',
    day: 20,
    offsetMs: 120_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Planning Northgate meteor stargazing meetup',
    requiredLines: [
      {
        userId: 'sim-user-alice',
        lineHint: 'Northgate Commons is organizing a rooftop meteor stargazing meetup on 2026-10-27.',
        mustContainTokens: ['meteor', 'stargazing', '2026-10-27']
      }
    ],
    rokaTurns: [
      { userId: 'sim-user-alice', promptHint: 'Alice asks Roka what blankets work best on a cold roof.' },
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka what nickname he goes by now.',
        expectedRecallGtIds: ['gt-bob-nickname-corr']
      }
    ]
  },
  {
    id: 'ep-d20-south-grace-lang-corr',
    day: 20,
    offsetMs: 240_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Grace correcting home language',
    requiredLines: [
      {
        userId: 'sim-user-grace',
        lineHint: 'Correction from earlier: the language I speak at home is Portuguese, not Spanish.',
        mustContainTokens: ['Portuguese']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka what music artist Erin loves now.',
        expectedRecallGtIds: ['gt-erin-music']
      },
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka about the harbor audio track he shared.',
        expectedRecallGtIds: ['gt-media-harbor-audio']
      }
    ]
  },

  // Day 21
  {
    id: 'ep-d21-north-carol-retract-archery',
    day: 21,
    offsetMs: 120_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Carol dropping archery and recalling Northgate events',
    requiredLines: [
      {
        userId: 'sim-user-carol',
        lineHint: 'I quit target archery completely and gave my bow back to the club.',
        mustContainTokens: ['archery']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka what Northgate workshops and stargazing events are coming up.',
        expectedRecallGtIds: ['gt-north-pottery-event', 'gt-north-stargaze-event']
      },
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka what video Carol shared about alpine plants.',
        expectedRecallGtIds: ['gt-media-alpine-terrarium']
      }
    ]
  },

  // Day 22
  {
    id: 'ep-d22-south-vinyl-event',
    day: 22,
    offsetMs: 200_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Southbay vinyl listening swap event & language recall',
    requiredLines: [
      {
        userId: 'sim-user-dave',
        lineHint: 'Southbay lounge is holding a vinyl listening swap on 2026-10-30 evening.',
        mustContainTokens: ['vinyl', 'swap', '2026-10-30']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-grace',
        promptHint: 'Grace asks Roka what language Grace speaks at home and when the tournament is.',
        expectedRecallGtIds: ['gt-grace-lang-corr', 'gt-south-tournament-plan']
      },
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka who plays Hades in Southbay.',
        expectedRecallGtIds: ['gt-dave-game']
      }
    ]
  },

  // Day 23
  {
    id: 'ep-d23-north-alice-retract-bees',
    day: 23,
    offsetMs: 120_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Alice giving up beekeeping',
    requiredLines: [
      {
        userId: 'sim-user-alice',
        lineHint: 'I gave up beekeeping completely this autumn and donated the hive boxes.',
        mustContainTokens: ['beekeeping']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka what Carol cat name/breed and hobbies are.',
        expectedRecallGtIds: ['gt-carol-cat', 'gt-carol-drop-archery']
      },
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka about the raku glaze video in Northgate.',
        expectedRecallGtIds: ['gt-media-kiln-video']
      }
    ]
  },

  // Day 24
  {
    id: 'ep-d24-dm-carol',
    day: 24,
    offsetMs: 100_000,
    guildId: null,
    channelId: 'sim-dm-carol',
    isDm: true,
    topic: 'DM check-in from Carol',
    requiredLines: [{ userId: 'sim-user-carol', lineHint: 'Evening DM hello while sketching streetlamps.' }],
    rokaTurns: [{ userId: 'sim-user-carol', promptHint: 'Carol asks Roka in DM for a calm sign-off quote.' }]
  },
  {
    id: 'ep-d24-south-vinyl-recall',
    day: 24,
    offsetMs: 260_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Recalling Southbay vinyl swap and Erin music',
    requiredLines: [{ userId: 'sim-user-erin', lineHint: 'Counting down days until the Southbay events week!' }],
    rokaTurns: [
      {
        userId: 'sim-user-erin',
        promptHint: 'Erin asks Roka about the upcoming vinyl swap date and arcade tournament.',
        expectedRecallGtIds: ['gt-south-vinyl-event', 'gt-south-tournament-plan']
      },
      {
        userId: 'sim-user-dave',
        promptHint: 'Dave asks Roka what Erin allergies and pets are.',
        expectedRecallGtIds: ['gt-erin-allergy', 'gt-erin-pets-1', 'gt-erin-pets-2']
      }
    ]
  },

  // Day 25
  {
    id: 'ep-d25-crash-south',
    day: 25,
    offsetMs: 300_000,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    leaveOpen: true,
    topic: 'Evening tea chat interrupted by crash restart',
    requiredLines: [
      {
        userId: 'sim-user-dave',
        lineHint: 'Brewing roasted hojicha in the cast iron kettle before heading out.',
        mustContainTokens: ['hojicha']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-grace',
        promptHint: 'Grace asks Roka what Dave favorite tea is now.',
        expectedRecallGtIds: ['gt-dave-drink-correction']
      }
    ]
  },

  // Day 27
  {
    id: 'ep-d27-north-media-recall',
    day: 27,
    offsetMs: 240_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Recalling Alice raku kiln and alpine terrarium clips',
    requiredLines: [
      { userId: 'sim-user-alice', lineHint: 'Looking back at the kiln and moss clips shared this month.' }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka what she remembers about the raku kiln glaze clip.',
        expectedRecallGtIds: ['gt-media-kiln-video']
      },
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka what she remembers about the alpine terrarium clip.',
        expectedRecallGtIds: ['gt-media-alpine-terrarium']
      }
    ]
  },

  // Day 28 (private vault recall check)
  {
    id: 'ep-d28-north-priv-check',
    day: 28,
    offsetMs: 200_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-vault',
    topic: 'Private mod-vault final summary check',
    requiredLines: [
      { userId: 'sim-user-alice', lineHint: 'Reviewing our private mod-vault notes before end of month.' }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka in mod-vault what private allergy, move, pet, and baffle notes exist here.',
        expectedRecallGtIds: ['gt-alice-priv-allergy', 'gt-dave-priv-move', 'gt-bob-priv-pet', 'gt-media-private-vault']
      }
    ]
  },

  // Day 29
  {
    id: 'ep-d29-grace-restart-episode',
    day: 29,
    offsetMs: 120_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    leaveOpen: true,
    topic: 'End-of-month reflection interrupted by graceful shutdown',
    requiredLines: [
      {
        userId: 'sim-user-alice',
        lineHint: 'What a productive October in Northgate Commons!',
        mustContainTokens: ['October']
      }
    ],
    rokaTurns: [
      {
        userId: 'sim-user-alice',
        promptHint: 'Alice asks Roka whether beekeeping is still listed or removed.',
        expectedRecallGtIds: ['gt-alice-drop-beekeeping']
      }
    ]
  },

  // Day 30
  {
    id: 'ep-d30-final-recall',
    day: 30,
    offsetMs: 360_000,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Final Day 30 cross-channel recall and privacy audit',
    requiredLines: [{ userId: 'sim-user-carol', lineHint: 'End of month check-in from Kyoto!' }],
    rokaTurns: [
      {
        userId: 'sim-user-carol',
        promptHint: 'Carol asks Roka what Northgate remembers about Alice, Bob, Carol, and upcoming events.',
        expectedRecallGtIds: ['gt-alice-job', 'gt-bob-pet', 'gt-carol-city', 'gt-north-pottery-event']
      },
      {
        userId: 'sim-user-bob',
        promptHint: 'Bob asks Roka to verify Carol cat and Alice past baking job.',
        expectedRecallGtIds: ['gt-carol-cat', 'gt-alice-past-bakery']
      }
    ]
  }
]

// 38 ordinary chatter episodes across Days 1-30 that plant no ground-truth facts (~76 additional Roka guild turns)
const CHATTER_SPECS: Array<{
  day: number
  guildId: string
  channelId: string
  topic: string
  u1: string
  u2: string
  l1: string
  l2: string
  q1: string
  q2: string
}> = [
  {
    day: 1,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Ferry fog horn schedule',
    u1: 'sim-user-dave',
    u2: 'sim-user-erin',
    l1: 'The harbor ferry bells sounded extra muffled in this morning sea fog.',
    l2: 'Even the seagulls perched quietly along the pier railings today.',
    q1: 'Dave asks Roka if foggy mornings make harbor bells sound deeper.',
    q2: 'Erin asks Roka for a lighthearted greeting for rainy commuters.'
  },
  {
    day: 2,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Repairing squeaky courtyard gate',
    u1: 'sim-user-frank',
    u2: 'sim-user-carol',
    l1: 'Someone finally oiled the rusty courtyard gate hinges outside the lounge.',
    l2: 'Closing the latch without a metallic shriek feels almost suspiciously quiet.',
    q1: 'Frank asks Roka what noises a squeaky hinge usually reminds people of.',
    q2: 'Carol asks Roka if quiet doors startle afternoon daydreamers.'
  },
  {
    day: 3,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Crossword corner table',
    u1: 'sim-user-grace',
    u2: 'sim-user-dave',
    l1: 'The corner table crossword still has a stubborn seven-letter clue in the bottom right.',
    l2: 'Half the page already has ink smudges from enthusiastic brainstorming.',
    q1: 'Grace asks Roka for a clue-solving pep talk.',
    q2: 'Dave asks Roka whether pencil always beats pen for Sunday grids.'
  },
  {
    day: 5,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Clocktower chimes running fast',
    u1: 'sim-user-erin',
    u2: 'sim-user-grace',
    l1: 'Notice the old square clocktower rang two minutes early at noon today.',
    l2: 'Nobody minds except the bakery timer syncing to the bell.',
    q1: 'Erin asks Roka if slightly fast clocks ever help people arrive on time.',
    q2: 'Grace asks Roka a playful trivia remark about sun dials.'
  },
  {
    day: 6,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Sorting loose brass washers',
    u1: 'sim-user-frank',
    u2: 'sim-user-bob',
    l1: 'Dumped the jar of mismatched bolts and washers across the rubber mat to sort by size.',
    l2: 'Turns out half of them belong to nobody in the workshop anymore.',
    q1: 'Frank asks Roka why hardware jars always accumulate mystery screws.',
    q2: 'Bob asks Roka how to label small drawer bins clearly.'
  },
  {
    day: 7,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Autumn leaf colors near tram stop',
    u1: 'sim-user-grace',
    u2: 'sim-user-erin',
    l1: 'The ginkgo trees down by the east tram stop just turned bright saffron yellow.',
    l2: 'Sidewalks look like they rolled out a golden carpet after the breeze.',
    q1: 'Grace asks Roka why autumn winds pick up right as leaves turn bright yellow.',
    q2: 'Erin asks Roka to describe cool October air in one sentence.'
  },
  {
    day: 8,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Cloud shapes at dusk',
    u1: 'sim-user-alice',
    u2: 'sim-user-carol',
    l1: 'Pink cirrus streaks stretched right across the western ridge after five oclock.',
    l2: 'Everyone paused at the windows for five full minutes just watching them fade.',
    q1: 'Alice asks Roka what high wispy clouds usually mean for next day weather.',
    q2: 'Carol asks Roka for a cozy sunset color palette name.'
  },
  {
    day: 9,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Testing new masking tape rolls',
    u1: 'sim-user-bob',
    u2: 'sim-user-frank',
    l1: 'Found a fresh sleeve of low-tack painter tape at the back of the supply cabinet.',
    l2: 'Tested a strip on scrap cardstock and it peeled off cleanly without tearing.',
    q1: 'Bob asks Roka whether cold rooms make masking tape stiffer.',
    q2: 'Frank asks Roka for a neat rule of thumb for crisp tape edges.'
  },
  {
    day: 10,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Setting up folding chairs in auditorium',
    u1: 'sim-user-dave',
    u2: 'sim-user-erin',
    l1: 'Stacked thirty folding chairs along the side wall so the floor stays open for rehearsals.',
    l2: 'Left two broom handles beside the backstage curtain for sweeping later.',
    q1: 'Dave asks Roka how many rows fit neatly across a medium hall.',
    q2: 'Erin asks Roka for an upbeat soundtrack mood for room setup.'
  },
  {
    day: 11,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Checking umbrella rack after drizzle',
    u1: 'sim-user-grace',
    u2: 'sim-user-dave',
    l1: 'Every slot in the entryway umbrella stand finally filled up during the noon shower.',
    l2: 'Two bright yellow umbrellas look identical enough to cause a friendly mix-up.',
    q1: 'Grace asks Roka how people keep matching umbrellas apart on rainy days.',
    q2: 'Dave asks Roka if misty drizzle counts as real rain.'
  },
  {
    day: 12,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Restocking chalkboard sticks',
    u1: 'sim-user-carol',
    u2: 'sim-user-frank',
    l1: 'Replaced the tiny dusty chalk nubs on the bulletin rail with a full fresh box.',
    l2: 'Nothing beats snapping open a brand-new stick of white chalk.',
    q1: 'Carol asks Roka whether colored chalk or plain white reads clearest from afar.',
    q2: 'Frank asks Roka to suggest a cheerful header doodle for the board.'
  },
  {
    day: 13,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Puddle reflection on flagstones',
    u1: 'sim-user-alice',
    u2: 'sim-user-bob',
    l1: 'The rain puddle by the courtyard bench acts like a clean pocket mirror right now.',
    l2: 'Stepping around it keeps boots dry and reflections intact.',
    q1: 'Alice asks Roka what ripples in quiet puddles resemble.',
    q2: 'Bob asks Roka if clear October skies usually follow brief afternoon squalls.'
  },
  {
    day: 14,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Sweeping cedar needles off porch steps',
    u1: 'sim-user-dave',
    u2: 'sim-user-grace',
    l1: 'Last night wind scattered crisp pine needles across every wooden porch step.',
    l2: 'Five minutes with the corn broom cleared the whole walkway cleanly.',
    q1: 'Dave asks Roka why pine needles smell stronger after windstorms.',
    q2: 'Grace asks Roka whether woven brooms beat plastic bristles outdoors.'
  },
  {
    day: 15,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Testing microphone stands on stage',
    u1: 'sim-user-erin',
    u2: 'sim-user-dave',
    l1: 'Tightened the clutch collars on all three boom stands so none droop mid-announcement.',
    l2: 'Taped down the extension cord neatly along the baseboard.',
    q1: 'Erin asks Roka for a crisp soundcheck test phrase.',
    q2: 'Dave asks Roka how loud stage feedback usually starts.'
  },
  {
    day: 16,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Sharpening utility knife blades',
    u1: 'sim-user-frank',
    u2: 'sim-user-carol',
    l1: 'Snapped off dull knife tips into the steel disposal tin before trimming mat board.',
    l2: 'Fresh steel glides through thick backing cardboard with zero ragged fuzz.',
    q1: 'Frank asks Roka why fresh blades actually cut safer than dull ones.',
    q2: 'Carol asks Roka for a quick bench cleanup motto.'
  },
  {
    day: 17,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Delivering extra cardboard mailers',
    u1: 'sim-user-bob',
    u2: 'sim-user-alice',
    l1: 'A bundle of flat mailers arrived by hand truck and rests neatly beside the coat hooks.',
    l2: 'Stamped return labels sit in the top tray ready for anyone mailing zines.',
    q1: 'Bob asks Roka why corner creases always target heavy envelopes.',
    q2: 'Alice asks Roka if flat kraft mailers recycle cleanly.'
  },
  {
    day: 18,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Checking outdoor string lights',
    u1: 'sim-user-carol',
    u2: 'sim-user-bob',
    l1: 'Replaced one flickering warm-white bulb along the patio awning strand.',
    l2: 'All twenty globes glow evenly over the picnic benches now.',
    q1: 'Carol asks Roka whether warm amber bulbs feel cozier than daylight LEDs.',
    q2: 'Bob asks Roka how early evening dusk arrives this week.'
  },
  {
    day: 19,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Wiping down glue mats',
    u1: 'sim-user-alice',
    u2: 'sim-user-frank',
    l1: 'Scrubbed dried white glue speckles off the green cutting mat with warm soapy cloth.',
    l2: 'Grid lines look sharp as day one again under the task lamp.',
    q1: 'Alice asks Roka how to remove stubborn dried paper glue without scratching vinyl.',
    q2: 'Frank asks Roka if task lamps flicker less with diffusers.'
  },
  {
    day: 20,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Checking kettle limescale filter',
    u1: 'sim-user-dave',
    u2: 'sim-user-erin',
    l1: 'Rinsed the little mesh spout screen in the lounge electric kettle.',
    l2: 'Water pours smoothly again without sputtering sideways.',
    q1: 'Dave asks Roka whether citric acid cleans kettle mineral scale gently.',
    q2: 'Erin asks Roka why hard water leaves chalky rings.'
  },
  {
    day: 21,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Poster board lettering check',
    u1: 'sim-user-grace',
    u2: 'sim-user-dave',
    l1: 'Tacked the hand-lettered directional arrows onto the lobby easel.',
    l2: 'Thick black marker strokes show cleanly from clear across the hall.',
    q1: 'Grace asks Roka whether diagonal arrows confuse hallway turns.',
    q2: 'Dave asks Roka for a polite two-word doorway welcome line.'
  },
  {
    day: 22,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Watching migrating geese overhead',
    u1: 'sim-user-bob',
    u2: 'sim-user-alice',
    l1: 'A noisy V-formation of geese honked clear over the courtyard oaks at four.',
    l2: 'Everyone heard them through closed double panes.',
    q1: 'Bob asks Roka how far migrating flocks fly in one clear afternoon.',
    q2: 'Alice asks Roka why geese trade off the lead spot in V-formations.'
  },
  {
    day: 23,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Tightening wobbling cafe table leg',
    u1: 'sim-user-erin',
    u2: 'sim-user-grace',
    l1: 'Slipped a folded cork shim under the crooked round side table.',
    l2: 'Teacups sit completely level without rattling saucers anymore.',
    q1: 'Erin asks Roka whether cork or felt pads last longer under heavy tables.',
    q2: 'Grace asks Roka for a playful math joke about four-legged tables.'
  },
  {
    day: 24,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Refilling sponge water dishes',
    u1: 'sim-user-carol',
    u2: 'sim-user-bob',
    l1: 'Fresh cool water in the porcelain brush rinse dishes on the craft counter.',
    l2: 'Clean water keeps pastel washes from turning muddy halfway through a page.',
    q1: 'Carol asks Roka why using two rinse jars keeps brush water cleaner.',
    q2: 'Bob asks Roka if rag blotters absorb drips better than paper towels.'
  },
  {
    day: 25,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'First frost warning on windowsill',
    u1: 'sim-user-alice',
    u2: 'sim-user-frank',
    l1: 'Window latches rattled softly before dawn as crisp northerly wind dropped the temperature.',
    l2: 'Moved tender potted mint inside from the courtyard ledge overnight.',
    q1: 'Alice asks Roka what nighttime temperature brings first windowpane frost.',
    q2: 'Frank asks Roka whether weatherstripping stops draft whistles.'
  },
  {
    day: 26,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Polishing brass bell at reception',
    u1: 'sim-user-frank',
    u2: 'sim-user-carol',
    l1: 'Rubbed the tarnish off the little counter bell until it gleamed like new copper.',
    l2: 'One tap rings bright enough to wake the whole stairwell.',
    q1: 'Frank asks Roka why brass darkens faster near coastal air.',
    q2: 'Carol asks Roka for a polite counter sign note.'
  },
  {
    day: 26,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Restacking board game boxes',
    u1: 'sim-user-dave',
    u2: 'sim-user-grace',
    l1: 'Sorted loose cardboard tokens back into zip bags inside the lounge closet.',
    l2: 'No stray dice rolling around the bottom shelf anymore.',
    q1: 'Dave asks Roka why wooden game tokens age nicer than plastic ones.',
    q2: 'Grace asks Roka what makes setup time faster on game nights.'
  },
  {
    day: 27,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Hanging velvet drape near acoustics corner',
    u1: 'sim-user-erin',
    u2: 'sim-user-dave',
    l1: 'Clipped the thick stage curtain back onto brass rings along the back alcove.',
    l2: 'Room echo dropped noticeably as soon as the pleats hung straight.',
    q1: 'Erin asks Roka why heavy fabric cuts sharp high-pitched echo.',
    q2: 'Dave asks Roka if wooden walls reflect sound faster than plaster.'
  },
  {
    day: 28,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Sweeping maple samaras off skylight',
    u1: 'sim-user-bob',
    u2: 'sim-user-alice',
    l1: 'Cleared a handful of spinning maple seed helicopters off the porch awning.',
    l2: 'Sunlight streams cleanly onto the reading bench now.',
    q1: 'Bob asks Roka how maple samara wings spin gently to the ground.',
    q2: 'Alice asks Roka for an October nature observation.'
  },
  {
    day: 28,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Replacing burnt bulb in bookcase lamp',
    u1: 'sim-user-grace',
    u2: 'sim-user-erin',
    l1: 'Swapped out the dead candelabra bulb inside the corner floor lamp.',
    l2: 'Soft amber light reaches the top fiction shelf evenly again.',
    q1: 'Grace asks Roka whether frosted glass softens glare near bookshelves.',
    q2: 'Erin asks Roka for a calm evening reading mood.'
  },
  {
    day: 29,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Packing folding banners after cleanup',
    u1: 'sim-user-dave',
    u2: 'sim-user-erin',
    l1: 'Rolled canvas event banners around cardboard tubes so corners stay crease-free.',
    l2: 'Tucked twine rolls inside the bin for next month.',
    q1: 'Dave asks Roka why rolling cloth banners avoids iron marks.',
    q2: 'Erin asks Roka for an organized end-of-month checklist tip.'
  },
  {
    day: 30,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Closing October logbook in Southbay',
    u1: 'sim-user-grace',
    u2: 'sim-user-dave',
    l1: 'Turned to a clean fresh page in the Southbay clubhouse guest logbook.',
    l2: 'Every bench and kettle sits tidy for November.',
    q1: 'Grace asks Roka for an upbeat end-of-month reflection.',
    q2: 'Dave asks Roka what November harbor mornings feel like.'
  },
  {
    day: 30,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Sharpening shop pencils for November',
    u1: 'sim-user-frank',
    u2: 'sim-user-bob',
    l1: 'Cranked every blunt carpenter pencil through the brass sharpener.',
    l2: 'Tidy tray of sharp leads ready for next week woodworking sketches.',
    q1: 'Frank asks Roka whether soft lead smudges less on rough cedar.',
    q2: 'Bob asks Roka for a crisp closing remark for the workshop.'
  },
  {
    day: 4,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Winding acoustic wall timer',
    u1: 'sim-user-dave',
    u2: 'sim-user-erin',
    l1: 'Wound the vintage brass wall clock above the Southbay bulletin rail.',
    l2: 'Steady ticking sets a calm rhythm while waiting for afternoon tea.',
    q1: 'Dave asks Roka why mechanical ticks feel calmer than blinking digits.',
    q2: 'Erin asks Roka for a cozy late-afternoon remark.'
  },
  {
    day: 13,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-craft',
    topic: 'Sorting copper wire spools',
    u1: 'sim-user-frank',
    u2: 'sim-user-bob',
    l1: 'Organized tarnished brass wire spools onto wooden dowel pegs above the bench.',
    l2: 'Every gauge label faces outward cleanly now.',
    q1: 'Frank asks Roka whether pegboards beat shallow storage trays.',
    q2: 'Bob asks Roka for a quick bench inventory tip.'
  },
  {
    day: 19,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Airflow around window fern trays',
    u1: 'sim-user-carol',
    u2: 'sim-user-alice',
    l1: 'Cracked the high transom louver an inch to let cool breeze circulate past the window.',
    l2: 'Notice the curtains sway gently without chilling the room.',
    q1: 'Carol asks Roka if cross-breezes clear stale afternoon warmth.',
    q2: 'Alice asks Roka for a brief autumn courtyard proverb.'
  },
  {
    day: 25,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-events',
    topic: 'Checking hall thermostat dial',
    u1: 'sim-user-erin',
    u2: 'sim-user-grace',
    l1: 'Adjusted the radiator valve in Southbay events hall down one notch.',
    l2: 'Comfortably cool air beats overheating during board game setup.',
    q1: 'Erin asks Roka why cool rooms help board game focus.',
    q2: 'Grace asks Roka for a short cozy blanket comparison.'
  },
  {
    day: 27,
    guildId: 'sim-guild-north',
    channelId: 'sim-north-general',
    topic: 'Sweeping oak acorns off stoop',
    u1: 'sim-user-frank',
    u2: 'sim-user-carol',
    l1: 'Swept a pocketful of glossy oak acorns off the flagstone stoop after dusk.',
    l2: 'Squirrels already stashed half the cap cups under the hedge.',
    q1: 'Frank asks Roka why oak masts drop heavier some autumns.',
    q2: 'Carol asks Roka for a crisp twilight sound description.'
  },
  {
    day: 29,
    guildId: 'sim-guild-south',
    channelId: 'sim-south-lounge',
    topic: 'Wiping down slate coasters',
    u1: 'sim-user-dave',
    u2: 'sim-user-grace',
    l1: 'Rinsed citrus tea rings off the dark slate mug coasters by the sideboard.',
    l2: 'Set them upright along the drying rack in neat rows.',
    q1: 'Dave asks Roka whether natural slate darkens when wiped damp.',
    q2: 'Grace asks Roka for a polite lounge cleanup line.'
  }
]

const BLUEPRINTS: EpisodeBlueprint[] = [
  ...CORE_BLUEPRINTS,
  ...CHATTER_SPECS.map((spec, idx) => ({
    id: `ep-d${String(spec.day).padStart(2, '0')}-chatter-${idx + 1}`,
    day: spec.day,
    offsetMs: 420_000 + (idx % 3) * 90_000,
    guildId: spec.guildId,
    channelId: spec.channelId,
    topic: spec.topic,
    requiredLines: [
      { userId: spec.u1, lineHint: spec.l1 },
      { userId: spec.u2, lineHint: spec.l2 }
    ],
    rokaTurns: [
      { userId: spec.u1, promptHint: spec.q1 },
      { userId: spec.u2, promptHint: spec.q2 }
    ]
  }))
]

const GeneratedBatchSchema = z.object({
  episodes: z.array(
    z.object({
      id: z.string(),
      messages: z.array(
        z.object({
          userId: z.string(),
          content: z.string()
        })
      ),
      rokaPrompts: z.array(z.string()).nullish(),
      rokaReplies: z.array(z.string()).nullish()
    })
  )
})

function resolveRequiredLineContent(
  generated: string | undefined,
  req: EpisodeBlueprint['requiredLines'][number] | undefined,
  fallback: string
): string {
  const candidate = generated?.trim()
  if (!candidate) return req?.lineHint ?? fallback
  if (!req?.mustContainTokens || req.mustContainTokens.length === 0) return candidate
  const lower = candidate.toLowerCase()
  const allPresent = req.mustContainTokens.every((token) => lower.includes(token.toLowerCase()))
  return allPresent ? candidate : req.lineHint
}

function defaultEventsForDay(day: number): SimDayEvent[] {
  const events: SimDayEvent[] = []
  if (day === 1) {
    events.push({
      kind: 'operator',
      id: 'op-d01-seed-aged-throwaways',
      offsetMs: 20_000,
      action: 'seed_aged_throwaways',
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-frank'
    })
  }
  if (day === 2) {
    events.push({
      kind: 'tool',
      id: 'tool-d02-remember-misc',
      offsetMs: 360_000,
      action: 'remember_user',
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-grace',
      factKey: 'misc',
      factValue: 'Collects vintage brass mechanical compasses from flea markets'
    })
  }
  if (day === 4) {
    events.push({ kind: 'restart', id: 'restart-d04-crash', offsetMs: 350_000, mode: 'crash' })
  }
  if (day === 5) {
    events.push({
      kind: 'operator',
      id: 'op-d05-undo-reclassify',
      offsetMs: 320_000,
      action: 'undo_last_reclassify',
      guildId: 'sim-guild-north',
      userId: 'sim-user-grace'
    })
  }
  if (day === 6) {
    events.push({
      kind: 'tool',
      id: 'tool-d06-remember-frank-temp',
      offsetMs: 320_000,
      action: 'remember_user',
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-frank',
      factKey: 'misc',
      factValue: 'Temporary keyfob number forty-two for craft locker'
    })
  }
  if (day === 9) {
    events.push({
      kind: 'media',
      id: 'media-d09-raku-kiln',
      offsetMs: 400_000,
      guildId: 'sim-guild-north',
      channelId: 'sim-north-craft',
      userId: 'sim-user-alice',
      messageId: 'sim-msg-media-d09-1',
      contentKey: 'sim:video:raku-kiln-glaze',
      mediaKind: 'video',
      label: 'raku-kiln-glaze.mp4',
      summary: 'Alice demonstrates reduction firing and copper glaze inside her backyard raku kiln.',
      subjects: ['sim-user-alice'],
      groundTruthId: 'gt-media-kiln-video'
    })
    events.push({
      kind: 'media',
      id: 'media-d09-sketch-forget',
      offsetMs: 420_000,
      guildId: 'sim-guild-south',
      channelId: 'sim-south-lounge',
      userId: 'sim-user-bob',
      messageId: 'sim-msg-media-d09-2',
      contentKey: 'sim:image:sketchbook-page',
      mediaKind: 'image',
      label: 'sketchbook-page.png',
      summary: 'Bob shares a quick charcoal sketch page titled sketchbookdrop from Tuesday practice.',
      subjects: ['sim-user-bob']
    })
  }
  if (day === 10) {
    events.push({
      kind: 'media',
      id: 'media-d10-priv-baffle',
      offsetMs: 300_000,
      guildId: 'sim-guild-north',
      channelId: 'sim-north-vault',
      userId: 'sim-user-alice',
      messageId: 'sim-msg-media-d10-priv',
      contentKey: 'sim:video:mod-acoustic-baffle',
      mediaKind: 'video',
      label: 'mod-baffle-walkthrough.mp4',
      summary: 'Alice walks the moderators through the confidential acoustic baffle installation.',
      subjects: ['sim-user-alice'],
      groundTruthId: 'gt-media-private-vault'
    })
    events.push({
      kind: 'operator',
      id: 'op-d10-seed-overflow',
      offsetMs: 500_000,
      action: 'seed_overflow_facts',
      guildId: 'sim-guild-north',
      userId: 'sim-user-frank'
    })
    events.push({
      kind: 'operator',
      id: 'op-d10-clear-open-episodes',
      offsetMs: 540_000,
      action: 'clear_saved_open_episodes',
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-frank'
    })
  }
  if (day === 11) {
    events.push({
      kind: 'restart',
      id: 'restart-d11-crash',
      offsetMs: 170_000,
      mode: 'crash',
      simulateStuckProcessing: true
    })
  }
  if (day === 12) {
    events.push({
      kind: 'media',
      id: 'media-d12-harbor-sax',
      offsetMs: 320_000,
      guildId: 'sim-guild-south',
      channelId: 'sim-south-lounge',
      userId: 'sim-user-dave',
      messageId: 'sim-msg-media-d12-1',
      contentKey: 'sim:audio:night-harbor-sax',
      mediaKind: 'audio',
      label: 'night-harbor-sax.mp3',
      summary: 'Dave shares an evening harbor saxophone rehearsal recording with warm echo.',
      subjects: ['sim-user-dave'],
      groundTruthId: 'gt-media-harbor-audio'
    })
    events.push({
      kind: 'tool',
      id: 'tool-d12-recall-user',
      offsetMs: 600_000,
      action: 'recall_user',
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-alice',
      query: 'botanist'
    })
  }
  if (day === 14) {
    events.push({
      kind: 'media',
      id: 'media-d14-alpine-terrarium-1',
      offsetMs: 300_000,
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-carol',
      messageId: 'sim-msg-media-d14-1',
      contentKey: 'sim:video:alpine-terrarium',
      mediaKind: 'video',
      label: 'alpine-terrarium.mp4',
      summary: 'Carol films an indoor alpine moss terrarium misting jar beside her desk.',
      subjects: ['sim-user-carol'],
      groundTruthId: 'gt-media-alpine-terrarium'
    })
    events.push({
      kind: 'media',
      id: 'media-d14-alpine-terrarium-reshare',
      offsetMs: 340_000,
      guildId: 'sim-guild-north',
      channelId: 'sim-north-craft',
      userId: 'sim-user-bob',
      messageId: 'sim-msg-media-d14-2',
      contentKey: 'sim:video:alpine-terrarium',
      mediaKind: 'video',
      label: 'alpine-terrarium.mp4',
      summary: 'Carol films an indoor alpine moss terrarium misting jar beside her desk.',
      subjects: ['sim-user-carol']
    })
  }
  if (day === 15) {
    events.push({
      kind: 'operator',
      id: 'op-d15-pin-unpin',
      offsetMs: 600_000,
      action: 'pin_unpin_claim',
      guildId: 'sim-guild-north',
      userId: 'sim-user-alice'
    })
    events.push({
      kind: 'operator',
      id: 'op-d15-prune-overflow',
      offsetMs: 620_000,
      action: 'prune_overflow',
      guildId: 'sim-guild-north',
      userId: 'sim-user-frank'
    })
  }
  if (day === 18) {
    events.push({ kind: 'restart', id: 'restart-d18-crash', offsetMs: 170_000, mode: 'crash' })
  }
  if (day === 19) {
    events.push({
      kind: 'tool',
      id: 'tool-d19-forget-bob-media',
      offsetMs: 600_000,
      action: 'forget_user',
      guildId: 'sim-guild-south',
      channelId: 'sim-south-lounge',
      userId: 'sim-user-bob',
      query: 'sketchbookdrop'
    })
    events.push({
      kind: 'tool',
      id: 'tool-d19-forget-frank-claim',
      offsetMs: 610_000,
      action: 'forget_user',
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-frank',
      query: 'keyfob'
    })
    events.push({
      kind: 'operator',
      id: 'op-d19-activate-candidate',
      offsetMs: 620_000,
      action: 'activate_candidate',
      guildId: 'sim-guild-north',
      userId: 'sim-user-carol'
    })
    events.push({
      kind: 'operator',
      id: 'op-d19-reject-user-claim',
      offsetMs: 630_000,
      action: 'reject_user_claim',
      guildId: 'sim-guild-north',
      userId: 'sim-user-frank'
    })
    events.push({
      kind: 'operator',
      id: 'op-d19-replace-guild-claim',
      offsetMs: 640_000,
      action: 'replace_guild_claim',
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-alice'
    })
    events.push({
      kind: 'operator',
      id: 'op-d19-reject-guild-claim',
      offsetMs: 650_000,
      action: 'reject_guild_claim',
      guildId: 'sim-guild-north',
      channelId: 'sim-north-general',
      userId: 'sim-user-alice'
    })
  }
  if (day === 23) {
    events.push({
      kind: 'operator',
      id: 'op-d23-retract-explicit',
      offsetMs: 500_000,
      action: 'retract_explicit',
      guildId: 'sim-guild-south',
      userId: 'sim-user-frank'
    })
  }
  if (day === 25) {
    events.push({ kind: 'restart', id: 'restart-d25-crash', offsetMs: 350_000, mode: 'crash' })
  }
  if (day === 29) {
    events.push({ kind: 'restart', id: 'restart-d29-graceful', offsetMs: 170_000, mode: 'graceful' })
  }
  return events
}

async function generateBatch(
  cache: MemsimCache,
  batch: readonly EpisodeBlueprint[]
): Promise<Map<string, z.infer<typeof GeneratedBatchSchema>['episodes'][number]>> {
  const personaList = PERSONAS.map((p) => `${p.id} (${p.displayName})`).join(', ')
  const payload = batch.map((bp) => ({
    id: bp.id,
    day: bp.day,
    channelId: bp.channelId,
    isDm: Boolean(bp.isDm),
    topic: bp.topic,
    requiredLines: bp.requiredLines,
    rokaTurns: bp.rokaTurns ?? []
  }))

  const raw = await callRiverChatCompletion({
    cache,
    responseFormatJson: true,
    temperature: 0.3,
    maxTokens: 4096,
    messages: [
      {
        role: 'system',
        content: [
          'You generate short, natural synthetic Discord conversations for testing a memory system.',
          'Return strict JSON matching: {"episodes":[{"id":"...","messages":[{"userId":"...","content":"..."}],"rokaPrompts":["..."],"rokaReplies":["..."]}]}',
          `Personas: ${personaList}.`,
          'For every requiredLine, keep its exact userId, natural phrasing, and include all mustContainTokens verbatim.',
          'Keep messages aligned with requiredLines in order (no extra random speakers).',
          'For every item in rokaTurns, generate one entry in rokaPrompts (question from that user to Roka) and one entry in rokaReplies (brief in-character Roka reply, plain prose).'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Generate JSON dialogue for these episodes:\n${JSON.stringify(payload)}`
      }
    ]
  })

  const parsed = GeneratedBatchSchema.parse(JSON.parse(raw))
  const byId = new Map<string, (typeof parsed.episodes)[number]>()
  for (const ep of parsed.episodes) byId.set(ep.id, ep)
  return byId
}

export async function markGenerateReplayCacheReads(cache: MemsimCache): Promise<void> {
  const batchSize = 6
  for (let idx = 0; idx < BLUEPRINTS.length; idx += batchSize) {
    const slice = BLUEPRINTS.slice(idx, idx + batchSize)
    await generateBatch(cache, slice)
  }
}

export async function generateScenario(
  options: { mode?: CacheMode; cacheDir?: string; outDir?: string; budgets?: Partial<ProviderBudgets> } = {}
): Promise<{
  scenarioPath: string
  groundTruthPath: string
  cacheStats: ReturnType<MemsimCache['stats']>
}> {
  const mode = options.mode ?? 'record'
  const cacheDir = resolve(options.cacheDir ?? 'tests/harness/memsim/cache')
  const outDir = resolve(options.outDir ?? 'tests/harness/memsim')
  const cache = new MemsimCache({ mode, cacheDir, budgets: options.budgets })

  const generatedById = new Map<string, z.infer<typeof GeneratedBatchSchema>['episodes'][number]>()
  const batchSize = 6
  for (let idx = 0; idx < BLUEPRINTS.length; idx += batchSize) {
    const slice = BLUEPRINTS.slice(idx, idx + batchSize)
    const batchMap = await generateBatch(cache, slice)
    for (const [id, value] of batchMap) generatedById.set(id, value)
  }

  let msgCounter = 1
  const days: SimDay[] = []
  for (let day = 1; day <= 30; day += 1) {
    const events: SimDayEvent[] = []
    const dayBlueprints = BLUEPRINTS.filter((bp) => bp.day === day)
    for (const bp of dayBlueprints) {
      const gen = generatedById.get(bp.id)
      const messages: SimEpisodeEvent['messages'] = []
      const genMsgs = gen?.messages ?? []

      for (let i = 0; i < bp.requiredLines.length; i += 1) {
        const req = bp.requiredLines[i]!
        const gm = genMsgs[i]
        const content = resolveRequiredLineContent(gm?.content, req, bp.topic)
        messages.push({
          id: `sim-msg-${day}-${msgCounter++}`,
          userId: req.userId,
          content,
          delayMs: i === 0 ? 0 : 12_000
        })
      }

      const rokaTurns = bp.rokaTurns ?? []
      const genPrompts = gen?.rokaPrompts ?? []
      const genReplies = gen?.rokaReplies ?? []
      for (let t = 0; t < rokaTurns.length; t += 1) {
        const spec = rokaTurns[t]!
        const promptText = genPrompts[t]?.trim() || spec.promptHint
        const mentionContent = promptText.toLowerCase().includes('roka')
          ? promptText
          : `<@${BOT_USER_ID}> ${promptText}`
        messages.push({
          id: `sim-msg-${day}-${msgCounter++}`,
          userId: spec.userId,
          content: mentionContent,
          delayMs: 10_000,
          rokaReply: genReplies[t]?.trim() || 'Got it — noted!',
          ...(spec.expectedRecallGtIds ? { expectedRecallGtIds: spec.expectedRecallGtIds } : {})
        })
      }

      events.push({
        kind: 'episode',
        id: bp.id,
        offsetMs: bp.offsetMs,
        guildId: bp.guildId,
        channelId: bp.channelId,
        ...(bp.isDm ? { isDm: true } : {}),
        ...(bp.leaveOpen ? { leaveOpen: true } : {}),
        messages
      })
    }

    events.push(...defaultEventsForDay(day))
    events.sort((a, b) => a.offsetMs - b.offsetMs)
    days.push({ day, events })
  }

  const scenario: SimScenario = {
    version: 1,
    baseTimeMs: BASE_TIME_MS,
    botUserId: BOT_USER_ID,
    botDisplayName: BOT_DISPLAY_NAME,
    guilds: GUILDS,
    dmChannels: DM_CHANNELS,
    personas: PERSONAS,
    days
  }

  const groundTruth: GroundTruthFile = {
    version: 1,
    baseTimeMs: BASE_TIME_MS,
    items: GROUND_TRUTH_ITEMS
  }

  const scenarioPath = resolve(outDir, 'scenario.json')
  const groundTruthPath = resolve(outDir, 'ground-truth.json')
  writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8')
  writeFileSync(groundTruthPath, `${JSON.stringify(groundTruth, null, 2)}\n`, 'utf8')

  return { scenarioPath, groundTruthPath, cacheStats: cache.stats() }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const modeArg = process.argv.includes('--replay') ? 'replay' : 'record'
  const budgetIdx = process.argv.indexOf('--budget')
  const budgetRaw =
    budgetIdx >= 0
      ? process.argv[budgetIdx + 1]
      : process.argv.find((arg) => arg.startsWith('--budget='))?.slice('--budget='.length)
  let budgets: Partial<ProviderBudgets> | undefined
  if (budgetRaw) {
    budgets = {}
    for (const part of budgetRaw.split(',')) {
      const [k, v] = part.trim().split('=')
      if (k === 'river' || k === 'embeddings' || k === 'typesafe') {
        budgets[k] = Number.parseInt(v ?? '', 10)
      }
    }
  }
  generateScenario({ mode: modeArg, budgets })
    .then((result) => {
      console.log(
        `Generated memsim scenario & ground truth (river calls: live=${result.cacheStats.liveCalls.river}, hits=${result.cacheStats.hits.river})`
      )
    })
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
}
