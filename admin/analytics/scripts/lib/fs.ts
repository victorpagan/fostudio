import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true })
}

export async function ensureParentDir(path: string) {
  await ensureDir(dirname(path))
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeJsonFile(path: string, value: unknown) {
  await ensureParentDir(path)
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export async function writeTextFile(path: string, value: string) {
  await ensureParentDir(path)
  await writeFile(path, value, 'utf8')
}

export async function fileExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
