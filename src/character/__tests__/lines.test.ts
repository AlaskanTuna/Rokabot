import { describe, expect, it } from 'vitest'
import { fillLine } from '../lines.js'

describe('fillLine', () => {
  it('fills each named slot and leaves any other as written', () => {
    expect(fillLine('Hey {{mention}}: "{{task}}" #{{id}} {{other}}', { mention: '<@1>', task: 'tea', id: 7 })).toBe(
      'Hey <@1>: "tea" #7 {{other}}'
    )
  })

  it('inserts a value literally, so a reminder cannot fill another slot or a replacement pattern', () => {
    expect(fillLine('"{{task}}" for {{mention}}', { task: "{{mention}} $& $1 $'", mention: '<@1>' })).toBe(
      '"{{mention}} $& $1 $\'" for <@1>'
    )
  })
})
