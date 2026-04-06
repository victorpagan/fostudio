import { spawn } from 'node:child_process'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  dryRun: z.coerce.boolean().optional().default(false)
})

function trimOutput(value: string, maxChars = 15000) {
  if (value.length <= maxChars) return value
  return value.slice(value.length - maxChars)
}

function parseSummaryFromStdout(stdout: string) {
  const lines = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line) continue
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>
      }
    } catch {
      continue
    }
  }

  return null
}

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})
  const startedAt = Date.now()

  const args = [
    'exec',
    'tsx',
    'admin/analytics/scripts/sync_ads_platforms.ts',
    '--json'
  ]

  if (body.dryRun) {
    args.push('--dry-run')
  }

  const result = await new Promise<{
    ok: boolean
    exitCode: number
    stdout: string
    stderr: string
    durationMs: number
  }>((resolve) => {
    const child = spawn('pnpm', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANALYTICS_REQUIRE_SUPABASE: '1'
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
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        durationMs: Date.now() - startedAt
      })
    })

    child.on('error', (error) => {
      stderr += `\n${String(error)}`
      resolve({
        ok: false,
        exitCode: 1,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        durationMs: Date.now() - startedAt
      })
    })
  })

  const summary = parseSummaryFromStdout(result.stdout)

  if (!result.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Ads integrations sync failed',
      data: {
        ...result,
        summary
      }
    })
  }

  return {
    ok: true,
    dryRun: body.dryRun,
    durationMs: result.durationMs,
    summary,
    run: {
      exitCode: result.exitCode,
      stderr: result.stderr
    }
  }
})
