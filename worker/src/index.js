const ALLOWED_ORIGINS = [
  'https://superinvestors-app.pages.dev',
  'http://localhost:3000',
];

const SYSTEM_PROMPT = `You are a helpful assistant for SuperInvestors (superinvestors-app.pages.dev), a website tracking ~150 legendary value investors' SEC 13F portfolio holdings, position changes, cross-investor overlap, and conviction bet analyses.

You help users understand:
- Investor portfolios and strategies
- Position changes and what they might signal
- Investment theses for conviction bets
- Value investing concepts

Current page context: {context}

Rules:
- Be factual, cite data from the site where possible
- Do not give investment advice or buy/sell recommendations
- If the user is suggesting a site improvement, acknowledge it warmly and note it has been logged
- Keep responses concise but helpful`;

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// In-memory rate limiting (resets on worker restart, good enough for this use case)
const rateLimitMap = new Map();

function isRateLimited(sessionId) {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionId);
  if (!entry) {
    rateLimitMap.set(sessionId, { count: 1, windowStart: now });
    return false;
  }
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(sessionId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }
  entry.count++;
  return false;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env, headers);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },
};

async function handleChat(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const { message, context, history, sessionId } = body;

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId is required' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  if (isRateLimited(sessionId)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
      status: 429,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = SYSTEM_PROMPT.replace('{context}', context || 'Homepage');

  const messages = [];
  if (Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      if (msg.role && msg.content) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  messages.push({ role: 'user', content: message });

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Stream the response through to the client, collecting full text for logging
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    let fullResponse = '';

    // Process the stream in the background
    const streamPromise = (async () => {
      const reader = anthropicResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  fullResponse += parsed.delta.text;
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`));
                }
              } catch {
                // Skip unparseable chunks
              }
            }
          }
        }

        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      } catch (err) {
        console.error('Stream processing error:', err);
        await writer.abort(err);
      }

      // Log to D1
      try {
        const isSuggestion = /suggest|improve|feature|add|change.*site/i.test(message) ? 1 : 0;
        await env.DB.prepare(
          'INSERT INTO chat_logs (session_id, page_context, question, response, is_suggestion) VALUES (?, ?, ?, ?, ?)'
        ).bind(sessionId, context || null, message, fullResponse, isSuggestion).run();
      } catch (err) {
        console.error('D1 logging error:', err);
      }
    })();

    // Don't block on the stream processing, let it run via waitUntil if available
    // The readable side is returned immediately for streaming
    return new Response(readable, {
      headers: {
        ...headers,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Chat handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}
