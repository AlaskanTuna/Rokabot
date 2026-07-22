import { describe, expect, it } from 'vitest'
import {
  PREDICATES,
  baseSalienceOf,
  cardinalityOf,
  isKnownPredicate,
  normalizePredicate,
  predicateCategory,
  routeTopics
} from '../predicates.js'

describe('PREDICATES', () => {
  it('defines the approved controlled vocabulary with valid metadata', () => {
    expect(Object.isFrozen(PREDICATES)).toBe(true)
    expect(Object.keys(PREDICATES)).toEqual([
      'nickname',
      'language_spoken',
      'nationality',
      'pronouns',
      'pets',
      'daily_routine',
      'diet',
      'general_occupation',
      'likes',
      'dislikes',
      'favorite_anime',
      'favorite_game',
      'favorite_music',
      'hobby',
      'currently_watching',
      'relationship_to',
      'friend_group',
      'communication_style',
      'humor_style',
      'catchphrase',
      'teasing_habit',
      'recommends',
      'complains_about',
      'strong_opinion',
      'misc'
    ])

    for (const predicate of Object.values(PREDICATES)) {
      expect(['identity', 'lifestyle', 'interests', 'social', 'personality', 'opinions', 'misc']).toContain(
        predicate.category
      )
      expect(['single', 'multi']).toContain(predicate.cardinality)
      expect(predicate.keywords.length).toBeGreaterThan(0)
      expect(predicate.baseSalience).toBeGreaterThanOrEqual(0)
      expect(predicate.baseSalience).toBeLessThanOrEqual(1)
    }
  })

  it('marks relationships as multi-valued one-hop user edges', () => {
    expect(PREDICATES.relationship_to).toMatchObject({
      cardinality: 'multi',
      objectKind: 'user'
    })
  })
})

describe('predicate helpers', () => {
  it('normalizes canonical names and obvious synonyms while falling back to misc', () => {
    expect(normalizePredicate('Favorite Anime')).toBe('favorite_anime')
    expect(normalizePredicate('favourite_anime')).toBe('favorite_anime')
    expect(normalizePredicate('job')).toBe('general_occupation')
    expect(normalizePredicate('unrecognized detail')).toBe('misc')
    expect(isKnownPredicate('favorite_anime')).toBe(true)
    expect(isKnownPredicate('unrecognized_detail')).toBe(false)
  })

  it('returns registered metadata for a normalized predicate', () => {
    expect(predicateCategory('favorite_anime')).toBe('interests')
    expect(cardinalityOf('favorite_anime')).toBe('single')
    expect(baseSalienceOf('favorite_anime')).toBe(0.5)
  })
})

describe('routeTopics', () => {
  it('routes keyword matches to their categories deterministically', () => {
    const message = 'do you play any games?'
    const first = routeTopics(message)
    const second = routeTopics(message)

    expect(first).toEqual(new Set(['interests']))
    expect(second).toEqual(first)
  })
})
