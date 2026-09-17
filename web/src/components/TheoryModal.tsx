import React from 'react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div>
            <h3 className="font-mono font-bold text-xs text-white uppercase tracking-wider">
              Theoretical Foundation // Radar Interception Mathematics
            </h3>
            <p className="text-[10px] text-zinc-400">
              Closed-form analytical proofs required by the SIH Electronic Warfare problem statement
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition font-mono text-xs cursor-pointer"
          >
            [CLOSE]
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
          {/* Section 1: Wiley-Richards Model */}
          <div className="bg-black p-4 rounded-xl border border-zinc-800 space-y-2">
            <h4 className="text-white font-mono font-bold text-xs uppercase">
              1. Wiley-Richards Closed-Form Probability of Intercept (Pi) Model
            </h4>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              In classical Electronic Support measures (Wiley 1993, Richards 2010), the cumulative probability
              P_i(t) of intercepting an uncooperative scanning emitter within t time steps is derived as:
            </p>
            <div className="bg-zinc-900 px-3 py-2 rounded-lg font-mono text-xs text-white text-center border border-zinc-800">
              P_i(t) = 1 - (1 - min(1.0, t_dwell / C)) ^ (t / T_emitter)
            </div>

            {/* SVG Plot for Wiley Richards curve */}
            <div className="h-32 w-full bg-zinc-950 rounded-lg border border-zinc-800 p-2 flex flex-col justify-end">
              <svg viewBox="0 0 500 100" className="w-full h-24 overflow-visible">
                <line x1="40" y1="10" x2="490" y2="10" stroke="#27272a" strokeDasharray="3,3" />
                <line x1="40" y1="50" x2="490" y2="50" stroke="#27272a" strokeDasharray="3,3" />
                <line x1="40" y1="90" x2="490" y2="90" stroke="#3f3f46" />
                <line x1="40" y1="10" x2="40" y2="90" stroke="#3f3f46" />

                <polyline
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  points={sampleSteps
                    .map((step, idx) => {
                      const x = 40 + (step / 500) * 450;
                      const y = 90 - theoryPoints[idx] * 80;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              </svg>
              <div className="flex justify-between text-[10px] text-zinc-400 font-mono px-4">
                <span>0 Epochs</span>
                <span className="text-white font-bold">Theoretical Cumulative Intercept Probability P_i → 1.0</span>
                <span>500 Epochs</span>
              </div>
            </div>
          </div>

          {/* Section 2: Co-Prime Sweeper */}
          <div className="bg-black p-4 rounded-xl border border-zinc-800 space-y-2">
            <h4 className="text-white font-mono font-bold text-xs uppercase">
              2. Number-Theoretic Co-Prime Sweep (Chinese Remainder Theorem)
            </h4>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              <strong className="text-white">The Harmonic Blind Spot Problem:</strong> When an adversary's radar rotates with period T_e = 40, and our receiver sweeps C = 32 channels sequentially with step s=1, the greatest common divisor gcd(32, 40) = 8 &gt; 1. This causes permanent phase blindness where our receiver is looking elsewhere every time the radar beam flashes past!
            </p>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              <strong className="text-white">The Solution:</strong> Setting scan stride s such that gcd(s, C) = 1 (e.g. prime s=7 for C=32) guarantees that the receiver sweeps all channels in a non-repeating permutation before repeating, breaking harmonic synchrony and eliminating blind spots.
            </p>
            <div className="bg-zinc-900 px-3 py-2 rounded-lg font-mono text-xs text-zinc-200 text-center border border-zinc-800">
              a_t = (t × prime_stride) mod C &nbsp;|&nbsp; gcd(stride, C) = 1
            </div>
          </div>

          {/* Section 3: Closed-Loop Reinforcement Learning */}
          <div className="bg-black p-4 rounded-xl border border-zinc-800 space-y-2">
            <h4 className="text-white font-mono font-bold text-xs uppercase">
              3. Interactive POMDP Formulation & Tactical Reward
            </h4>
            <p className="text-zinc-300 leading-relaxed text-[11px]">
              Because an instantaneous receiver can only observe the channel it chooses to dwell on (a_t), receiver scheduling cannot be solved by offline static dataset classification. It is a Partially Observable Markov Decision Process (POMDP). Our cognitive agent learns online from live tactical feedback:
            </p>
            <div className="grid grid-cols-3 gap-2 font-mono text-center text-[10px] pt-1">
              <div className="p-2 rounded bg-zinc-900 border border-zinc-700 text-white font-bold">+10.0 HIT</div>
              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">-1.0 EMPTY DWELL</div>
              <div className="p-2 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold">-5.0 MISSED MISSILE</div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white text-black hover:bg-zinc-200 transition cursor-pointer"
          >
            Close Theory Reference
          </button>
        </div>
      </div>
    </div>
  );
};
