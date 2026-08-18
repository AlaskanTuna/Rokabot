import { askCommand } from './ask.js'
import { gameCommands } from './games.js'
import { statsCommand } from './stats.js'
import { toolCommands } from './tools.js'

export function buildCommandBody() {
  return [
    askCommand.toJSON(),
    ...toolCommands.map((command) => command.toJSON()),
    ...gameCommands.map((command) => command.toJSON()),
    statsCommand.toJSON()
  ]
}
