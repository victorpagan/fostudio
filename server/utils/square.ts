// server/utils/square/index.ts
import { SquareClient, SquareEnvironment } from 'square'
import { getKey } from '~~/server/utils/config/secret'
import type { H3Event } from 'h3'

let squareClient: SquareClient | null = null

export async function useSquareClient(event: H3Event): Promise<SquareClient> {
  if (squareClient) return squareClient

  const token = await getKey(event, 'SQUARE_ACCESS_TOKEN')
  const environment = SquareEnvironment.Production

  if (!token) {
    throw new Error('Missing Square access token in runtime config')
  }

  squareClient = new SquareClient({
    token,
    environment,
    timeoutInSeconds: 15,
    maxRetries: 1
  })

  return squareClient
}
