export type PredicateCategory = 'identity' | 'lifestyle' | 'interests' | 'social' | 'personality' | 'opinions' | 'misc'
export type PredicateCardinality = 'single' | 'multi'

export type PredicateDefinition = Readonly<{
  category: PredicateCategory
  cardinality: PredicateCardinality
  keywords: readonly string[]
  baseSalience: number
  objectKind?: 'user'
}>

function predicate(
  category: PredicateCategory,
  cardinality: PredicateCardinality,
  keywords: string[],
  objectKind?: 'user'
): PredicateDefinition {
  return Object.freeze({
    category,
    cardinality,
    keywords: Object.freeze(keywords),
    baseSalience: 0.5,
    ...(objectKind ? { objectKind } : {})
  })
}

export const PREDICATES = Object.freeze({
  nickname: predicate('identity', 'single', ['nickname', 'nicknames', 'call me', 'name']),
  language_spoken: predicate('identity', 'single', ['language', 'languages', 'speak', 'speaks', 'speaking']),
  nationality: predicate('identity', 'single', ['nationality', 'country', 'countries', 'national']),
  pronouns: predicate('identity', 'single', ['pronoun', 'pronouns']),
  pets: predicate('lifestyle', 'multi', ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats']),
  daily_routine: predicate('lifestyle', 'single', [
    'routine',
    'routines',
    'schedule',
    'schedules',
    'morning',
    'bedtime'
  ]),
  diet: predicate('lifestyle', 'single', ['diet', 'diets', 'vegetarian', 'vegan', 'allergy', 'allergies']),
  general_occupation: predicate('lifestyle', 'single', ['job', 'jobs', 'work', 'working', 'career', 'occupation']),
  likes: predicate('interests', 'multi', ['like', 'likes', 'love', 'loves', 'enjoy', 'enjoys']),
  dislikes: predicate('interests', 'multi', ['dislike', 'dislikes', 'hate', 'hates']),
  favorite_anime: predicate('interests', 'single', ['anime', 'manga', 'favorite anime', 'favourite anime']),
  favorite_game: predicate('interests', 'single', ['game', 'games', 'gaming', 'play', 'playing']),
  favorite_music: predicate('interests', 'single', ['music', 'song', 'songs', 'artist', 'artists']),
  hobby: predicate('interests', 'multi', ['hobby', 'hobbies', 'pastime', 'pastimes', 'craft', 'crafts']),
  currently_watching: predicate('interests', 'multi', ['watch', 'watching', 'show', 'shows', 'series', 'episode']),
  relationship_to: predicate(
    'social',
    'multi',
    ['relationship', 'relationships', 'partner', 'partners', 'dating'],
    'user'
  ),
  friend_group: predicate('social', 'multi', ['friend', 'friends', 'group', 'groups', 'squad', 'crew']),
  communication_style: predicate('social', 'single', ['texting', 'message', 'messages', 'communication', 'voice call']),
  humor_style: predicate('personality', 'single', ['humor', 'humour', 'joke', 'jokes', 'funny']),
  catchphrase: predicate('personality', 'multi', ['catchphrase', 'catchphrases', 'always say', 'often say']),
  teasing_habit: predicate('personality', 'single', ['tease', 'teases', 'teasing', 'banter']),
  recommends: predicate('opinions', 'multi', ['recommend', 'recommends', 'recommendation', 'suggest', 'suggests']),
  complains_about: predicate('opinions', 'multi', ['complain', 'complains', 'complaint', 'annoyed by']),
  strong_opinion: predicate('opinions', 'multi', ['opinion', 'opinions', 'believe', 'believes', 'think']),
  misc: predicate('misc', 'multi', ['misc'])
} satisfies Record<string, PredicateDefinition>)

export type PredicateId = keyof typeof PREDICATES

const SYNONYMS: Readonly<Record<string, PredicateId>> = {
  name: 'nickname',
  names: 'nickname',
  language: 'language_spoken',
  languages: 'language_spoken',
  country: 'nationality',
  countries: 'nationality',
  pet: 'pets',
  routine: 'daily_routine',
  job: 'general_occupation',
  jobs: 'general_occupation',
  occupation: 'general_occupation',
  favourite_anime: 'favorite_anime',
  fave_anime: 'favorite_anime',
  favourite_game: 'favorite_game',
  fave_game: 'favorite_game',
  favourite_music: 'favorite_music',
  fave_music: 'favorite_music',
  current_show: 'currently_watching',
  friends: 'friend_group',
  relationship: 'relationship_to',
  humor: 'humor_style',
  humour: 'humor_style',
  recommendation: 'recommends',
  complaint: 'complains_about',
  opinion: 'strong_opinion'
}

export function isKnownPredicate(predicateId: string): predicateId is PredicateId {
  return Object.hasOwn(PREDICATES, predicateId)
}

export function normalizePredicate(rawKey: string): PredicateId {
  const normalized = rawKey
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (isKnownPredicate(normalized)) return normalized
  return SYNONYMS[normalized] ?? 'misc'
}

export function predicateCategory(predicateId: PredicateId): PredicateCategory {
  return PREDICATES[predicateId].category
}

export function cardinalityOf(predicateId: PredicateId): PredicateCardinality {
  return PREDICATES[predicateId].cardinality
}

export function baseSalienceOf(predicateId: PredicateId): number {
  return PREDICATES[predicateId].baseSalience
}

export function routeTopics(message: string): Set<PredicateCategory> {
  const normalizedMessage = message.toLowerCase()
  const topics = new Set<PredicateCategory>()

  for (const predicate of Object.values(PREDICATES)) {
    if (predicate.keywords.some((keyword) => normalizedMessage.includes(keyword))) {
      topics.add(predicate.category)
    }
  }

  return topics
}
