/** Single message in the per-channel FIFO window. */
export interface WindowMessage {
  role: 'user' | 'assistant'
  displayName: string
  content: string
  timestamp: number
}
