/**
 * GlanceAI — a glanceable AI assistant for Even Realities G2.
 *
 * One screen, one thing, a few words:
 *  - Ask AI: pick a question (or type one on the phone) → one short
 *    answer card on the glasses.
 *  - News: the top 3 live headlines.
 *  - Prices: BTC / ETH on one line each.
 *
 * The same screen state machine drives two renderers:
 *  - EvenRenderer: the real path. Renders through the Even Hub SDK
 *    bridge into a single full-screen text container on the G2.
 *  - DomRenderer: browser preview fallback (no bridge found). Draws
 *    the same text into a 576x288 frame so the app can be developed,
 *    demoed and screenshotted in a plain browser.
 *
 * Input mapping (glasses): swipe up/down = move, tap = select,
 * double tap = back (on the home screen: system exit dialog).
 */

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { answerQuestion, PRESET_QUESTIONS } from './brain'
import { fetchHeadlines, fetchPrices, formatTime, formatUsd } from './data'
import './style.css'

// ---------------------------------------------------------------------------
// Small text helpers — the G2 canvas fits only a few short lines.
// ---------------------------------------------------------------------------

const LINE_WIDTH = 32
const MAX_LINES = 9

function wrap(text: string, width = LINE_WIDTH): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (w.length > width) {
      if (cur) lines.push(cur)
      for (let i = 0; i < w.length; i += width) lines.push(w.slice(i, i + width))
      cur = ''
    } else if ((cur + ' ' + w).trim().length <= width) {
      cur = (cur + ' ' + w).trim()
    } else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function fit(lines: string[]): string {
  return lines.slice(0, MAX_LINES).join('\n')
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

type ScreenName = 'home' | 'ask' | 'answer' | 'news' | 'prices'

interface AppState {
  screen: ScreenName
  menuIndex: number
  questionIndex: number
  answerQ: string
  answerA: string
  busy: boolean
  newsLines: string[]
  priceLines: string[]
}

const MENU: { name: ScreenName; label: string }[] = [
  { name: 'ask', label: 'Ask AI' },
  { name: 'news', label: 'News' },
  { name: 'prices', label: 'BTC / ETH prices' },
]

const state: AppState = {
  screen: 'home',
  menuIndex: 0,
  questionIndex: 0,
  answerQ: '',
  answerA: '',
  busy: false,
  newsLines: ['Loading headlines…'],
  priceLines: ['Loading prices…'],
}

function renderContent(): string {
  switch (state.screen) {
    case 'home': {
      const lines = ['GlanceAI', '']
      MENU.forEach((item, i) => {
        lines.push(`${i === state.menuIndex ? '>' : ' '} ${item.label}`)
      })
      lines.push('', 'Swipe: move  Tap: open')
      lines.push('Double-tap: exit')
      return fit(lines)
    }
    case 'ask': {
      const lines = ['Ask AI']
      PRESET_QUESTIONS.forEach((q, i) => {
        const mark = i === state.questionIndex ? '>' : ' '
        wrap(`${mark} ${q}`, LINE_WIDTH).forEach((l) => lines.push(l))
      })
      lines.push('Tap: ask  2xTap: back')
      return fit(lines)
    }
    case 'answer': {
      const lines = ['Q:', ...wrap(state.answerQ, LINE_WIDTH).slice(0, 2), 'A:']
      if (state.busy) lines.push('Thinking…')
      else {
        const aLines = wrap(state.answerA, LINE_WIDTH)
        lines.push(...aLines.slice(0, 4))
        if (aLines.length > 4) lines[lines.length - 1] += '…'
      }
      lines.push('Tap: more Qs  2xTap: home')
      return fit(lines)
    }
    case 'news': {
      const lines = ['Top headlines']
      state.newsLines.forEach((l) => lines.push(l))
      lines.push('Tap: refresh  2xTap: back')
      return fit(lines)
    }
    case 'prices': {
      const lines = ['Markets', '']
      state.priceLines.forEach((l) => lines.push(l))
      lines.push('', 'Tap: refresh  2xTap: back')
      lines.push('Read-only data, not advice.')
      return fit(lines)
    }
  }
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

interface Renderer {
  show(content: string): void
  exit(): void
}

class DomRenderer implements Renderer {
  private el: HTMLElement
  constructor(el: HTMLElement) {
    this.el = el
  }
  show(content: string): void {
    this.el.textContent = content
  }
  exit(): void {
    this.el.textContent = 'GlanceAI closed.\n\n(Exit dialog is shown by the\nsystem on real glasses.)'
  }
}

type EvenBridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>

class EvenRenderer implements Renderer {
  private bridge: EvenBridge
  constructor(bridge: EvenBridge) {
    this.bridge = bridge
  }
  show(content: string): void {
    void this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 1, containerName: 'main', content }),
    )
  }
  exit(): void {
    // Mode 1 = system exit-confirmation dialog; required on the root page.
    void this.bridge.shutDownPageContainer(1)
  }
}

