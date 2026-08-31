'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { ChartTerminal } from '@/components/ChartTerminal';
import { FlowMetricsPanel } from '@/components/FlowMetricsPanel';
import { SignalCard } from '@/components/SignalCard';
import { OrderFlowLog } from '@/components/OrderFlowLog';
import { MarketScanner } from '@/components/MarketScanner';
import { PatternPoolView } from '@/components/PatternPoolView';
import { SettingsModal } from '@/components/SettingsModal';
import {
  AppSettings,
  Candle,
  DecisionEvaluation,
  FlowEvent,
  FlowSnapshot,
  HeatmapFrame,
  LiquidationEvent,
  PatternStats,
  SignalLogEntry,
  Ticker24h,
  TradeEvent
} from '@/lib/types';
import {
  BinanceStreamClient,
  fetch24hTickers,
  fetchExchangeInfo,
  fetchKlines,
  fetchOpenInterest,
  fetchPremiumIndex
} from '@/lib/binance';
import { generateCommentary } from '@/lib/commentary';
import {
  initPatternDB,
  patternContext,
  patternCrossesAt,
  patternGetStats,
  patternOutcome,
  patternResolveSar,
  dbAdd,
  dbIndexGet,
  dbPut,
  dbAll,
  dbIndexAll,
  patternRecomputeStats,
  patternPeriods,
  patternId
} from '@/lib/pattern-engine';

const DEFAULT_SETTINGS: AppSettings = {
  ma1: 9,
  ma2: 21,
  ma3: 50,
  sarStep: 0.02,
  sarMax: 0.2,
  nWindow: 3,
  dark: true,
  showMa: true,
  showSar: true,
  showVol: true,
  rawConfirm: true,
  showFlow: true,
  showLiq: true,
  liqMin: 50000,
  oiPollSec: 15,
  cascadePct: 0.8,
  showLadder: true,
  showHeatmap: true,
  whaleAlerts: true,
  whaleMin: 300000,
  wallPct: 90,
  showBB: true,
  showRsi: true,
  showMacd: true,
  showVwap: true,
  bbPeriod: 20,
  bbStd: 2,
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  patternWinPct: 0.15,
  ma1Color: '#e0b64c',
  ma2Color: '#4c8ce0',
  ma3Color: '#b06ce0',
  ma1Width: 1,
  ma2Width: 1,
  ma3Width: 1,
  sarColor: '#9aa4ae',
  sarWidth: 1,
  bbColor: '#4c8ce0',
  bbWidth: 1,
  vwapColor: '#ff9800',
  vwapWidth: 2,
  rsiColor: '#fdd835',
  rsiWidth: 1,
  macdColor: '#00bcd4',
  macdWidth: 1,
  macdSignalColor: '#ff7043',
  macdSignalWidth: 1
};

