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
  height = 360
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

  // Colors
  const COLORS = {
    empty: '#09090b',
    periodic: '#1d4ed8',      // Blue
    agile: '#d97706',         // Amber
    sporadic: '#e11d48',      // Rose / Red (High Threat)
    spatial: '#9333ea',       // Purple
    hit: '#10b981',           // Emerald
    dwell: '#38bdf8',         // Light cyan
    cursor: '#ffffff'
  };

  const threatLabels: Record<number, string> = {
    [EmitterClass.EMPTY]: 'Quiet Spectrum (Noise Floor)',
    [EmitterClass.PERIODIC]: 'Class 1: Surveillance Radar (Periodic)',
    [EmitterClass.AGILE]: 'Class 2: Frequency-Hopper (FHSS)',
    [EmitterClass.SPORADIC]: 'Class 3: High-Threat Missile Radar',
    [EmitterClass.SPATIAL_SCAN]: 'Class 4: Spatially Rotating Radar'
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const canvasHeight = canvas.height;

    // Clear background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, canvasHeight);

    const cellWidth = width / T;
    const cellHeight = canvasHeight / C;

    // 1. Draw Spectrum Heatmap
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

    // 2. Draw Receiver Dwells (historical up to currentStep)
    const renderLimit = Math.min(T, currentStep + 1);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
    for (let t = 0; t < renderLimit; t++) {
      const ch = selectedLog.actions[t];
      const y = (C - 1 - ch) * cellHeight + cellHeight * 0.25;
      ctx.fillRect(t * cellWidth, y, Math.max(1.5, cellWidth), cellHeight * 0.5);
    }

    // 3. Draw Interception Hits
    ctx.fillStyle = COLORS.hit;
    for (let t = 0; t < renderLimit; t++) {
      if (selectedLog.detections[t] === 1) {
        const ch = selectedLog.actions[t];
        const cx = t * cellWidth + cellWidth / 2;
        const cy = (C - 1 - ch) * cellHeight + cellHeight / 2;
        const radius = Math.min(cellHeight * 0.45, 4.5);

        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, radius), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 4. Draw Live Playhead Line
    const playheadX = currentStep * cellWidth;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvasHeight);
    ctx.stroke();

    // Highlight active dwell at playhead
    if (currentStep < T) {
      const activeCh = selectedLog.actions[currentStep];
      const activeY = (C - 1 - activeCh) * cellHeight;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(playheadX - 3, activeY, Math.max(cellWidth, 6), cellHeight);
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
    <div ref={containerRef} className="canvas-wrapper" style={{ height }}>
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointer(e);
        }}
        onPointerMove={handlePointer}
        onPointerLeave={() => setHoverInfo(null)}
        className="canvas-element"
      />

      {/* Modern Floating Hover Glass Tooltip */}
      {hoverInfo && (
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 30,
            transform: 'translate(-50%, -100%)',
            marginBottom: '10px',
            padding: '8px 12px',
            backgroundColor: 'rgba(24, 24, 27, 0.95)',
            border: '1px solid #3f3f46',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            left: Math.max(120, Math.min((canvasRef.current?.width || 300) - 120, hoverInfo.x)),
            top: Math.max(70, hoverInfo.y)
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ color: '#a1a1aa' }}>Step:</span>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>{hoverInfo.step}</span>
            <span style={{ color: '#52525b' }}>|</span>
            <span style={{ color: '#a1a1aa' }}>Ch:</span>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>{hoverInfo.channel}</span>
          </div>
          <div style={{ color: '#e4e4e7', marginBottom: '4px' }}>
            {threatLabels[hoverInfo.threatClass] || 'Quiet'}
          </div>
          {hoverInfo.isIntercepted ? (
            <div style={{ color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>●</span> DIRECT INTERCEPT HIT
            </div>
          ) : hoverInfo.receiverHere ? (
            <div style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>○</span> Receiver Dwell (No Signal)
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
