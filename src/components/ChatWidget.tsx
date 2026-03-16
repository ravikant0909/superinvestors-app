'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { buildApiUrl } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTION_CHIPS = [
  'What stocks do most investors hold?',
  "Tell me about Li Lu's portfolio",
  'Suggest an improvement',
]

const ROTATING_PLACEHOLDERS = [
  'Ask anything about investor portfolios, or give us feedback...',
  'Why does Li Lu own Google?',
  'Which investors recently bought new positions?',
  'I wish this site showed...',
]

function getPageContext(): string {
  if (typeof window === 'undefined') return 'Homepage'
  const path = window.location.pathname
  if (path.match(/^\/investors\/(.+)/)) {
    const slug = path.split('/investors/')[1]?.replace(/\/$/, '')
    return `Viewing investor profile: ${slug}`
  }
  if (path.match(/^\/convictions\/(.+)/)) {
    const slug = path.split('/convictions/')[1]?.replace(/\/$/, '')
    return `Viewing conviction analysis: ${slug}`
  }
  if (path === '/changes' || path === '/changes/') return 'Viewing position changes'
  if (path === '/investors' || path === '/investors/') return 'Viewing investors list'
  if (path === '/best-ideas' || path === '/best-ideas/') return 'Viewing best ideas / cross-investor overlap'
  if (path === '/convictions' || path === '/convictions/') return 'Viewing conviction bets'
  if (path === '/about' || path === '/about/') return 'Viewing about page'
  return 'Homepage'
}

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('si-chat-session')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('si-chat-session', id)
  }
  return id
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const collapsedInputRef = useRef<HTMLInputElement>(null)

  // Rotate placeholder text every 4 seconds when collapsed
  useEffect(() => {
    if (isOpen) return
    const interval = setInterval(() => {
      setPlaceholderIndex(prev => (prev + 1) % ROTATING_PLACEHOLDERS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [isOpen])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    const assistantMessage: Message = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMessage])

    try {
      const response = await fetch(buildApiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context: getPageContext(),
          history: messages,
          sessionId: getSessionId(),
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }))
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: error.error || 'Something went wrong. Please try again.',
          }
          return updated
        })
        setIsLoading(false)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: 'No response received.' }
          return updated
        })
        setIsLoading(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                fullText += parsed.text
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: fullText }
                  return updated
                })
              }
            } catch {
              // Skip unparseable
            }
          }
        }
      }

      if (!fullText) {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: 'No response received.' }
          return updated
        })
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Unable to connect. Please try again later.',
        }
        return updated
      })
    }

    setIsLoading(false)
  }

  return (
    <>
      {/* Backdrop overlay when chat is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Collapsed state: bottom-center search bar */}
      {!isOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-5 px-4 pointer-events-none">
          <div className="w-full max-w-2xl pointer-events-auto">
            <div
              className="bg-white rounded-2xl shadow-lg border border-gray-200 px-5 py-3 cursor-text hover:shadow-xl transition-shadow"
              onClick={() => setIsOpen(true)}
            >
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <input
                  ref={collapsedInputRef}
                  type="text"
                  readOnly
                  tabIndex={-1}
                  className="flex-1 text-sm text-gray-400 bg-transparent outline-none cursor-text placeholder:text-gray-400"
                  placeholder={ROTATING_PLACEHOLDERS[placeholderIndex]}
                  onFocus={() => setIsOpen(true)}
                />
                <div className="flex-shrink-0 bg-indigo-500 rounded-lg p-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400 text-center">
                Powered by AI &middot; All site data included &middot; Feedback welcome
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Expanded state: full chat panel from bottom-center */}
      {isOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-5 px-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[600px]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Ask anything</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Questions about any investor, stock, or thesis. Your feedback helps us improve.
                  </p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                  aria-label="Close chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[200px] max-h-[400px]">
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 mb-2">Try asking:</p>
                  {SUGGESTION_CHIPS.map(chip => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      className="block w-full text-left text-sm px-3 py-2 rounded-lg bg-gray-50 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 transition-colors border border-gray-200"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-indigo-50 text-gray-900'
                        : 'bg-gray-50 text-gray-900'
                    }`}
                  >
                    {msg.content || (isLoading && i === messages.length - 1 ? (
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    ) : '')}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-5 py-3 border-t border-gray-100">
              <form
                onSubmit={e => {
                  e.preventDefault()
                  sendMessage(input)
                }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="px-3 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 text-white rounded-lg transition-colors"
                  aria-label="Send message"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
              <p className="mt-2 text-[11px] text-gray-400 text-center">
                Free for now — may become premium as usage grows
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
