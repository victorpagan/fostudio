import { spawn } from 'node:child_process'

export type AnalyticsRunScope = 'weekly' | 'monthly' | 'refresh'

export type AnalyticsRunResult = {
  ok: boolean
  command: string
  args: string[]
  exitCode: number
  durationMs: number
  stdout: string
  stderr: string
}

function trimOutput(value: string, maxChars = 12000) {
  if (value.length <= maxChars) return value
  return value.slice(value.length - maxChars)
}

function resolveScriptForScope(scope: AnalyticsRunScope) {
  if (scope === 'refresh') return 'analytics:refresh'
  return 'analytics:all'
}

export async function runAnalyticsPipeline(options?: { requireSupabase?: boolean, scope?: AnalyticsRunScope }): Promise<AnalyticsRunResult> {
  const startedAt = Date.now()
  const scope = options?.scope ?? 'weekly'
  const args = [resolveScriptForScope(scope)]
  const command = 'pnpm'
  const requireSupabase = options?.requireSupabase ?? true

  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANALYTICS_REQUIRE_SUPABASE: requireSupabase ? '1' : (process.env.ANALYTICS_REQUIRE_SUPABASE ?? ''),
        ANALYTICS_SCOPE: scope
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk)
    })

    child.on('close', (exitCode) => {
      resolve({
        ok: exitCode === 0,
        command,
        args,
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        durationMs: Date.now() - startedAt,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr)
      })
    })

    child.on('error', (error) => {
      stderr += `\n${String(error)}`
      resolve({
        ok: false,
        command,
        args,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr)
      })
    })
  })
}
