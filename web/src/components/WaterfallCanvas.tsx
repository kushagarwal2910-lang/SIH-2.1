import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EmitterClass, RFEnvironment } from '../engine/environment';
import { SchedulerLog } from '../engine/schedulers';

interface WaterfallCanvasProps {
  env: RFEnvironment;
  selectedLog: SchedulerLog;
  currentStep: number;
  onSeek: (step: number) => void;
  height?: number;
}

export const WaterfallCanvas: React.FC<WaterfallCanvasProps> = ({
  env,
  selectedLog,
  currentStep,
  onSeek,
  height = 320
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    step: number;
    channel: number;
    threatClass: EmitterClass;
    isIntercepted: boolean;
    receiverHere: boolean;
  } | null>(null);

  const T = env.config.numSteps;
  const C = env.config.numChannels;

  // Tactical Electronic Warfare Radar Spectrogram Palette (Vibrant High-Fidelity SDR)
  const COLORS = {
    empty: '#030508',          // Deep void black noise floor
    periodic: '#00f0ff',       // Class 1: Surveillance Radar (Electric Neon Cyan)
    agile: '#f59e0b',          // Class 2: Agile Frequency Hopper (Tactical Amber)
    sporadic: '#ff2255',       // Class 3: Pop-Up Lethal Missile Guidance (Laser Crimson)
    spatial: '#a855f7',        // Class 4: Spatially Rotating Beam (Cyber Violet)
    hit: '#10b981',            // Direct Intercept Hit (High-Voltage Neon Emerald Green)
    hitGlow: '#059669',        // Hit halo glow
    dwell: 'rgba(255, 255, 255, 0.22)', // Receiver Dwell Window
    grid: 'rgba(255, 255, 255, 0.04)',
    playhead: '#ffffff'
  };

  const threatLabels: Record<number, string> = {
    [EmitterClass.EMPTY]: 'Quiet Spectrum (Noise Floor)',
    [EmitterClass.PERIODIC]: 'Class 1: Surveillance Radar (Fixed PRI)',
    [EmitterClass.AGILE]: 'Class 2: Frequency-Hopper (FHSS Net)',
    [EmitterClass.SPORADIC]: 'Class 3: High-Threat Missile Lock (Pop-Up)',
    [EmitterClass.SPATIAL_SCAN]: 'Class 4: Spatially Rotating Radar (360°)'
  };

  const threatColors: Record<number, string> = {
    [EmitterClass.EMPTY]: '#71717a',
    [EmitterClass.PERIODIC]: '#00f0ff',
    [EmitterClass.AGILE]: '#f59e0b',
    [EmitterClass.SPORADIC]: '#ff2255',
    [EmitterClass.SPATIAL_SCAN]: '#a855f7'
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const canvasHeight = canvas.height;

    // Background (Deep Void)
    ctx.fillStyle = COLORS.empty;
    ctx.fillRect(0, 0, width, canvasHeight);

    const cellWidth = width / T;
    const cellHeight = canvasHeight / C;

    // 1. Draw Ground-Truth Spectrum Activity (Vibrant Multi-Color Pulses)
    for (let t = 0; t < T; t++) {
      for (let c = 0; c < C; c++) {
        const val = env.getCell(t, c);
        if (val === EmitterClass.EMPTY) continue;

        let fill = COLORS.empty;
        if (val === EmitterClass.PERIODIC) fill = COLORS.periodic;
        else if (val === EmitterClass.AGILE) fill = COLORS.agile;
        else if (val === EmitterClass.SPORADIC) fill = COLORS.sporadic;
        else if (val === EmitterClass.SPATIAL_SCAN) fill = COLORS.spatial;

        ctx.fillStyle = fill;
        ctx.fillRect(t * cellWidth, (C - 1 - c) * cellHeight, Math.max(1.2, cellWidth), cellHeight);
      }
    }

    // 2. Draw Subtle Channel Grid Lines
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    const gridInterval = C <= 32 ? 4 : 8;
    for (let c = 0; c < C; c += gridInterval) {
      const y = (C - 1 - c) * cellHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Draw Receiver Dwells (historical trajectory up to currentStep)
    const renderLimit = Math.min(T, currentStep + 1);
    ctx.fillStyle = COLORS.dwell;
    for (let t = 0; t < renderLimit; t++) {
      const ch = selectedLog.actions[t];
      const y = (C - 1 - ch) * cellHeight + cellHeight * 0.15;
      ctx.fillRect(t * cellWidth, y, Math.max(1.5, cellWidth), cellHeight * 0.7);
    }

    // 4. Draw Interception Hits (Brilliant Neon Emerald Green with Glow)
    for (let t = 0; t < renderLimit; t++) {
      if (selectedLog.detections[t] === 1) {
        const ch = selectedLog.actions[t];
        const cx = t * cellWidth + cellWidth / 2;
        const cy = (C - 1 - ch) * cellHeight + cellHeight / 2;
        const radius = Math.min(cellHeight * 0.45, 5);

        // Outer glow
        ctx.fillStyle = COLORS.hit;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2.5, radius), 0, Math.PI * 2);
        ctx.fill();

        // Inner bright white spark
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, radius * 0.5), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // 5. Draw Live Playhead Line (Crisp White Laser)
    const playheadX = currentStep * cellWidth;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvasHeight);
    ctx.stroke();

    // Active look indicator box at playhead
    if (currentStep < T) {
      const activeCh = selectedLog.actions[currentStep];
      const activeY = (C - 1 - activeCh) * cellHeight;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(playheadX - 4, activeY - 1, Math.max(cellWidth + 8, 14), cellHeight + 2);
    }
  }, [env, selectedLog, currentStep, T, C]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = height;
        draw();
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const step = Math.min(T - 1, Math.max(0, Math.floor((px / canvas.width) * T)));
    const ch = Math.min(C - 1, Math.max(0, C - 1 - Math.floor((py / canvas.height) * C)));

    const threatClass = env.getCell(step, ch);
    const receiverHere = selectedLog.actions[step] === ch;
    const isIntercepted = receiverHere && selectedLog.detections[step] === 1;

    setHoverInfo({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      step,
      channel: ch,
      threatClass,
      isIntercepted,
      receiverHere
    });

    if (e.buttons === 1) {
      onSeek(step);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden border border-zinc-800 bg-black shadow-xl" style={{ height }}>
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointer(e);
        }}
        onPointerMove={handlePointer}
        onPointerLeave={() => setHoverInfo(null)}
        className="w-full h-full cursor-crosshair block"
      />

      {/* Floating Inspection Tooltip */}
      {hoverInfo && (
        <div
          className="absolute pointer-events-none z-30 transform -translate-x-1/2 -translate-y-full mb-2 px-3 py-2 bg-zinc-950/95 border border-zinc-700 rounded-lg shadow-2xl backdrop-blur-md text-[11px] font-mono text-zinc-200 min-w-[180px]"
          style={{
            left: Math.max(100, Math.min((canvasRef.current?.width || 300) - 100, hoverInfo.x)),
            top: Math.max(50, hoverInfo.y)
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-1 border-b border-zinc-800 pb-1">
            <div>
              <span className="text-zinc-500">t=</span>
              <span className="text-white font-bold">{hoverInfo.step}</span>
            </div>
            <div>
              <span className="text-zinc-500">Ch </span>
              <span className="text-white font-bold">{hoverInfo.channel}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 my-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: threatColors[hoverInfo.threatClass] || '#71717a' }}
            />
            <span className="text-zinc-300 font-sans text-[10px] leading-tight">
              {threatLabels[hoverInfo.threatClass] || 'Quiet Spectrum'}
            </span>
          </div>
          {hoverInfo.isIntercepted ? (
            <div className="text-emerald-400 font-bold flex items-center gap-1.5 pt-1 border-t border-zinc-800 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              DIRECT INTERCEPT HIT
            </div>
          ) : hoverInfo.receiverHere ? (
            <div className="text-zinc-400 flex items-center gap-1.5 pt-1 border-t border-zinc-800 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
              Receiver Look Dwell
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
