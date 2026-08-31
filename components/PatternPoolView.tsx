'use client';

import React, { useState, useEffect } from 'react';
import {
  Brain,
  Download,
  Upload,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
  Flame,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { PatternStats } from '@/lib/types';
import { fetchKlines } from '@/lib/binance';
import {
  initPatternDB,
  dbAll,
  patternAllIds,
  patternName,
  patternRecomputeStats,
  patternGetStats,
  patternBackfillFromCandles,
  dbAdd,
  dbIndexGet
} from '@/lib/pattern-engine';

interface PatternPoolViewProps {
  symbol: string;
  interval: string;
}

export const PatternPoolView: React.FC<PatternPoolViewProps> = ({ symbol, interval }) => {
  const [statsList, setStatsList] = useState<PatternStats[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<PatternStats | null>(null);
  const [tfFilter, setTfFilter] = useState<'all' | '1m' | '5m' | '15m' | '1h'>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'coin'>('all');
  const [minN, setMinN] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      await initPatternDB();
      const allStats = await dbAll<PatternStats>('poolStats');
      const map = new Map(allStats.map((s) => [s.key, s]));

      const defaultKeys: string[] = [];
      ['1m', '5m', '15m', '1h'].forEach((tf) =>
        patternAllIds().forEach((pid) => defaultKeys.push(`${tf}:${pid}`))
      );

      const list: PatternStats[] = allStats.length > 0
        ? allStats.slice()
        : defaultKeys.map((key) => ({
            key,
            schemaVersion: 1,
            updatedAt: Date.now(),
            scope: 'global' as const,
            timeframe: key.split(':')[0],
            patternId: key.split(':')[1],
            n: 0,
            wins: 0,
            winRate: 0,
            wilsonLower: 0,
            avgRet10: 0,
            stdRet10: 0,
            avgMfe20: 0,
            avgMae20: 0,
            avgRMultiple: 0,
            medBarsToMfe: 0,
            weightedWinRate: 0,
            weightedAvgRet10: 0,
            regimes: {}
          }));

      list.sort((a, b) => b.wilsonLower - a.wilsonLower || b.n - a.n);
      setStatsList(list);
    } catch (e) {
      console.warn('Load stats error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      try {
        await initPatternDB();
        const allStats = await dbAll<PatternStats>('poolStats');
        if (!mounted) return;
        const defaultKeys: string[] = [];
        ['1m', '5m', '15m', '1h'].forEach((tf) =>
          patternAllIds().forEach((pid) => defaultKeys.push(`${tf}:${pid}`))
        );

        const list: PatternStats[] = allStats.length > 0
          ? allStats.slice()
          : defaultKeys.map((key) => ({
              key,
              schemaVersion: 1,
              updatedAt: Date.now(),
              scope: 'global' as const,
              timeframe: key.split(':')[0],
              patternId: key.split(':')[1],
              n: 0,
              wins: 0,
              winRate: 0,
              wilsonLower: 0,
              avgRet10: 0,
              stdRet10: 0,
              avgMfe20: 0,
              avgMae20: 0,
              avgRMultiple: 0,
              medBarsToMfe: 0,
              weightedWinRate: 0,
              weightedAvgRet10: 0,
              regimes: {}
            }));

        list.sort((a, b) => b.wilsonLower - a.wilsonLower || b.n - a.n);
        if (mounted) {
          setStatsList(list);
          setLoading(false);
        }
      } catch (e) {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, [symbol]);

  const runBackfillScan = async () => {
    setBackfilling(true);
    try {
      // Fetch 600 klines with timeout protection and backfill for current symbol
      const cs = await fetchKlines(symbol, interval, 600);
      if (cs && cs.length > 0) {
        await patternBackfillFromCandles(symbol, interval, cs);
      }
      await loadStats();
    } catch (e) {
      console.warn('Backfill scan error:', e);
    } finally {
      setBackfilling(false);
    }
  };

  const filteredList = statsList.filter((s) => {
    if (tfFilter !== 'all' && s.timeframe !== tfFilter) return false;
    if (scopeFilter === 'global' && s.scope !== 'global') return false;
    if (scopeFilter === 'coin' && (s.scope !== 'coin' || s.coin !== symbol)) return false;
    if (s.n < minN) return false;
    return true;
  });

  const exportJSON = async () => {
    try {
      const events = await dbAll('events');
      const poolStats = await dbAll('poolStats');
      const data = {
        exportedAt: new Date().toISOString(),
        events,
        poolStats
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `binance-futures-pattern-pool-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Export error:', e);
    }
  };

  const importJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.events)) {
        for (const ev of data.events) {
          const old = await dbIndexGet('events', 'eventKey', ev.eventKey);
          if (!old) {
            delete ev.id;
            await dbAdd('events', ev);
          }
        }
      }
      await loadStats();
    } catch (err) {
      console.warn('Import error:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] p-3 sm:p-4 select-none">
      <div className="bg-[#12161c] border border-[#22272e] rounded-xl p-4 flex flex-col gap-4 flex-1 min-h-0">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f252e] pb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">
                HAVUZ MOTORU (PATTERN POOL LEADERBOARD)
              </h2>
              <span className="text-[11px] text-slate-500 font-mono">
                IndexedDB Kalıcı İstatistikler · Wilson %95 Alt Sınır Modeli
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#181d24] text-slate-300 hover:text-white border border-[#2a3038] hover:border-slate-500 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Dışa Aktar</span>
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#181d24] text-slate-300 hover:text-white border border-[#2a3038] hover:border-slate-500 transition-all cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>İçe Aktar</span>
              <input type="file" accept="application/json" onChange={importJSON} className="hidden" />
            </label>

            <button
              onClick={loadStats}
              disabled={loading}
              className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-[#181d24] p-1 rounded-lg border border-[#262c34] text-xs">
              <span className="text-slate-500 px-2">TF:</span>
              {(['all', '1m', '5m', '15m', '1h'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTfFilter(tf)}
                  className={`px-2.5 py-0.5 rounded font-mono font-bold transition-colors ${
                    tfFilter === tf
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf === 'all' ? 'Hepsi' : tf}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-[#181d24] p-1 rounded-lg border border-[#262c34] text-xs">
              <span className="text-slate-500 px-2">Kapsam:</span>
              {(['all', 'global', 'coin'] as const).map((sc) => (
                <button
                  key={sc}
                  onClick={() => setScopeFilter(sc)}
                  className={`px-2.5 py-0.5 rounded font-mono font-bold transition-colors ${
                    scopeFilter === sc
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sc === 'all' ? 'Hepsi' : sc === 'global' ? 'Global' : symbol}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-[#181d24] p-1 rounded-lg border border-[#262c34] text-xs">
              <span className="text-slate-500 px-2">Min Örnek:</span>
              {[0, 15, 30, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => setMinN(n)}
                  className={`px-2.5 py-0.5 rounded font-mono font-bold transition-colors ${
                    minN === n
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {n === 0 ? 'Tümü' : `${n}+`}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={runBackfillScan}
            disabled={backfilling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600/30 to-cyan-600/30 text-emerald-300 hover:text-white border border-emerald-500/40 hover:border-emerald-400 transition-all shadow-sm disabled:opacity-50"
          >
            <Flame className={`w-3.5 h-3.5 text-amber-400 ${backfilling ? 'animate-bounce' : ''}`} />
            <span>{backfilling ? 'Taranıyor...' : `${symbol} (${interval}) Mumlarını Tara & Öğren`}</span>
          </button>
        </div>

        {/* Main Grid: Table & Selected Detail */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
          {/* Table (2 cols) */}
          <div className="lg:col-span-2 overflow-y-auto border border-[#22272e] rounded-lg">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 bg-[#161b22] border-b border-[#22272e] text-slate-400 z-10">
                <tr>
                  <th className="p-3">Desen Adı</th>
                  <th className="p-3 text-center">TF</th>
                  <th className="p-3 text-center">Örnek (N)</th>
                  <th className="p-3 text-center">Wilson Alt (%95)</th>
                  <th className="p-3 text-right">Ort. Ret10</th>
                  <th className="p-3 text-right">MFE/MAE</th>
                  <th className="p-3 text-center">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e242d]">
                {filteredList.map((st) => {
                  const isSelected = selectedPattern?.key === st.key;
                  return (
                    <tr
                      key={st.key}
                      onClick={() => setSelectedPattern(st)}
                      className={`hover:bg-[#1b212a] cursor-pointer transition-colors ${
                        isSelected ? 'bg-purple-500/10' : ''
                      }`}
                    >
                      <td className="p-3 font-bold text-slate-200">
                        <div>{patternName(st.patternId)}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{st.patternId}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-[#181d24] text-slate-300 border border-[#262c34]">
                          {st.timeframe}
                        </span>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-200">{st.n}</td>
                      <td className="p-3 text-center font-extrabold text-slate-100">
                        <span
                          className={`px-2 py-0.5 rounded border ${
                            st.wilsonLower >= 50
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : st.wilsonLower < 42
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          %{st.wilsonLower.toFixed(1)}
                        </span>
                      </td>
                      <td
                        className={`p-3 text-right font-bold ${
                          st.avgRet10 > 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {st.avgRet10 > 0 ? '+' : ''}
                        {st.avgRet10.toFixed(2)}%
                      </td>
                      <td className="p-3 text-right text-slate-300">
                        {st.avgMfe20.toFixed(1)}% / {st.avgMae20.toFixed(1)}%
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            st.n < 15
                              ? 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                              : st.wilsonLower >= 50
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : st.wilsonLower < 42
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {st.n < 15
                            ? 'Topluyor'
                            : st.wilsonLower >= 50
                            ? 'Güvenilir'
                            : st.wilsonLower < 42
                            ? 'Zayıf'
                            : 'Orta'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected Pattern Detail Card (1 col) */}
          <div className="bg-[#161b22] border border-[#22272e] rounded-lg p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-[#22272e] pb-2">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold text-slate-200">SEÇİLİ DESEN DETAYI</h3>
            </div>

            {selectedPattern ? (
              <div className="flex flex-col gap-3 font-mono text-xs">
                <div>
                  <div className="font-bold text-sm text-slate-100">
                    {patternName(selectedPattern.patternId)}
                  </div>
                  <div className="text-[11px] text-purple-400 mt-0.5">{selectedPattern.key}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#11151b] p-2.5 rounded-lg border border-[#1e242d]">
                    <span className="text-[10px] text-slate-500 block">Ham Win Rate:</span>
                    <span className="font-bold text-slate-100 text-sm">
                      %{selectedPattern.winRate.toFixed(1)}
                    </span>
                  </div>

                  <div className="bg-[#11151b] p-2.5 rounded-lg border border-[#1e242d]">
                    <span className="text-[10px] text-slate-500 block">Ağırlıklı Win Rate:</span>
                    <span className="font-bold text-slate-100 text-sm">
                      %{selectedPattern.weightedWinRate.toFixed(1)}
                    </span>
                  </div>

                  <div className="bg-[#11151b] p-2.5 rounded-lg border border-[#1e242d]">
                    <span className="text-[10px] text-slate-500 block">Wilson Alt Sınır:</span>
                    <span className="font-bold text-emerald-400 text-sm">
                      %{selectedPattern.wilsonLower.toFixed(1)}
                    </span>
                  </div>

                  <div className="bg-[#11151b] p-2.5 rounded-lg border border-[#1e242d]">
                    <span className="text-[10px] text-slate-500 block">Toplam Örnek:</span>
                    <span className="font-bold text-slate-100 text-sm">{selectedPattern.n}</span>
                  </div>
                </div>

                {/* Regime breakdown */}
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-[11px] font-bold text-slate-400">Piyasa Rejimleri Dağılımı:</span>
                  <div className="border border-[#1e242d] rounded-lg overflow-hidden">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-[#11151b] text-slate-400">
                        <tr>
                          <th className="p-2">Rejim (Vol/Trend)</th>
                          <th className="p-2 text-center">N</th>
                          <th className="p-2 text-center">Win %</th>
                          <th className="p-2 text-right">Ret10</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e242d]">
                        {Object.values(selectedPattern.regimes || {}).map((r) => (
                          <tr key={r.key}>
                            <td className="p-2 font-bold text-slate-300">{r.key.replace('_', ' / ')}</td>
                            <td className="p-2 text-center text-slate-400">{r.n}</td>
                            <td className="p-2 text-center text-emerald-400 font-bold">%{r.winRate.toFixed(0)}</td>
                            <td className="p-2 text-right text-slate-200">{r.avgRet10.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                Detayları incelemek için tablodan bir desen seçin.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
