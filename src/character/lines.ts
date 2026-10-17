/** A line from lines.yml with its slots filled; a slot with no value stays as written. */
export function fillLine(line: string, values: Readonly<Record<string, string | number>>): string {
  return line.replace(/\{\{(\w+)\}\}/g, (slot, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : slot
  )
}
