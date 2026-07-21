/** ADK FunctionTool definitions for the Roka agent */

import { FunctionTool } from '@google/adk'
import { z } from 'zod'
import { config } from '../../config.js'
import { flipCoin } from './flipCoin.js'
import { getAnimeSchedule } from './getAnimeSchedule.js'
import { getCurrentTime } from './getCurrentTime.js'
import { getWeather } from './getWeather.js'
import { recallUser } from './recallUser.js'
import { rememberUser } from './rememberUser.js'
import { rollDice } from './rollDice.js'
import { searchAnime } from './searchAnime.js'
import { searchWeb } from './searchWeb.js'
import { cancelReminder, listReminders, setReminder } from './setReminder.js'

export { rollDice, flipCoin, getCurrentTime, searchAnime, getAnimeSchedule, getWeather, searchWeb }
export { rememberUser, recallUser }
export { setReminder }
export type { SetReminderParams } from './setReminder.js'
export type { RollDiceParams } from './rollDice.js'
export type { GetCurrentTimeParams } from './getCurrentTime.js'
export type { SearchAnimeParams } from './searchAnime.js'
export type { GetAnimeScheduleParams } from './getAnimeSchedule.js'
export type { GetWeatherParams } from './getWeather.js'
export type { SearchWebParams } from './searchWeb.js'
export type { RememberUserParams } from './rememberUser.js'
export type { RecallUserParams } from './recallUser.js'

export const rollDiceTool = new FunctionTool({
  name: 'roll_dice',
  description: 'Roll dice. Use when someone wants to roll dice or play a dice game.',
  parameters: z.object({
    count: z.number().int().describe('Number of dice to roll (1-10)').optional(),
    sides: z.number().int().describe('Number of sides per die (2-100)').optional()
  }),
  execute: async (input) => rollDice(input)
})

export const flipCoinTool = new FunctionTool({
  name: 'flip_coin',
  description: 'Flip a coin. Use when someone wants to flip a coin or make a random heads/tails choice.',
  execute: async () => flipCoin()
})

export const getCurrentTimeTool = new FunctionTool({
  name: 'get_current_time',
  description:
    'Get the current time, date, and day of the week for a location. IMPORTANT: Always report the exact time returned by this tool — never estimate or guess the time yourself.',
  parameters: z.object({
    location: z
      .string()
      .describe('IANA timezone (e.g. Asia/Tokyo) or city name (e.g. London). Defaults to configured timezone.')
      .optional(),
    format: z.enum(['12h', '24h']).describe('Time format: 12h or 24h. Defaults to 24h.').optional()
  }),
  execute: async (input) => getCurrentTime(input)
})

export const searchAnimeTool = new FunctionTool({
  name: 'search_anime',
  description:
    'Search for anime by title or keyword. ALWAYS use this first for anime questions before trying search_web.',
  parameters: z.object({
    query: z.string().describe('Anime title or search keyword'),
    limit: z.number().int().describe('Number of results to return (1-25). Defaults to 5.').optional(),
    sort_by: z
      .enum(['score', 'popularity', 'members', 'title', 'start_date'])
      .describe('Sort results by. Defaults to relevance.')
      .optional(),
    type: z.enum(['tv', 'movie', 'ova', 'special', 'ona', 'music']).describe('Filter by anime type.').optional(),
    status: z.enum(['airing', 'complete', 'upcoming']).describe('Filter by airing status.').optional()
  }),
  execute: async (input) => await searchAnime(input)
})

export const getAnimeScheduleTool = new FunctionTool({
  name: 'get_anime_schedule',
  description:
    'Get anime airing schedule. ALWAYS use this first for schedule/airing questions before trying search_web. Can check a specific day, the full week, or current season.',
  parameters: z.object({
    scope: z
      .enum(['day', 'week', 'season'])
      .describe('Time range: day (single day), week (full week), or season (current season). Defaults to day.')
      .optional(),
    day: z
      .enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
      .describe('Day of the week (only used when scope is day). Defaults to today.')
      .optional(),
    sort_by: z
      .enum(['score', 'popularity', 'members', 'title'])
      .describe('Sort results by. Defaults to score.')
      .optional(),
    limit: z.number().int().describe('Number of results to return (1-25). Defaults to 5.').optional(),
    anime: z
      .string()
      .describe(
        'Search for a specific anime by name to get its broadcast schedule. When provided, overrides scope/sort/limit.'
      )
      .optional()
  }),
  execute: async (input) => await getAnimeSchedule({ scope: input.scope ?? 'day', ...input })
})

export const getWeatherTool = new FunctionTool({
  name: 'get_weather',
  description:
    "Get the current weather for a city. Defaults to the bot's configured timezone location if no city is specified. Use when someone asks about the weather, temperature, or conditions in a location.",
  parameters: z.object({
    city: z.string().describe('City name to get weather for. Omit to use the default location.').optional()
  }),
  execute: async (input) => await getWeather(input)
})

export const searchWebTool = new FunctionTool({
  name: 'search_web',
  description:
    'FALLBACK: Search the web. Only use this when other tools (search_anime, get_anime_schedule, get_weather, get_current_time) cannot answer the question, OR when the user explicitly asks about recent news and current events.',
  parameters: z.object({
    query: z.string().describe('Search query'),
    topic: z.enum(['general', 'news']).describe('Search topic. Use news for current events.').optional(),
    max_results: z.number().int().describe('Number of results (1-10). Defaults to 5.').optional()
  }),
  execute: async (input) => await searchWeb(input)
})

