import React, { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';

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
      const intervalMs = Math.max(10, Math.floor(100 / playbackSpeed));
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
    <div className="playback-bar">
      {/* Left Control Actions */}
      <div className="playback-controls-group">
        <button
          onClick={onReset}
          className="btn btn-secondary btn-xs"
          title="Reset Simulation Timeline"
        >
          <RotateCcw size={13} />
          <span>Reset</span>
        </button>

        <button
          onClick={onPlayPause}
          className={`btn btn-xs ${isPlaying ? 'btn-secondary' : 'btn-primary'}`}
          style={isPlaying ? { backgroundColor: '#d97706', borderColor: '#f59e0b', color: '#ffffff' } : {}}
        >
          {isPlaying ? (
            <>
              <Pause size={13} />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play size={13} />
              <span>Play Live</span>
            </>
          )}
        </button>

        <button
          onClick={onStep}
          disabled={isPlaying || currentStep >= maxSteps - 1}
          className="btn btn-secondary btn-xs"
          title="Step +1 Epoch"
          style={isPlaying || currentStep >= maxSteps - 1 ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
        >
          <SkipForward size={13} />
          <span>+1 Step</span>
        </button>

        {/* Speed Selector */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#09090b', border: '1px solid #27272a', borderRadius: '6px', padding: '2px', marginLeft: '4px' }}>
          {[1, 2, 5, 10].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              style={{
                border: 'none',
                background: playbackSpeed === s ? '#27272a' : 'transparent',
                color: playbackSpeed === s ? '#ffffff' : '#71717a',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: playbackSpeed === s ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Scrub Slider */}
      <div className="playback-scrub-group">
        <input
          type="range"
          min={0}
          max={maxSteps - 1}
          value={currentStep}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="scrub-slider"
        />
        <span className="scrub-counter">
          {currentStep} / {maxSteps}
        </span>
      </div>

      {/* Live Telemetry Badges */}
      <div className="telemetry-pills">
        <div className="telemetry-badge">
          Look: <strong style={{ color: '#38bdf8' }}>Ch {currentAction}</strong>
        </div>
        <div className="telemetry-badge">
          Hits: <strong style={{ color: '#34d399' }}>{detectionsCount}</strong>
        </div>
      </div>
    </div>
  );
};
