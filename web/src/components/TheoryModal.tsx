import React from 'react';
import { X, BookOpen } from 'lucide-react';
import { RFEnvironmentConfig } from '../engine/environment';

interface TheoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: RFEnvironmentConfig;
}

export const TheoryModal: React.FC<TheoryModalProps> = ({ isOpen, onClose, config }) => {
  if (!isOpen) return null;

  // Compute points for Wiley-Richards theoretical curve
  const sampleSteps = [20, 50, 100, 150, 200, 300, 400, 500];
  const singleScanProb = Math.min(1.0, 4.0 / config.numChannels);
  const theoryPoints = sampleSteps.map((t) => {
    const scans = Math.max(1, t / 40.0);
    const pCum = 1.0 - Math.pow(Math.max(0, 1.0 - singleScanProb), scans);
    return Math.min(1.0, Math.max(0, pCum));
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={18} style={{ color: '#60a5fa' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#f4f4f5' }}>
              Theoretical Foundation: Radar Interception Mathematics
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-xs"
            title="Close modal"
          >
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          {/* Section 1: Wiley-Richards Model */}
          <div style={{ background: '#09090b', padding: '16px', borderRadius: '8px', border: '1px solid #27272a' }}>
            <h4 style={{ color: '#60a5fa', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>
              1. Wiley-Richards Closed-Form Probability of Intercept (Pi) Model
            </h4>
            <p style={{ fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '10px', lineHeight: 1.6 }}>
              In classical Electronic Support measures (Wiley 1993, Richards 2010), the cumulative probability
              $P_i(t)$ of intercepting an uncooperative scanning emitter within $t$ time steps is derived as:
            </p>
            <div style={{ background: '#111114', padding: '10px', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#f4f4f5', textAlign: 'center', border: '1px solid #27272a', marginBottom: '12px' }}>
              P_i(t) = 1 - (1 - min(1.0, t_dwell / C)) ^ (t / T_emitter)
            </div>

            {/* SVG Plot for Wiley Richards curve */}
            <div style={{ height: '140px', width: '100%', background: '#141418', borderRadius: '6px', border: '1px solid #27272a', padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <svg viewBox="0 0 500 100" style={{ width: '100%', height: '100px', overflow: 'visible' }}>
                <line x1="40" y1="10" x2="490" y2="10" stroke="#27272a" strokeDasharray="3,3" />
                <line x1="40" y1="50" x2="490" y2="50" stroke="#27272a" strokeDasharray="3,3" />
                <line x1="40" y1="90" x2="490" y2="90" stroke="#3f3f46" />
                <line x1="40" y1="10" x2="40" y2="90" stroke="#3f3f46" />

                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  points={sampleSteps
                    .map((step, idx) => {
                      const x = 40 + (step / 500) * 450;
                      const y = 90 - theoryPoints[idx] * 80;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#71717a', fontFamily: 'var(--font-mono)', padding: '0 16px' }}>
                <span>0 Epochs</span>
                <span style={{ color: '#60a5fa', fontWeight: 600 }}>Theoretical Cumulative Intercept Probability P_i → 1.0</span>
                <span>500 Epochs</span>
              </div>
            </div>
          </div>

          {/* Section 2: Co-Prime Sweeper */}
          <div style={{ background: '#09090b', padding: '16px', borderRadius: '8px', border: '1px solid #27272a' }}>
            <h4 style={{ color: '#c084fc', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>
              2. Number-Theoretic Co-Prime Sweep (Chinese Remainder Theorem)
            </h4>
            <p style={{ fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '8px', lineHeight: 1.6 }}>
              <strong style={{ color: '#ffffff' }}>The Harmonic Blind Spot Problem:</strong> When an airport or missile radar rotates with period $T_e = 40$, and our receiver sweeps $C = 32$ channels sequentially with step $s=1$, the greatest common divisor $\gcd(32, 40) = 8$. This causes <b>permanent phase blindness</b> where our receiver is looking elsewhere each time the radar beam flashes past!
            </p>
            <p style={{ fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '10px', lineHeight: 1.6 }}>
              <strong style={{ color: '#ffffff' }}>The Solution:</strong> Setting scan stride $s$ such that $\gcd(s, C) = 1$ (e.g. prime $s=7$ for $C=32$) guarantees that the receiver sweeps all channels in a non-repeating permutation before repeating, breaking harmonic synchrony and eliminating blind spots.
            </p>
            <div style={{ background: '#111114', padding: '8px', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#c084fc', textAlign: 'center', border: '1px solid #27272a' }}>
              a_t = (t × prime_stride) mod C &nbsp;|&nbsp; gcd(stride, C) = 1
            </div>
          </div>

          {/* Section 3: Closed-Loop Reinforcement Learning */}
          <div style={{ background: '#09090b', padding: '16px', borderRadius: '8px', border: '1px solid #27272a' }}>
            <h4 style={{ color: '#34d399', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>
              3. Why Offline Datasets are Fundamentally Inappropriate (Interactive MDP)
            </h4>
            <p style={{ fontSize: '0.78rem', color: '#a1a1aa', lineHeight: 1.6 }}>
              In real Electronic Warfare, hostile systems are non-cooperative and unknown beforehand (zero prior intelligence). Furthermore, an instantaneous receiver can only observe the single channel it chooses to look at ($a_t$). Therefore, receiver scheduling is an interactive <b>Markov Decision Process (MDP)</b> where our agent must learn dynamically on the fly based on real-time hits (+10) and misses (-1, -5).
            </p>
          </div>
        </div>

        <div style={{ padding: '12px 20px', background: '#18181b', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary btn-xs">
            Close Theory Reference
          </button>
        </div>
      </div>
    </div>
  );
};
