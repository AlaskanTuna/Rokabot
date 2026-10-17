import { z } from 'zod'
import { characterFileSchema, linesFileSchema, moodsFileSchema, voiceFileSchema } from '../../src/character/schema.js'

/** JSON Schema for what a deployer writes in each pack file, so fields with defaults show as optional. */
export function packSchemas(): Record<string, unknown> {
  const schemas = {
    'character.yml': characterFileSchema,
    'voice.yml': voiceFileSchema,
    'moods.yml': moodsFileSchema,
    'lines.yml': linesFileSchema
  }
  return Object.fromEntries(
    Object.entries(schemas).map(([file, schema]) => [file, z.toJSONSchema(schema, { io: 'input' })])
  )
}
