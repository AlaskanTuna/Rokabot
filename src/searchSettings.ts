/** Reads for the search state, tolerating the partial `config.js` mocks most tests use. */

import { type SearchProvider, config } from './config.js'

export function searchProviderSetting(): SearchProvider {
  return config.search?.provider ?? 'tavily'
}

export function searchIsAvailable(): boolean {
  return config.search?.available ?? true
}
