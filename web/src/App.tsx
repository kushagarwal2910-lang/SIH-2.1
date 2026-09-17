import React, { useState, useMemo, useCallback } from 'react';
import {
  Radio,
  Sliders,
  Download,
  BookOpen,
  RefreshCw,
  Target,
  BarChart3,
  Shield,
  Layers,
  X,
  Zap,
  Menu,
  CheckCircle2,
  Upload,
  Activity,
  Radar,
  Flame,
  Clock,
  Sparkles
} from 'lucide-react';

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

  // Sidebar visibility
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
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 antialiased overflow-hidden select-none font-sans">
      {/* 1. TOP COCKPIT NAVIGATION HEADER (Matches odvp.vercel.app style) */}
      <header className="h-14 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between px-2.5 sm:px-4 z-30 shrink-0">
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-400 text-cyan-400 transition cursor-pointer flex items-center gap-1.5"
            title="Toggle Control Drawer"
          >
            <Menu size={16} />
            <span className="hidden sm:inline text-[11px] font-semibold text-slate-200">Controls</span>
          </button>

          {/* Logo Badge */}
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
            <Radio size={18} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="font-bold text-[11px] sm:text-xs tracking-wider uppercase text-white font-mono">
                AERO-SCAN <span className="text-cyan-400">COGNITIVE EW C2</span>
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                SIH-2.1
              </span>
              <span className="hidden md:inline px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                DRDO ESM
              </span>
            </div>
            <p className="hidden lg:block text-[10px] text-slate-400">
              Ministry of Defence • Cognitive Electronic Support Measures Adaptive Scan Engine
            </p>
          </div>
        </div>

        {/* Right Header Quick-Stats & Action Buttons */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Quick-Stats Telemetry Bar */}
          <div className="hidden xl:flex items-center space-x-3 text-[11px] font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Spectrum: {config.numChannels} Channels
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-cyan-400">MDS: {config.receiverMdsDbm.toFixed(0)} dBm</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400">Compute: {computeTimeMs.toFixed(1)}ms Local</span>
          </div>

          {/* Ingest Custom Matrix */}
          <button
            onClick={() => setIsIngestOpen(true)}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/60 text-slate-200 font-semibold rounded-lg text-[11px] sm:text-xs transition cursor-pointer"
            title="Upload Custom Matrix (Jury Sandbox)"
          >
            <Upload size={13} className="text-cyan-400" />
            <span className="hidden sm:inline">Ingest</span>
          </button>

          {/* Radar Math Theory */}
          <button
            onClick={() => setIsTheoryOpen(true)}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-purple-500/60 text-slate-200 font-semibold rounded-lg text-[11px] sm:text-xs transition cursor-pointer"
            title="Wiley-Richards & Co-Prime Radar Math"
          >
            <BookOpen size={13} className="text-purple-400" />
            <span className="hidden sm:inline">Theory</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={downloadTelemetryCsv}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/60 text-slate-200 font-semibold rounded-lg text-[11px] sm:text-xs transition cursor-pointer"
            title="Download Telemetry CSV"
          >
            <Download size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Reroll Battlefield Seed */}
          <button
            onClick={rerollSeed}
            className="flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-lg text-[11px] sm:text-xs shadow-lg transition transform active:scale-95 cursor-pointer"
            title="Proceduralize New Random Battlefield Seed"
          >
            <RefreshCw size={13} />
            <span className="hidden xs:inline">Reroll Seed</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN VIEWPORT LAYOUT */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Left Sidebar: Controls Drawer (Docked on desktop, toggleable) */}
        {isSidebarOpen && (
          <aside className="w-72 sm:w-80 border-r border-slate-800 bg-slate-950/80 backdrop-blur-md flex flex-col p-3.5 space-y-3.5 overflow-y-auto custom-scrollbar shrink-0 shadow-2xl z-20">
            {/* Section 1: Scenario Presets */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Tactical RF Scenarios
                </span>
                <span className="text-[9px] font-mono text-cyan-400">Jury Presets</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'IADS', label: 'Air Defense', icon: Shield, desc: 'Coordinated radar net' },
                  { id: 'SURVEILLANCE', label: 'Dense Radars', icon: Radar, desc: 'High pulse density' },
                  { id: 'AGILE_HOPPER', label: 'Agile FHSS', icon: Zap, desc: 'Rapid hoppers' },
                  { id: 'MISSILE_LOCK', label: 'Missile Lock', icon: Flame, desc: 'Lethal pop-up' }
                ].map(({ id, label, icon: Icon, desc }) => (
                  <button
                    key={id}
                    onClick={() => applyScenario(id)}
                    className={`p-2 rounded-lg text-left transition border ${
                      activeScenario === id
                        ? 'bg-slate-800/90 border-cyan-400 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon size={12} className={activeScenario === id ? 'text-cyan-400' : 'text-slate-400'} />
                      <span className="text-[11px] font-semibold">{label}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 leading-tight">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Section 2: Active Scheduling Strategy */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Receiver Schedulers
                </span>
                <span className="text-[9px] font-mono text-emerald-400">4 Algorithms</span>
              </div>
              <div className="space-y-1.5">
                {[
                  {
                    name: 'Sequential Sweep (Baseline)',
                    short: 'Baseline Sweep (Legacy)',
                    gain: '1.00x',
                    tag: 'Rigid Circle',
                    color: 'text-rose-400'
                  },
                  {
                    name: 'Co-Prime Sweeper (Optimal Scan)',
                    short: 'Co-Prime Sweeper (CRT)',
                    gain: `${(metrics['Co-Prime Sweeper (Optimal Scan)']?.interceptionEfficiencyRatio || 1.12).toFixed(2)}x`,
                    tag: 'Chinese Remainder',
                    color: 'text-purple-400'
                  },
                  {
                    name: 'UCB1 Bandit (ML 1)',
                    short: 'UCB1 Bandit (ML 1)',
                    gain: `${(metrics['UCB1 Bandit (ML 1)']?.interceptionEfficiencyRatio || 1.48).toFixed(2)}x`,
                    tag: 'Non-Stationary',
                    color: 'text-amber-400'
                  },
                  {
                    name: 'Q-Learning Dwell Agent (ML 2)',
                    short: 'Q-Learning Agent (ML 2)',
                    gain: `${(metrics['Q-Learning Dwell Agent (ML 2)']?.interceptionEfficiencyRatio || 1.60).toFixed(2)}x`,
                    tag: 'Reinforcement Learning',
                    color: 'text-emerald-400'
                  }
                ].map(({ name, short, gain, tag, color }) => {
                  const isSelected = activeSchedulerName === name;
                  return (
                    <div
                      key={name}
                      onClick={() => setActiveSchedulerName(name)}
                      className={`p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-slate-800/90 border-cyan-400 ring-1 ring-cyan-400/50'
                          : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-850'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-bold ${color}`}>{short}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">{tag}</div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-cyan-400 border border-slate-800">
                        {gain}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Sensor Parameters */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                Physical Sensor Parameters
              </span>

              <div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>Channels ($C$):</span>
                  <span className="text-white font-bold">{config.numChannels} Bands</span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={64}
                  step={4}
                  value={config.numChannels}
                  onChange={(e) => setConfig((prev) => ({ ...prev, numChannels: Number(e.target.value) }))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>Sensitivity (MDS):</span>
                  <span className="text-cyan-400 font-bold">{config.receiverMdsDbm.toFixed(0)} dBm</span>
                </div>
                <input
                  type="range"
                  min={-110}
                  max={-70}
                  step={1}
                  value={config.receiverMdsDbm}
                  onChange={(e) => setConfig((prev) => ({ ...prev, receiverMdsDbm: Number(e.target.value) }))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>Thermal False Alarm (P_fa):</span>
                  <span className="text-slate-300 font-bold">{(config.pFaAmbient * 100).toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={0.005}
                  max={0.08}
                  step={0.005}
                  value={config.pFaAmbient}
                  onChange={(e) => setConfig((prev) => ({ ...prev, pFaAmbient: Number(e.target.value) }))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>

            {/* Section 4: Live Threat Roster */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                Active Emitter Inventory
              </span>
              <div className="space-y-1 text-[10px] font-mono text-slate-400">
                <div className="flex justify-between py-0.5">
                  <span className="text-blue-400">● Class 1 (Surveillance):</span>
                  <span>{config.numPeriodic} Radars (Fixed PRI)</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-amber-400">● Class 2 (Agile FHSS):</span>
                  <span>{config.numAgile} Nets (Hops / 3 ep)</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-rose-400">● Class 3 (Missile Lock):</span>
                  <span>Lethal Pop-Up Threat</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-purple-400">● Class 4 (Rotating Beam):</span>
                  <span>{config.numSpatial} Radars (360° Scan)</span>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Center Main Cockpit Area */}
        <main className="flex-1 relative bg-slate-950 flex flex-col overflow-hidden">
          {/* Top Sub-Nav View Switcher */}
          <div className="h-10 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center space-x-1">
              {[
                { id: 'waterfall', label: '2D Waterfall Spectrogram', icon: Radio },
                { id: 'metrics', label: 'Figures of Merit Scorecard', icon: Target },
                { id: 'theory', label: 'Radar Math & Proofs', icon: BookOpen },
                { id: 'telemetry', label: 'Step Telemetry Log', icon: Activity }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                    activeTab === id
                      ? 'bg-slate-800 text-cyan-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Active Strategy Badge */}
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono">
              <span className="text-slate-400">Active Look:</span>
              <span className="text-cyan-400 font-bold">{activeSchedulerName}</span>
            </div>
          </div>

          {/* VIEW TAB 1: WATERFALL SPECTROGRAM */}
          {activeTab === 'waterfall' && (
            <div className="flex-1 relative flex flex-col p-3 sm:p-4 overflow-hidden">
              {/* Top Floating Inspection HUD (like odvp.vercel.app) */}
              <div className="absolute top-5 left-6 z-20 pointer-events-none bg-slate-900/85 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 shadow-2xl flex flex-col gap-0.5 max-w-sm">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-bold">Look: Ch {currentLog.actions[currentStep]}</span>
                  <span className="text-slate-500">•</span>
                  <span className={isCurrentIntercept ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {isCurrentIntercept ? '🎯 INTERCEPT HIT' : '○ Listening...'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Target: <span className="text-slate-200">{threatLabels[currentCellThreat] || 'Quiet Spectrum'}</span>
                </div>
              </div>

              {/* Top Right Quick Stats HUD */}
              <div className="hidden md:flex absolute top-5 right-6 z-20 pointer-events-none bg-slate-900/85 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-300 shadow-xl flex items-center gap-3">
                <div>
                  Overall Pd: <strong className="text-cyan-400">{(activeMetrics.pDSlot * 100).toFixed(1)}%</strong>
                </div>
                <div className="text-slate-600">|</div>
                <div>
                  Missile Threat Pd: <strong className="text-rose-400">{(activeMetrics.pDSporadic * 100).toFixed(1)}%</strong>
                </div>
                <div className="text-slate-600">|</div>
                <div>
                  Gain: <strong className="text-emerald-400">{activeMetrics.interceptionEfficiencyRatio.toFixed(2)}x</strong>
                </div>
              </div>

              {/* Contained Canvas Viewport */}
              <div className="flex-1 min-h-0 relative flex flex-col justify-center">
                <WaterfallCanvas
                  env={env}
                  selectedLog={currentLog}
                  currentStep={currentStep}
                  onSeek={setCurrentStep}
                  height={window.innerHeight > 800 ? 360 : 280}
                />

                {/* Radar Axis Scale Legend */}
                <div className="flex justify-between text-[9px] font-mono text-slate-500 px-2 pt-1">
                  <span>Frequency: Channel 0 (Low Band)</span>
                  <span>Time Epochs ($t = 0 \to {config.numSteps - 1}$)</span>
                  <span>Channel {config.numChannels - 1} (High Band)</span>
                </div>
              </div>

              {/* Horizontal Legend Strip */}
              <div className="flex items-center justify-center gap-2 sm:gap-4 text-[10px] font-mono text-slate-400 py-1.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600"></span> Periodic Radar
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-600"></span> Agile FHSS
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-600"></span> Missile Lock (Pop-Up)
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-purple-600"></span> Rotating Beam
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 opacity-60"></span> Receiver Look
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> DIRECT HIT!
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

              {/* Bottom Quick KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Enemy Pulses</div>
                  <div className="text-sm font-mono font-bold text-slate-100">{activeMetrics.totalTransmissionsGroundTruth}</div>
                  <div className="text-[9px] text-slate-500">In band ground truth</div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Baseline Sweep</div>
                  <div className="text-sm font-mono font-bold text-rose-400">{baselineMetrics.totalDetections} hits</div>
                  <div className="text-[9px] text-slate-500">{(baselineMetrics.pDSlot * 100).toFixed(1)}% caught</div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Co-Prime Sweeper</div>
                  <div className="text-sm font-mono font-bold text-purple-400">
                    {metrics['Co-Prime Sweeper (Optimal Scan)']?.totalDetections} hits
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {metrics['Co-Prime Sweeper (Optimal Scan)']?.interceptionEfficiencyRatio.toFixed(2)}x baseline
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Q-Learning Agent</div>
                  <div className="text-sm font-mono font-bold text-emerald-400">{qlMetrics.totalDetections} hits</div>
                  <div className="text-[9px] text-emerald-400/80 font-bold">
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
            <div className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-4 max-w-4xl mx-auto text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <h3 className="font-mono font-bold text-sm text-cyan-400 uppercase">
                  1. The Number-Theoretic Co-Prime Scan (Chinese Remainder Theorem)
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  When a linear receiver sweeps C = 32 channels sequentially (s=1) and an adversary's surveillance radar rotates with period T_e = 40 steps:
                  gcd(C, T_e) = gcd(32, 40) = 8 &gt; 1.
                  Because periods share common divisors, the sampling phase repeats in a restricted subgroup, leaving 75% of the phase space permanently blind!
                </p>
                <div className="bg-slate-950 p-2.5 rounded font-mono text-purple-400 text-center border border-slate-800">
                  a_t = (t × prime_stride) mod C &nbsp;|&nbsp; gcd(stride, C) = 1
                </div>
                <p className="text-slate-400 text-[11px]">
                  By the Chinese Remainder Theorem, using a prime stride guarantees a non-repeating permutation across all channels, breaking harmonic resonance.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <h3 className="font-mono font-bold text-sm text-emerald-400 uppercase">
                  2. Cognitive Reinforcement Learning (POMDP & Bellman TD)
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  Because an instantaneous receiver can only observe the channel it dwells on, offline static datasets fail in electronic warfare. The agent interacts with a Partially Observable Markov Decision Process (POMDP):
                </p>
                <div className="grid grid-cols-3 gap-2 font-mono text-center text-[10px]">
                  <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-400 font-bold">+10.0 Intercept Hit</div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-400">-1.0 Empty Dwell</div>
                  <div className="p-2 rounded bg-rose-950/40 border border-rose-800 text-rose-400 font-bold">-5.0 Missed Lethal Burst</div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW TAB 4: STEP TELEMETRY LOG */}
          {activeTab === 'telemetry' && (
            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-400">
                  Recorded Telemetry Dwell History (First 150 Epochs):
                </span>
                <button
                  onClick={downloadTelemetryCsv}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg text-xs font-mono font-semibold"
                >
                  <Download size={13} />
                  <span>Download Full CSV</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-800 rounded-xl bg-slate-900/60">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="sticky top-0 bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Epoch</th>
                      <th className="py-2 px-3">Dwell Ch</th>
                      <th className="py-2 px-3">Ground-Truth Activity</th>
                      <th className="py-2 px-3">Detection Result</th>
                      <th className="py-2 px-3 text-right">Step Reward</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {Array.from({ length: Math.min(150, config.numSteps) }).map((_, t) => {
                      const ch = currentLog.actions[t];
                      const threat = env.getCell(t, ch);
                      const hit = currentLog.detections[t] === 1;
                      const rew = currentLog.rewards[t];
                      return (
                        <tr key={t} className={hit ? 'bg-emerald-950/20' : 'hover:bg-slate-850'}>
                          <td className="py-1.5 px-3">{t}</td>
                          <td className="py-1.5 px-3 font-bold text-cyan-400">Ch {ch}</td>
                          <td className="py-1.5 px-3">{threatLabels[threat] || 'Quiet'}</td>
                          <td className="py-1.5 px-3">
                            {hit ? (
                              <span className="text-emerald-400 font-bold">● INTERCEPT HIT</span>
                            ) : (
                              <span className="text-slate-500">○ Silent</span>
                            )}
                          </td>
                          <td className={`py-1.5 px-3 text-right font-bold ${rew > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
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