let renderer: Renderer

function draw(): void {
  renderer.show(renderContent())
}

// ---------------------------------------------------------------------------
// Data loading for the glance panels
// ---------------------------------------------------------------------------

async function loadNews(): Promise<void> {
  state.newsLines = ['Loading headlines…']
  if (state.screen === 'news') draw()
  const h = await fetchHeadlines(3)
  const lines: string[] = []
  h.titles.forEach((t, i) => {
    wrap(`${i + 1}. ${t}`, LINE_WIDTH).slice(0, 2).forEach((l) => lines.push(l))
  })
  if (h.isSample) lines.push('(sample data - feed offline)')
  state.newsLines = lines
  if (state.screen === 'news') draw()
}

async function loadPrices(): Promise<void> {
  state.priceLines = ['Loading prices…']
  if (state.screen === 'prices') draw()
  const p = await fetchPrices()
  state.priceLines = p
    ? [
        `BTC  ${formatUsd(p.btc)}`,
        `ETH  ${formatUsd(p.eth)}`,
        `via ${p.source}, ${formatTime(p.fetchedAt)}`,
      ]
    : ['Prices unavailable.', 'Check connection, tap to retry.']
  if (state.screen === 'prices') draw()
}

// ---------------------------------------------------------------------------
// Actions (shared by glasses events and browser-preview input)
// ---------------------------------------------------------------------------

async function askAndShow(question: string): Promise<void> {
  state.answerQ = question
  state.answerA = ''
  state.busy = true
  state.screen = 'answer'
  draw()
  state.answerA = await answerQuestion(question)
  state.busy = false
  draw()
}

function goHome(): void {
  state.screen = 'home'
  draw()
}

function openScreen(name: ScreenName): void {
  state.screen = name
  draw()
  if (name === 'news') void loadNews()
  if (name === 'prices') void loadPrices()
}

function onScroll(down: boolean): void {
  if (state.screen === 'home') {
    const n = MENU.length
    state.menuIndex = (state.menuIndex + (down ? 1 : -1) + n) % n
    draw()
  } else if (state.screen === 'ask') {
    const n = PRESET_QUESTIONS.length
    state.questionIndex = (state.questionIndex + (down ? 1 : -1) + n) % n
    draw()
  }
}

function onClick(): void {
  switch (state.screen) {
    case 'home':
      openScreen(MENU[state.menuIndex].name)
      break
    case 'ask':
      void askAndShow(PRESET_QUESTIONS[state.questionIndex])
      break
    case 'answer':
      state.screen = 'ask'
      draw()
      break
    case 'news':
      void loadNews()
      break
    case 'prices':
      void loadPrices()
      break
  }
}

function onDoubleClick(): void {
  if (state.screen === 'home') {
    renderer.exit()
  } else if (state.screen === 'answer') {
    goHome()
  } else {
    goHome()
  }
}

function handleEventType(eventType: number | undefined): void {
  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
    case undefined: // SDK sometimes normalizes click (0) to undefined
      onClick()
      break
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      onScroll(true)
      break
    case OsEventTypeList.SCROLL_TOP_EVENT:
      onScroll(false)
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      onDoubleClick()
      break
  }
}

