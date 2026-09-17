import React, { useState } from 'react';

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

      setSuccess(`Valid T x C Matrix: ${matrix.length} Steps × ${expectedCols} Channels!`);
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
      for (let t = 0; t < T; t++) {
        const row = new Array(C).fill(0);
        if (t % 16 === 0) row[10] = 1;
        if (t % 24 === 0) row[22] = 1;
        if (t % 32 >= 0 && t % 32 < 4) row[16] = 4;
        rows.push(row.join(','));
      }
    } else if (type === 'dense') {
      for (let t = 0; t < T; t++) {
        const row = new Array(C).fill(0);
        if (t % 12 < 2) row[4] = 1;
        if (t % 18 < 3) row[12] = 1;
        if (t % 25 < 2) row[20] = 1;
        row[t % C] = 2;
        rows.push(row.join(','));
      }
    } else {
      for (let t = 0; t < T; t++) {
        const row = new Array(C).fill(0);
        if (t >= 40 && t <= 46) row[8] = 3;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div>
            <h3 className="font-mono font-bold text-xs text-white uppercase tracking-wider">
              Tactical Testbench // Ingest Custom RF Matrix
            </h3>
            <p className="text-[10px] text-zinc-400">
              Upload or generate your own T x C ground truth transmission matrix
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
        <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs font-mono">
          {/* Preset Buttons */}
          <div>
            <label className="block text-[10px] uppercase text-zinc-400 mb-1.5">
              Select 1-Click Benchmark Test Vectors:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => loadSampleMatrix('adversarial')}
                className="px-3 py-2 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-500 rounded-lg text-left transition cursor-pointer"
              >
                <div className="font-bold text-white text-[11px]">Harmonic Trap</div>
                <div className="text-[9px] text-zinc-500">Tests Co-Prime Sweeper</div>
              </button>
              <button
                type="button"
                onClick={() => loadSampleMatrix('dense')}
                className="px-3 py-2 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-500 rounded-lg text-left transition cursor-pointer"
              >
                <div className="font-bold text-white text-[11px]">Dense Agile Hopper</div>
                <div className="text-[9px] text-zinc-500">Tests UCB1 Bandit</div>
              </button>
              <button
                type="button"
                onClick={() => loadSampleMatrix('stealth')}
                className="px-3 py-2 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-500 rounded-lg text-left transition cursor-pointer"
              >
                <div className="font-bold text-white text-[11px]">Stealth Pop-Up</div>
                <div className="text-[9px] text-zinc-500">Tests Q-Learning</div>
              </button>
            </div>
          </div>

          {/* Upload Area */}
          <div>
            <label className="block text-[10px] uppercase text-zinc-400 mb-1.5">
              Upload CSV File (T Rows × C Columns):
            </label>
            <label className="border border-dashed border-zinc-700 hover:border-zinc-400 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-zinc-950 hover:bg-zinc-900 transition text-center">
              <span className="text-white font-medium text-xs">Click to browse or drop CSV</span>
              <span className="text-[10px] text-zinc-500 mt-0.5">Format: 0=Quiet, 1=Periodic, 2=Agile, 3=Missile, 4=Spatial</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* Matrix Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase text-zinc-400">
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
                  className="text-[10px] text-zinc-500 hover:text-white"
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
              className="w-full bg-black border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-500 custom-scrollbar"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-300 text-xs">
              Error: {error}
            </div>
          )}
          {success && (
            <div className="p-2.5 bg-zinc-950 border border-zinc-600 rounded-lg text-white text-xs font-bold">
              {success}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end gap-2.5 font-mono">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-zinc-400 hover:text-white transition text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!csvText || !!error}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
              !csvText || !!error
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-white text-black hover:bg-zinc-200 cursor-pointer shadow-md'
            }`}
          >
            Apply to Simulation
          </button>
        </div>
      </div>
    </div>
  );
};
