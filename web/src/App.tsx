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
  CheckCircle2
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

export const App: React.FC = () => {
  // Navigation Tabs: 'spectrogram' | 'metrics' | 'threats'
  const [activeTab, setActiveTab] = useState<'spectrogram' | 'metrics' | 'threats'>('spectrogram');

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

  // UI Modals / Drawers
  const [isTheoryOpen, setIsTheoryOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // 1. Run Procedural Simulation (Memoized for Sub-15ms Compute)
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
    const rows = ['step,channel,threat_class,receiver_look,is_intercept,reward'];
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
    a.download = `ew_telemetry_T${config.numSteps}_C${config.numChannels}_seed${config.seed}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container">
      {/* Top Cockpit Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-section">
            <div className="brand-icon">
              <Radio size={19} />
            </div>
            <div>
              <div className="brand-title">
                <span>AERO-SCAN</span>
                <span style={{ color: '#71717a' }}>//</span>
                <span style={{ color: '#60a5fa' }}>EW COGNITIVE RECEIVER C2</span>
                <span className="badge badge-emerald" style={{ marginLeft: '4px' }}>
                  LEVEL 2 FINALE
                </span>
              </div>
              <div className="brand-subtitle">
                Smart India Hackathon • DRDO Electronic Support Measures Adaptive Scan
              </div>
            </div>
          </div>

          <div className="header-actions">
            <button
              onClick={() => setIsTheoryOpen(true)}
              className="btn btn-secondary btn-xs"
              title="View Wiley-Richards Radar Interception Theory"
            >
              <BookOpen size={13} style={{ color: '#60a5fa' }} />
              <span>Radar Math</span>
            </button>

            <button
              onClick={rerollSeed}
              className="btn btn-secondary btn-xs"
              title="Generate New Random Battlefield Seed"
            >
              <RefreshCw size={13} style={{ color: '#a1a1aa' }} />
              <span>Reroll Seed</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="btn btn-secondary btn-xs"
              title="Configure Physical Sensor Parameters"
            >
              <Sliders size={13} style={{ color: '#a1a1aa' }} />
              <span>Parameters</span>
            </button>

            <button
              onClick={downloadTelemetryCsv}
              className="btn btn-primary btn-xs"
              title="Export Step-by-Step Telemetry to CSV"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Mission Body */}
      <main className="main-content">
        {/* Executive Punchline Banner */}
        <div className="status-banner">
          <div className="status-summary">
            <div className="status-chips">
              <span className="badge badge-blue">MISSION BRIEFING</span>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>
                Contested Spectrum: {config.numChannels} Ch × {config.numSteps} Epochs • CPU Time:{' '}
                <strong style={{ color: '#34d399' }}>{computeTimeMs.toFixed(1)}ms</strong>
              </span>
            </div>
            <p className="status-headline">
              Contested space had <strong>{baselineMetrics?.totalTransmissionsGroundTruth}</strong> enemy radar pulses.
              Baseline sweep caught only <strong style={{ color: '#fb7185' }}>{baselineMetrics?.totalDetections}</strong> pulses.
              Our Cognitive Q-Learning Agent learned threat patterns on the fly, intercepting{' '}
              <strong style={{ color: '#34d399' }}>{qlMetrics?.totalDetections}</strong> pulses (
              <strong style={{ color: '#60a5fa' }}>{qlMetrics?.interceptionEfficiencyRatio.toFixed(2)}x more threats</strong>)
              with zero prior intelligence.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: '#71717a', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tactical Scenarios:
            </span>
            <div className="scenario-pills">
              {[
                { id: 'IADS', label: 'IADS Network' },
                { id: 'SURVEILLANCE', label: 'Dense Radars' },
                { id: 'AGILE_HOPPER', label: 'FHSS Hopper' },
                { id: 'MISSILE_LOCK', label: 'Missile Lock' }
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => applyScenario(s.id)}
                  className={`scenario-btn ${activeScenario === s.id ? 'active' : ''}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Clean Segmented Tab Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div className="tab-nav">
            <button
              onClick={() => setActiveTab('spectrogram')}
              className={`tab-btn ${activeTab === 'spectrogram' ? 'active' : ''}`}
            >
              <Layers size={14} />
              <span>1. Tactical Spectrogram</span>
            </button>

            <button
              onClick={() => setActiveTab('metrics')}
              className={`tab-btn ${activeTab === 'metrics' ? 'active' : ''}`}
            >
              <BarChart3 size={14} />
              <span>2. SIH Figures of Merit</span>
            </button>

            <button
              onClick={() => setActiveTab('threats')}
              className={`tab-btn ${activeTab === 'threats' ? 'active' : ''}`}
            >
              <Shield size={14} />
              <span>3. Threat Environment</span>
            </button>
          </div>

          {/* Active Scheduler Selector Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: 'var(--font-mono)', marginRight: '4px' }}>
              Active Scan Policy:
            </span>
            {[
              { id: 'Sequential Sweep (Baseline)', short: 'Sweep' },
              { id: 'Co-Prime Sweeper (Optimal Scan)', short: 'Co-Prime' },
              { id: 'UCB1 Bandit (ML 1)', short: 'UCB1 Bandit' },
              { id: 'Q-Learning Dwell Agent (ML 2)', short: 'Q-Learning RL' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveSchedulerName(p.id)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  border: activeSchedulerName === p.id ? '1px solid #3b82f6' : '1px solid #27272a',
                  background: activeSchedulerName === p.id ? 'rgba(59, 130, 246, 0.15)' : '#111114',
                  color: activeSchedulerName === p.id ? '#60a5fa' : '#a1a1aa',
                  fontWeight: activeSchedulerName === p.id ? 700 : 500
                }}
              >
                {p.short}
              </button>
            ))}
          </div>
        </div>

        {/* TAB 1: Tactical Spectrogram & Playback Deck */}
        {activeTab === 'spectrogram' && (
          <div className="spectrogram-deck">
            <div className="deck-header">
              <div className="deck-title">
                <span>🛰️ 2D RF SPECTROGRAM WATERFALL</span>
                <span style={{ color: '#71717a', fontWeight: 400 }}>|</span>
                <span style={{ color: '#60a5fa', fontWeight: 600 }}>{activeSchedulerName}</span>
              </div>

              {/* Visual Legend */}
              <div className="deck-legend">
                <span className="legend-item">
                  <span className="legend-dot periodic" /> Periodic Radar
                </span>
                <span className="legend-item">
                  <span className="legend-dot agile" /> Agile FHSS
                </span>
                <span className="legend-item">
                  <span className="legend-dot spatial" /> Spatial Scan
                </span>
                <span className="legend-item">
                  <span className="legend-dot sporadic" /> Missile Lock
                </span>
                <span className="legend-item" style={{ color: '#34d399', fontWeight: 600 }}>
                  <span className="legend-dot hit" /> Intercept Hit
                </span>
              </div>
            </div>

            {/* Canvas Area */}
            <WaterfallCanvas
              env={env}
              selectedLog={currentLog}
              currentStep={currentStep}
              onSeek={(s) => setCurrentStep(s)}
              height={380}
            />

            {/* Consolidated Playback Bar */}
            <PlaybackControls
              currentStep={currentStep}
              maxSteps={config.numSteps}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              onPlayPause={() => setIsPlaying(!isPlaying)}
              onStep={handleStep}
              onReset={() => {
                setCurrentStep(0);
                setIsPlaying(false);
              }}
              onSeek={(s) => setCurrentStep(s)}
              onSpeedChange={(spd) => setPlaybackSpeed(spd)}
              currentAction={currentLog.actions[currentStep] || 0}
              detectionsCount={
                currentLog.detections.slice(0, currentStep + 1).reduce((a, b) => a + b, 0)
              }
            />
          </div>
        )}

        {/* TAB 2: Figures of Merit Scorecard */}
        {activeTab === 'metrics' && (
          <MetricsDashboard
            metrics={metrics}
            activeScheduler={activeSchedulerName}
            onSelectScheduler={(name) => setActiveSchedulerName(name)}
          />
        )}

        {/* TAB 3: Threat Environment Ground Truth */}
        {activeTab === 'threats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="table-card">
              <div className="table-header">
                <div className="table-title">
                  <Shield size={16} style={{ color: '#fbbf24' }} />
                  <span>GROUND TRUTH EMITTER CLASSIFICATION & SPECTRAL DYNAMICS</span>
                </div>
                <span className="badge badge-zinc">Zero Prior Intelligence Required</span>
              </div>

              <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div style={{ background: '#09090b', border: '1px solid #1d4ed8', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#60a5fa' }}>
                      CLASS 1: SURVEILLANCE RADAR
                    </span>
                    <span className="badge badge-blue">Periodic</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#a1a1aa', lineHeight: 1.5, marginBottom: '10px' }}>
                    Fixed PRF pulse train on designated channels. Emitters maintain stable repetition intervals.
                  </p>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#71717a' }}>
                    Active instances: <strong>{config.numPeriodic}</strong> • Period: 20-50 epochs
                  </div>
                </div>

                <div style={{ background: '#09090b', border: '1px solid #d97706', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fbbf24' }}>
                      CLASS 2: FREQUENCY HOPPER (FHSS)
                    </span>
                    <span className="badge badge-amber">Agile</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#a1a1aa', lineHeight: 1.5, marginBottom: '10px' }}>
                    Frequency hopping across channels with 2-epoch dwell time. Evades fixed open-loop sweeps.
                  </p>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#71717a' }}>
                    Active instances: <strong>{config.numAgile}</strong> • Dwell: {config.agileDwellSteps} epochs
                  </div>
                </div>

                <div style={{ background: '#09090b', border: '1px solid #9333ea', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#c084fc' }}>
                      CLASS 4: SPATIAL ROTATING RADAR
                    </span>
                    <span className="badge badge-purple">Spatial Scan</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#a1a1aa', lineHeight: 1.5, marginBottom: '10px' }}>
                    Mechanically or electronically scanned 360° rotating mainlobe beam. Causes harmonic blind spots for standard sweeps.
                  </p>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#71717a' }}>
                    Active instances: <strong>{config.numSpatial}</strong> • Rotation Period: 40 epochs
                  </div>
                </div>

                <div style={{ background: '#09090b', border: '1px solid #e11d48', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fb7185' }}>
                      CLASS 3: MISSILE GUIDANCE LOCK
                    </span>
                    <span className="badge badge-rose">High Threat</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#a1a1aa', lineHeight: 1.5, marginBottom: '10px' }}>
                    Sporadic high-rate pulse bursts. High lethality with short window of opportunity.
                  </p>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#71717a' }}>
                    Burst Probability: <strong>{(config.sporadicBurstProb * 100).toFixed(1)}%</strong> • Priority: High
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Settings / Parameters Drawer */}
      {isSettingsOpen && (
        <div className="drawer-container">
          <div className="drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={16} style={{ color: '#60a5fa' }} />
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#f4f4f5' }}>
                Physical Sensor Parameters
              </h3>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="btn btn-secondary btn-xs"
            >
              <X size={14} />
            </button>
          </div>

          <div className="drawer-body">
            <div className="form-group">
              <label className="form-label">
                <span>Frequency Channels (C)</span>
                <span style={{ color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{config.numChannels}</span>
              </label>
              <input
                type="range"
                min={16}
                max={64}
                step={4}
                value={config.numChannels}
                onChange={(e) => setConfig({ ...config, numChannels: Number(e.target.value) })}
                className="scrub-slider"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Time Epochs (T)</span>
                <span style={{ color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{config.numSteps}</span>
              </label>
              <input
                type="range"
                min={200}
                max={2000}
                step={100}
                value={config.numSteps}
                onChange={(e) => setConfig({ ...config, numSteps: Number(e.target.value) })}
                className="scrub-slider"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Receiver Sensitivity (MDS)</span>
                <span style={{ color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{config.receiverMdsDbm} dBm</span>
              </label>
              <input
                type="range"
                min={-110}
                max={-70}
                step={1}
                value={config.receiverMdsDbm}
                onChange={(e) => setConfig({ ...config, receiverMdsDbm: Number(e.target.value) })}
                className="scrub-slider"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Ambient False Alarm (Pfa)</span>
                <span style={{ color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>
                  {(config.pFaAmbient * 100).toFixed(1)}%
                </span>
              </label>
              <input
                type="range"
                min={0.001}
                max={0.08}
                step={0.005}
                value={config.pFaAmbient}
                onChange={(e) => setConfig({ ...config, pFaAmbient: Number(e.target.value) })}
                className="scrub-slider"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Battlefield RNG Seed</span>
                <span style={{ color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{config.seed}</span>
              </label>
              <input
                type="number"
                value={config.seed}
                onChange={(e) => setConfig({ ...config, seed: Number(e.target.value) })}
                className="form-input"
              />
            </div>
          </div>

          <div className="drawer-footer">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Apply Battlefield Parameters
            </button>
          </div>
        </div>
      )}

      {/* Theory Modal */}
      <TheoryModal
        isOpen={isTheoryOpen}
        onClose={() => setIsTheoryOpen(false)}
        config={config}
      />

      {/* Footer */}
      <footer className="app-footer">
        AERO-SCAN // SMART INDIA HACKATHON 2024 • DRDO ELECTRONIC SUPPORT MEASURES • DEPLOYABLE ON VERCEL
      </footer>
    </div>
  );
};
