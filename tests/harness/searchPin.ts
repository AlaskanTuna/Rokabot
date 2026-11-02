/** Pins the harness to Tavily, whose key the harness deletes to keep `search_web` declared and unreachable. */

// toolTrigger.ts removes TAVILY_API_KEY so search_web spends nothing. That only leaves the tool unreachable
// while Tavily is the selected backend; another provider would still find its own key.
process.env.SEARCH_PROVIDER = 'tavily'
