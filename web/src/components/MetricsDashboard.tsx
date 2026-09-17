import React from 'react';
import { SchedulerPerformanceMetrics } from '../engine/metrics';

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
            label: '1. Baseline Sweep',
            desc: 'Legacy open-loop circle scan'
          },
          {
            key: 'Co-Prime Sweeper (Optimal Scan)',
            m: coprime,
            label: '2. Co-Prime Sweeper',
            desc: 'Chinese Remainder Theorem'
          },
          {
            key: 'UCB1 Bandit (ML 1)',
            m: ucb,
            label: '3. UCB1 Bandit',
            desc: 'Online explore vs exploit'
          },
          {
            key: 'Q-Learning Dwell Agent (ML 2)',
            m: ql,
            label: '4. Cognitive Q-Learning',
            desc: 'Adaptive reinforcement policy'
          }
        ].map(({ key, m, label, desc }) => {
          if (!m) return null;
          const isSelected = activeScheduler === key;
          return (
            <div
              key={key}
              onClick={() => onSelectScheduler(key)}
              className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-zinc-800/95 border-zinc-300 shadow-xl ring-1 ring-zinc-300'
                  : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-mono font-bold text-xs text-white uppercase">{label}</div>
                  <div className="text-[10px] text-zinc-400 leading-tight">{desc}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  isSelected ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                }`}>
                  {m.interceptionEfficiencyRatio.toFixed(2)}x
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-2xl font-mono font-extrabold text-white">{m.totalDetections}</span>
                <span className="text-[10px] text-zinc-400 font-mono">interceptions</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-zinc-800 text-[10px] font-mono text-zinc-400">
                <div>Pd: <strong className="text-zinc-100">{(m.pDSlot * 100).toFixed(1)}%</strong></div>
                <div>Mean Latency: <strong className="text-zinc-100">{m.meanTti.toFixed(1)} ep</strong></div>
                <div>Pred Acc: <strong className="text-zinc-100">{m.percentageCorrectPredictions.toFixed(0)}%</strong></div>
                <div>Missile Pd: <strong className="text-white font-bold">{(m.pDSporadic * 100).toFixed(1)}%</strong></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Figures of Merit Benchmark Data Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-xl">
        <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <span className="font-mono font-bold text-xs uppercase tracking-wider text-zinc-200">
            SIH ELECTRONIC SUPPORT MEASURES // FIGURES OF MERIT (FOM) SCORECARD
          </span>
          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-zinc-900 text-zinc-400 border border-zinc-800">
            Contested RF Ground Truth
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/90 text-[10px] text-zinc-400 uppercase tracking-wider">
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
            <tbody className="divide-y divide-zinc-800/60">
              {Object.values(metrics).map((m) => {
                const isSelected = activeScheduler === m.schedulerName;
                return (
                  <tr
                    key={m.schedulerName}
                    onClick={() => onSelectScheduler(m.schedulerName)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-zinc-800/90 text-white font-semibold'
                        : 'hover:bg-zinc-850 text-zinc-300'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                        )}
                        <span>{m.schedulerName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-zinc-100">{(m.pDSlot * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-zinc-100 font-bold">{(m.pDSporadic * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-zinc-300">{(m.pDSpatial * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-zinc-400">{(m.pFa * 100).toFixed(2)}%</td>
                    <td className="py-2.5 px-3">{m.meanTti.toFixed(2)} ep</td>
                    <td className="py-2.5 px-3 text-zinc-100">{(m.percentageCorrectPredictions).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-zinc-400">{m.averageInterceptTimeError.toFixed(1)} ep</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-white">
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
