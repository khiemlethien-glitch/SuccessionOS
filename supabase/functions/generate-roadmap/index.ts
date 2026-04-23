/**
 * Supabase Edge Function: generate-roadmap
 *
 * Proxies requests to OpenAI GPT-4o for career roadmap generation.
 * The OpenAI API key is stored as an Edge Function secret (OPENAI_API_KEY)
 * and is NEVER exposed to the browser.
 *
 * Security:
 *  - Requires a valid Supabase Auth JWT (user must be logged in)
 *  - Rate-limited: max 20 calls per user per day (tracked in Supabase)
 *  - Only allows model gpt-4o with capped max_tokens (4000)
 *  - CORS restricted to same Supabase project origin in production
 *
 * Deploy:
 *   supabase functions deploy generate-roadmap --no-verify-jwt false
 *   supabase secrets set OPENAI_API_KEY=sk-proj-...
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── CORS ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://successionos.vercel.app',
  'http://localhost:4200',
  'http://localhost:4000',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age':       '86400',
  }
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

// ─── Rate-limit helper ────────────────────────────────────────────────────────
const RATE_LIMIT_PER_DAY = 20

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // We re-use the audit_logs table to track AI calls
    const { count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action', 'ai_roadmap_generate')
      .gte('timestamp', `${today}T00:00:00Z`)

    return (count ?? 0) < RATE_LIMIT_PER_DAY
  } catch {
    // If rate-limit check fails, allow the request (fail open)
    return true
  }
}

async function logAiCall(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_id:   userId,
      action:    'ai_roadmap_generate',
      timestamp: new Date().toISOString(),
    })
  } catch {
    // Non-critical — don't fail the request if logging fails
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  const origin = req.headers.get('Origin')

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin)
  }

  // ── 1. Verify Supabase auth JWT ─────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401, origin)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json({ error: 'Unauthorized — valid session required' }, 401, origin)
  }

  // ── 2. Rate limit ───────────────────────────────────────────────────────────
  const allowed = await checkRateLimit(supabase, user.id)
  if (!allowed) {
    return json({
      error: `Rate limit exceeded — max ${RATE_LIMIT_PER_DAY} AI calls per day`,
    }, 429, origin)
  }

  // ── 3. Parse & validate request body ───────────────────────────────────────
  let body: { messages: unknown[]; temperature?: number; max_tokens?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin)
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'messages array is required' }, 400, origin)
  }

  // Hard-cap params — caller cannot override to expensive settings
  const temperature = Math.min(body.temperature ?? 0.7, 1.0)
  const max_tokens  = Math.min(body.max_tokens  ?? 4000, 4000)

  // ── 4. Call OpenAI ──────────────────────────────────────────────────────────
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) {
    console.error('OPENAI_API_KEY secret is not set')
    return json({ error: 'AI service not configured' }, 503, origin)
  }

  const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model:           'gpt-4o',
      messages:        body.messages,
      response_format: { type: 'json_object' },
      temperature,
      max_tokens,
    }),
  })

  const openaiData = await openaiResp.json()

  if (!openaiResp.ok) {
    console.error('OpenAI error:', openaiData)
    return json({ error: openaiData.error?.message ?? 'OpenAI request failed' }, 502, origin)
  }

  // ── 5. Log usage & return ───────────────────────────────────────────────────
  await logAiCall(supabase, user.id)

  return json(openaiData, 200, origin)
})
