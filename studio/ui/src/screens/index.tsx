import type { ComponentType } from 'react'
import type { Route } from '../lib/router'
import Discord from './Discord'
import Identity from './Identity'
import Limits from './Limits'
import Lines from './Lines'
import Memory from './Memory'
import Models from './Models'
import Moods from './Moods'
import Prompts from './Prompts'
import Secrets from './Secrets'
import Voice from './Voice'

export const SCREENS: Record<Route, { title: string; Component: ComponentType }> = {
  identity: { title: 'Identity', Component: Identity },
  prompts: { title: 'Prompts', Component: Prompts },
  voice: { title: 'Voice', Component: Voice },
  moods: { title: 'Moods', Component: Moods },
  lines: { title: 'Lines', Component: Lines },
  models: { title: 'Models', Component: Models },
  memory: { title: 'Memory', Component: Memory },
  limits: { title: 'Limits', Component: Limits },
  discord: { title: 'Discord', Component: Discord },
  secrets: { title: 'Secrets', Component: Secrets }
}
