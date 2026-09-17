import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { RFEnvironmentConfig } from '../engine/environment';

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCustomConfig: (matrix: number[][], numChannels: number, numSteps: number) => void;
}

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  onApplyCustomConfig
}) => {
  const [csvText, setCsvText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content);
      validateAndProcess(content);
    };
    reader.readAsText(file);
  };

  const validateAndProcess = (text: string) => {
    try {
      const lines = text
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length < 10) {
        setError('CSV must have at least 10 time steps (rows).');
        return;
      }

      const matrix: number[][] = [];
      let expectedCols = -1;

      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => parseInt(p.trim(), 10));
        if (expectedCols === -1) {
          expectedCols = parts.length;
          if (expectedCols < 4) {
            setError('CSV must have at least 4 frequency channels (columns).');
            return;
          }
        } else if (parts.length !== expectedCols) {
          setError(`Row ${i + 1} has ${parts.length} columns, expected ${expectedCols}.`);
          return;
        }

        matrix.push(parts.map((val) => (isNaN(val) ? 0 : Math.max(0, Math.min(4, val)))));
      }

      setSuccess(`Valid T x C Matrix Loaded: ${matrix.length} Steps × ${expectedCols} Channels!`);
      setError(null);
      return { matrix, steps: matrix.length, channels: expectedCols };
    } catch (err: any) {
      setError(`Parsing Error: ${err.message || 'Invalid CSV format'}`);
      return null;
    }
  };

  const handleApply = () => {
    const result = validateAndProcess(csvText);
    if (result) {
      onApplyCustomConfig(result.matrix, result.channels, result.steps);
      onClose();
    }
  };

  const loadSampleMatrix = (type: 'adversarial' | 'dense' | 'stealth') => {
    let T = 300;
    let C = 32;
    let rows: string[] = [];

    if (type === 'adversarial') {
      // Co-prime trap: periodic radar on period 32
      for (let t = 0; t < T; t++) {
        const row = new Array(C).fill(0);
        if (t % 16 === 0) row[10] = 1;
        if (t % 24 === 0) row[22] = 1;
        if (t % 32 >= 0 && t % 32 < 4) row[16] = 4; // Spatial scan
        rows.push(row.join(','));
      }
    } else if (type === 'dense') {
      for (let t = 0; t < T; t++) {
        const row = new Array(C).fill(0);
        if (t % 12 < 2) row[4] = 1;
        if (t % 18 < 3) row[12] = 1;
        if (t % 25 < 2) row[20] = 1;
        row[t % C] = 2; // Agile hopping
        rows.push(row.join(','));
      }
    } else {
      // Stealth pop-up
      for (let t = 0; t < T; t++) {
        const row = new Array(C).fill(0);
        if (t >= 40 && t <= 46) row[8] = 3; // Lethal pop-up burst
        if (t >= 140 && t <= 145) row[24] = 3;
        if (t >= 220 && t <= 228) row[14] = 3;
        rows.push(row.join(','));
      }
    }

    const generated = rows.join('\n');
    setCsvText(generated);
    validateAndProcess(generated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Upload size={16} />
            </div>
            <div>
              <h3 className="font-mono font-bold text-sm text-slate-100 uppercase tracking-wider">
                Jury Sandbox // Ingest Custom RF Matrix
              </h3>
              <p className="text-[11px] text-slate-400">
                Upload or generate your own $T \times C$ ground truth transmission matrix
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

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
          {/* Quick Preset Generators */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase">
              1-Click Benchmark Test Vectors:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => loadSampleMatrix('adversarial')}
                className="px-3 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-purple-500/50 rounded-lg text-left transition"
              >
                <div className="font-semibold text-purple-400">Harmonic Trap</div>
                <div className="text-[10px] text-slate-400">Tests Co-Prime Sweeper</div>
              </button>
              <button
                type="button"
                onClick={() => loadSampleMatrix('dense')}
                className="px-3 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-lg text-left transition"
              >
                <div className="font-semibold text-cyan-400">Dense Agile Hopper</div>
                <div className="text-[10px] text-slate-400">Tests UCB1 Bandit</div>
              </button>
              <button
                type="button"
                onClick={() => loadSampleMatrix('stealth')}
                className="px-3 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-rose-500/50 rounded-lg text-left transition"
              >
                <div className="font-semibold text-rose-400">Stealth Pop-Up</div>
                <div className="text-[10px] text-slate-400">Tests Q-Learning Prioritization</div>
              </button>
            </div>
          </div>

          {/* File Upload Drop Area */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase">
              Or Upload Raw CSV File ($T$ Rows × $C$ Columns):
            </label>
            <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/70 transition group">
              <FileText className="w-8 h-8 text-slate-500 group-hover:text-cyan-400 mb-1 transition" />
              <span className="text-slate-300 font-medium text-xs">Click to browse or drop CSV</span>
              <span className="text-[10px] text-slate-500 mt-0.5">Format: 0=Quiet, 1=Periodic, 2=Agile, 3=Missile, 4=Spatial</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* CSV Textarea Preview */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-mono text-slate-400 uppercase">
                CSV Matrix Preview ({csvText ? `${csvText.trim().split('\n').length} rows` : 'empty'}):
              </label>
              {csvText && (
                <button
                  type="button"
                  onClick={() => {
                    setCsvText('');
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                validateAndProcess(e.target.value);
              }}
              placeholder="0,0,1,0,0,0,2,0&#10;0,0,1,0,0,0,2,0&#10;0,0,0,0,3,3,0,0"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/80 custom-scrollbar"
            />
          </div>

          {/* Error / Success feedback */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-xs">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-emerald-300 text-xs">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!csvText || !!error}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              !csvText || !!error
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg cursor-pointer'
            }`}
          >
            <Upload size={13} />
            <span>Apply to Simulation</span>
          </button>
        </div>
      </div>
    </div>
  );
};
