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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* 4 Strategy Comparison Cards */}
      <div className="strategy-grid">
        {[
          {
            key: 'Sequential Sweep (Baseline)',
            m: sweep,
            badgeClass: 'badge-rose',
            label: 'Baseline Sweep',
            desc: 'Fixed open-loop circle scan'
          },
          {
            key: 'Co-Prime Sweeper (Optimal Scan)',
            m: coprime,
            badgeClass: 'badge-purple',
            label: 'Co-Prime Sweeper',
            desc: 'Chinese Remainder Theorem scan'
          },
          {
            key: 'UCB1 Bandit (ML 1)',
            m: ucb,
            badgeClass: 'badge-amber',
            label: 'UCB1 Bandit',
            desc: 'Online exploration vs exploitation'
          },
          {
            key: 'Q-Learning Dwell Agent (ML 2)',
            m: ql,
            badgeClass: 'badge-emerald',
            label: 'Cognitive Q-Learning',
            desc: 'Adaptive reinforcement policy'
          }
        ].map(({ key, m, badgeClass, label, desc }) => {
          if (!m) return null;
          const isSelected = activeScheduler === key;
          return (
            <div
              key={key}
              onClick={() => onSelectScheduler(key)}
              className={`strategy-card ${isSelected ? 'selected' : ''}`}
            >
              <div className="strategy-card-top">
                <div>
                  <div className="strategy-name">{label}</div>
                  <div className="strategy-desc">{desc}</div>
                </div>
                <span className={`badge ${badgeClass}`}>
                  {m.interceptionEfficiencyRatio.toFixed(2)}x
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span className="strategy-hits">{m.totalDetections}</span>
                <span style={{ fontSize: '0.75rem', color: '#71717a', fontFamily: 'var(--font-mono)' }}>intercepts</span>
              </div>

              <div className="strategy-meta-grid">
                <div className="strategy-meta-item">
                  Pd: <strong>{(m.pDSlot * 100).toFixed(1)}%</strong>
                </div>
                <div className="strategy-meta-item">
                  Latency: <strong>{m.meanTti.toFixed(1)} ep</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Figures of Merit Benchmark Data Table */}
      <div className="table-card">
        <div className="table-header">
          <div className="table-title">
            <Target size={16} style={{ color: '#60a5fa' }} />
            <span>SIH ELECTRONIC SUPPORT MEASURES // FIGURES OF MERIT (FOM)</span>
          </div>
          <span className="badge badge-zinc">Contested Spectrum Ground Truth</span>
        </div>

        <div className="table-responsive-container">
          <table className="fom-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Overall Pd</th>
                <th>Missile Radar Pd</th>
                <th>Spatial Scan Pd</th>
                <th>False Alarm (Pfa)</th>
                <th>Mean Latency</th>
                <th>Prediction Acc</th>
                <th>Time Error</th>
                <th style={{ textAlign: 'right' }}>Efficiency Multiplier</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(metrics).map((m) => {
                const isSelected = activeScheduler === m.schedulerName;
                return (
                  <tr
                    key={m.schedulerName}
                    onClick={() => onSelectScheduler(m.schedulerName)}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ color: isSelected ? '#ffffff' : '#f4f4f5' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {isSelected && (
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#60a5fa' }} />
                        )}
                        {m.schedulerName}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{(m.pDSlot * 100).toFixed(1)}%</td>
                    <td style={{ color: '#fb7185' }}>{(m.pDSporadic * 100).toFixed(1)}%</td>
                    <td style={{ color: '#c084fc' }}>{(m.pDSpatial * 100).toFixed(1)}%</td>
                    <td style={{ color: '#a1a1aa' }}>{(m.pFa * 100).toFixed(2)}%</td>
                    <td>{m.meanTti.toFixed(2)} ep</td>
                    <td style={{ color: '#34d399' }}>{m.percentageCorrectPredictions.toFixed(1)}%</td>
                    <td style={{ color: '#a1a1aa' }}>{m.averageInterceptTimeError.toFixed(1)} ep</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#60a5fa' }}>
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