// ---------------------------------------------------------------------------
// Browser-preview input mapping (mouse / wheel / keyboard on the frame)
// ---------------------------------------------------------------------------

function wireDomInput(frame: HTMLElement): void {
  let clickTimer: number | undefined
  frame.addEventListener('click', (e) => {
    if (e.detail >= 2) {
      window.clearTimeout(clickTimer)
      handleEventType(OsEventTypeList.DOUBLE_CLICK_EVENT)
    } else {
      clickTimer = window.setTimeout(
        () => handleEventType(OsEventTypeList.CLICK_EVENT),
        260,
      )
    }
  })
  let wheelLock = 0
  frame.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const now = Date.now()
      if (now - wheelLock < 180) return
      wheelLock = now
      handleEventType(
        e.deltaY > 0
          ? OsEventTypeList.SCROLL_BOTTOM_EVENT
          : OsEventTypeList.SCROLL_TOP_EVENT,
      )
    },
    { passive: false },
  )
  frame.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') handleEventType(OsEventTypeList.SCROLL_BOTTOM_EVENT)
    else if (e.key === 'ArrowUp') handleEventType(OsEventTypeList.SCROLL_TOP_EVENT)
    else if (e.key === 'Enter') handleEventType(OsEventTypeList.CLICK_EVENT)
    else if (e.key === 'Escape' || e.key === 'Backspace')
      handleEventType(OsEventTypeList.DOUBLE_CLICK_EVENT)
  })
}

// ---------------------------------------------------------------------------
// Boot: bridge if present (simulator / glasses), DOM preview otherwise
// ---------------------------------------------------------------------------

async function tryBridge(timeoutMs = 1500): Promise<EvenBridge | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs),
    )
    const bridge = await Promise.race([waitForEvenAppBridge(), timeout])
    return (bridge as EvenBridge | null) ?? null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const screenEl = document.getElementById('g2-screen') as HTMLElement
  const frame = document.getElementById('g2-frame') as HTMLElement
  const modeLine = document.getElementById('mode-line') as HTMLElement

  const bridge = await tryBridge()

  if (bridge) {
    const mainText = new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 6,
      containerID: 1,
      containerName: 'main',
      content: renderContent(),
      isEventCapture: 1,
    })
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [mainText] }),
    )
    if (result !== 0) {
      // The SDK shim also exists in plain browsers, where the startup
      // page call fails (no Flutter handler behind it). Treat any
      // non-zero result as "no real bridge" and use the DOM preview.
      console.warn('createStartUpPageContainer returned', result, '- falling back to DOM preview')
      renderer = new DomRenderer(screenEl)
      modeLine.textContent =
        'Mode: browser preview (bridge present but startup page failed). Open this page in the Even Hub simulator or the Even App for the real glasses UI.'
    } else {
    const evenRenderer = new EvenRenderer(bridge)
    bridge.onEvenHubEvent((event) => {
      const textEvent = (
        event as { textEvent?: { containerID?: number; eventType?: number } }
      ).textEvent
      if (!textEvent || textEvent.containerID !== 1) return
      handleEventType(textEvent.eventType)
    })
    modeLine.textContent =
      'Mode: Even Hub bridge connected (simulator or G2 glasses). The glasses show the UI; this page mirrors the current screen text.'
    // Keep the DOM preview in sync as a mirror of the glasses screen.
    const mirror = new DomRenderer(screenEl)
    renderer = {
      show: (c: string) => {
        evenRenderer.show(c)
        mirror.show(c)
      },
      exit: () => evenRenderer.exit(),
    }
    }
  } else {
    renderer = new DomRenderer(screenEl)
    modeLine.textContent =
      'Mode: browser preview (no Even bridge found). Interact with the frame above, or open this page in the Even Hub simulator for the real bridge.'
  }

  wireDomInput(frame)
  draw()

  // Companion input: type on the phone, answer card lands on the glasses.
  const form = document.getElementById('ask-form') as HTMLFormElement
  const input = document.getElementById('ask-input') as HTMLInputElement
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const q = input.value.trim()
    if (!q) return
    input.value = ''
    void askAndShow(q)
  })
}

void main()
