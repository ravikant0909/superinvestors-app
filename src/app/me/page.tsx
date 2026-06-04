'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { setPrivateMode } from '@/lib/private-mode'

// Owner-only: toggle the personal research layer (scores / verdicts / ranking)
// back on. Not linked from the public nav. The flag is stored in localStorage on
// this device. When on, the rest of the site re-renders the kept-for-you scoring.
export default function MePage() {
  const [on, setOn] = useState(false)

  useEffect(() => {
    try {
      setOn(localStorage.getItem('si-private') === '1')
    } catch {
      /* ignore */
    }
  }, [])

  function toggle(next: boolean) {
    setPrivateMode(next)
    setOn(next)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-gray-900">Private research layer</h1>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          The public site is a generic superinvestor tracker. Your personal scoring — the
          8-dimension ratings, FOLLOW / MONITOR / IGNORE verdicts, &ldquo;relevance to us&rdquo; notes,
          and score-ranked sorting — is kept in the data but hidden from the public UI. Turn it on
          here (this device only) to see it across the investor pages.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => toggle(!on)}
            aria-pressed={on}
            className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition ${
              on ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                on ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm font-semibold text-gray-800">
            Personal scoring is {on ? 'ON' : 'off'}
          </span>
        </div>

        {on && (
          <div className="mt-6 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-900">
            Scores and verdicts are now visible. Open the{' '}
            <Link href="/investors" className="font-semibold underline">
              investors list
            </Link>{' '}
            — it&apos;s now ranked by your composite score, with the verdict filter and score
            breakdowns restored.
          </div>
        )}

        <p className="mt-6 text-xs text-gray-400">
          Note: the scores are still returned by the API (this only controls what the UI shows).
          For a fully private API, gate the scoring endpoints — a separate follow-up.
        </p>
      </div>
    </div>
  )
}