export default function Home() {
  // Navigation & Core State
  const [symbol, setSymbol] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('fs_symbol') || 'BTCUSDT';
    }
    return 'BTCUSDT';
  });
  const [interval, setInterval] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('fs_interval') || '5m';
    }
    return '5m';
  });
  const [activeView, setActiveView] = useState<'chart' | 'signal' | 'scanner' | 'pool' | 'settings'>('chart');
  const [symbols, setSymbols] = useState<string[]>([]);
  const [tickers, setTickers] = useState<Ticker24h[]>([]);
  const [favs, setFavs] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('fs_favs');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [candles, setCandles] = useState<Candle[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('fs_settings');
        if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch {}
    }
    return DEFAULT_SETTINGS;
  });

  // Real-time Flow State
  const [lastPrice, setLastPrice] = useState<number>(0);
  const [fundingRate, setFundingRate] = useState<number | null>(null);
  const [markPrice, setMarkPrice] = useState<number | null>(null);
  const [nextFundingTime, setNextFundingTime] = useState<number | null>(null);
  const [openInterest, setOpenInterest] = useState<number | null>(null);
  const [prevOi, setPrevOi] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [wsMessage, setWsMessage] = useState<string>('');

  // Flow Data Arrays
  const [trades, setTrades] = useState<TradeEvent[]>([]);
  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);
  const [flowEvents, setFlowEvents] = useState<FlowEvent[]>([]);
  const [heatmapFrames, setHeatmapFrames] = useState<HeatmapFrame[]>([]);
  const [bidsBook, setBidsBook] = useState<Map<number, number>>(new Map());
  const [asksBook, setAsksBook] = useState<Map<number, number>>(new Map());
  const [flowSnapshot, setFlowSnapshot] = useState<FlowSnapshot>({
    cvd60: 0,
    notional60: 0,
    cvdBias: 0,
    cvdSlope: 0,
    obi: 0,
    bidVol: 0,
    askVol: 0,
    longLiq60: 0,
    shortLiq60: 0,
    oi: null,
    oiChangePct: 0,
    funding: null,
    markPrice: null,
    nextFunding: null,
    bestBid: 0,
    bestAsk: 0,
    spread: 0,
    taker30: 0,
    takerSpike: false,
    rangePct: 0,
    atrPct: 0,
    tightRange: false,
    change5: 0,
    cascadeDown: false,
    cascadeUp: false,
    wallCount: { bid: 0, ask: 0 }
  });

  // Decision & Signals
  const [status, setStatus] = useState<'AL' | 'SAT' | 'IZLEMEDE' | 'NOTR'>('NOTR');
  const [statusRule, setStatusRule] = useState<string>('Tetikleyici aranıyor...');
  const [evaluation, setEvaluation] = useState<DecisionEvaluation | null>(null);
  const [commentary, setCommentary] = useState<string>('Piyasa taranıyor, veri akışı ısınıyor...');
  const [signals, setSignals] = useState<SignalLogEntry[]>([]);
  const [activePatternStats, setActivePatternStats] = useState<PatternStats | null>(null);
  const [activePatternId, setActivePatternId] = useState<string | null>(null);

  // Refs for high-speed streaming without state closure traps
  const clientRef = useRef<BinanceStreamClient | null>(null);
  const tradesRef = useRef<TradeEvent[]>([]);
  const liqsRef = useRef<LiquidationEvent[]>([]);
  const lastHeatSampleRef = useRef<number>(0);
  const lastWhaleRef = useRef<number>(0);
  const lastSweepRef = useRef<number>(0);
  const lastAbsorbRef = useRef<number>(0);
  const wallAgesRef = useRef<Map<string, { born: number; peak: number }>>(new Map());
  const pendingEngineRef = useRef<{ dir: 'AL' | 'SAT'; idx: number; flip: boolean } | null>(null);

  // Initialize DB on Mount
  useEffect(() => {
    initPatternDB();
  }, []);

  // Save Settings & Favs on change
  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('fs_settings', JSON.stringify(newSettings));
    } catch {}
  };

  const handleToggleFav = (sym: string) => {
    const nextFavs = favs.includes(sym) ? favs.filter((s) => s !== sym) : [sym, ...favs];
    setFavs(nextFavs);
    try {
      localStorage.setItem('fs_favs', JSON.stringify(nextFavs));
    } catch {}
  };

  const handleSelectSymbol = (sym: string) => {
    if (sym === symbol) return;
    setSymbol(sym);
    try {
      localStorage.setItem('fs_symbol', sym);
    } catch {}
    // Reset flow states for new symbol
    tradesRef.current = [];
    liqsRef.current = [];
    setTrades([]);
    setLiquidations([]);
    setHeatmapFrames([]);
    setBidsBook(new Map());
    setAsksBook(new Map());
    setStatus('NOTR');
    setStatusRule('Yeni sembol yüklendi, taranıyor...');
    setEvaluation(null);
  };

  const handleSelectInterval = (tf: string) => {
    if (tf === interval) return;
    setInterval(tf);
    try {
      localStorage.setItem('fs_interval', tf);
    } catch {}
  };

  // 1. Load Exchange Info & 24h Tickers
  useEffect(() => {
    const loadMarketData = async () => {
      try {
        const [infos, tickerList] = await Promise.all([fetchExchangeInfo(), fetch24hTickers()]);
        setSymbols(infos.map((i) => i.symbol));
        setTickers(tickerList);
      } catch (e) {
        console.warn('Failed to load exchange info:', e);
      }
    };
    loadMarketData();
    const intervalId = window.setInterval(async () => {
      try {
        const tickerList = await fetch24hTickers();
        setTickers(tickerList);
      } catch {}
    }, 15000);
    return () => clearInterval(intervalId);
  }, []);

  // 2. Load Historical Klines when Symbol / Interval Changes
  useEffect(() => {
    let active = true;
    const loadKlines = async () => {
      try {
        const data = await fetchKlines(symbol, interval, 600);
        if (active) {
          setCandles(data);
          if (data.length) setLastPrice(data[data.length - 1].close);
        }
      } catch (e) {
        console.warn('Failed to load klines:', e);
      }
    };
    loadKlines();
    return () => {
      active = false;
    };
  }, [symbol, interval]);

  // 3. Open Interest & Funding Rate Poller
  useEffect(() => {
    const pollOI = async () => {
      try {
        const [oi, prem] = await Promise.all([fetchOpenInterest(symbol), fetchPremiumIndex(symbol)]);
        if (oi !== null) {
          setPrevOi((prev) => {
            setOpenInterest(oi);
            return prev ?? oi;
          });
        }
        if (prem.fundingRate !== null) setFundingRate(prem.fundingRate);
        if (prem.markPrice !== null) setMarkPrice(prem.markPrice);
        if (prem.nextFundingTime !== null) setNextFundingTime(prem.nextFundingTime);
      } catch {}
    };

    pollOI();
    const pollSec = Math.max(15, settings.oiPollSec || 15);
    const id = window.setInterval(pollOI, pollSec * 1000);
    return () => clearInterval(id);
  }, [symbol, settings.oiPollSec]);

  // 4. Compute Flow Snapshot Helper
  const computeFlowSnapshot = useCallback((): FlowSnapshot => {
    const now = Date.now();
    const recentTrades = tradesRef.current;
    const recentLiqs = liqsRef.current;

    // 60s CVD & notional
    let cvd60 = 0;
    let notional60 = 0;
    let cvdPrev = 0;
    let notionalPrev = 0;
    let taker30 = 0;

    for (let i = recentTrades.length - 1; i >= 0; i--) {
      const t = recentTrades[i];
      const age = now - t.ts;
      if (age <= 30000) taker30 += t.notional;
      if (age <= 60000) {
        cvd60 += t.delta;
        notional60 += t.notional;
      } else if (age <= 180000) {
        cvdPrev += t.delta;
        notionalPrev += t.notional;
      }
    }

    const cvdBias = notional60 > 0 ? cvd60 / notional60 : 0;
    const prevBias = notionalPrev > 0 ? cvdPrev / notionalPrev : 0;
    const cvdSlope = cvdBias - prevBias;

    // Liquidations 60s
    let longLiq60 = 0;
    let shortLiq60 = 0;
    for (let i = recentLiqs.length - 1; i >= 0; i--) {
      const l = recentLiqs[i];
      if (now - l.ts <= 60000) {
        if (l.type === 'LONG_LIQ') longLiq60 += l.notional;
        else shortLiq60 += l.notional;
      }
    }

    // OBI (Order Book Imbalance within 1% band)
    let bestBid = 0;
    let bestAsk = Infinity;
    bidsBook.forEach((_, p) => {
      if (p > bestBid) bestBid = p;
    });
    asksBook.forEach((_, p) => {
      if (p < bestAsk) bestAsk = p;
    });
    if (!Number.isFinite(bestAsk)) bestAsk = 0;

    const spread = bestAsk > bestBid && bestBid > 0 ? bestAsk - bestBid : 0;
    const mid = (bestBid + bestAsk) / 2 || lastPrice;
    const lo = mid * 0.99;
    const hi = mid * 1.01;

    let bidVol = 0;
    let askVol = 0;
    bidsBook.forEach((q, p) => {
      if (p >= lo) bidVol += p * q;
    });
    asksBook.forEach((q, p) => {
      if (p <= hi) askVol += p * q;
    });

    const obi = bidVol + askVol > 0 ? (bidVol - askVol) / (bidVol + askVol) : 0;

    // OI Delta %
    const oiChangePct = prevOi && openInterest ? ((openInterest - prevOi) / prevOi) * 100 : 0;

    // Range & ATR
    const win = candles.slice(-20);
    const hiP = Math.max(...win.map((c) => c.high), 1);
    const loP = Math.min(...win.map((c) => c.low), 1);
    const rangePct = lastPrice > 0 ? (hiP - loP) / lastPrice : 0;
    const atrPct =
      win.length > 0 ? win.reduce((a, c) => a + (c.high - c.low) / (c.close || 1), 0) / win.length : 0;
    const tightRange = rangePct > 0 && (rangePct < 0.006 || atrPct < 0.0012);

    const base5 = candles[Math.max(0, candles.length - 6)]?.close || lastPrice;
    const change5 = base5 > 0 ? (lastPrice - base5) / base5 : 0;
    const cascadeThr = (settings.cascadePct || 0.8) / 100;

    // Wall counts
    let wallBid = 0;
    let wallAsk = 0;
    const wallMin = (settings.whaleMin || 300000) * 0.7;
    bidsBook.forEach((q, p) => {
      if (p * q >= wallMin) wallBid++;
    });
    asksBook.forEach((q, p) => {
      if (p * q >= wallMin) wallAsk++;
    });

    return {
      cvd60,
      notional60,
      cvdBias,
      cvdSlope,
      obi,
      bidVol,
      askVol,
      longLiq60,
      shortLiq60,
      oi: openInterest,
      oiChangePct,
      funding: fundingRate,
      markPrice,
      nextFunding: nextFundingTime,
      bestBid,
      bestAsk,
      spread,
      taker30,
      takerSpike: taker30 > (notionalPrev / 4) * 1.8 && taker30 > 25000,
      rangePct,
      atrPct,
      tightRange,
      change5,
      cascadeDown: change5 < -cascadeThr || longLiq60 > (settings.liqMin || 50000) * 2,
      cascadeUp: change5 > cascadeThr || shortLiq60 > (settings.liqMin || 50000) * 2,
      wallCount: { bid: wallBid, ask: wallAsk }
    };
  }, [bidsBook, asksBook, candles, fundingRate, lastPrice, markPrice, nextFundingTime, openInterest, prevOi, settings]);

  // 5. Evaluate Raw Flow Scoring (Katman 2)
  const evaluateRawFlow = useCallback(
    (dir: 'AL' | 'SAT', idx: number): DecisionEvaluation => {
      if (!settings.rawConfirm) {
        return {
          score: null,
          grade: 'HAM',
          summary: 'Ham mod — raw flow onayı kapalı.',
          reasons: ['Katman 2 kapatıldı: MA/SAR tetikleyicisi doğrudan grafik sinyali üretiyor.'],
          metrics: computeFlowSnapshot()
        };
      }

      const snap = computeFlowSnapshot();
      let score = 55;
      const reasons: string[] = [];

      if (snap.notional60 === 0) {
        score -= 6;
        reasons.push('CVD verisi ısınıyor; taker agresyon teyidi bekleniyor.');
      }
      if (snap.bidVol + snap.askVol === 0) {
        score -= 6;
        reasons.push('Derinlik orderbook senkronize ediliyor.');
      }

      if (dir === 'SAT') {
        if (snap.cvdBias < -0.12) {
          score += 14;
          reasons.push('Breakdown teyidi: CVD net satış baskısı altında.');
        } else if (snap.cvdBias < -0.03) {
          score += 7;
          reasons.push('CVD satış tarafına eğimli, düşüş yönünü destekliyor.');
        } else if (snap.cvdBias > 0.1) {
          score -= 12;
          reasons.push('Uyuşmazlık: CVD alıcı tarafta; SAT güveni zayıfladı.');
        }

        if (snap.obi < -0.1) {
          score += 10;
          reasons.push('OBI ask ağırlıklı; yukarıda satış duvarı baskın.');
        } else if (snap.obi > 0.1) {
          score -= 8;
          reasons.push('OBI bid tarafına dönmüş; satış kovalamaya dikkat.');
        }
      } else {
        // AL
        if (snap.cascadeDown) {
          if (snap.cvdBias > -0.05 || snap.cvdSlope > 0) {
            score += 10;
            reasons.push('Fade confirm: Satış baskısı tükeniyor, CVD toparlanıyor.');
          } else {
            score -= 8;
            reasons.push('Dump sonrası AL fakat CVD hâlâ satıcı; güven düşük.');
          }
          if (snap.obi > 0.08) {
            score += 10;
            reasons.push('OBI alış tarafına döndü; mean-reversion AL destekleniyor.');
          }
        } else {
          if (snap.cvdBias > 0.08) {
            score += 10;
            reasons.push('CVD alıcı tarafta; AL ivmesi güçlü.');
          } else if (snap.cvdBias < -0.1) {
            score -= 10;
            reasons.push('Uyuşmazlık: CVD satıcı tarafta; AL sinyali zayıfladı.');
          }

          if (snap.obi > 0.1) {
            score += 8;
            reasons.push('OBI bid ağırlıklı; orderbook alış tarafı güçlü.');
          } else if (snap.obi < -0.1) {
            score -= 7;
            reasons.push('OBI ask ağırlıklı; yükseliş önünde direnç var.');
          }
        }
      }

      // Range Filter
      if (snap.tightRange) {
        score -= 12;
        reasons.push(`Range filtresi: Bant dar (%${(snap.rangePct * 100).toFixed(2)}); whipsaw riski.`);
      } else {
        score += 3;
        reasons.push('Fiyat aralığı açık; kurgu nefes alıyor.');
      }

      // Liquidation Clusters
      if (dir === 'SAT' && snap.longLiq60 >= (settings.liqMin || 50000)) {
        score += 12;
        reasons.push(`Likidasyon cascade: $${(snap.longLiq60 / 1000).toFixed(0)}k long liq tetiklendi.`);
      }
      if (dir === 'AL' && snap.shortLiq60 >= (settings.liqMin || 50000)) {
        score += 12;
        reasons.push(`Short squeeze cascade: $${(snap.shortLiq60 / 1000).toFixed(0)}k short liq tetiklendi.`);
      }

      // Open Interest Dynamic
      if (snap.oiChangePct < -0.25 && snap.takerSpike) {
        score += dir === 'SAT' ? 8 : 4;
        reasons.push(`OI %${snap.oiChangePct.toFixed(2)} boşaldı + taker spike.`);
      }

      // Funding Rate Bias
      if (snap.funding !== null) {
        if (snap.funding > 0.00025 && dir === 'SAT') {
          score += 8;
          reasons.push(`Aşırı pozitif funding (%${(snap.funding * 100).toFixed(4)}); long unwind/SAT lehine.`);
        } else if (snap.funding < -0.00025 && dir === 'AL') {
          score += 8;
          reasons.push(`Aşırı negatif funding (%${(snap.funding * 100).toFixed(4)}); short squeeze/AL lehine.`);
        }
      }

      score = Math.round(Math.max(0, Math.min(100, score)));
      const grade =
        score >= 75 ? 'YÜKSEK' : score >= 60 ? 'ORTA+' : score >= 45 ? 'ORTA' : 'ZAYIF';

      return {
        score,
        grade,
        summary: `${grade} Güven (${score}/100)`,
        reasons,
        metrics: snap
      };
    },
    [computeFlowSnapshot, settings]
  );

  // 6. Signal Trigger Engine (Katman 1 MA/SAR)
  const runSignalEngine = useCallback(
    async (cs: Candle[]) => {
      if (cs.length < (settings.ma3 || 50) + 5) return;
      const ctx = patternContext(
        cs,
        settings.ma1 || 9,
        settings.ma2 || 21,
        settings.ma3 || 50,
        settings.sarStep || 0.02,
        settings.sarMax || 0.2
      );
      const i = cs.length - 1;
      const ma1 = ctx.ma[settings.ma1 || 9];
      const ma2 = ctx.ma[settings.ma2 || 21];
      const ma3 = ctx.ma[settings.ma3 || 50];

      if (!ma1 || !ma2 || !ma3 || ma1[i] === null || ma2[i - 1] === null || ma3[i] === null || ctx.trend[i] === null) {
        return;
      }

      const primaryPair = `${settings.ma1 || 9}x${settings.ma2 || 21}`;
      const crosses = patternCrossesAt(ctx, i, settings.ma1 || 9, settings.ma2 || 21, settings.ma3 || 50);
      const flipUp = ctx.trend[i - 1] === -1 && ctx.trend[i] === 1;
      const flipDown = ctx.trend[i - 1] === 1 && ctx.trend[i] === -1;

      const primaryCross = crosses.find((cr) => cr.pair === primaryPair);
      if (primaryCross) {
        pendingEngineRef.current = {
          dir: primaryCross.dir === 'UP' ? 'AL' : 'SAT',
          idx: i,
          flip: false
        };
      }

      if (pendingEngineRef.current) {
        const p = pendingEngineRef.current;
        const elapsed = i - p.idx;
        if (elapsed > (settings.nWindow || 3)) {
          pendingEngineRef.current = null;
          setStatus('NOTR');
          setStatusRule('Pencere süresi doldu, tetikleyici iptal edildi.');
          const comment = generateCommentary('NOTR', null);
          setCommentary(comment);
        } else {
          if ((p.dir === 'AL' && flipUp) || (p.dir === 'SAT' && flipDown)) {
            p.flip = true;
          }
          if (p.flip) {
            const ok =
              p.dir === 'AL'
                ? ma2[i]! > ma3[i]! || ctx.closes[i] > ma3[i]!
                : ma2[i]! < ma3[i]! || ctx.closes[i] < ma3[i]!;

            if (ok) {
              // FIRE SIGNAL!
              const rule = `MA${settings.ma1}×MA${settings.ma2} ${p.dir === 'AL' ? 'Golden' : 'Death'} Cross + SAR Flip (${elapsed} mum sonra) + MA${settings.ma3} Trend Filtresi`;
              const evalRes = evaluateRawFlow(p.dir, i);
              setStatus(p.dir);
              setStatusRule(rule);
              setEvaluation(evalRes);

              const comment = generateCommentary(p.dir, evalRes);
              setCommentary(comment);

              // Query pattern stats
              const patKey = patternId(
                `${settings.ma1}x${settings.ma2}`,
                p.dir === 'AL' ? 'UP' : 'DOWN',
                elapsed === 0 ? 'SAR0' : elapsed === 1 ? 'SAR1' : elapsed <= 3 ? 'SAR2-3' : 'SARX',
                'F1'
              );
              setActivePatternId(patKey);
              const stats = await patternGetStats(`${interval}:${patKey}`);
              setActivePatternStats(stats);

              // Push to Signal Log
              setSignals((prev) => [
                {
                  id: `${Date.now()}-${Math.random()}`,
                  dir: p.dir,
                  rule,
                  price: cs[i].close,
                  ts: cs[i].time,
                  score: evalRes.score,
                  grade: evalRes.grade,
                  reasons: evalRes.reasons,
                  patternId: patKey
                },
                ...prev.slice(0, 30)
              ]);

              pendingEngineRef.current = null;
            } else {
              setStatus('IZLEMEDE');
              setStatusRule(
                `${p.dir} kurgusu: Cross + SAR flip tamam, MA${settings.ma3} trend filtresi bekleniyor.`
              );
              setCommentary(generateCommentary('IZLEMEDE', null));
            }
          } else {
            setStatus('IZLEMEDE');
            setStatusRule(
              `${p.dir === 'AL' ? 'Golden' : 'Death'} cross oluştu, SAR flip onayı bekleniyor (${elapsed}/${settings.nWindow} mum).`
            );
            setCommentary(generateCommentary('IZLEMEDE', null));
          }
        }
      }
    },
    [evaluateRawFlow, interval, settings]
  );

  // 7. Initialize Real-Time WebSocket Streaming Client
  useEffect(() => {
    const client = new BinanceStreamClient(symbol, interval, {
      onKline: (candle, isClosed) => {
        setLastPrice(candle.close);
        setCandles((prev) => {
          if (!prev.length) return [candle];
          const last = prev[prev.length - 1];
          let updated: Candle[];
          if (last.time === candle.time) {
            updated = [...prev.slice(0, -1), candle];
          } else {
            updated = [...prev, candle];
            if (updated.length > 700) updated.shift();
          }

          if (isClosed) {
            // Run signal engine & pattern pool recorder on closed candle
            runSignalEngine(updated);
          }
          return updated;
        });
      },
      onTrade: (trade) => {
        tradesRef.current.push(trade);
        if (tradesRef.current.length > 5000) tradesRef.current.shift();

        // Whale Detector
        const whaleMin = settings.whaleMin || 300000;
        if (trade.notional >= whaleMin && trade.ts - lastWhaleRef.current > 2000) {
          lastWhaleRef.current = trade.ts;
          const ev: FlowEvent = {
            id: `${trade.ts}-${Math.random()}`,
            type: 'WHALE',
            sev: trade.notional >= whaleMin * 2 ? 'high' : 'medium',
            text: `Whale ${trade.side.toUpperCase()} $${(trade.notional / 1000).toFixed(0)}k @ $${trade.price}`,
            ts: trade.ts,
            side: trade.side
          };
          setFlowEvents((prev) => [ev, ...prev.slice(0, 30)]);
        }

        // Sweep Detector (>=4 trades on same side in <1.8s totaling > wmin * 1.8)
        const now = trade.ts;
        if (now - lastSweepRef.current > 5000) {
          const recent = tradesRef.current.filter((t) => now - t.ts < 1800);
          ['buy', 'sell'].forEach((side) => {
            const sameSide = recent.filter((t) => t.side === side);
            const total = sameSide.reduce((a, b) => a + b.notional, 0);
            if (total > whaleMin * 1.6 && sameSide.length >= 4) {
              lastSweepRef.current = now;
              const ev: FlowEvent = {
                id: `${now}-${Math.random()}`,
                type: 'SWEEP',
                sev: 'high',
                text: `SWEEP ${side.toUpperCase()} $${(total / 1000).toFixed(0)}k / ${sameSide.length} işlem`,
                ts: now,
                side: side as 'buy' | 'sell'
              };
              setFlowEvents((prev) => [ev, ...prev.slice(0, 30)]);
            }
          });
        }
      },
      onMarkPrice: (mark) => {
        setMarkPrice(mark.markPrice);
        setFundingRate(mark.fundingRate);
        setNextFundingTime(mark.nextFundingTime);
      },
      onLiquidation: (liq) => {
        liqsRef.current.push(liq);
        if (liqsRef.current.length > 500) liqsRef.current.shift();
        setLiquidations((prev) => [liq, ...prev.slice(0, 50)]);

        if (liq.notional >= (settings.liqMin || 50000)) {
          const ev: FlowEvent = {
            id: `${liq.ts}-${Math.random()}`,
            type: 'LIQUIDATION',
            sev: 'high',
            text: `Likidasyon: ${liq.side === 'SELL' ? 'LONG' : 'SHORT'} $${(liq.notional / 1000).toFixed(0)}k @ $${liq.price}`,
            ts: liq.ts
          };
          setFlowEvents((prev) => [ev, ...prev.slice(0, 30)]);
        }
      },
      onDepthUpdate: (depth) => {
        setBidsBook(new Map(depth.bids));
        setAsksBook(new Map(depth.asks));

        // Sample Heatmap frame every 1s
        const now = Date.now();
        if (now - lastHeatSampleRef.current >= 1000 && settings.showHeatmap) {
          lastHeatSampleRef.current = now;
          let bestBid = 0;
          let bestAsk = Infinity;
          depth.bids.forEach((_, p) => {
            if (p > bestBid) bestBid = p;
          });
          depth.asks.forEach((_, p) => {
            if (p < bestAsk) bestAsk = p;
          });
          const mid = (bestBid + bestAsk) / 2 || lastPrice;

          if (mid > 0) {
            const bins: HeatmapFrame['bins'] = [];
            let maxN = 0;

            depth.bids.forEach((q, p) => {
              if (Math.abs(p - mid) / mid <= 0.015) {
                const notional = p * q;
                if (notional > maxN) maxN = notional;
                bins.push({ side: 'B', price: p, notional });
              }
            });

            depth.asks.forEach((q, p) => {
              if (Math.abs(p - mid) / mid <= 0.015) {
                const notional = p * q;
                if (notional > maxN) maxN = notional;
                bins.push({ side: 'A', price: p, notional });
              }
            });

            bins.sort((a, b) => b.notional - a.notional);
            const topBins = bins.slice(0, 180);

            setHeatmapFrames((prev) => {
              const next = [...prev, { t: Math.floor(now / 1000), bins: topBins, max: maxN }];
              if (next.length > 300) next.shift();
              return next;
            });
          }
        }
      },
      onStatusChange: (st) => {
        setWsConnected(st.connected);
        setWsMessage(st.message || '');
      }
    });

    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [interval, lastPrice, runSignalEngine, settings, symbol]);

  // Periodic flow snapshot calculation
  useEffect(() => {
    const timer = window.setInterval(() => {
      setFlowSnapshot(computeFlowSnapshot());
    }, 500);
    return () => clearInterval(timer);
  }, [computeFlowSnapshot]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0d1117] text-slate-100 antialiased font-sans">
      {/* Top Navbar */}
      <Navbar
        symbol={symbol}
        onSelectSymbol={handleSelectSymbol}
        symbols={symbols}
        tickers={tickers}
        favs={favs}
        onToggleFav={handleToggleFav}
        activeView={activeView}
        onChangeView={setActiveView}
        lastPrice={lastPrice}
        fundingRate={fundingRate}
        nextFundingTime={nextFundingTime}
        wsConnected={wsConnected}
        wsMessage={wsMessage}
      />

      {/* Main View Router */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {activeView === 'chart' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top Flow Metrics Bar */}
            <FlowMetricsPanel flow={flowSnapshot} lastPrice={lastPrice} />

            {/* Middle: Interactive Candlestick + Canvas Overlays */}
            <ChartTerminal
              symbol={symbol}
              interval={interval}
              onSelectInterval={handleSelectInterval}
              candles={candles}
              settings={settings}
              flowSnapshot={flowSnapshot}
              heatmapFrames={heatmapFrames}
              bidsBook={bidsBook}
              asksBook={asksBook}
              signals={signals}
              liquidations={liquidations}
              flowEvents={flowEvents}
              lastPrice={lastPrice}
            />

            {/* Bottom: Decision Engine Card */}
            <div className="p-3 border-t border-[#22272e] bg-[#0d1117] max-h-44 overflow-y-auto">
              <SignalCard
                status={status}
                statusRule={statusRule}
                evaluation={evaluation}
                commentary={commentary}
                patternStats={activePatternStats}
                patternId={activePatternId}
              />
            </div>
          </div>
        )}

        {activeView === 'signal' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 max-w-6xl mx-auto w-full">
            <SignalCard
              status={status}
              statusRule={statusRule}
              evaluation={evaluation}
              commentary={commentary}
              patternStats={activePatternStats}
              patternId={activePatternId}
            />

            <FlowMetricsPanel flow={flowSnapshot} lastPrice={lastPrice} />

            <OrderFlowLog flowEvents={flowEvents} signals={signals} />
          </div>
        )}

        {activeView === 'scanner' && (
          <MarketScanner
            tickers={tickers}
            favs={favs}
            onToggleFav={handleToggleFav}
            onSelectSymbol={(sym) => {
              handleSelectSymbol(sym);
              setActiveView('chart');
            }}
            selectedSymbol={symbol}
          />
        )}

        {activeView === 'pool' && (
          <PatternPoolView symbol={symbol} interval={interval} />
        )}

        {activeView === 'settings' && (
          <SettingsModal
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onResetDefaults={() => handleUpdateSettings(DEFAULT_SETTINGS)}
          />
        )}
      </main>
    </div>
  );
}
