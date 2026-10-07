import { resolve } from 'node:path'
import Database from 'better-sqlite3'

interface ReportRow extends Record<string, unknown> {
  id: number
  created_at: number
  type: string
  status: string
  message: string
  user_id: string
  username: string | null
  display_name: string | null
  context: string
  attachment_name: string | null
  context_json: string
}

interface ReportOptions {
  dbPath: string
  id?: number
  status?: string
  limit: number
}

function parseArgs(args: string[]): ReportOptions {
  const options: ReportOptions = { dbPath: 'data/rokabot.db', limit: 20 }
  if (args[0] && !args[0].startsWith('--')) options.dbPath = args.shift() as string

  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)

    if (flag === '--id') {
      const id = Number(value)
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('--id must be a positive integer')
      options.id = id
    } else if (flag === '--status') {
      options.status = value
    } else if (flag === '--limit') {
      const limit = Number(value)
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer')
      options.limit = limit
    } else {
      throw new Error(`Unknown option: ${flag}`)
    }
    index++
  }
  return options
}

function showOne(database: Database.Database, id: number): void {
  const row = database.prepare('SELECT * FROM bug_reports WHERE id = ?').get(id) as ReportRow | undefined
  if (!row) throw new Error(`No report with id ${id}`)
  console.log(JSON.stringify({ ...row, context_json: JSON.parse(row.context_json) }, null, 2))
}

function showMany(database: Database.Database, status: string | undefined, limit: number): void {
  const where = status ? 'WHERE status = ?' : ''
  const parameters = status ? [status, limit] : [limit]
  const rows = database
    .prepare(
      `SELECT id, created_at, type, status, context, user_id, username, display_name, message, attachment_name
       FROM bug_reports ${where} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...parameters) as ReportRow[]

  console.log('ID\tCreated At\tType\tStatus\tContext\tUser\tMessage\tAttachment')
  for (const row of rows) {
    const user = row.display_name ?? row.username ?? row.user_id
    const message = row.message.replace(/\s+/g, ' ').slice(0, 80)
    console.log(
      [
        row.id,
        new Date(row.created_at).toISOString(),
        row.type,
        row.status,
        row.context,
        user,
        message,
        row.attachment_name !== null ? 'yes' : 'no'
      ].join('\t')
    )
  }
}

function main(): void {
  let database: Database.Database | undefined
  try {
    const options = parseArgs(process.argv.slice(2))
    database = new Database(resolve(options.dbPath), { readonly: true, fileMustExist: true })
    if (options.id !== undefined) showOne(database, options.id)
    else showMany(database, options.status, options.limit)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error('Usage: npm run reports -- [db] [--id N] [--status open] [--limit 20]')
    process.exitCode = 1
  } finally {
    database?.close()
  }
}

main()
