import React, { useEffect, useRef } from 'react';

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
    <div className="flex flex-wrap items-center justify-between gap-2.5 bg-zinc-950/90 backdrop-blur-md border border-zinc-850 px-3 sm:px-4 py-1.5 rounded-lg shadow-xl text-xs font-mono w-full max-w-2xl">
      {/* Playback Action Buttons (Sleek Monochrome) */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onReset}
          className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 transition text-[11px] font-medium cursor-pointer"
          title="Reset Timeline to Epoch 0"
        >
          RESET
        </button>

        <button
          onClick={onPlayPause}
          className={`px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer ${
            isPlaying
              ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-650'
              : 'bg-zinc-100 hover:bg-white text-black shadow-xs font-bold'
          }`}
          title={isPlaying ? 'Pause Simulation' : 'Play Live Mission'}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>

        <button
          onClick={onStep}
          disabled={isPlaying || currentStep >= maxSteps - 1}
          className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition text-[11px] font-medium cursor-pointer"
          title="Advance by +1 Epoch"
        >
          +1 STEP
        </button>
      </div>

      {/* Speed Selector */}
      <div className="flex items-center bg-zinc-900/90 p-0.5 rounded-md border border-zinc-800">
        {[1, 2, 5, 10].map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
              playbackSpeed === s
                ? 'bg-zinc-800 text-white font-bold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Scrubber Range Slider */}
      <div className="flex items-center gap-2 flex-1 min-w-[120px] sm:min-w-[150px]">
        <input
          type="range"
          min={0}
          max={maxSteps - 1}
          value={currentStep}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-white focus:outline-none"
        />
        <span className="text-[10px] text-zinc-400 whitespace-nowrap">
          <span className="text-white font-bold">{currentStep}</span> / {maxSteps}
        </span>
      </div>

      {/* Live Telemetry Status */}
      <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-zinc-800 text-[10px]">
        <div>
          Look: <strong className="text-white font-bold">Ch {currentAction}</strong>
        </div>
        <div className="text-zinc-700">•</div>
        <div>
          Hits: <strong className="text-emerald-400 font-bold">{detectionsCount}</strong>
        </div>
      </div>
    </div>
  );
};
