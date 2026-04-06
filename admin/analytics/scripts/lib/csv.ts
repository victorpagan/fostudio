import { readTextFile } from './fs'

type CsvRow = Record<string, string>

function splitCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let idx = 0; idx < line.length; idx += 1) {
    const char = line[idx]

    if (char === '"') {
      const next = line[idx + 1]
      if (inQuotes && next === '"') {
        current += '"'
        idx += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

export async function readCsv(path: string): Promise<CsvRow[]> {
  const raw = await readTextFile(path)
  if (!raw) return []

  const lines = raw
    .split(/\r?\n/g)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const headers = splitCsvLine(lines[0] ?? '').map(header => header.trim())
  const rows: CsvRow[] = []

  for (let idx = 1; idx < lines.length; idx += 1) {
    const line = lines[idx]
    if (!line) continue

    const values = splitCsvLine(line)
    const row: CsvRow = {}

    headers.forEach((header, headerIdx) => {
      row[header] = values[headerIdx] ?? ''
    })

    rows.push(row)
  }

  return rows
}
