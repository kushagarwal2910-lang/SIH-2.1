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

  const sampleSteps = [20, 50, 100, 150, 200, 300, 400, 500];
  const singleScanProb = Math.min(1.0, 4.0 / config.numChannels);
  const theoryPoints = sampleSteps.map((t) => {
    const scans = Math.max(1, t / 40.0);
    const pCum = 1.0 - Math.pow(Math.max(0, 1.0 - singleScanProb), scans);
    return Math.min(1.0, Math.max(0, pCum));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <BookOpen size={16} />
            </div>
            <div>
              <h3 className="font-mono font-bold text-sm text-slate-100 uppercase tracking-wider">
                Theoretical Foundation // Radar Interception Mathematics
              </h3>
              <p className="text-[11px] text-slate-400">
                Mathematical proofs required by the SIH Electronic Warfare problem statement
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
          {/* Section 1: Wiley-Richards Model */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="text-cyan-400 font-mono font-bold text-xs">
              1. Wiley-Richards Closed-Form Probability of Intercept ($P_i$) Model
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              In classical Electronic Support measures (Wiley 1993, Richards 2010), the cumulative probability
              $P_i(t)$ of intercepting an uncooperative scanning emitter within $t$ time steps is derived as:
            </p>
            <div className="bg-slate-900 px-3 py-2 rounded-lg font-mono text-xs text-white text-center border border-slate-800">
              P_i(t) = 1 - (1 - min(1.0, t_dwell / C)) ^ (t / T_emitter)
            </div>

            {/* SVG Plot for Wiley Richards curve */}
            <div className="h-32 w-full bg-slate-900/60 rounded-lg border border-slate-800/80 p-2 flex flex-col justify-end">
              <svg viewBox="0 0 500 100" className="w-full h-24 overflow-visible">
                <line x1="40" y1="10" x2="490" y2="10" stroke="#334155" strokeDasharray="3,3" />
                <line x1="40" y1="50" x2="490" y2="50" stroke="#334155" strokeDasharray="3,3" />
                <line x1="40" y1="90" x2="490" y2="90" stroke="#475569" />
                <line x1="40" y1="10" x2="40" y2="90" stroke="#475569" />

                <polyline
                  fill="none"
                  stroke="#00f0ff"
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
              <div className="flex justify-between text-[10px] text-slate-400 font-mono px-4">
                <span>0 Epochs</span>
                <span className="text-cyan-400 font-bold">Theoretical Cumulative Intercept Probability P_i → 1.0</span>
                <span>500 Epochs</span>
              </div>
            </div>
          </div>

          {/* Section 2: Co-Prime Sweeper */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="text-purple-400 font-mono font-bold text-xs">
              2. Number-Theoretic Co-Prime Sweep (Chinese Remainder Theorem)
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              <strong className="text-white">The Harmonic Blind Spot Problem:</strong> When an adversary's radar rotates with period $T_e = 40$, and our receiver sweeps $C = 32$ channels sequentially with step $s=1$, the greatest common divisor $\gcd(32, 40) = 8$. This causes <b>permanent phase blindness</b> where our receiver is looking elsewhere every time the radar beam flashes past!
            </p>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              <strong className="text-white">The Solution:</strong> Setting scan stride $s$ such that $\gcd(s, C) = 1$ (e.g. prime $s=7$ for $C=32$) guarantees that the receiver sweeps all channels in a non-repeating permutation before repeating, breaking harmonic synchrony and eliminating blind spots.
            </p>
            <div className="bg-slate-900 px-3 py-2 rounded-lg font-mono text-xs text-purple-400 text-center border border-slate-800">
              a_t = (t × prime_stride) mod C &nbsp;|&nbsp; gcd(stride, C) = 1
            </div>
          </div>

          {/* Section 3: Closed-Loop Reinforcement Learning */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="text-emerald-400 font-mono font-bold text-xs">
              3. Interactive POMDP Formulation & Tactical Reward
            </h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Because an instantaneous receiver can only observe the channel it chooses to dwell on ($a_t$), receiver scheduling cannot be solved by offline static CSV classification. It is a <b>Partially Observable Markov Decision Process (POMDP)</b>. Our cognitive agent learns online from live tactical feedback:
            </p>
            <div className="grid grid-cols-3 gap-2 font-mono text-center text-[10px] pt-1">
              <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-300 font-bold">+10.0 HIT</div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-400">-1.0 EMPTY DWELL</div>
              <div className="p-2 rounded bg-rose-950/40 border border-rose-800 text-rose-300 font-bold">-5.0 MISSED MISSILE</div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Close Theory Reference
          </button>
        </div>
      </div>
    </div>
  );
};
