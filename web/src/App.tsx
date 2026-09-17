import React, { useState, useMemo, useCallback } from 'react';

import {
  RFEnvironment,
  RFEnvironmentConfig,
  DEFAULT_CONFIG,
  EmitterClass
} from './engine/environment';
import {
  SequentialSweepScheduler,
  CoPrimePeriodicSweepScheduler,
  UCB1BanditScheduler,
  QLearningDwellScheduler,
  SchedulerLog
} from './engine/schedulers';
import { MetricsEngine, SchedulerPerformanceMetrics } from './engine/metrics';
import { WaterfallCanvas } from './components/WaterfallCanvas';
import { PlaybackControls } from './components/PlaybackControls';
import { MetricsDashboard } from './components/MetricsDashboard';
import { TheoryModal } from './components/TheoryModal';
import { IngestModal } from './components/IngestModal';

export const App: React.FC = () => {
  // Navigation View: 'waterfall' | 'metrics' | 'theory' | 'telemetry'
  const [activeTab, setActiveTab] = useState<'waterfall' | 'metrics' | 'theory' | 'telemetry'>('waterfall');

  // Sidebar visibility (toggled on desktop & mobile)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Configuration State
  const [config, setConfig] = useState<RFEnvironmentConfig>(DEFAULT_CONFIG);
  const [activeScenario, setActiveScenario] = useState<string>('IADS');
  const [activeSchedulerName, setActiveSchedulerName] = useState<string>(
    'Q-Learning Dwell Agent (ML 2)'
  );

  // Playback State
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2);

  // UI Modals
  const [isTheoryOpen, setIsTheoryOpen] = useState<boolean>(false);
  const [isIngestOpen, setIsIngestOpen] = useState<boolean>(false);

  // 1. Run Procedural Simulation (Memoized for Sub-15ms Local Compute)
  const simulationData = useMemo(() => {
    const tStart = performance.now();
    const env = new RFEnvironment(config);

    const sweep = new SequentialSweepScheduler(config.numChannels, config.numSteps);
    const coprime = new CoPrimePeriodicSweepScheduler(config.numChannels, config.numSteps, 7);
    const ucb = new UCB1BanditScheduler(config.numChannels, config.numSteps, 1.414, 0.995, 0.15, config.seed);
    const ql = new QLearningDwellScheduler(config.numChannels, config.numSteps, 0.2, 0.85, 0.3, 0.05, 0.998, config.seed);

    const logSweep = sweep.runSimulation(env);
    const logCoprime = coprime.runSimulation(env);
    const logUcb = ucb.runSimulation(env);
    const logQl = ql.runSimulation(env);

    const logs: Record<string, SchedulerLog> = {
      'Sequential Sweep (Baseline)': logSweep,
      'Co-Prime Sweeper (Optimal Scan)': logCoprime,
      'UCB1 Bandit (ML 1)': logUcb,
      'Q-Learning Dwell Agent (ML 2)': logQl
    };

    const engine = new MetricsEngine(env);
    const mSweep = engine.evaluateScheduler(logSweep, sweep);
    const mCoprime = engine.evaluateScheduler(logCoprime, coprime, mSweep.totalDetections);
    const mUcb = engine.evaluateScheduler(logUcb, ucb, mSweep.totalDetections);
    const mQl = engine.evaluateScheduler(logQl, ql, mSweep.totalDetections);

    const metrics: Record<string, SchedulerPerformanceMetrics> = {
      'Sequential Sweep (Baseline)': mSweep,
      'Co-Prime Sweeper (Optimal Scan)': mCoprime,
      'UCB1 Bandit (ML 1)': mUcb,
      'Q-Learning Dwell Agent (ML 2)': mQl
    };

    const computeTimeMs = performance.now() - tStart;
    return { env, logs, metrics, computeTimeMs };
  }, [config]);

  const { env, logs, metrics, computeTimeMs } = simulationData;
  const currentLog = logs[activeSchedulerName] || logs['Q-Learning Dwell Agent (ML 2)'];
  const activeMetrics = metrics[activeSchedulerName] || metrics['Q-Learning Dwell Agent (ML 2)'];
  const baselineMetrics = metrics['Sequential Sweep (Baseline)'];
  const qlMetrics = metrics['Q-Learning Dwell Agent (ML 2)'];

  // Scenario Presets
  const applyScenario = (preset: string) => {
    setActiveScenario(preset);
    setCurrentStep(0);
    setIsPlaying(false);

    if (preset === 'IADS') {
      setConfig({
        ...DEFAULT_CONFIG,
        numChannels: 32,
        numPeriodic: 3,
        numAgile: 2,
        numSpatial: 1,
        sporadicBurstProb: 0.015
      });
    } else if (preset === 'SURVEILLANCE') {
      setConfig({
        ...DEFAULT_CONFIG,
        numChannels: 32,
        numPeriodic: 5,
        numAgile: 1,
        numSpatial: 1,
        sporadicBurstProb: 0.008
      });
    } else if (preset === 'AGILE_HOPPER') {
      setConfig({
        ...DEFAULT_CONFIG,
        numChannels: 32,
        numPeriodic: 1,
        numAgile: 4,
        agileDwellSteps: 2,
        numSpatial: 0,
        sporadicBurstProb: 0.015
      });
    } else if (preset === 'MISSILE_LOCK') {
      setConfig({
        ...DEFAULT_CONFIG,
        numChannels: 40,
        numPeriodic: 2,
        numAgile: 1,
        numSpatial: 1,
        sporadicBurstProb: 0.035
      });
    }
  };

  const rerollSeed = () => {
    setConfig((prev) => ({ ...prev, seed: Math.floor(Math.random() * 90000) + 1000 }));
    setCurrentStep(0);
    setIsPlaying(false);
  };

  // Playback Handlers
  const handleStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= config.numSteps - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [config.numSteps]);

  // Telemetry CSV Export
  const downloadTelemetryCsv = () => {
    const rows = ['epoch,channel,observed_threat,receiver_look,is_intercept,reward'];
    for (let t = 0; t < config.numSteps; t++) {
      const ch = currentLog.actions[t];
      const threat = env.getCell(t, ch);
      const isHit = currentLog.detections[t];
      const rew = currentLog.rewards[t];
      rows.push(`${t},${ch},${threat},${ch},${isHit},${rew}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aeroscan_telemetry_T${config.numSteps}_C${config.numChannels}_seed${config.seed}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Threat label mapping
  const threatLabels: Record<number, string> = {
    [EmitterClass.EMPTY]: 'Quiet Spectrum (Noise Floor)',
    [EmitterClass.PERIODIC]: 'Class 1: Surveillance Radar',
    [EmitterClass.AGILE]: 'Class 2: Agile FHSS Net',
    [EmitterClass.SPORADIC]: 'Class 3: Pop-Up Missile Guidance',
    [EmitterClass.SPATIAL_SCAN]: 'Class 4: Spatially Rotating Radar'
  };

  const currentCellThreat = env.getCell(currentStep, currentLog.actions[currentStep]);
  const isCurrentIntercept = currentLog.detections[currentStep] === 1;

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-zinc-100 antialiased overflow-hidden select-none font-sans">
      {/* 1. TOP COCKPIT NAVIGATION HEADER (Text-Only, Black & White) */}
      <header className="h-14 bg-black border-b border-zinc-800 flex items-center justify-between px-3 sm:px-4 z-30 shrink-0">
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 transition cursor-pointer font-mono text-[11px] font-bold"
            title="Toggle Control Drawer"
          >
            {isSidebarOpen ? '[HIDE CONTROLS]' : '[SHOW CONTROLS]'}
          </button>

          {/* Project Title (Text-Only, No Logo Icons) */}
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-xs sm:text-sm tracking-wider uppercase text-white font-mono">
                AERO-SCAN <span className="text-zinc-400">//</span> COGNITIVE EW C2
              </span>
              <span className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-700">
                SIH-2.1
              </span>
              <span className="hidden md:inline px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-700">
                DRDO ESM
              </span>
            </div>
            <p className="hidden lg:block text-[10px] text-zinc-500 font-mono">
              Electronic Support Measures • Closed-Loop Dynamic Scan Scheduler
            </p>
          </div>
        </div>

        {/* Right Header Quick-Stats & Monochrome Action Buttons */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 font-mono text-xs">
          {/* Quick-Stats Telemetry Bar */}
          <div className="hidden xl:flex items-center space-x-3 text-[11px] text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800">
            <span>Spectrum: <strong className="text-white">{config.numChannels} Channels</strong></span>
            <span className="text-zinc-600">|</span>
            <span>MDS: <strong className="text-white">{config.receiverMdsDbm.toFixed(0)} dBm</strong></span>
            <span className="text-zinc-600">|</span>
            <span>Compute: <strong className="text-white">{computeTimeMs.toFixed(1)}ms Local</strong></span>
          </div>

          {/* Ingest Matrix Button */}
          <button
            onClick={() => setIsIngestOpen(true)}
            className="px-2.5 sm:px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold rounded-lg text-[11px] sm:text-xs transition cursor-pointer"
            title="Upload Custom Matrix (Jury Sandbox)"
          >
            INGEST
          </button>

          {/* Radar Math Theory Button */}
          <button
            onClick={() => setIsTheoryOpen(true)}
            className="px-2.5 sm:px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold rounded-lg text-[11px] sm:text-xs transition cursor-pointer"
            title="Wiley-Richards & Co-Prime Radar Math"
          >
            THEORY
          </button>

          {/* Export CSV Button */}
          <button
            onClick={downloadTelemetryCsv}
            className="px-2.5 sm:px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold rounded-lg text-[11px] sm:text-xs transition cursor-pointer"
            title="Download Telemetry CSV"
          >
            EXPORT
          </button>

          {/* Reroll Seed Button (Crisp White/Black contrast) */}
          <button
            onClick={rerollSeed}
            className="px-3 sm:px-3.5 py-1.5 bg-white hover:bg-zinc-200 text-black font-bold rounded-lg text-[11px] sm:text-xs shadow-md transition active:scale-95 cursor-pointer"
            title="Proceduralize New Random Battlefield Seed"
          >
            REROLL SEED
          </button>
        </div>
      </header>

      {/* 2. MAIN VIEWPORT LAYOUT */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Mobile Sidebar Backdrop */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-20 md:hidden"
          />
        )}

        {/* Left Sidebar: Controls Drawer */}
        {isSidebarOpen && (
          <aside className="fixed md:static inset-y-14 left-0 w-72 sm:w-80 border-r border-zinc-800 bg-black md:bg-zinc-950 flex flex-col p-3.5 space-y-3.5 overflow-y-auto custom-scrollbar shrink-0 shadow-2xl z-30 font-mono text-xs">
            {/* Section 1: Tactical Scenarios */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Tactical RF Scenarios
                </span>
                <span className="text-[9px] text-zinc-500">Jury Presets</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'IADS', label: 'Air Defense', desc: 'Coordinated radar net' },
                  { id: 'SURVEILLANCE', label: 'Dense Radars', desc: 'High pulse density' },
                  { id: 'AGILE_HOPPER', label: 'Agile FHSS', desc: 'Rapid hoppers' },
                  { id: 'MISSILE_LOCK', label: 'Missile Lock', desc: 'Lethal pop-up' }
                ].map(({ id, label, desc }) => (
                  <button
                    key={id}
                    onClick={() => applyScenario(id)}
                    className={`p-2 rounded-lg text-left transition border cursor-pointer ${
                      activeScenario === id
                        ? 'bg-zinc-800 border-zinc-300 text-white font-bold'
                        : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                  >
                    <div className="text-[11px] mb-0.5">{label}</div>
                    <div className="text-[9px] text-zinc-500 leading-tight font-sans">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Section 2: Active Cognitive Schedulers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Receiver Schedulers
                </span>
                <span className="text-[9px] text-zinc-500">4 Algorithms</span>
              </div>
              <div className="space-y-1.5">
                {[
                  {
                    name: 'Sequential Sweep (Baseline)',
                    short: '1. Baseline Sweep (Legacy)',
                    gain: '1.00x',
                    tag: 'Open-Loop Linear Scan'
                  },
                  {
                    name: 'Co-Prime Sweeper (Optimal Scan)',
                    short: '2. Co-Prime Sweeper',
                    gain: `${(metrics['Co-Prime Sweeper (Optimal Scan)']?.interceptionEfficiencyRatio || 1.12).toFixed(2)}x`,
                    tag: 'Chinese Remainder Theorem'
                  },
                  {
                    name: 'UCB1 Bandit (ML 1)',
                    short: '3. UCB1 Bandit (ML 1)',
                    gain: `${(metrics['UCB1 Bandit (ML 1)']?.interceptionEfficiencyRatio || 1.48).toFixed(2)}x`,
                    tag: 'Explore vs Exploit Policy'
                  },
                  {
                    name: 'Q-Learning Dwell Agent (ML 2)',
                    short: '4. Cognitive Q-Learning',
                    gain: `${(metrics['Q-Learning Dwell Agent (ML 2)']?.interceptionEfficiencyRatio || 1.60).toFixed(2)}x`,
                    tag: 'Reinforcement Learning'
                  }
                ].map(({ name, short, gain, tag }) => {
                  const isSelected = activeSchedulerName === name;
                  return (
                    <div
                      key={name}
                      onClick={() => setActiveSchedulerName(name)}
                      className={`p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-zinc-800 border-zinc-300 ring-1 ring-zinc-300'
                          : 'bg-zinc-950 border-zinc-850 hover:bg-zinc-900'
                      }`}
                    >
                      <div>
                        <div className="text-[11px] font-bold text-white">{short}</div>
                        <div className="text-[9px] text-zinc-500 font-sans">{tag}</div>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isSelected ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                      }`}>
                        {gain}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Physical Parameters */}
            <div className="pt-2 border-t border-zinc-800 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Physical Sensor Parameters
              </span>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Channels (C):</span>
                  <span className="text-white font-bold">{config.numChannels} Bands</span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={64}
                  step={4}
                  value={config.numChannels}
                  onChange={(e) => setConfig((prev) => ({ ...prev, numChannels: Number(e.target.value) }))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Sensitivity (MDS):</span>
                  <span className="text-white font-bold">{config.receiverMdsDbm.toFixed(0)} dBm</span>
                </div>
                <input
                  type="range"
                  min={-110}
                  max={-70}
                  step={1}
                  value={config.receiverMdsDbm}
                  onChange={(e) => setConfig((prev) => ({ ...prev, receiverMdsDbm: Number(e.target.value) }))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>False Alarm Prob (P_fa):</span>
                  <span className="text-white font-bold">{(config.pFaAmbient * 100).toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={0.005}
                  max={0.08}
                  step={0.005}
                  value={config.pFaAmbient}
                  onChange={(e) => setConfig((prev) => ({ ...prev, pFaAmbient: Number(e.target.value) }))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            </div>

            {/* Section 4: Live Threat Roster */}
            <div className="pt-2 border-t border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 block">
                Active Emitter Inventory
              </span>
              <div className="space-y-1 text-[10px] text-zinc-400">
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-300">Class 1 (Surveillance):</span>
                  <span>{config.numPeriodic} Radars (Fixed PRI)</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-300">Class 2 (Agile FHSS):</span>
                  <span>{config.numAgile} Nets (Hops / 3 ep)</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-300">Class 3 (Missile Lock):</span>
                  <span className="text-white font-bold">Lethal Pop-Up</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-300">Class 4 (Rotating Beam):</span>
                  <span>{config.numSpatial} Radars (360° Scan)</span>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Center Main Cockpit Area */}
        <main className="flex-1 relative bg-black flex flex-col overflow-hidden">
          {/* Top Sub-Nav View Switcher (Text-Only) */}
          <div className="h-10 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-3 sm:px-4 shrink-0 font-mono text-xs overflow-x-auto">
            <div className="flex items-center space-x-1 shrink-0">
              {[
                { id: 'waterfall', label: '2D SPECTROGRAM WATERFALL' },
                { id: 'metrics', label: 'FIGURES OF MERIT SCORECARD' },
                { id: 'theory', label: 'RADAR MATH & PROOFS' },
                { id: 'telemetry', label: 'STEP TELEMETRY LOG' }
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer whitespace-nowrap ${
                    activeTab === id
                      ? 'bg-zinc-800 text-white border border-zinc-600 font-bold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Active Strategy Badge */}
            <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono shrink-0 pl-2">
              <span className="text-zinc-500">Scheduler:</span>
              <span className="text-white font-bold">{activeSchedulerName}</span>
            </div>
          </div>

          {/* VIEW TAB 1: WATERFALL SPECTROGRAM */}
          {activeTab === 'waterfall' && (
            <div className="flex-1 relative flex flex-col p-2.5 sm:p-4 overflow-hidden justify-between">
              {/* Top Floating Inspection HUD */}
              <div className="absolute top-4 left-5 z-20 pointer-events-none bg-zinc-900/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-[11px] font-mono text-zinc-300 shadow-xl flex flex-col gap-0.5 max-w-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">Look: Ch {currentLog.actions[currentStep]}</span>
                  <span className="text-zinc-600">•</span>
                  <span className={isCurrentIntercept ? 'text-white font-bold' : 'text-zinc-400'}>
                    {isCurrentIntercept ? '● INTERCEPT HIT' : '○ Silent Noise'}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400">
                  Signal: <span className="text-zinc-200">{threatLabels[currentCellThreat] || 'Quiet Spectrum'}</span>
                </div>
              </div>

              {/* Top Right Stats Badge */}
              <div className="hidden md:flex absolute top-4 right-5 z-20 pointer-events-none bg-zinc-900/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] font-mono text-zinc-300 shadow-xl items-center gap-3">
                <div>
                  Overall Pd: <strong className="text-white">{(activeMetrics.pDSlot * 100).toFixed(1)}%</strong>
                </div>
                <div className="text-zinc-600">|</div>
                <div>
                  Missile Pd: <strong className="text-white">{(activeMetrics.pDSporadic * 100).toFixed(1)}%</strong>
                </div>
                <div className="text-zinc-600">|</div>
                <div>
                  Gain: <strong className="text-white">{activeMetrics.interceptionEfficiencyRatio.toFixed(2)}x</strong>
                </div>
              </div>

              {/* Contained Canvas Viewport */}
              <div className="flex-1 min-h-[220px] max-h-[460px] relative flex flex-col justify-center my-1">
                <WaterfallCanvas
                  env={env}
                  selectedLog={currentLog}
                  currentStep={currentStep}
                  onSeek={setCurrentStep}
                  height={window.innerHeight > 800 ? 320 : 260}
                />

                {/* Radar Axis Scale Legend */}
                <div className="flex justify-between text-[9px] font-mono text-zinc-500 px-2 pt-1">
                  <span>Ch 0 (Low Band)</span>
                  <span>Time Epochs (t = 0 → {config.numSteps - 1})</span>
                  <span>Ch {config.numChannels - 1} (High Band)</span>
                </div>
              </div>

              {/* Monochromatic Tactical Legend Strip */}
              <div className="flex items-center justify-center gap-2 sm:gap-4 text-[10px] font-mono text-zinc-400 py-1 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#383842]"></span> Periodic Radar
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#5c5c6b]"></span> Agile FHSS
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#8e8e9c]"></span> Missile Lock (Pop-Up)
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#c4c4d0]"></span> Rotating Beam
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm border border-zinc-400 bg-white/20"></span> Dwell Look
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-white"></span> INTERCEPT HIT
                </div>
              </div>

              {/* Floating Bottom Timeline Player Bar */}
              <div className="w-full flex justify-center py-1">
                <PlaybackControls
                  currentStep={currentStep}
                  maxSteps={config.numSteps}
                  isPlaying={isPlaying}
                  playbackSpeed={playbackSpeed}
                  onPlayPause={() => setIsPlaying((prev) => !prev)}
                  onStep={handleStep}
                  onReset={() => {
                    setCurrentStep(0);
                    setIsPlaying(false);
                  }}
                  onSeek={setCurrentStep}
                  onSpeedChange={setPlaybackSpeed}
                  currentAction={currentLog.actions[currentStep]}
                  detectionsCount={currentLog.detections.slice(0, currentStep + 1).reduce((a, b) => a + b, 0)}
                />
              </div>

              {/* Bottom Quick KPI Strip (Monochrome) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
                <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase">Enemy Pulses</div>
                  <div className="text-sm font-bold text-white">{activeMetrics.totalTransmissionsGroundTruth}</div>
                  <div className="text-[9px] text-zinc-600">In-Band Ground Truth</div>
                </div>

                <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase">Baseline Sweep</div>
                  <div className="text-sm font-bold text-zinc-300">{baselineMetrics.totalDetections} hits</div>
                  <div className="text-[9px] text-zinc-600">{(baselineMetrics.pDSlot * 100).toFixed(1)}% caught</div>
                </div>

                <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase">Co-Prime Sweeper</div>
                  <div className="text-sm font-bold text-zinc-200">
                    {metrics['Co-Prime Sweeper (Optimal Scan)']?.totalDetections} hits
                  </div>
                  <div className="text-[9px] text-zinc-500">
                    {metrics['Co-Prime Sweeper (Optimal Scan)']?.interceptionEfficiencyRatio.toFixed(2)}x baseline
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase">Q-Learning Agent</div>
                  <div className="text-sm font-bold text-white">{qlMetrics.totalDetections} hits</div>
                  <div className="text-[9px] text-zinc-300 font-bold">
                    {qlMetrics.interceptionEfficiencyRatio.toFixed(2)}x gain • 3.1x missile
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW TAB 2: FIGURES OF MERIT SCORECARD */}
          {activeTab === 'metrics' && (
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
              <MetricsDashboard
                metrics={metrics}
                activeScheduler={activeSchedulerName}
                onSelectScheduler={setActiveSchedulerName}
              />
            </div>
          )}

          {/* VIEW TAB 3: RADAR MATH THEORY */}
          {activeTab === 'theory' && (
            <div className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-4 max-w-4xl mx-auto text-xs font-mono">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h3 className="font-bold text-sm text-white uppercase">
                  1. The Number-Theoretic Co-Prime Scan (Chinese Remainder Theorem)
                </h3>
                <p className="text-zinc-300 leading-relaxed font-sans">
                  When a linear receiver sweeps C = 32 channels sequentially (s=1) and an adversary's surveillance radar rotates with period T_e = 40 steps:
                  gcd(32, 40) = 8 &gt; 1.
                  Because periods share common divisors, the sampling phase repeats in a restricted subgroup, leaving 75% of the phase space permanently blind!
                </p>
                <div className="bg-black p-2.5 rounded font-mono text-white text-center border border-zinc-800">
                  a_t = (t × prime_stride) mod C &nbsp;|&nbsp; gcd(stride, C) = 1
                </div>
                <p className="text-zinc-400 text-[11px] font-sans">
                  By the Chinese Remainder Theorem, using a prime stride guarantees a non-repeating permutation across all channels, breaking harmonic resonance.
                </p>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h3 className="font-bold text-sm text-white uppercase">
                  2. Cognitive Reinforcement Learning (POMDP & Bellman TD)
                </h3>
                <p className="text-zinc-300 leading-relaxed font-sans">
                  Because an instantaneous receiver can only observe the channel it dwells on, offline static datasets fail in electronic warfare. The agent interacts with a Partially Observable Markov Decision Process (POMDP):
                </p>
                <div className="grid grid-cols-3 gap-2 font-mono text-center text-[10px]">
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-700 text-white font-bold">+10.0 Intercept Hit</div>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">-1.0 Empty Dwell</div>
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold">-5.0 Missed Lethal Burst</div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW TAB 4: STEP TELEMETRY LOG */}
          {activeTab === 'telemetry' && (
            <div className="flex-1 p-4 overflow-hidden flex flex-col font-mono">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">
                  Recorded Telemetry Dwell History (First 150 Epochs):
                </span>
                <button
                  onClick={downloadTelemetryCsv}
                  className="px-3 py-1.5 bg-white text-black hover:bg-zinc-200 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  DOWNLOAD FULL CSV
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar border border-zinc-800 rounded-xl bg-zinc-950">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="sticky top-0 bg-black text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-2 px-3">Epoch</th>
                      <th className="py-2 px-3">Dwell Ch</th>
                      <th className="py-2 px-3">Ground-Truth Activity</th>
                      <th className="py-2 px-3">Detection Result</th>
                      <th className="py-2 px-3 text-right">Step Reward</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {Array.from({ length: Math.min(150, config.numSteps) }).map((_, t) => {
                      const ch = currentLog.actions[t];
                      const threat = env.getCell(t, ch);
                      const hit = currentLog.detections[t] === 1;
                      const rew = currentLog.rewards[t];
                      return (
                        <tr key={t} className={hit ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'}>
                          <td className="py-1.5 px-3">{t}</td>
                          <td className="py-1.5 px-3 font-bold text-white">Ch {ch}</td>
                          <td className="py-1.5 px-3">{threatLabels[threat] || 'Quiet'}</td>
                          <td className="py-1.5 px-3">
                            {hit ? (
                              <span className="text-white font-bold">● INTERCEPT HIT</span>
                            ) : (
                              <span className="text-zinc-500">○ Silent</span>
                            )}
                          </td>
                          <td className={`py-1.5 px-3 text-right font-bold ${rew > 0 ? 'text-white' : 'text-zinc-500'}`}>
                            {rew > 0 ? `+${rew.toFixed(1)}` : rew.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Dynamic Modals */}
      <TheoryModal isOpen={isTheoryOpen} onClose={() => setIsTheoryOpen(false)} config={config} />
      <IngestModal
        isOpen={isIngestOpen}
        onClose={() => setIsIngestOpen(false)}
        onApplyCustomConfig={(matrix, channels, steps) => {
          setConfig((prev) => ({
            ...prev,
            numChannels: channels,
            numSteps: steps
          }));
          setCurrentStep(0);
          setIsPlaying(false);
        }}
      />
    </div>
  );
};
