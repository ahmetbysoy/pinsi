import { Candle, FlowEvent, FlowSnapshot, LiquidationEvent, SymbolInfo, Ticker24h, TradeEvent } from './types';

export const REST_BASE = 'https://fapi.binance.com';
export const WS_BASE = 'wss://fstream.binance.com';

export async function fetchExchangeInfo(): Promise<SymbolInfo[]> {
  const res = await fetch(`${REST_BASE}/fapi/v1/exchangeInfo`);
  if (!res.ok) throw new Error(`exchangeInfo HTTP ${res.status}`);
  const data = await res.json();
  const symbols: SymbolInfo[] = [];

  for (const s of data.symbols) {
    if (s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING') {
      const priceFilter = s.filters.find((f: { filterType: string }) => f.filterType === 'PRICE_FILTER');
      const lotFilter = s.filters.find((f: { filterType: string }) => f.filterType === 'LOT_SIZE');
      const tick = priceFilter && priceFilter.tickSize ? parseFloat(priceFilter.tickSize) : 0.0001;
      const step = lotFilter && lotFilter.stepSize ? parseFloat(lotFilter.stepSize) : 0.001;
      symbols.push({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        tickSize: tick,
        stepSize: step,
        pricePrecision: Math.max(0, Math.round(-Math.log10(tick))),
        quantityPrecision: Math.max(0, Math.round(-Math.log10(step)))
      });
    }
  }
  return symbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function fetchKlines(symbol: string, interval: string, limit: number = 600): Promise<Candle[]> {
  const res = await fetch(`${REST_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`klines HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Invalid klines response');

  return data.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
}

export async function fetch24hTickers(): Promise<Ticker24h[]> {
  const res = await fetch(`${REST_BASE}/fapi/v1/ticker/24hr`);
  if (!res.ok) throw new Error(`ticker/24hr HTTP ${res.status}`);
  const data = await res.json();
  return (data as { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; highPrice: string; lowPrice: string; count: number }[])
    .filter((t) => t.symbol.endsWith('USDT'))
    .map((t) => ({
      symbol: t.symbol,
      lastPrice: parseFloat(t.lastPrice),
      priceChangePercent: parseFloat(t.priceChangePercent),
      quoteVolume: parseFloat(t.quoteVolume),
      highPrice: parseFloat(t.highPrice),
      lowPrice: parseFloat(t.lowPrice),
      count: t.count
    }))
    .sort((a, b) => b.quoteVolume - a.quoteVolume);
}

export async function fetchOpenInterest(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${REST_BASE}/fapi/v1/openInterest?symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    const val = parseFloat(data.openInterest);
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
}

export async function fetchPremiumIndex(symbol: string): Promise<{ fundingRate: number | null; markPrice: number | null; nextFundingTime: number | null }> {
  try {
    const res = await fetch(`${REST_BASE}/fapi/v1/premiumIndex?symbol=${symbol}`);
    if (!res.ok) return { fundingRate: null, markPrice: null, nextFundingTime: null };
    const data = await res.json();
    return {
      fundingRate: data.lastFundingRate ? parseFloat(data.lastFundingRate) : null,
      markPrice: data.markPrice ? parseFloat(data.markPrice) : null,
      nextFundingTime: data.nextFundingTime ? parseInt(data.nextFundingTime, 10) : null
    };
  } catch {
    return { fundingRate: null, markPrice: null, nextFundingTime: null };
  }
}

export async function fetchDepthSnapshot(symbol: string, limit: number = 1000): Promise<{
  lastUpdateId: number;
  bids: [number, number][];
  asks: [number, number][];
}> {
  const res = await fetch(`${REST_BASE}/fapi/v1/depth?symbol=${symbol}&limit=${limit}`);
  if (!res.ok) throw new Error(`depth snapshot HTTP ${res.status}`);
  const snap = await res.json();
  const bids: [number, number][] = (snap.bids || []).map((x: [string, string]) => [parseFloat(x[0]), parseFloat(x[1])]);
  const asks: [number, number][] = (snap.asks || []).map((x: [string, string]) => [parseFloat(x[0]), parseFloat(x[1])]);
  return {
    lastUpdateId: parseInt(snap.lastUpdateId, 10) || 0,
    bids,
    asks
  };
}

export interface StreamCallbacks {
  onKline?: (candle: Candle, isClosed: boolean) => void;
  onTrade?: (trade: TradeEvent) => void;
  onMarkPrice?: (mark: { markPrice: number; fundingRate: number; nextFundingTime: number }) => void;
  onLiquidation?: (liq: LiquidationEvent) => void;
  onDepthUpdate?: (depth: { bids: Map<number, number>; asks: Map<number, number>; lastUpdateId: number }) => void;
  onStatusChange?: (status: { connected: boolean; message?: string }) => void;
}

export class BinanceStreamClient {
  private ws: WebSocket | null = null;
  private symbol: string = 'BTCUSDT';
  private interval: string = '5m';
  private callbacks: StreamCallbacks = {};
  private active = false;
  private retryCount = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastMessageTime = 0;

  // Orderbook state
  public bidsBook = new Map<number, number>();
  public asksBook = new Map<number, number>();
  public depthSynced = false;
  public depthLastUpdate = 0;
  private depthBuffer: any[] = [];
  private syncGen = 0;

  constructor(symbol: string, interval: string, callbacks: StreamCallbacks) {
    this.symbol = symbol.toUpperCase();
    this.interval = interval;
    this.callbacks = callbacks;
  }

  public updateConfig(symbol: string, interval: string) {
    const symbolChanged = this.symbol !== symbol.toUpperCase();
    const intervalChanged = this.interval !== interval;

    this.symbol = symbol.toUpperCase();
    this.interval = interval;

    if (symbolChanged || intervalChanged) {
      this.reconnect();
    }
  }

  public start() {
    this.active = true;
    this.connect();
    this.startWatchdog();
  }

  public stop() {
    this.active = false;
    this.cleanupSocket();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.depthSynced = false;
    this.depthBuffer = [];
  }

  public reconnect() {
    this.cleanupSocket();
    this.depthSynced = false;
    this.depthBuffer = [];
    this.bidsBook.clear();
    this.asksBook.clear();
    this.connect();
  }

  private cleanupSocket() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  private startWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (!this.active) return;
      const now = Date.now();
      if (this.ws && this.lastMessageTime > 0 && now - this.lastMessageTime > 35000) {
        console.warn('[BinanceStream] Watchdog timeout, reconnecting...');
        this.reconnect();
      }
    }, 10000);
  }

  private connect() {
    if (!this.active) return;
    this.cleanupSocket();

    const sym = this.symbol.toLowerCase();
    const streams = [
      `${sym}@kline_${this.interval}`,
      `${sym}@aggTrade`,
      `${sym}@markPrice@1s`,
      `${sym}@forceOrder`,
      `${sym}@depth@100ms`,
      `!forceOrder@arr`
    ].join('/');

    const url = `${WS_BASE}/stream?streams=${streams}`;
    this.callbacks.onStatusChange?.({ connected: false, message: 'Bağlanıyor...' });

    const gen = ++this.syncGen;
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.retryCount = 0;
      this.lastMessageTime = Date.now();
      this.callbacks.onStatusChange?.({ connected: true, message: 'Bağlandı' });
      this.initDepthSync(gen);
    };

    this.ws.onmessage = (ev) => {
      this.lastMessageTime = Date.now();
      let payload: any;
      try {
        payload = JSON.parse(ev.data);
      } catch {
        return;
      }

      const data = payload.data || payload;
      if (!data) return;

      const eventType = data.e;
      if (eventType === 'kline' && data.s === this.symbol) {
        const k = data.k;
        if (k) {
          const candle: Candle = {
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v)
          };
          this.callbacks.onKline?.(candle, !!k.x);
        }
      } else if (eventType === 'aggTrade' && data.s === this.symbol) {
        const price = parseFloat(data.p);
        const qty = parseFloat(data.q);
        const notional = price * qty;
        const isSell = !!data.m;
        const trade: TradeEvent = {
          ts: data.T || data.E || Date.now(),
          price,
          qty,
          notional,
          delta: isSell ? -notional : notional,
          side: isSell ? 'sell' : 'buy'
        };
        this.callbacks.onTrade?.(trade);
      } else if (eventType === 'markPriceUpdate' && data.s === this.symbol) {
        this.callbacks.onMarkPrice?.({
          markPrice: parseFloat(data.p),
          fundingRate: parseFloat(data.r),
          nextFundingTime: data.T ? parseInt(data.T, 10) : 0
        });
      } else if (eventType === 'forceOrder') {
        const o = data.o || {};
        if (o.s === this.symbol) {
          const price = parseFloat(o.ap || o.p);
          const qty = parseFloat(o.z || o.q);
          const notional = price * qty;
          const side = o.S as 'BUY' | 'SELL';
          const liq: LiquidationEvent = {
            ts: o.T || data.E || Date.now(),
            price,
            qty,
            notional,
            side,
            type: side === 'SELL' ? 'LONG_LIQ' : 'SHORT_LIQ'
          };
          this.callbacks.onLiquidation?.(liq);
        }
      } else if (eventType === 'depthUpdate' && data.s === this.symbol) {
        this.handleDepthMessage(data, gen);
      }
    };

    this.ws.onclose = () => {
      this.callbacks.onStatusChange?.({ connected: false, message: 'Koptu, tekrar deneniyor...' });
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      try {
        this.ws?.close();
      } catch {}
    };
  }

  private scheduleReconnect() {
    if (!this.active) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(25000, 1000 * Math.pow(1.6, this.retryCount++));
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private async initDepthSync(gen: number) {
    try {
      const snap = await fetchDepthSnapshot(this.symbol, 1000);
      if (gen !== this.syncGen || !this.active) return;

      this.bidsBook.clear();
      this.asksBook.clear();
      snap.bids.forEach(([p, q]) => {
        if (q > 0) this.bidsBook.set(p, q);
      });
      snap.asks.forEach(([p, q]) => {
        if (q > 0) this.asksBook.set(p, q);
      });

      this.depthLastUpdate = snap.lastUpdateId;

      // Apply buffered diffs with u >= lastUpdateId + 1
      for (const m of this.depthBuffer) {
        const U = parseInt(m.U, 10);
        const u = parseInt(m.u, 10);
        if (u < this.depthLastUpdate + 1) continue;
        if (U > this.depthLastUpdate + 1) {
          // Gap detected, re-sync snapshot
          this.depthBuffer = [];
          this.initDepthSync(gen);
          return;
        }
        this.applyDepthDiff(m);
      }

      this.depthBuffer = [];
      this.depthSynced = true;
      this.callbacks.onDepthUpdate?.({
        bids: this.bidsBook,
        asks: this.asksBook,
        lastUpdateId: this.depthLastUpdate
      });
    } catch (e) {
      console.warn('[DepthSync] Snapshot failed, retrying in 2s...', e);
      if (gen === this.syncGen && this.active) {
        setTimeout(() => this.initDepthSync(gen), 2000);
      }
    }
  }

  private handleDepthMessage(data: any, gen: number) {
    if (!this.depthSynced) {
      this.depthBuffer.push(data);
      if (this.depthBuffer.length > 2000) this.depthBuffer.shift();
      return;
    }

    const finalId = parseInt(data.u, 10);
    if (finalId <= this.depthLastUpdate) return;

    this.applyDepthDiff(data);
    this.depthLastUpdate = finalId;

    this.callbacks.onDepthUpdate?.({
      bids: this.bidsBook,
      asks: this.asksBook,
      lastUpdateId: this.depthLastUpdate
    });
  }

  private applyDepthDiff(data: any) {
    const bids = data.b || [];
    const asks = data.a || [];

    for (const [pStr, qStr] of bids) {
      const p = parseFloat(pStr);
      const q = parseFloat(qStr);
      if (q === 0) this.bidsBook.delete(p);
      else this.bidsBook.set(p, q);
    }

    for (const [pStr, qStr] of asks) {
      const p = parseFloat(pStr);
      const q = parseFloat(qStr);
      if (q === 0) this.asksBook.delete(p);
      else this.asksBook.set(p, q);
    }
  }
}
