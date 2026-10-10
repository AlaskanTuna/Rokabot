// No imports here: promptSafety reads these names, and tools/index.ts imports promptSafety back.
export const ROKA_TOOL_NAMES = [
  'search_anime',
  'get_anime_schedule',
  'search_web',
  'read_replies',
  'remember_user',
  'recall_user',
  'forget_user',
  'set_reminder',
  'list_reminders',
  'cancel_reminder',
  'roll_dice',
  'flip_coin',
  'get_current_time',
  'get_weather'
] as const