export const rememberUserTool = new FunctionTool({
  name: 'remember_user',
  description:
    'Remember a fact about the current user. Use when someone shares personal details worth remembering — their name preference, favorite anime, hobbies, birthday, etc. Only store genuinely useful facts, not temporary conversation details. The user ID is filled in automatically.',
  parameters: z.object({
    fact_key: z.string().describe('A short label for the fact (e.g. "favorite_anime", "nickname", "birthday")'),
    fact_value: z.string().describe('The value of the fact (e.g. "Frieren", "Ali", "March 15")')
  }),
  execute: async (input, toolContext) => {
    const userId = toolContext?.state?.get<string>('_userId') ?? 'unknown'
    const guildId = toolContext?.state?.get<string>('_guildId') ?? 'global'
    return rememberUser({ user_id: userId, guild_id: guildId, fact_key: input.fact_key, fact_value: input.fact_value })
  }
})

export const recallUserTool = new FunctionTool({
  name: 'recall_user',
  description:
    'Recall stored facts about the current user. Use when you want to check what you remember about them. The user ID is filled in automatically.',
  parameters: z.object({}),
  execute: async (_input, toolContext) => {
    const userId = toolContext?.state?.get<string>('_userId') ?? 'unknown'
    const guildId = toolContext?.state?.get<string>('_guildId') ?? 'global'
    return recallUser({ user_id: userId, guild_id: guildId })
  }
})

export const setReminderTool = new FunctionTool({
  name: 'set_reminder',
  description:
    'Set a reminder for the current user. Use EITHER delay_minutes (for "in X minutes") OR target_hour+target_minute (for "at 3pm"). Do NOT call get_current_time first when using target_hour — the tool computes the delay automatically. The user and channel are filled in automatically.',
  parameters: z.object({
    reminder: z.string().describe('What to remind them about'),
    delay_minutes: z
      .number()
      .describe('Minutes from now until the reminder (1-10080). Use this for "in X minutes" requests.')
      .optional(),
    target_hour: z
      .number()
      .describe('Target hour (0-23) for "at X:XXpm" requests. The tool computes the delay automatically.')
      .optional(),
    target_minute: z.number().describe('Target minute (0-59, default 0). Use with target_hour.').optional()
  }),
  execute: async (input, toolContext) => {
    const userId = toolContext?.state?.get<string>('_userId') ?? 'unknown'
    const channelId = toolContext?.state?.get<string>('_channelId') ?? 'unknown'

    let delayMinutes: number

    if (input.target_hour !== undefined) {
      // Compute delay from target clock time using configured timezone
      const tz = config.timezone ?? undefined
      const now = new Date()
      let currentHours: number, currentMins: number
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
          timeZone: tz
        })
        const parts = formatter.format(now).split(':')
        currentHours = parseInt(parts[0], 10)
        currentMins = parseInt(parts[1], 10)
      } catch {
        currentHours = now.getHours()
        currentMins = now.getMinutes()
      }

      const targetMins = input.target_hour * 60 + (input.target_minute ?? 0)
      const currentTotalMins = currentHours * 60 + currentMins
      delayMinutes = targetMins - currentTotalMins
      if (delayMinutes <= 0) delayMinutes += 24 * 60
    } else if (input.delay_minutes !== undefined) {
      delayMinutes = input.delay_minutes
    } else {
      return { success: false, message: 'Specify either delay_minutes or target_hour.' }
    }

    return setReminder({
      user_id: userId,
      channel_id: channelId,
      reminder: input.reminder,
      delay_minutes: delayMinutes
    })
  }
})

export const listRemindersTool = new FunctionTool({
  name: 'list_reminders',
  description:
    "List the current user's active reminders. Use when someone asks to see their reminders, check what's pending, or asks 'what reminders do I have'. The user ID is filled in automatically.",
  parameters: z.object({}),
  execute: async (_input, toolContext) => {
    const userId = toolContext?.state?.get<string>('_userId') ?? 'unknown'
    return listReminders({ user_id: userId })
  }
})

export const cancelReminderTool = new FunctionTool({
  name: 'cancel_reminder',
  description:
    'Cancel an active reminder by its ID. Use when someone asks to cancel, remove, or delete a reminder. Call list_reminders first if you need to find the ID. The user ID is filled in automatically.',
  parameters: z.object({
    reminder_id: z.number().describe('The reminder ID to cancel (get this from list_reminders)')
  }),
  execute: async (input, toolContext) => {
    const userId = toolContext?.state?.get<string>('_userId') ?? 'unknown'
    return cancelReminder({ user_id: userId, reminder_id: input.reminder_id })
  }
})

/** All tool instances registered with the Roka LlmAgent */
export const rokaTools = [
  rollDiceTool,
  flipCoinTool,
  getCurrentTimeTool,
  searchAnimeTool,
  getAnimeScheduleTool,
  getWeatherTool,
  searchWebTool,
  rememberUserTool,
  recallUserTool,
  setReminderTool,
  listRemindersTool,
  cancelReminderTool
]
