'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Activity,
  Sliders,
  Brain,
  Star,
  Search,
  Zap,
  Radio,
  Clock,
  ChevronDown
} from 'lucide-react';
import { Ticker24h } from '@/lib/types';

interface NavbarProps {
  symbol: string;
  onSelectSymbol: (symbol: string) => void;
  symbols: string[];
  tickers: Ticker24h[];
  favs: string[];
  onToggleFav: (symbol: string) => void;
  activeView: 'chart' | 'signal' | 'scanner' | 'pool' | 'settings';
  onChangeView: (view: 'chart' | 'signal' | 'scanner' | 'pool' | 'settings') => void;
  lastPrice: number;
  fundingRate: number | null;
  nextFundingTime: number | null;
  wsConnected: boolean;
  marketConnected?: boolean;
  depthConnected?: boolean;
  wsMessage?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  symbol,
  onSelectSymbol,
  symbols,
  tickers,
  favs,
  onToggleFav,
  activeView,
  onChangeView,
  lastPrice,
  fundingRate,
  nextFundingTime,
  wsConnected,
  marketConnected = true,
  depthConnected = true,
  wsMessage
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fundingCountdown, setFundingCountdown] = useState('00:00:00');
  const searchRef = useRef<HTMLDivElement>(null);

  const isFav = favs.includes(symbol);
  const currentTicker = tickers.find((t) => t.symbol === symbol);

  // Funding countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      if (!nextFundingTime) {
        setFundingCountdown('--:--:--');
        return;
      }
      const diff = Math.max(0, nextFundingTime - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setFundingCountdown(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextFundingTime]);

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSymbols = searchQuery
    ? symbols.filter((s) => s.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 30)
    : [
        ...favs,
        ...tickers.slice(0, 20).map((t) => t.symbol).filter((s) => !favs.includes(s))
      ].slice(0, 25);

  const priceChange = currentTicker?.priceChangePercent || 0;

  return (
    <header className="h-14 border-b border-[#22272e] bg-[#12161c] px-3 sm:px-4 flex items-center justify-between gap-2 z-40 select-none">
      {/* Left: Logo & Symbol Selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 flex items-center justify-center shadow-inner">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="hidden md:block">
            <div className="text-xs font-bold tracking-wider text-slate-200">FUTURES PRO</div>
            <div className="text-[10px] font-mono flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${marketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                <span className={marketConnected ? 'text-emerald-400' : 'text-red-400'}>MKT</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${depthConnected ? 'bg-cyan-400 animate-pulse' : 'bg-red-500'}`} />
                <span className={depthConnected ? 'text-cyan-400' : 'text-red-400'}>DOM</span>
              </span>
            </div>
          </div>
        </div>

        {/* Symbol Search Bar */}
        <div className="relative" ref={searchRef}>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="flex items-center gap-2 bg-[#181d24] hover:bg-[#1f242c] border border-[#2a3038] hover:border-emerald-500/50 rounded-lg px-3 py-1.5 transition-all text-left"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono font-bold text-sm text-slate-100 tracking-wide">{symbol}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PERP</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${searchOpen ? 'rotate-180' : ''}`} />
          </button>

          {searchOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 sm:w-80 bg-[#161b22] border border-[#2e3640] rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[70vh] backdrop-blur-md">
              <div className="p-2 border-b border-[#252b33] bg-[#12161c]">
                <input
                  type="text"
                  placeholder="Futures coin ara (BTC, ETH, SOL...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-[#181d24] border border-[#2e3640] rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500 font-mono uppercase"
                />
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-[#1e232b]">
                {filteredSymbols.map((sym) => {
                  const t = tickers.find((x) => x.symbol === sym);
                  const chg = t?.priceChangePercent || 0;
                  const isF = favs.includes(sym);
                  return (
                    <div
                      key={sym}
                      onClick={() => {
                        onSelectSymbol(sym);
                        setSearchOpen(false);
                        setSearchQuery('');
                      }}
                      className="px-3 py-2 hover:bg-[#1f242c] cursor-pointer flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFav(sym);
                          }}
                          className={`p-1 rounded hover:bg-slate-700/50 ${isF ? 'text-amber-400' : 'text-slate-500'}`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <div>
                          <div className="font-mono font-bold text-xs text-slate-200 group-hover:text-emerald-400 transition-colors">
                            {sym}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Vol: ${((t?.quoteVolume || 0) / 1e6).toFixed(1)}M
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-xs text-slate-200">${t?.lastPrice ? t.lastPrice.toLocaleString() : '---'}</div>
                        <div className={`text-[10px] font-semibold ${chg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Favorite Button */}
        <button
          onClick={() => onToggleFav(symbol)}
          className={`p-2 rounded-lg border transition-colors ${
            isFav
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-[#181d24] border-[#2a3038] text-slate-500 hover:text-slate-300'
          }`}
          title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
        >
          <Star className="w-4 h-4 fill-current" />
        </button>

        {/* Price & 24h Change */}
        <div className="flex items-baseline gap-2 font-mono">
          <span className="text-base sm:text-lg font-extrabold text-slate-100 tracking-tight">
            ${lastPrice > 0 ? (lastPrice >= 100 ? lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : lastPrice.toFixed(4)) : '---'}
          </span>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${priceChange >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Center: Funding Stats (Desktop) */}
      <div className="hidden lg:flex items-center gap-4 bg-[#181d24] border border-[#262c34] rounded-lg px-3 py-1 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Radio className="w-3 h-3 text-cyan-400" />
          <span>Funding:</span>
          <span className={`font-bold ${fundingRate && fundingRate > 0 ? 'text-amber-400' : fundingRate && fundingRate < 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
            {fundingRate !== null ? `${(fundingRate * 100).toFixed(4)}%` : '---'}
          </span>
        </div>
        <div className="h-3 w-[1px] bg-[#2e3640]" />
        <div className="flex items-center gap-1.5 text-slate-400">
          <Clock className="w-3 h-3 text-purple-400" />
          <span>Geri Sayım:</span>
          <span className="text-slate-200 font-semibold">{fundingCountdown}</span>
        </div>
      </div>

      {/* Right: View Navigation */}
      <nav className="flex items-center gap-1 bg-[#181d24] border border-[#262c34] p-1 rounded-lg">
        <button
          onClick={() => onChangeView('chart')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            activeView === 'chart'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Grafik & Flow</span>
        </button>

        <button
          onClick={() => onChangeView('signal')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            activeView === 'signal'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sinyal & DOM</span>
        </button>

        <button
          onClick={() => onChangeView('scanner')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            activeView === 'scanner'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Tarayıcı</span>
        </button>

        <button
          onClick={() => onChangeView('pool')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            activeView === 'pool'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Havuz</span>
        </button>

        <button
          onClick={() => onChangeView('settings')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
            activeView === 'settings'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Ayarlar"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </nav>
    </header>
  );
};
