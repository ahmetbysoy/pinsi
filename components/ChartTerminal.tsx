'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type SeriesMarker,
  type Time
} from 'lightweight-charts';
import { AppSettings, Candle, FlowSnapshot, HeatmapFrame, SignalLogEntry, LiquidationEvent, FlowEvent } from '@/lib/types';
import { bollingerBands, macd, psar, rsi, sma, vwap } from '@/lib/indicators';

interface ChartTerminalProps {
  symbol: string;
  interval: string;
  onSelectInterval: (interval: string) => void;
  candles: Candle[];
  settings: AppSettings;
  flowSnapshot: FlowSnapshot;
  heatmapFrames: HeatmapFrame[];
  bidsBook: Map<number, number>;
  asksBook: Map<number, number>;
  signals: SignalLogEntry[];
  liquidations: LiquidationEvent[];
  flowEvents: FlowEvent[];
  lastPrice: number;
}

const TFS = ['1m', '5m', '15m', '1h', '4h'];

export const ChartTerminal: React.FC<ChartTerminalProps> = ({
  symbol,
  interval,
  onSelectInterval,
  candles,
  settings,
  flowSnapshot,
  heatmapFrames,
  bidsBook,
  asksBook,
  signals,
  liquidations,
  flowEvents,
  lastPrice
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma1SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma2SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma3SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sarSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMidRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSigRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markerPrimitiveRef = useRef<any>(null);

  // Overlay Canvases
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const domOverlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize Lightweight Charts
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#8b949e'
      },
      grid: {
        vertLines: { color: 'rgba(42, 48, 56, 0.4)' },
        horzLines: { color: 'rgba(42, 48, 56, 0.4)' }
      },
      crosshair: {
        mode: 0
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#2a3038'
      },
      rightPriceScale: {
        borderColor: '#2a3038',
        scaleMargins: {
          top: 0.05,
          bottom: settings.showRsi || settings.showMacd ? 0.35 : 0.12
        }
      }
    });

    chartRef.current = chart;

    // Candlesticks
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350'
    });
    candleSeriesRef.current = candleSeries as any;

    // Volume
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol'
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      borderVisible: false
    });
    volSeriesRef.current = volSeries as any;

    // MAs
    ma1SeriesRef.current = chart.addSeries(LineSeries, {
      color: settings.ma1Color || '#e0b64c',
      lineWidth: (settings.ma1Width as any) || 1,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;
    ma2SeriesRef.current = chart.addSeries(LineSeries, {
      color: settings.ma2Color || '#4c8ce0',
      lineWidth: (settings.ma2Width as any) || 1,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;
    ma3SeriesRef.current = chart.addSeries(LineSeries, {
      color: settings.ma3Color || '#b06ce0',
      lineWidth: (settings.ma3Width as any) || 1,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;

    // SAR
    sarSeriesRef.current = chart.addSeries(LineSeries, {
      color: settings.sarColor || '#9aa4ae',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;

    // Bollinger Bands
    bbUpperRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(76, 140, 224, 0.6)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;
    bbMidRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(76, 140, 224, 0.3)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;
    bbLowerRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(76, 140, 224, 0.6)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;

    // VWAP
    vwapSeriesRef.current = chart.addSeries(LineSeries, {
      color: settings.vwapColor || '#ff9800',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;

    // Sub-indicators: RSI & MACD
    rsiSeriesRef.current = chart.addSeries(LineSeries, {
      priceScaleId: 'rsi',
      color: '#fdd835',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;
    chart.priceScale('rsi').applyOptions({
      scaleMargins: { top: 0.72, bottom: 0.16 },
      borderVisible: false
    });

    macdHistRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: 'macd',
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;
    macdLineRef.current = chart.addSeries(LineSeries, {
      priceScaleId: 'macd',
      color: '#00bcd4',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;
    macdSigRef.current = chart.addSeries(LineSeries, {
      priceScaleId: 'macd',
      color: '#ff7043',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false
    }) as any;
    chart.priceScale('macd').applyOptions({
      scaleMargins: { top: 0.86, bottom: 0 },
      borderVisible: false
    });

    // Resize Observer
    const handleResize = () => {
      if (!containerRef.current || !chartRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      chartRef.current.resize(w, h);

      // Resize overlay canvases with devicePixelRatio
      const dpr = window.devicePixelRatio || 1;
      [heatmapCanvasRef.current, domOverlayCanvasRef.current].forEach((cv) => {
        if (!cv) return;
        cv.width = w * dpr;
        cv.height = h * dpr;
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
        const ctx = cv.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      });
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);
    handleResize();

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update Series Data on Candle or Settings Change
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !candles.length) return;

    // 1. Candlesticks
    const candleData: CandlestickData<Time>[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }));
    candleSeriesRef.current.setData(candleData);

    // 2. Volume
    if (volSeriesRef.current) {
      const volData: HistogramData<Time>[] = settings.showVol
        ? candles.map((c) => ({
            time: c.time as Time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)'
          }))
        : [];
      volSeriesRef.current.setData(volData);
    }

    const closes = candles.map((c) => c.close);

    // 3. MAs
    const ma1 = sma(closes, settings.ma1 || 9);
    const ma2 = sma(closes, settings.ma2 || 21);
    const ma3 = sma(closes, settings.ma3 || 50);

    const mapLineData = (arr: (number | null)[]): LineData<Time>[] =>
      candles
        .map((c, i) => (arr[i] !== null ? { time: c.time as Time, value: arr[i]! } : null))
        .filter((d): d is LineData<Time> => d !== null);

    if (ma1SeriesRef.current) {
      ma1SeriesRef.current.applyOptions({ color: settings.ma1Color || '#e0b64c', lineWidth: (settings.ma1Width as any) || 1 });
      ma1SeriesRef.current.setData(settings.showMa ? mapLineData(ma1) : []);
    }
    if (ma2SeriesRef.current) {
      ma2SeriesRef.current.applyOptions({ color: settings.ma2Color || '#4c8ce0', lineWidth: (settings.ma2Width as any) || 1 });
      ma2SeriesRef.current.setData(settings.showMa ? mapLineData(ma2) : []);
    }
    if (ma3SeriesRef.current) {
      ma3SeriesRef.current.applyOptions({ color: settings.ma3Color || '#b06ce0', lineWidth: (settings.ma3Width as any) || 1 });
      ma3SeriesRef.current.setData(settings.showMa ? mapLineData(ma3) : []);
    }

    // 4. SAR
    if (sarSeriesRef.current) {
      sarSeriesRef.current.applyOptions({ color: settings.sarColor || '#9aa4ae' });
      const { sar } = psar(candles, settings.sarStep || 0.02, settings.sarMax || 0.2);
      sarSeriesRef.current.setData(settings.showSar ? mapLineData(sar) : []);
    }

    // 5. Bollinger Bands
    if (bbUpperRef.current && bbMidRef.current && bbLowerRef.current) {
      const bb = bollingerBands(candles, settings.bbPeriod || 20, settings.bbStd || 2);
      bbUpperRef.current.setData(settings.showBB ? mapLineData(bb.upper) : []);
      bbMidRef.current.setData(settings.showBB ? mapLineData(bb.mid) : []);
      bbLowerRef.current.setData(settings.showBB ? mapLineData(bb.lower) : []);
    }

    // 6. VWAP
    if (vwapSeriesRef.current) {
      const vw = vwap(candles);
      vwapSeriesRef.current.setData(settings.showVwap ? mapLineData(vw) : []);
    }

    // 7. RSI
    if (rsiSeriesRef.current) {
      const r = rsi(closes, settings.rsiPeriod || 14);
      rsiSeriesRef.current.setData(settings.showRsi ? mapLineData(r) : []);
    }

    // 8. MACD
    if (macdLineRef.current && macdSigRef.current && macdHistRef.current) {
      const m = macd(closes, settings.macdFast || 12, settings.macdSlow || 26, settings.macdSignal || 9);
      macdLineRef.current.setData(settings.showMacd ? mapLineData(m.line) : []);
      macdSigRef.current.setData(settings.showMacd ? mapLineData(m.signal) : []);
      const histData: HistogramData<Time>[] = [];
      if (settings.showMacd) {
        candles.forEach((c, i) => {
          if (m.hist[i] !== null) {
            histData.push({
              time: c.time as Time,
              value: m.hist[i]!,
              color: m.hist[i]! >= 0 ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)'
            });
          }
        });
      }
      macdHistRef.current.setData(histData);
    }

    // Markers: Signals + Liquidations + Whale Events
    const markers: SeriesMarker<Time>[] = [];

    // Signals
    signals.forEach((s) => {
      markers.push({
        time: s.ts as Time,
        position: s.dir === 'AL' ? 'belowBar' : 'aboveBar',
        color: s.dir === 'AL' ? '#26a69a' : '#ef5350',
        shape: s.dir === 'AL' ? 'arrowUp' : 'arrowDown',
        text: `${s.dir} ${s.score ? `${s.score}` : ''}`
      });
    });

    // Liquidations
    if (settings.showLiq) {
      liquidations.slice(-20).forEach((liq) => {
        if (liq.notional >= (settings.liqMin || 50000)) {
          const isLongLiq = liq.type === 'LONG_LIQ';
          markers.push({
            time: Math.floor(liq.ts / 1000) as Time,
            position: isLongLiq ? 'aboveBar' : 'belowBar',
            color: isLongLiq ? '#ff8a80' : '#69f0ae',
            shape: 'circle',
            text: `LIQ $${(liq.notional / 1000).toFixed(0)}k`
          });
        }
      });
    }

    // Whale Flow Events
    if (settings.whaleAlerts) {
      flowEvents
        .filter((e) => e.type === 'WHALE' || e.type === 'SWEEP')
        .slice(0, 15)
        .forEach((e) => {
          markers.push({
            time: Math.floor(e.ts / 1000) as Time,
            position: e.side === 'buy' ? 'belowBar' : 'aboveBar',
            color: e.side === 'buy' ? '#38bdf8' : '#f43f5e',
            shape: 'circle',
            text: `${e.type}`
          });
        });
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));

    if (markerPrimitiveRef.current) {
      try {
        markerPrimitiveRef.current.setMarkers(markers);
      } catch {
        markerPrimitiveRef.current = createSeriesMarkers(candleSeriesRef.current as any, markers);
      }
    } else {
      markerPrimitiveRef.current = createSeriesMarkers(candleSeriesRef.current as any, markers);
    }
  }, [candles, settings, signals, liquidations, flowEvents]);

  // Draw Heatmap Overlay & DOM Ladder
  const drawOverlays = useCallback(() => {
    if (!containerRef.current || !chartRef.current || !candleSeriesRef.current) return;

    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    const rightScaleWidth = 75;
    const chartRight = Math.max(0, w - rightScaleWidth);

    // 1. Draw Liquidity Heatmap
    const cvH = heatmapCanvasRef.current;
    if (cvH && settings.showHeatmap && heatmapFrames.length) {
      const ctx = cvH.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        const timeScale = chartRef.current.timeScale();

        for (let i = 0; i < heatmapFrames.length; i++) {
          const frame = heatmapFrames[i];
          const x = timeScale.timeToCoordinate(frame.t as Time);
          if (x === null || x === undefined || x < 0 || x > chartRight) continue;

          const colW = Math.max(2, Math.min(14, 6));

          for (const bin of frame.bins) {
            const y = candleSeriesRef.current.priceToCoordinate(bin.price);
            if (y === null || y === undefined || y < 0 || y > h) continue;

            const power = Math.log1p(bin.notional) / Math.log1p(frame.max || bin.notional);
            const alpha = Math.min(0.45, 0.04 + power * 0.35);

            ctx.fillStyle =
              bin.side === 'B'
                ? `rgba(38, 166, 154, ${alpha.toFixed(3)})`
                : `rgba(239, 83, 80, ${alpha.toFixed(3)})`;

            ctx.fillRect(x, y - 2, colW, 4);
          }
        }
      }
    }

    // 2. Draw DOM Ladder & Liquidity Walls on Right Edge
    const cvD = domOverlayCanvasRef.current;
    if (cvD && settings.showLadder && (bidsBook.size > 0 || asksBook.size > 0)) {
      const ctx = cvD.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);

        const ladderWidth = 54;
        const ladderX = chartRight - ladderWidth;
        const raySpan = 100;
        const rayLeft = Math.max(0, ladderX - raySpan);

        // Find max notional for normalization
        let maxNotional = 1;
        const topBids: { price: number; notional: number }[] = [];
        const topAsks: { price: number; notional: number }[] = [];

        bidsBook.forEach((qty, price) => {
          const notional = price * qty;
          if (notional > maxNotional) maxNotional = notional;
          topBids.push({ price, notional });
        });

        asksBook.forEach((qty, price) => {
          const notional = price * qty;
          if (notional > maxNotional) maxNotional = notional;
          topAsks.push({ price, notional });
        });

        const logMax = Math.log1p(maxNotional);

        // Draw Bids (Green)
        topBids.forEach(({ price, notional }) => {
          const y = candleSeriesRef.current?.priceToCoordinate(price);
          if (y === null || y === undefined || y < 0 || y > h) return;

          const ratio = Math.log1p(notional) / logMax;
          const barW = Math.max(2, ladderWidth * ratio);

          // Ladder Bar
          ctx.fillStyle = `rgba(38, 166, 154, ${Math.min(0.8, 0.15 + ratio * 0.65).toFixed(2)})`;
          ctx.fillRect(ladderX, y - 1.5, barW, 3);

          // Wall Ray for large liquidity
          if (notional >= (settings.whaleMin || 300000) * 0.7) {
            const grad = ctx.createLinearGradient(rayLeft, y, ladderX, y);
            grad.addColorStop(0, 'rgba(38, 166, 154, 0)');
            grad.addColorStop(1, 'rgba(38, 166, 154, 0.45)');
            ctx.fillStyle = grad;
            ctx.fillRect(rayLeft, y - 1, ladderX - rayLeft, 2);

            // Text Label
            ctx.fillStyle = '#26a69a';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`$${(notional / 1000).toFixed(0)}k`, ladderX - 4, y + 3);
          }
        });

        // Draw Asks (Red)
        topAsks.forEach(({ price, notional }) => {
          const y = candleSeriesRef.current?.priceToCoordinate(price);
          if (y === null || y === undefined || y < 0 || y > h) return;

          const ratio = Math.log1p(notional) / logMax;
          const barW = Math.max(2, ladderWidth * ratio);

          // Ladder Bar
          ctx.fillStyle = `rgba(239, 83, 80, ${Math.min(0.8, 0.15 + ratio * 0.65).toFixed(2)})`;
          ctx.fillRect(ladderX, y - 1.5, barW, 3);

          // Wall Ray for large liquidity
          if (notional >= (settings.whaleMin || 300000) * 0.7) {
            const grad = ctx.createLinearGradient(rayLeft, y, ladderX, y);
            grad.addColorStop(0, 'rgba(239, 83, 80, 0)');
            grad.addColorStop(1, 'rgba(239, 83, 80, 0.45)');
            ctx.fillStyle = grad;
            ctx.fillRect(rayLeft, y - 1, ladderX - rayLeft, 2);

            // Text Label
            ctx.fillStyle = '#ef5350';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`$${(notional / 1000).toFixed(0)}k`, ladderX - 4, y + 3);
          }
        });

        // Mid-price indicator line
        if (flowSnapshot.bestBid && flowSnapshot.bestAsk) {
          const mid = (flowSnapshot.bestBid + flowSnapshot.bestAsk) / 2;
          const my = candleSeriesRef.current.priceToCoordinate(mid);
          if (my !== null && my !== undefined && my >= 0 && my <= h) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(rayLeft, my);
            ctx.lineTo(chartRight, my);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    }
  }, [bidsBook, asksBook, heatmapFrames, settings, flowSnapshot]);

  // Subscribe chart timeScale to redraw canvas overlays on pan/zoom
  useEffect(() => {
    if (!chartRef.current) return;
    const ts = chartRef.current.timeScale();
    const handleRangeChange = () => drawOverlays();
    ts.subscribeVisibleLogicalRangeChange(handleRangeChange);
    drawOverlays();
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
    };
  }, [drawOverlays]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] relative select-none">
      {/* Timeframe Bar */}
      <div className="h-9 border-b border-[#22272e] bg-[#12161c] px-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          {TFS.map((tf) => (
            <button
              key={tf}
              onClick={() => onSelectInterval(tf)}
              className={`px-2.5 py-1 rounded font-mono font-bold transition-colors ${
                interval === tf
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d24]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Quick CVD & OBI Badges on Chart Header */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">CVD 60s:</span>
            <span
              className={`font-bold ${
                flowSnapshot.cvd60 > 0
                  ? 'text-emerald-400'
                  : flowSnapshot.cvd60 < 0
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              {flowSnapshot.cvd60 > 0 ? '+' : ''}
              {(flowSnapshot.cvd60 / 1e3).toFixed(1)}k
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500">OBI:</span>
            <span
              className={`font-bold ${
                flowSnapshot.obi > 0
                  ? 'text-emerald-400'
                  : flowSnapshot.obi < 0
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              {flowSnapshot.obi > 0 ? '+' : ''}
              {(flowSnapshot.obi * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="flex-1 relative min-h-0 w-full overflow-hidden" ref={containerRef}>
        {/* Heatmap Canvas */}
        <canvas
          ref={heatmapCanvasRef}
          className="absolute inset-0 pointer-events-none z-10 opacity-70 mix-blend-screen"
        />

        {/* DOM Ladder & Liquidity Wall Canvas */}
        <canvas
          ref={domOverlayCanvasRef}
          className="absolute inset-0 pointer-events-none z-20"
        />
      </div>
    </div>
  );
};
