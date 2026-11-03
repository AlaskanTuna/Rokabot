import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface Vocabulary {
  types: string[]
  scopes: string[]
}

export interface ParsedTitle {
  type: string
  scope: string | null
}

export interface PullRequestState {
  title: string
  labels: string[]
  assignees: string[]
  headRef: string
}

interface CommitlintConfig {
  rules: Record<string, [number, string, string[]]>
}

interface GitHubActor {
  login: string
}

interface GitHubLabel {
  name: string
}

interface GitHubIssue {
  number: number
  title: string
  labels: GitHubLabel[]
  assignees: GitHubActor[]
  user: GitHubActor
}

interface GitHubPullRequest extends GitHubIssue {
  head: { ref: string }
}

const FALLBACK_ASSIGNEE = 'AlaskanTuna'
const MAX_TITLE_LENGTH = 100
const RELEASE_PLEASE_PREFIX = 'release-please--'
const TITLE_PATTERN = /^([^(:!]+)(\(([^()]*)\))?(!)?: (.+)$/

export async function loadVocabulary(): Promise<Vocabulary> {
  const url = new URL('../commitlint.config.js', import.meta.url).href
  const loaded: { default: CommitlintConfig } = await import(url)
  return { types: loaded.default.rules['type-enum'][2], scopes: loaded.default.rules['scope-enum'][2] }
}

export function parseTitle(title: string, vocabulary: Vocabulary): ParsedTitle | null {
  const match = TITLE_PATTERN.exec(title)
  if (match === null) return null
  const type = match[1]
  if (!vocabulary.types.includes(type)) return null
  if (match[2] === undefined) return { type, scope: null }
  const scope = match[3]
  if (scope.length === 0 || !vocabulary.scopes.includes(scope)) return null
  return { type, scope }
}

export function labelsFor(parsed: ParsedTitle): string[] {
  if (parsed.scope === null || parsed.scope === 'main') return [`type:${parsed.type}`, 'area:repo']
  return [`type:${parsed.type}`, `area:${parsed.scope}`]
}

export function pullRequestProblems(pr: PullRequestState, vocabulary: Vocabulary): string[] {
  if (pr.headRef.startsWith(RELEASE_PLEASE_PREFIX)) return []
  const problems: string[] = []
  if (parseTitle(pr.title, vocabulary) === null) problems.push(`title is not a conventional commit: ${pr.title}`)
  if (pr.title.length > MAX_TITLE_LENGTH) problems.push(`title is longer than ${MAX_TITLE_LENGTH} characters`)
  if (!pr.labels.some((label) => label.startsWith('type:'))) problems.push('pull request is missing a type:* label')
  if (!pr.labels.some((label) => label.startsWith('area:'))) problems.push('pull request is missing an area:* label')
  if (pr.assignees.length === 0) problems.push('pull request has no assignee')
  return problems
}

function api(repo: string, path: string, args: string[]): void {
  execFileSync('gh', ['api', `repos/${repo}/${path}`, ...args], { stdio: 'pipe' })
}

function assignable(repo: string, login: string): boolean {
  try {
    api(repo, `assignees/${login}`, [])
    return true
  } catch {
    return false
  }
}

function labelAndAssign(
  repo: string,
  number: number,
  title: string,
  labels: string[],
  assignees: string[],
  author: string,
  vocabulary: Vocabulary
): void {
  const parsed = parseTitle(title, vocabulary)
  const wanted = parsed === null ? ['needs-triage'] : labelsFor(parsed)
  api(repo, `issues/${number}/labels`, ['--method', 'POST', ...wanted.flatMap((label) => ['-f', `labels[]=${label}`])])
  if (parsed !== null && labels.includes('needs-triage')) {
    api(repo, `issues/${number}/labels/needs-triage`, ['--method', 'DELETE'])
  }
  if (assignees.length === 0) {
    const login = assignable(repo, author) ? author : FALLBACK_ASSIGNEE
    api(repo, `issues/${number}/assignees`, ['--method', 'POST', '-f', `assignees[]=${login}`])
  }
}

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  const eventName = process.env.GITHUB_EVENT_NAME
  const repo = process.env.GITHUB_REPOSITORY
  if (eventPath === undefined || eventName === undefined || repo === undefined) {
    console.error('metadata needs GITHUB_EVENT_PATH, GITHUB_EVENT_NAME and GITHUB_REPOSITORY')
    process.exitCode = 1
    return
  }
  const payload: unknown = JSON.parse(readFileSync(eventPath, 'utf8'))
  const vocabulary = await loadVocabulary()
  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    const pr = (payload as { pull_request: GitHubPullRequest }).pull_request
    if (pr.head.ref.startsWith(RELEASE_PLEASE_PREFIX)) return
    const labels = pr.labels.map((label) => label.name)
    const assignees = pr.assignees.map((user) => user.login)
    labelAndAssign(repo, pr.number, pr.title, labels, assignees, pr.user.login, vocabulary)
    const options = { encoding: 'utf8', stdio: 'pipe' } as const
    const fresh = JSON.parse(
      execFileSync('gh', ['api', `repos/${repo}/pulls/${pr.number}`], options)
    ) as GitHubPullRequest
    const problems = pullRequestProblems(
      {
        title: fresh.title,
        labels: fresh.labels.map((label) => label.name),
        assignees: fresh.assignees.map((user) => user.login),
        headRef: fresh.head.ref
      },
      vocabulary
    )
    for (const problem of problems) console.log(problem)
    if (problems.length > 0) process.exitCode = 1
  } else if (eventName === 'issues') {
    const issue = (payload as { issue: GitHubIssue }).issue
    const labels = issue.labels.map((label) => label.name)
    const assignees = issue.assignees.map((user) => user.login)
    labelAndAssign(repo, issue.number, issue.title, labels, assignees, issue.user.login, vocabulary)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
