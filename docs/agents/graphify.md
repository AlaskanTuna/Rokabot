# Graphify

Use this only if `which graphify` succeeds and `graphify-out/graph.json` exists; not every teammate has it.

- **Query First:** for "how does X work", "what calls Y" or "where is Z handled", run `graphify query "<question>"` before grep, then grep or read for exact `file:line` evidence. This applies to subagents too.
- **Other Commands:** `graphify query "<question>" --budget 1500`, `graphify path "A" "B"` and `graphify explain "Node"`.
- **Stay Fresh:** after changing code, run `graphify update .` (no LLM).
- **LLM Steps:** run them as `GEMINI_API_KEY="$GRAPHIFY_GEMINI_API_KEY" graphify label .`, so they never spend the bot's own key.
- **Committed Graph:** `graphify-out/` holds the current graph, and refreshing it is a normal PR. Graph-only changes do not redeploy the bot.
