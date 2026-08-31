'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  Flame,
  TrendingUp,
  TrendingDown,
  Percent,
  Star
} from 'lucide-react';
import { Ticker24h } from '@/lib/types';

interface MarketScannerProps {
  tickers: Ticker24h[];
  favs: string[];
  onToggleFav: (symbol: string) => void;
  onSelectSymbol: (symbol: string) => void;
  selectedSymbol: string;
}

export const MarketScanner: React.FC<MarketScannerProps> = ({
  tickers,
  favs,
  onToggleFav,
  onSelectSymbol,
  selectedSymbol
}) => {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'gainers' | 'losers' | 'volume' | 'favs'>('volume');
  const [sortField, setSortField] = useState<'quoteVolume' | 'priceChangePercent' | 'lastPrice'>('quoteVolume');
  const [sortAsc, setSortAsc] = useState(false);

  const filteredTickers = useMemo(() => {
    let list = [...tickers];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.symbol.toLowerCase().includes(q));
    }

    if (tab === 'favs') {
      list = list.filter((t) => favs.includes(t.symbol));
    } else if (tab === 'gainers') {
      list = list.filter((t) => t.priceChangePercent > 0).sort((a, b) => b.priceChangePercent - a.priceChangePercent);
    } else if (tab === 'losers') {
      list = list.filter((t) => t.priceChangePercent < 0).sort((a, b) => a.priceChangePercent - b.priceChangePercent);
    } else if (tab === 'volume') {
      list = list.sort((a, b) => b.quoteVolume - a.quoteVolume);
    }

    if (tab === 'all') {
      list.sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        return sortAsc ? valA - valB : valB - valA;
      });
    }

    return list;
  }, [tickers, search, tab, favs, sortField, sortAsc]);

  const handleSort = (field: 'quoteVolume' | 'priceChangePercent' | 'lastPrice') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] p-3 sm:p-4 select-none">
      <div className="bg-[#12161c] border border-[#22272e] rounded-xl p-4 flex flex-col gap-3 flex-1 min-h-0">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f252e] pb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">FUTURES PİYASA TARAYICI</h2>
              <span className="text-[11px] text-slate-500 font-mono">
                {tickers.length} Aktif Binance USDT-M Perpetual Çifti
              </span>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Coin ara (BTC, SOL...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#181d24] border border-[#2a3038] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500 font-mono uppercase"
            />
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setTab('volume')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'volume'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d24]'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>En Yüksek Hacim</span>
          </button>

          <button
            onClick={() => setTab('gainers')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'gainers'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d24]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>En Çok Artanlar</span>
          </button>

          <button
            onClick={() => setTab('losers')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'losers'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d24]'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span>En Çok Düşenler</span>
          </button>

          <button
            onClick={() => setTab('favs')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              tab === 'favs'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d24]'
            }`}
          >
            <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>Favoriler ({favs.length})</span>
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto border border-[#22272e] rounded-lg">
          <table className="w-full text-left text-xs font-mono">
            <thead className="sticky top-0 bg-[#161b22] border-b border-[#22272e] text-slate-400 z-10">
              <tr>
                <th className="p-3 w-10">★</th>
                <th className="p-3">Sembol</th>
                <th
                  onClick={() => handleSort('lastPrice')}
                  className="p-3 text-right cursor-pointer hover:text-slate-200"
                >
                  Son Fiyat
                </th>
                <th
                  onClick={() => handleSort('priceChangePercent')}
                  className="p-3 text-right cursor-pointer hover:text-slate-200"
                >
                  24s Değişim
                </th>
                <th
                  onClick={() => handleSort('quoteVolume')}
                  className="p-3 text-right cursor-pointer hover:text-slate-200"
                >
                  24s Hacim (USDT)
                </th>
                <th className="p-3 text-right">24s Aralık (H / L)</th>
                <th className="p-3 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e242d]">
              {filteredTickers.map((t) => {
                const isF = favs.includes(t.symbol);
                const isSelected = t.symbol === selectedSymbol;
                return (
                  <tr
                    key={t.symbol}
                    onClick={() => onSelectSymbol(t.symbol)}
                    className={`hover:bg-[#1b212a] cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-500/10' : ''
                    }`}
                  >
                    <td className="p-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFav(t.symbol);
                        }}
                        className={`p-1 rounded hover:bg-slate-700/50 ${
                          isF ? 'text-amber-400' : 'text-slate-600'
                        }`}
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </td>
                    <td className="p-3 font-bold text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span>{t.symbol}</span>
                        <span className="text-[10px] text-emerald-400 px-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                          PERP
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-bold text-slate-100">
                      ${t.lastPrice >= 100 ? t.lastPrice.toLocaleString() : t.lastPrice.toFixed(4)}
                    </td>
                    <td
                      className={`p-3 text-right font-bold ${
                        t.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {t.priceChangePercent >= 0 ? '+' : ''}
                      {t.priceChangePercent.toFixed(2)}%
                    </td>
                    <td className="p-3 text-right text-slate-300">
                      ${(t.quoteVolume / 1e6).toFixed(2)}M
                    </td>
                    <td className="p-3 text-right text-slate-400 text-[11px]">
                      <span className="text-emerald-400/80">${t.highPrice.toLocaleString()}</span>
                      <span className="mx-1">/</span>
                      <span className="text-rose-400/80">${t.lowPrice.toLocaleString()}</span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSymbol(t.symbol);
                        }}
                        className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40 transition-colors"
                      >
                        Aç
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
