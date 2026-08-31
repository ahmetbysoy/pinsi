'use client';

import React from 'react';
import {
  Activity,
  Layers,
  TrendingUp,
  Percent,
  ShieldAlert,
  ArrowUpDown,
  Zap
} from 'lucide-react';
import { FlowSnapshot } from '@/lib/types';

interface FlowMetricsPanelProps {
  flow: FlowSnapshot;
  lastPrice: number;
}

export const FlowMetricsPanel: React.FC<FlowMetricsPanelProps> = ({ flow, lastPrice }) => {
  const compact = (n: number) => {
    const a = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
    return `${sign}${a.toFixed(1)}`;
  };

  return (
    <div className="bg-[#12161c] border-b border-[#22272e] p-3 text-xs">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {/* CVD 60s */}
        <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>CVD 60s</span>
            <Activity className="w-3 h-3 text-cyan-400" />
          </div>
          <div className="font-mono mt-1">
            <span
              className={`font-bold text-sm ${
                flow.cvd60 > 0 ? 'text-emerald-400' : flow.cvd60 < 0 ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {flow.cvd60 > 0 ? '+' : ''}
              {compact(flow.cvd60)}
            </span>
            <div className="text-[10px] text-slate-500 font-mono">
              Tot: ${compact(flow.notional60)}
            </div>
          </div>
        </div>

        {/* OBI (Order Book Imbalance) */}
        <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>OBI Imbalance</span>
            <Layers className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="font-mono mt-1">
            <span
              className={`font-bold text-sm ${
                flow.obi > 0 ? 'text-emerald-400' : flow.obi < 0 ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {flow.obi > 0 ? '+' : ''}
              {(flow.obi * 100).toFixed(1)}%
            </span>
            <div className="text-[10px] text-slate-500 font-mono">
              B:{compact(flow.bidVol)} / A:{compact(flow.askVol)}
            </div>
          </div>
        </div>

        {/* Open Interest */}
        <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Open Interest</span>
            <TrendingUp className="w-3 h-3 text-amber-400" />
          </div>
          <div className="font-mono mt-1">
            <span className="font-bold text-sm text-slate-200">
              {flow.oi ? compact(flow.oi) : '---'}
            </span>
            <div
              className={`text-[10px] font-semibold ${
                flow.oiChangePct > 0
                  ? 'text-emerald-400'
                  : flow.oiChangePct < 0
                  ? 'text-rose-400'
                  : 'text-slate-500'
              }`}
            >
              Δ {flow.oiChangePct > 0 ? '+' : ''}
              {flow.oiChangePct.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Funding Rate */}
        <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Funding Rate</span>
            <Percent className="w-3 h-3 text-purple-400" />
          </div>
          <div className="font-mono mt-1">
            <span
              className={`font-bold text-sm ${
                flow.funding && flow.funding > 0
                  ? 'text-amber-400'
                  : flow.funding && flow.funding < 0
                  ? 'text-emerald-400'
                  : 'text-slate-300'
              }`}
            >
              {flow.funding !== null ? `${(flow.funding * 100).toFixed(4)}%` : '---'}
            </span>
            <div className="text-[10px] text-slate-500 font-mono">
              Mark: ${flow.markPrice ? (flow.markPrice >= 100 ? flow.markPrice.toFixed(2) : flow.markPrice.toFixed(4)) : '---'}
            </div>
          </div>
        </div>

        {/* Liquidation Volumes 60s */}
        <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Likidasyon 60s</span>
            <ShieldAlert className="w-3 h-3 text-rose-400" />
          </div>
          <div className="font-mono mt-1">
            <div className="text-xs flex justify-between">
              <span className="text-rose-400">L: ${compact(flow.longLiq60)}</span>
            </div>
            <div className="text-xs flex justify-between">
              <span className="text-emerald-400">S: ${compact(flow.shortLiq60)}</span>
            </div>
          </div>
        </div>

        {/* Spread & Ticks */}
        <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Spread / Best</span>
            <ArrowUpDown className="w-3 h-3 text-sky-400" />
          </div>
          <div className="font-mono mt-1">
            <span className="font-bold text-sm text-slate-200">
              {flow.spread > 0 ? (flow.spread >= 1 ? flow.spread.toFixed(2) : flow.spread.toFixed(4)) : '---'}
            </span>
            <div className="text-[10px] text-slate-500">
              Bid: {flow.bestBid ? (flow.bestBid >= 100 ? flow.bestBid.toFixed(1) : flow.bestBid.toFixed(4)) : '---'}
            </div>
          </div>
        </div>

        {/* Walls & Liquidity Clustered */}
        <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Duvarlar (B/A)</span>
            <Zap className="w-3 h-3 text-amber-400" />
          </div>
          <div className="font-mono mt-1">
            <span className="font-bold text-sm text-slate-200">
              <span className="text-emerald-400">{flow.wallCount.bid}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-rose-400">{flow.wallCount.ask}</span>
            </span>
            <div className="text-[10px] text-slate-500">
              {flow.wallCount.bid > flow.wallCount.ask ? 'Alış Duvarı Ağır' : flow.wallCount.ask > flow.wallCount.bid ? 'Satış Duvarı Ağır' : 'Dengeli'}
            </div>
          </div>
        </div>

        {/* Taker Momentum */}
        <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Taker Hızı</span>
            <Activity className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="font-mono mt-1">
            <span
              className={`font-bold text-sm ${
                flow.takerSpike ? 'text-amber-400 animate-pulse' : 'text-slate-200'
              }`}
            >
              ${compact(flow.taker30)}/30s
            </span>
            <div className="text-[10px] text-slate-500">
              {flow.takerSpike ? '⚡ SPIKE AKTİF' : 'Normal Hız'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
