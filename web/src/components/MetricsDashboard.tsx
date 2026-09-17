import React from 'react';
import { SchedulerPerformanceMetrics } from '../engine/metrics';
import { Target, Award, Zap, ShieldAlert, Cpu } from 'lucide-react';

interface MetricsDashboardProps {
  metrics: Record<string, SchedulerPerformanceMetrics>;
  activeScheduler: string;
  onSelectScheduler: (name: string) => void;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  metrics,
  activeScheduler,
  onSelectScheduler
}) => {
  const sweep = metrics['Sequential Sweep (Baseline)'];
  const coprime = metrics['Co-Prime Sweeper (Optimal Scan)'];
  const ucb = metrics['UCB1 Bandit (ML 1)'];
  const ql = metrics['Q-Learning Dwell Agent (ML 2)'];

  if (!sweep || !ql) return null;

  return (
    <div className="space-y-4 w-full text-xs">
      {/* 4 Strategy Comparison Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            key: 'Sequential Sweep (Baseline)',
            m: sweep,
            color: 'border-rose-500/40 text-rose-400 bg-rose-950/20',
            badgeBg: 'bg-rose-950 text-rose-400 border border-rose-800',
            label: '1. Baseline Sweep',
            desc: 'Legacy open-loop circle scan'
          },
          {
            key: 'Co-Prime Sweeper (Optimal Scan)',
            m: coprime,
            color: 'border-purple-500/40 text-purple-400 bg-purple-950/20',
            badgeBg: 'bg-purple-950 text-purple-400 border border-purple-800',
            label: '2. Co-Prime Sweeper',
            desc: 'Chinese Remainder Theorem'
          },
          {
            key: 'UCB1 Bandit (ML 1)',
            m: ucb,
            color: 'border-amber-500/40 text-amber-400 bg-amber-950/20',
            badgeBg: 'bg-amber-950 text-amber-400 border border-amber-800',
            label: '3. UCB1 Bandit',
            desc: 'Online explore vs exploit'
          },
          {
            key: 'Q-Learning Dwell Agent (ML 2)',
            m: ql,
            color: 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20',
            badgeBg: 'bg-emerald-950 text-emerald-400 border border-emerald-800',
            label: '4. Cognitive Q-Learning',
            desc: 'Adaptive reinforcement policy'
          }
        ].map(({ key, m, color, badgeBg, label, desc }) => {
          if (!m) return null;
          const isSelected = activeScheduler === key;
          return (
            <div
              key={key}
              onClick={() => onSelectScheduler(key)}
              className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-800/90 border-cyan-400 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-400'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-mono font-bold text-xs text-white">{label}</div>
                  <div className="text-[10px] text-slate-400 leading-tight">{desc}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${badgeBg}`}>
                  {m.interceptionEfficiencyRatio.toFixed(2)}x
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xl font-mono font-extrabold text-white">{m.totalDetections}</span>
                <span className="text-[10px] text-slate-400 font-mono">threat intercepts</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                <div>Pd: <strong className="text-slate-200">{(m.pDSlot * 100).toFixed(1)}%</strong></div>
                <div>Mean Latency: <strong className="text-slate-200">{m.meanTti.toFixed(1)} ep</strong></div>
                <div>Pred Acc: <strong className="text-emerald-400">{m.percentageCorrectPredictions.toFixed(0)}%</strong></div>
                <div>Missile Pd: <strong className="text-rose-400">{(m.pDSporadic * 100).toFixed(1)}%</strong></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Figures of Merit Benchmark Data Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-cyan-400" />
            <span className="font-mono font-bold text-xs uppercase tracking-wider text-slate-200">
              SIH ELECTRONIC SUPPORT MEASURES // FIGURES OF MERIT (FOM) SCORECARD
            </span>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
            Contested RF Ground Truth
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Scheduling Strategy</th>
                <th className="py-2.5 px-3">Overall Pd</th>
                <th className="py-2.5 px-3">Missile Lock Pd</th>
                <th className="py-2.5 px-3">Spatial Scan Pd</th>
                <th className="py-2.5 px-3">False Alarm (Pfa)</th>
                <th className="py-2.5 px-3">Mean Latency</th>
                <th className="py-2.5 px-3">Prediction Acc</th>
                <th className="py-2.5 px-3">Time Error</th>
                <th className="py-2.5 px-3 text-right">Efficiency Multiplier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {Object.values(metrics).map((m) => {
                const isSelected = activeScheduler === m.schedulerName;
                return (
                  <tr
                    key={m.schedulerName}
                    onClick={() => onSelectScheduler(m.schedulerName)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-slate-800/80 text-white font-semibold'
                        : 'hover:bg-slate-850 text-slate-300'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
                        )}
                        <span>{m.schedulerName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-100">{(m.pDSlot * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-rose-400 font-bold">{(m.pDSporadic * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-purple-400">{(m.pDSpatial * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-slate-400">{(m.pFa * 100).toFixed(2)}%</td>
                    <td className="py-2.5 px-3">{m.meanTti.toFixed(2)} ep</td>
                    <td className="py-2.5 px-3 text-emerald-400">{(m.percentageCorrectPredictions).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-slate-400">{m.averageInterceptTimeError.toFixed(1)} ep</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-cyan-400">
                      {m.interceptionEfficiencyRatio.toFixed(2)}x
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
