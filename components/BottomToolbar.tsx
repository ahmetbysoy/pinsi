'use client';

import React from 'react';
import {
  TrendingUp,
  Zap,
  Layers,
  Brain,
  Settings,
  Maximize2,
  Minimize2,
  Radio,
  Clock,
  Flame,
  Activity
} from 'lucide-react';
import { Ticker24h } from '@/lib/types';

interface BottomToolbarProps {
  activeView: 'chart' | 'signal' | 'scanner' | 'pool' | 'settings';
  onChangeView: (view: 'chart' | 'signal' | 'scanner' | 'pool' | 'settings') => void;
  symbol: string;
  lastPrice: number;
  tickers: Ticker24h[];
  wsConnected: boolean;
  fundingRate: number | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const BottomToolbar: React.FC<BottomToolbarProps> = ({
  activeView,
  onChangeView,
  symbol,
  lastPrice,
  tickers,
  wsConnected,
  fundingRate,
  isFullscreen,
  onToggleFullscreen
}) => {
  const currentTicker = tickers.find((t) => t.symbol === symbol);
  const chg = currentTicker?.priceChangePercent || 0;
  const isPositive = chg >= 0;

  const tabs: {
    id: 'chart' | 'signal' | 'scanner' | 'pool' | 'settings';
    label: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'chart',
      label: 'Grafik',
      sub: 'Terminal & Heatmap',
      icon: TrendingUp
    },
    {
      id: 'signal',
      label: 'Sinyal & Flow',
      sub: 'Katman 1+2 Radar',
      icon: Zap
    },
    {
      id: 'scanner',
      label: 'Tarayıcı',
      sub: 'Futures 24s Hacim',
      icon: Layers
    },
    {
      id: 'pool',
      label: 'Pattern Havuzu',
      sub: 'Wilson %95 Algoritma',
      icon: Brain
    },
    {
      id: 'settings',
      label: 'Ayarlar',
      sub: 'MA / SAR / Flow Param',
      icon: Settings
    }
  ];

  return (
    <footer
      id="bottom-navigation-toolbar"
      className="h-14 bg-[#12161c] border-t border-[#22272e] px-2 sm:px-4 flex items-center justify-between gap-2 z-40 select-none shrink-0 backdrop-blur-md"
    >
      {/* Left: Quick Market Info (Hidden on ultra small screens) */}
      <div className="hidden md:flex items-center gap-3 pr-3 border-r border-[#1f252e]">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              wsConnected ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500/50' : 'bg-rose-500'
            }`}
          />
          <span className="text-[11px] font-mono font-bold text-slate-300 tracking-wider">
            {wsConnected ? 'WSS CANLI' : 'KOPUK'}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-400 font-bold">{symbol}</span>
          <span className="text-slate-100 font-bold">
            ${lastPrice > 0 ? lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '---'}
          </span>
          <span
            className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
              isPositive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {isPositive ? '+' : ''}
            {chg.toFixed(2)}%
          </span>
        </div>

        {fundingRate !== null && (
          <div className="hidden lg:flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <span className="text-slate-500">Fund:</span>
            <span className={fundingRate >= 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {(fundingRate * 100).toFixed(4)}%
            </span>
          </div>
        )}
      </div>

      {/* Center: Main Tabbed Navigation Toolbar */}
      <nav id="bottom-tabs-menu" className="flex items-center justify-center gap-1 sm:gap-2 flex-1 max-w-2xl mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-button-${tab.id}`}
              onClick={() => onChangeView(tab.id)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d24] border border-transparent'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-transform ${
                  isActive ? 'text-emerald-400 scale-110' : 'text-slate-400'
                }`}
              />
              <div className="flex flex-col items-start text-left">
                <span className="leading-tight tracking-wide whitespace-nowrap">{tab.label}</span>
                <span
                  className={`hidden xl:block text-[9px] font-mono leading-none ${
                    isActive ? 'text-emerald-400/80' : 'text-slate-500'
                  }`}
                >
                  {tab.sub}
                </span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Right: Fullscreen Button & Quick Action */}
      <div className="flex items-center gap-2 pl-2 border-l border-[#1f252e] shrink-0">
        <button
          id="btn-bottom-fullscreen"
          onClick={onToggleFullscreen}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono transition-all border ${
            isFullscreen
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
              : 'bg-[#181d24] text-slate-300 hover:text-white border-[#2a3038] hover:border-slate-500'
          }`}
          title="Tam Ekran Modu (Kısayol: F tuşu)"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isFullscreen ? 'Çıkış' : 'Tam Ekran [F]'}</span>
        </button>
      </div>
    </footer>
  );
};
