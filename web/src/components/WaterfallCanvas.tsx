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

  // Tactical Monochrome / Grayscale Palette (FLIR style)
  const COLORS = {
    empty: '#050507',
    periodic: '#383842',       // Class 1: Periodic Radar (Dark Neutral Grey)
    agile: '#5c5c6b',          // Class 2: Agile FHSS (Mid Grey)
    sporadic: '#8e8e9c',       // Class 3: Pop-Up Missile (Light Grey)
    spatial: '#c4c4d0',        // Class 4: Rotating Radar (Silver Grey)
    hit: '#ffffff',            // Interception Hit (Pure White-Hot)
    dwell: 'rgba(255, 255, 255, 0.22)',
    grid: 'rgba(255, 255, 255, 0.06)'
  };

  const threatLabels: Record<number, string> = {
    [EmitterClass.EMPTY]: 'Quiet Spectrum (Noise Floor)',
    [EmitterClass.PERIODIC]: 'Class 1: Surveillance Radar (Fixed PRI)',
    [EmitterClass.AGILE]: 'Class 2: Frequency-Hopper (FHSS Net)',
    [EmitterClass.SPORADIC]: 'Class 3: High-Threat Missile Lock (Pop-Up)',
    [EmitterClass.SPATIAL_SCAN]: 'Class 4: Spatially Rotating Radar (360°)'
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const canvasHeight = canvas.height;

    // Background
    ctx.fillStyle = COLORS.empty;
    ctx.fillRect(0, 0, width, canvasHeight);

    const cellWidth = width / T;
    const cellHeight = canvasHeight / C;

    // 1. Draw Ground-Truth Spectrum Activity
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
        ctx.fillRect(t * cellWidth, (C - 1 - c) * cellHeight, Math.max(1, cellWidth), cellHeight);
      }
    }

    // 2. Draw Subtle Channel Grid Lines (every 4 or 8 channels)
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
      const y = (C - 1 - ch) * cellHeight + cellHeight * 0.2;
      ctx.fillRect(t * cellWidth, y, Math.max(1.5, cellWidth), cellHeight * 0.6);
    }

    // 4. Draw Interception Hits (Pure White)
    ctx.fillStyle = COLORS.hit;
    for (let t = 0; t < renderLimit; t++) {
      if (selectedLog.detections[t] === 1) {
        const ch = selectedLog.actions[t];
        const cx = t * cellWidth + cellWidth / 2;
        const cy = (C - 1 - ch) * cellHeight + cellHeight / 2;
        const radius = Math.min(cellHeight * 0.45, 5);

        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2.5, radius), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 5. Draw Live Playhead Line
    const playheadX = currentStep * cellWidth;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvasHeight);
    ctx.stroke();

    // Active look indicator at playhead
    if (currentStep < T) {
      const activeCh = selectedLog.actions[currentStep];
      const activeY = (C - 1 - activeCh) * cellHeight;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(playheadX - 4, activeY - 1, Math.max(cellWidth + 8, 12), cellHeight + 2);
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
          className="absolute pointer-events-none z-30 transform -translate-x-1/2 -translate-y-full mb-2 px-3 py-2 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-2xl backdrop-blur-md text-[11px] font-mono text-zinc-200"
          style={{
            left: Math.max(100, Math.min((canvasRef.current?.width || 300) - 100, hoverInfo.x)),
            top: Math.max(60, hoverInfo.y)
          }}
        >
          <div className="flex items-center gap-2 mb-1 border-b border-zinc-800 pb-1">
            <span className="text-zinc-400">Epoch:</span>
            <span className="text-white font-bold">{hoverInfo.step}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">Channel:</span>
            <span className="text-white font-bold">Ch {hoverInfo.channel}</span>
          </div>
          <div className="text-zinc-300 font-sans text-[10px] mb-1">
            {threatLabels[hoverInfo.threatClass] || 'Quiet Spectrum'}
          </div>
          {hoverInfo.isIntercepted ? (
            <div className="text-white font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white"></span> DIRECT INTERCEPT HIT
            </div>
          ) : hoverInfo.receiverHere ? (
            <div className="text-zinc-400 flex items-center gap-1 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span> Receiver Look Dwell
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
