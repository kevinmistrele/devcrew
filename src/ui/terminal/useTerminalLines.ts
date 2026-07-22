import { useCallback, useSyncExternalStore } from 'react'
import { getTerminalSnapshot, subscribeTerminal, type TerminalLine } from '@/core/terminal-service'

/** Assina o canal (aba = funcionário) do Terminal ao vivo e re-renderiza a cada linha nova. */
export function useTerminalLines(channelId: string): TerminalLine[] {
  const subscribe = useCallback((listener: () => void) => subscribeTerminal(channelId, listener), [channelId])
  const getSnapshot = useCallback(() => getTerminalSnapshot(channelId), [channelId])
  return useSyncExternalStore(subscribe, getSnapshot)
}
