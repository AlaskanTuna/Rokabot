import { describe, expect, it } from 'vitest'

import { type Passage, assessField } from '../coverage.js'

const passage = (body: string, sourceId = 's1', heading = 'Title'): Passage => ({ sourceId, heading, body })

describe('assessField list fields', () => {
  it('reports the Tripadvisor "See our menu" title positive as missing', () => {
    const assessed = assessField('menu items', [
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
    const assessed = assessField('menu items', [passage('Hot coffee, iced latte and egg sandwich.')])
    expect(assessed.covered).toBe(true)
    expect(assessed.support).toHaveLength(1)
  })

  it('counts duplicates once across case, punctuation and width', () => {
    const assessed = assessField('menu items', [passage('Hot Coffee. HOT COFFEE! Ｈｏｔ Ｃｏｆｆｅｅ．')])
    expect(assessed.covered).toBe(false)
    expect(assessed.support).toHaveLength(1)
  })

  it('requires one named member when the field names a category', () => {
    const without = assessField('drink menu', [passage('Egg sandwich, cheese toast and curry rice.')])
    expect(without.covered).toBe(false)
    const withDrink = assessField('drink menu', [passage('Hot coffee, iced latte and egg sandwich.')])
    expect(withDrink.covered).toBe(true)
  })

  it('does not combine evidence split across two sources', () => {
    const assessed = assessField('menu items', [
      passage('Hot coffee, iced latte.', 's1'),
      passage('Egg sandwich, cheese toast.', 's2')
    ])
    expect(assessed.covered).toBe(false)
    expect(assessed.support).toHaveLength(2)
  })

  it('keeps branch scopes separate within one passage', () => {
    const body = '# Sennichimae shop\n- hot coffee\n- latte\n\n# Nakanoshima shop\n- blended coffee\n- iced tea'
    expect(assessField('menu items', [passage(body)]).covered).toBe(false)
    const single = '# Sennichimae shop\n- hot coffee\n- latte\n- egg sandwich'
    expect(assessField('menu items', [passage(single)]).covered).toBe(true)
  })

  it('reads Japanese menu rows', () => {
    const assessed = assessField('drink price', [passage('ブレンドコーヒー 680円')])
    expect(assessed.covered).toBe(true)
  })
})

describe('assessField price fields', () => {
  it('accepts ¥680 and 680円 alike', () => {
    expect(assessField('drink price', [passage('Hot Coffee ¥680')]).covered).toBe(true)
    expect(assessField('drink price', [passage('Hot Coffee 680円')]).covered).toBe(true)
  })

  it('needs two distinct pairs for a plural prices field', () => {
    const one = assessField('drink prices', [passage('ブレンド ¥500 ドリンクメニュー')])
    expect(one.covered).toBe(false)
    const two = assessField('drink prices', [passage('Hot Coffee (680 yen), Almond Au Lait (tax included 700 yen)')])
    expect(two.covered).toBe(true)
  })

  it('rejects a price bound to the wrong category', () => {
    const assessed = assessField('drink prices', [passage('Egg sandwich ¥1,150, curry toast ¥900.')])
    expect(assessed.covered).toBe(false)
    const food = assessField('food prices', [passage('Egg sandwich ¥1,150, curry toast ¥900.')])
    expect(food.covered).toBe(true)
  })

  it('binds a shared price to the nearest item, not the neighbour', () => {
    const assessed = assessField('food prices', [passage('Hot Coffee (680 yen) and Butter Toast.')])
    expect(assessed.covered).toBe(false)
    const drink = assessField('drink price', [passage('Hot Coffee (680 yen) and Butter Toast.')])
    expect(drink.covered).toBe(true)
  })
})

describe('assessField other fields', () => {
  it('matches within one passage body at a time, never pooled titles', () => {
    const assessed = assessField('opening hours', [passage('We are open daily.')])
    expect(assessed.covered).toBe(true)
    expect(assessField('opening hours', [passage('Coffee Marufuku is in Osaka.')]).covered).toBe(false)
  })

  it('covers English fields on token overlap', () => {
    expect(assessField('price', [passage('The hotcake set is ¥1,100.')]).covered).toBe(true)
    expect(assessField('opening hours', [passage('We are open daily.')]).covered).toBe(true)
    expect(assessField('drinks', [passage('Try the morning coffee blend.')]).covered).toBe(true)
  })

  it('covers Japanese pages through the hint table', () => {
    expect(assessField('opening hours', [passage('営業時間 9:00-22:00')]).covered).toBe(true)
  })

  it('leaves genuinely missing fields uncovered', () => {
    expect(assessField('drink prices', [passage('Coffee Marufuku is in Osaka.')]).covered).toBe(false)
    expect(assessField('price', [passage('The hotcakes are fluffy.')]).covered).toBe(false)
  })
})

describe('assessField on lists that are not menus', () => {
  it('counts three bullet entries as an attractions list', () => {
    const body = '- Osaka Castle\n- Dotonbori\n- Umeda Sky Building'
    expect(assessField('attractions', [{ sourceId: 's1', heading: 'Top sights', body }]).covered).toBe(true)
  })

  it('needs three entries, not two', () => {
    const body = '- Osaka Castle\n- Dotonbori'
    expect(assessField('attractions', [{ sourceId: 's1', heading: 'Top sights', body }]).covered).toBe(false)
  })
})

describe('price binding window', () => {
  it('binds a price to the item before it, not to a drink after it', () => {
    const body = 'Egg sandwich ¥900, then later on the page we also serve coffee'
    expect(assessField('drink price', [{ sourceId: 's1', heading: 'Menu', body }]).covered).toBe(false)
  })
})
