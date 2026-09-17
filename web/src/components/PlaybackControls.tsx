import React, { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Radio } from 'lucide-react';

interface PlaybackControlsProps {
  currentStep: number;
  maxSteps: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onPlayPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSeek: (step: number) => void;
  onSpeedChange: (speed: number) => void;
  currentAction: number;
  detectionsCount: number;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  currentStep,
  maxSteps,
  isPlaying,
  playbackSpeed,
  onPlayPause,
  onStep,
  onReset,
  onSeek,
  onSpeedChange,
  currentAction,
  detectionsCount
}) => {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(12, Math.floor(120 / playbackSpeed));
      timerRef.current = window.setInterval(() => {
        onStep();
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, onStep]);

  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 sm:px-4 py-2 rounded-xl shadow-2xl text-xs font-mono max-w-full">
      {/* Playback Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onReset}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          title="Reset Timeline to Epoch 0"
        >
          <RotateCcw size={13} />
        </button>

        <button
          onClick={onPlayPause}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition ${
            isPlaying
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
          } shadow-lg active:scale-95 cursor-pointer`}
          title={isPlaying ? 'Pause Simulation' : 'Play Live Mission'}
        >
          {isPlaying ? (
            <>
              <Pause size={13} />
              <span>PAUSE</span>
            </>
          ) : (
            <>
              <Play size={13} fill="currentColor" />
              <span>PLAY</span>
            </>
          )}
        </button>

        <button
          onClick={onStep}
          disabled={isPlaying || currentStep >= maxSteps - 1}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
          title="Advance by +1 Epoch"
        >
          <SkipForward size={13} />
          <span className="hidden sm:inline">+1</span>
        </button>
      </div>

      {/* Speed Selector */}
      <div className="hidden sm:flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
        {[1, 2, 5, 10].map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-1 rounded text-[10px] font-mono transition ${
              playbackSpeed === s
                ? 'bg-slate-800 text-cyan-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Scrubber Range Slider */}
      <div className="flex items-center gap-2 flex-1 min-w-[120px] sm:min-w-[180px]">
        <input
          type="range"
          min={0}
          max={maxSteps - 1}
          value={currentStep}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
        />
        <span className="text-[10px] text-slate-400 whitespace-nowrap">
          <span className="text-white font-bold">{currentStep}</span> / {maxSteps}
        </span>
      </div>

      {/* Live Telemetry Pill */}
      <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-800 text-[10px]">
        <div className="flex items-center gap-1 text-slate-400">
          <Radio size={11} className="text-cyan-400" />
          <span>Look: <strong className="text-cyan-400">Ch {currentAction}</strong></span>
        </div>
        <div className="text-slate-600">|</div>
        <div>
          <span>Hits: <strong className="text-emerald-400 font-bold">{detectionsCount}</strong></span>
        </div>
      </div>
    </div>
  );
};
