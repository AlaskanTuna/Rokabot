function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Removes tool calls the model wrote into its reply instead of making them — `*(recall_user: Mio)*` from Gemini,
 * a `tool_code` fence, or Qwen's `<tool_call>` block. Only spans naming a real tool are removed, so an ordinary
 * `*(sighs)*` survives.
 */
export function stripNarratedToolCalls(text: string, toolNames: readonly string[]): { text: string; stripped: number } {
  if (toolNames.length === 0) return { text, stripped: 0 }
  const names = toolNames.map(escapeRegExp).join('|')
  const patterns = [
    new RegExp(`[*_\`]*[(\\[]\\s*(?:${names})\\s*:[^)\\]\\n]*[)\\]][*_\`]*[ \\t]*\\n?`, 'g'),
    new RegExp(`\`\`\`[a-z_]*\\n[^\`]*?\\b(?:${names})\\s*\\([^\`]*?\`\`\`[ \\t]*\\n?`, 'g'),
    /<tool_call>[\s\S]*?<\/tool_call>[ \t]*\n?/g
  ]
  let stripped = 0
  let result = text
  for (const pattern of patterns) {
    result = result.replace(pattern, () => {
      stripped++
      return ''
    })
  }
  return { text: result, stripped }
}
