/**
 * Live data for GlanceAI's glance panels.
 *
 * Every source here is a free, key-less public API that sends CORS
 * headers, and every domain is declared in app.json's network whitelist:
 *
 * - Prices: public exchange ticker APIs, tried in order — Binance,
 *   OKX, Gate.io, CoinGecko (all free, key-less, read-only market data;
 *   the first that answers wins and is named on screen). No trading,
 *   no advice. Some regions block some exchanges, hence the chain.
 * - News: Hacker News official Firebase API (top stories). If the
 *   network fails, clearly-labelled sample headlines are shown instead
 *   (see SAMPLE_HEADLINES) so the UI never goes blank.
 */

export interface Prices {
  btc: number
  eth: number
  source: string
  fetchedAt: Date
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

async function pricesFromBinance(): Promise<Prices> {
  const [btcRes, ethRes] = await Promise.all([
    fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
    fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT'),
  ])
  const btc = Number((btcRes as { price: string }).price)
  const eth = Number((ethRes as { price: string }).price)
  if (!Number.isFinite(btc) || !Number.isFinite(eth)) throw new Error('bad price payload')
  return { btc, eth, source: 'Binance', fetchedAt: new Date() }
}

async function pricesFromOkx(): Promise<Prices> {
  const [btcRes, ethRes] = await Promise.all([
    fetchJson('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT'),
    fetchJson('https://www.okx.com/api/v5/market/ticker?instId=ETH-USDT'),
  ])
  const btc = Number((btcRes as { data: { last: string }[] }).data[0].last)
  const eth = Number((ethRes as { data: { last: string }[] }).data[0].last)
  if (!Number.isFinite(btc) || !Number.isFinite(eth)) throw new Error('bad price payload')
  return { btc, eth, source: 'OKX', fetchedAt: new Date() }
}

async function pricesFromGate(): Promise<Prices> {
  const [btcRes, ethRes] = await Promise.all([
    fetchJson('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT'),
    fetchJson('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=ETH_USDT'),
  ])
  const btc = Number((btcRes as { last: string }[])[0].last)
  const eth = Number((ethRes as { last: string }[])[0].last)
  if (!Number.isFinite(btc) || !Number.isFinite(eth)) throw new Error('bad price payload')
  return { btc, eth, source: 'Gate.io', fetchedAt: new Date() }
}

async function pricesFromCoinGecko(): Promise<Prices> {
  const res = (await fetchJson(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
  )) as { bitcoin: { usd: number }; ethereum: { usd: number } }
  return {
    btc: res.bitcoin.usd,
    eth: res.ethereum.usd,
    source: 'CoinGecko',
    fetchedAt: new Date(),
  }
}

/** Returns null when every source is unreachable. */
export async function fetchPrices(): Promise<Prices | null> {
  const sources = [pricesFromBinance, pricesFromOkx, pricesFromGate, pricesFromCoinGecko]
  for (const source of sources) {
    try {
      return await source()
    } catch {
      // try the next source
    }
  }
  return null
}

export interface Headlines {
  titles: string[]
  /** true when these are the bundled samples, not live data */
  isSample: boolean
}

/**
 * Bundled fallback headlines, shown ONLY when the live feed cannot be
 * reached, and always labelled as samples on screen and in the README.
 */
export const SAMPLE_HEADLINES: string[] = [
  'Sample: Markets steady ahead of Fed decision',
  'Sample: New open-source AI model released',
  'Sample: City marathon draws record crowd',
]

export async function fetchHeadlines(count = 3): Promise<Headlines> {
  try {
    const ids = (await fetchJson(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
    )) as number[]
    const top = ids.slice(0, count)
    const titles: string[] = []
    for (const id of top) {
      const item = (await fetchJson(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
      )) as { title?: string }
      if (item.title) titles.push(item.title)
    }
    if (titles.length === 0) throw new Error('no titles')
    return { titles, isSample: false }
  } catch {
    return { titles: SAMPLE_HEADLINES.slice(0, count), isSample: true }
  }
}

export function formatUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  })
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
