import { readFile } from 'node:fs/promises'
import path from 'node:path'

type Mode = 'run' | 'outputs'
type Scope = 'weekly' | 'monthly' | 'refresh'

type ParsedArgs = {
  mode: Mode
  url: string
  scope: Scope
  json: boolean
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  pnpm analytics:remote:run [--url=https://fo.studio] [--scope=weekly|monthly|refresh] [--json]',
      '  pnpm analytics:remote:outputs [--url=https://fo.studio] [--json]',
      '',
      'Flags:',
      '  --url=<url>          Analytics app base URL (default: https://fo.studio)',
      '  --scope=<scope>      Scope for run mode (weekly, monthly, refresh)',
      '  --json               Print full endpoint JSON response'
    ].join('\n')
  )
}

function readOption(argv: string[], name: string) {
  const prefix = `--${name}=`
  const item = argv.find(value => value.startsWith(prefix))
  return item ? item.slice(prefix.length).trim() : null
}

function hasFlag(argv: string[], name: string) {
  return argv.includes(`--${name}`)
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Invalid URL: "${value}". Include protocol, for example https://fo.studio`)
  }
  return trimmed
}

function stripQuotes(value: string) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

async function loadEnvFile(filePath: string) {
  const raw = await readFile(filePath, 'utf8').catch(() => '')
  if (!raw) return

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    if (process.env[key]) continue
    process.env[key] = stripQuotes(match[2])
  }
}

async function loadLocalEnv() {
  const repoRoot = process.cwd()
  await loadEnvFile(path.join(repoRoot, '.env'))
  await loadEnvFile(path.join(repoRoot, '.env.local'))
}

function resolveKey(mode: Mode) {
  const runKey = process.env.ANALYTICS_RUN_SHARED_KEY?.trim() || ''
  const exportKey = process.env.ANALYTICS_EXPORT_SHARED_KEY?.trim() || ''

  if (mode === 'run') return runKey || exportKey
  return exportKey
}

function parseArgs(argv: string[]): ParsedArgs | null {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage()
    return null
  }

  const modeArg = argv[0]
  if (modeArg !== 'run' && modeArg !== 'outputs') {
    throw new Error('Expected first arg to be "run" or "outputs". Use --help for examples.')
  }

  const mode: Mode = modeArg
  const url = normalizeBaseUrl(readOption(argv, 'url') || process.env.ANALYTICS_APP_URL || 'https://fo.studio')
  const scopeRaw = readOption(argv, 'scope') || 'weekly'
  const scope = (scopeRaw === 'weekly' || scopeRaw === 'monthly' || scopeRaw === 'refresh')
    ? scopeRaw
    : (() => { throw new Error(`Invalid --scope value "${scopeRaw}". Expected weekly, monthly, or refresh.`) })()
  const json = hasFlag(argv, 'json')

  return {
    mode,
    url,
    scope,
    json
  }
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const text = await response.text()
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {}

  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim()
    throw new Error(`Request failed (${status}) at ${url}: ${JSON.stringify(payload)}`)
  }

  return payload
}

function printSummary(mode: Mode, payload: Record<string, unknown>) {
  if (mode === 'run') {
    const run = (payload.run && typeof payload.run === 'object') ? payload.run as Record<string, unknown> : {}
    const outputs = (payload.outputs && typeof payload.outputs === 'object') ? payload.outputs as Record<string, unknown> : {}
    console.log('[analytics:remote] run complete')
    console.log(JSON.stringify({
      authMode: payload.authMode ?? null,
      scope: payload.scope ?? null,
      exitCode: run.exitCode ?? null,
      durationMs: run.durationMs ?? null,
      generatedAt: outputs.generatedAt ?? null,
      freshness: outputs.freshness ?? null,
      storage: outputs.storage ?? null,
      source: outputs.source ?? null,
      artifacts: payload.artifacts ?? [],
      summary: payload.summary ?? null,
      missingFiles: outputs.missingFiles ?? []
    }, null, 2))
    return
  }

  const metrics = (payload.metrics && typeof payload.metrics === 'object')
    ? payload.metrics as Record<string, unknown>
    : null

  console.log('[analytics:remote] outputs fetched')
  console.log(JSON.stringify({
    authMode: payload.authMode ?? null,
    generatedAt: payload.generatedAt ?? null,
    freshness: payload.freshness ?? null,
    storage: payload.storage ?? null,
    source: payload.source ?? null,
    weekOf: metrics?.week_of ?? null,
    missingFiles: payload.missingFiles ?? []
  }, null, 2))
}

async function main() {
  await loadLocalEnv()
  const args = parseArgs(process.argv.slice(2))
  if (!args) return

  const key = resolveKey(args.mode)
  if (!key) {
    const keyName = args.mode === 'run'
      ? 'ANALYTICS_RUN_SHARED_KEY or ANALYTICS_EXPORT_SHARED_KEY'
      : 'ANALYTICS_EXPORT_SHARED_KEY'

    throw new Error(`Missing analytics key. Set ${keyName} in process env or .env`)
  }

  const endpoint = args.mode === 'run'
    ? `/api/internal/analytics/run?scope=${encodeURIComponent(args.scope)}`
    : '/api/internal/analytics/outputs'

  const url = `${args.url}${endpoint}`

  const payload = await requestJson(url, {
    method: args.mode === 'run' ? 'POST' : 'GET',
    headers: {
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json'
    },
    body: args.mode === 'run'
      ? JSON.stringify({ requireSupabase: true })
      : undefined
  })

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  printSummary(args.mode, payload)
}

main().catch((error: unknown) => {
  console.error('[analytics:remote] failed', error)
  process.exitCode = 1
})
