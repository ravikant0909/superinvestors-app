'use client'

import { useEffect, useState } from 'react'

// Private mode gates the owner's personal research layer (the 8-dimension scores,
// FOLLOW/MONITOR/IGNORE verdicts, "relevance to us" notes, and score-ranked sorting)
// off the public, generic superinvestor tracker. It's a local, owner-only toggle —
// the data still lives in the DB/API; the public UI simply doesn't render it.
const KEY = 'si-private'

export function usePrivateMode(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    try {
      setOn(localStorage.getItem(KEY) === '1')
    } catch {
      /* localStorage unavailable */
    }
  }, [])
  return on
}

export function setPrivateMode(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* localStorage unavailable */
  }
}
