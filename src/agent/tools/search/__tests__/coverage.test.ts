import { describe, expect, it } from 'vitest'

import { type Passage, assessField } from '../coverage.js'
import type { SearchField } from '../types.js'

const passage = (body: string, sourceId = 's1', heading = 'Title'): Passage => ({ sourceId, heading, body })

const list = (subject: string, aliases?: string[]): SearchField => ({
  kind: 'list',
  subject,
  ...(aliases ? { aliases } : {})
})
const price = (subject: string, aliases?: string[]): SearchField => ({
  kind: 'price',
  subject,
  ...(aliases ? { aliases } : {})
})
const hours = (subject: string): SearchField => ({ kind: 'hours', subject })
const other = (subject: string): SearchField => ({ kind: 'other', subject })

describe('assessField list fields', () => {
  it('reports the Tripadvisor "See our menu" title positive as missing', () => {
    const assessed = assessField(list('menu items'), [
      passage(
        'See our menu for details and seasonal recommendations.',
        's3',
        'MARUFUKU COFFEE SHOP - Menu, Prices & Reviews - Tripadvisor'
      )
    ])
    expect(assessed.covered).toBe(false)
    expect(assessed.support).toEqual([])
  })

  it('covers a list with three distinct items', () => {
    const assessed = assessField(list('menu items'), [passage('Hot coffee, iced latte and egg sandwich.')])
    expect(assessed.covered).toBe(true)
    expect(assessed.support).toHaveLength(1)
  })

  it('counts duplicates once across case, punctuation and width', () => {
    const assessed = assessField(list('menu items'), [passage('Hot Coffee. HOT COFFEE! Ｈｏｔ Ｃｏｆｆｅｅ．')])
    expect(assessed.covered).toBe(false)
    expect(assessed.support).toHaveLength(1)
  })

  it('needs three named drinks when the subject names a drink category', () => {
    const thin = assessField(list('coffee drinks'), [passage('Hot coffee, egg sandwich and curry rice.')])
    expect(thin.covered).toBe(false)
    const full = assessField(list('coffee drinks'), [passage('Hot coffee, iced latte and almond au lait.')])
    expect(full.covered).toBe(true)
  })

  it('does not combine evidence split across two sources', () => {
    const assessed = assessField(list('menu items'), [
      passage('Hot coffee, iced latte.', 's1'),
      passage('Egg sandwich, cheese toast.', 's2')
    ])
    expect(assessed.covered).toBe(false)
    expect(assessed.support).toHaveLength(2)
  })

  it('keeps branch scopes separate within one passage', () => {
    const body = '# Sennichimae shop\n- hot coffee\n- latte\n\n# Nakanoshima shop\n- blended coffee\n- iced tea'
    expect(assessField(list('menu items'), [passage(body)]).covered).toBe(false)
    const single = '# Sennichimae shop\n- hot coffee\n- latte\n- egg sandwich'
    expect(assessField(list('menu items'), [passage(single)]).covered).toBe(true)
  })

  it('covers a named item beside its price, in Japanese too', () => {
    expect(assessField(price('ブレンドコーヒー'), [passage('ブレンドコーヒー 680円')]).covered).toBe(true)
  })
})

describe('assessField price fields', () => {
  it('accepts ¥680 and 680円 alike beside the named item', () => {
    expect(assessField(price('hot coffee'), [passage('Hot Coffee ¥680')]).covered).toBe(true)
    expect(assessField(price('hot coffee'), [passage('Hot Coffee 680円')]).covered).toBe(true)
  })

  it('never covers a specific item with a price beside a different item', () => {
    const field = price('hotcake set', ['ホットケーキセット'])
    expect(assessField(field, [passage('plain pancake ¥750')]).covered).toBe(false)
    expect(assessField(field, [passage('ホットケーキセット ¥1,100')]).covered).toBe(true)
  })

  it('needs two distinct pairs for a category subject', () => {
    const one = assessField(price('drinks'), [passage('ブレンド ¥500 ドリンクメニュー')])
    expect(one.covered).toBe(false)
    const two = assessField(price('drinks'), [passage('Hot Coffee (680 yen), Almond Au Lait (tax included 700 yen)')])
    expect(two.covered).toBe(true)
  })

  it('rejects a price bound to the wrong category', () => {
    const assessed = assessField(price('drinks'), [passage('Egg sandwich ¥1,150, curry toast ¥900.')])
    expect(assessed.covered).toBe(false)
    const food = assessField(price('food'), [passage('Egg sandwich ¥1,150, curry toast ¥900.')])
    expect(food.covered).toBe(true)
  })

  it('binds a shared price to the nearest item, not the neighbour', () => {
    const assessed = assessField(price('food'), [passage('Hot Coffee (680 yen) and Butter Toast.')])
    expect(assessed.covered).toBe(false)
    const item = assessField(price('hot coffee'), [passage('Hot Coffee (680 yen) and Butter Toast.')])
    expect(item.covered).toBe(true)
  })
})

describe('assessField hours fields', () => {
  it('covers a time in a passage that mentions an hours word', () => {
    expect(assessField(hours('opening hours'), [passage('営業時間 8:00～23:00')]).covered).toBe(true)
  })

  it('leaves a time without the subject or an hours word uncovered', () => {
    expect(assessField(hours('opening hours'), [passage('The show starts 8:00 sharp, be there!')]).covered).toBe(false)
  })
})

describe('assessField other fields', () => {
  it('matches within one passage body at a time, never pooled titles', () => {
    const assessed = assessField(other('opening hours'), [passage('We are open daily.')])
    expect(assessed.covered).toBe(true)
    expect(assessField(other('opening hours'), [passage('Coffee Marufuku is in Osaka.')]).covered).toBe(false)
  })

  it('covers English fields on token overlap', () => {
    expect(assessField(other('price'), [passage('The hotcake set is ¥1,100.')]).covered).toBe(true)
    expect(assessField(other('opening hours'), [passage('We are open daily.')]).covered).toBe(true)
    expect(assessField(other('drinks'), [passage('Try the morning coffee blend.')]).covered).toBe(true)
  })

  it('covers Japanese pages through the hint table', () => {
    expect(assessField(other('opening hours'), [passage('営業時間 9:00-22:00')]).covered).toBe(true)
  })

  it('leaves genuinely missing fields uncovered', () => {
    expect(assessField(price('drinks'), [passage('Coffee Marufuku is in Osaka.')]).covered).toBe(false)
    expect(assessField(other('price'), [passage('The hotcakes are fluffy.')]).covered).toBe(false)
  })
})

describe('assessField on lists that are not menus', () => {
  it('counts three bullet entries as an attractions list', () => {
    const body = '- Osaka Castle\n- Dotonbori\n- Umeda Sky Building'
    expect(assessField(list('attractions'), [{ sourceId: 's1', heading: 'Top sights', body }]).covered).toBe(true)
  })

  it('needs three entries, not two', () => {
    const body = '- Osaka Castle\n- Dotonbori'
    expect(assessField(list('attractions'), [{ sourceId: 's1', heading: 'Top sights', body }]).covered).toBe(false)
  })
})

describe('price binding window', () => {
  it('binds a price to the item before it, not to a drink after it', () => {
    const body = 'Egg sandwich ¥900, then later on the page we also serve coffee'
    expect(assessField(price('drinks'), [{ sourceId: 's1', heading: 'Menu', body }]).covered).toBe(false)
  })
})
