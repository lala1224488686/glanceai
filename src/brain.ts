/**
 * GlanceAI's answer engine.
 *
 * Two modes, in order:
 *
 * 1. Real LLM (only when the user configured their own endpoint in
 *    src/config.ts): POSTs the question to an OpenAI-compatible chat
 *    completions endpoint with a system prompt that forces a SHORT,
 *    glanceable answer. The reply is hard-clamped before display.
 *
 * 2. Built-in rule engine (default): answers a small set of question
 *    types — time, date, live BTC/ETH price, top headline, simple
 *    arithmetic, and a few canned explainers. Anything else gets an
 *    honest "I can't answer that in local mode" reply that explains
 *    how to enable a real model. It never fabricates an answer.
 */

import { GLANCEAI_CONFIG } from './config'
import { fetchHeadlines, fetchPrices, formatUsd } from './data'

/** G2 is a glance display: answers are kept to a few short lines. */
const MAX_ANSWER_CHARS = 220

function clamp(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > MAX_ANSWER_CHARS
    ? clean.slice(0, MAX_ANSWER_CHARS - 1) + '…'
    : clean
}

async function answerWithLlm(question: string): Promise<string | null> {
  const { llmEndpoint, llmModel, llmApiKey } = GLANCEAI_CONFIG
  if (!llmEndpoint) return null
  try {
    const res = await fetch(llmEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(llmApiKey ? { Authorization: `Bearer ${llmApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: llmModel || undefined,
        messages: [
          {
            role: 'system',
            content:
              'You answer for a smart-glasses glance display. Reply in at most 2 short sentences, plain words, no markdown, under 200 characters.',
          },
          { role: 'user', content: question },
        ],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = data.choices?.[0]?.message?.content
    return text ? clamp(text) : null
  } catch {
    return null
  }
}

const CANNED: { match: RegExp; answer: string }[] = [
  {
    match: /what is (mcp|the model context protocol)/i,
    answer:
      'MCP (Model Context Protocol) is an open standard that lets AI apps plug into tools and data sources through one shared interface.',
  },
  {
    match: /what (are|is) (even )?g2|even realities/i,
    answer:
      'Even G2 are smart glasses with a private green micro-LED display (576x288 per eye), touch and ring input, and no camera.',
  },
  {
    match: /who are you|your name/i,
    answer:
      'I am GlanceAI, a glanceable assistant demo for Even G2 glasses, built for the Heads Up hackathon.',
  },
  {
    match: /hello|hi\b|hey/i,
    answer: 'Hello! Ask me the time, the BTC price, the top headline, or pick a question from the list.',
  },
]

function evalArithmetic(q: string): string | null {
  const m = q.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/x×])\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[3])
  const op = m[2]
  let r: number
  if (op === '+') r = a + b
  else if (op === '-') r = a - b
  else if (op === '/' ) r = b === 0 ? NaN : a / b
  else r = a * b
  if (!Number.isFinite(r)) return 'That calculation does not work out.'
  return `${a} ${op === 'x' || op === '×' ? '×' : op} ${b} = ${Math.round(r * 100) / 100}`
}

async function answerWithRules(question: string): Promise<string> {
  const q = question.trim()

  const arith = evalArithmetic(q)
  if (arith) return arith

  if (/\b(time|clock)\b/i.test(q) && !/time ?zone/i.test(q)) {
    return `It is ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} right now.`
  }
  if (/\b(date|today|day is it)\b/i.test(q)) {
    return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`
  }
  if (/\b(btc|bitcoin)\b/i.test(q) && /\b(price|worth|cost|much)\b/i.test(q)) {
    const p = await fetchPrices()
    return p
      ? `BTC is ${formatUsd(p.btc)} right now (via ${p.source}).`
      : 'Price feed is unreachable right now. Try again in a moment.'
  }
  if (/\b(eth|ethereum)\b/i.test(q) && /\b(price|worth|cost|much)\b/i.test(q)) {
    const p = await fetchPrices()
    return p
      ? `ETH is ${formatUsd(p.eth)} right now (via ${p.source}).`
      : 'Price feed is unreachable right now. Try again in a moment.'
  }
  if (/\b(news|headline|headlines|happening)\b/i.test(q)) {
    const h = await fetchHeadlines(1)
    return h.isSample
      ? `Live news is unreachable; top sample headline: ${h.titles[0].replace(/^Sample: /, '')}`
      : `Top headline: ${h.titles[0]}`
  }
  for (const c of CANNED) {
    if (c.match.test(q)) return c.answer
  }
  return clamp(
    'Local demo brain: I can only answer the preset questions, time/date, BTC/ETH price, headlines and simple math. ' +
      'To answer anything, set your own LLM endpoint in src/config.ts.',
  )
}

/** Main entry: real LLM when configured, honest rules otherwise. */
export async function answerQuestion(question: string): Promise<string> {
  const llm = await answerWithLlm(question)
  if (llm) return llm
  return clamp(await answerWithRules(question))
}

/** Questions offered on the glasses (browsable by swipe, tap to ask). */
export const PRESET_QUESTIONS: string[] = [
  'What is the BTC price?',
  'What are the top headlines?',
  'What time is it?',
  'What is MCP?',
  'What is 128 + 46?',
  'What are Even G2 glasses?',
]
