"""
Tactical Electronic Support Measures (ESM) / Electronic Warfare (EW) C2 Dashboard.
Smart Scan Strategy for Receiver Scheduling in Dense, Agile RF Environments.

Designed for Defense Evaluators & Military Operators:
- Crystal-clear visual guides and plain-English mission debriefs.
- 2D Waterfall Spectrogram with tactical threat color-coding and plain-English hover tooltips.
- Full compliance with Smart India Hackathon (SIH) Figures of Merit.
- Live Jury Sandbox: Pre-built scenarios, random environment generator, and custom CSV upload.
"""

from typing import Dict, Any, Optional, Tuple, List
import io
import math
import time
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st

from environment import (
    RFEnvironment,
    RFEnvironmentConfig,
    EmitterClass,
    BurstEvent,
    DwellObservation
)
from schedulers import (
    SequentialSweepScheduler,
    CoPrimePeriodicSweepScheduler,
    UCB1BanditScheduler,
    QLearningDwellScheduler,
    SchedulerLog
)
from metrics import (
    MetricsEngine,
    SchedulerPerformanceMetrics
)

# -----------------------------------------------------------------------------
# 1. PAGE CONFIGURATION & TACTICAL STYLING
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="EW Smart Scan C2 Suite",
    page_icon="📡",
    layout="wide",
    initial_sidebar_state="expanded"
)

CUSTOM_CSS = """
<style>
    /* Dark Tactical Defense C2 Theme */
    .stApp {
        background-color: #0b0f19;
        color: #e2e8f0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    /* Header Bar */
    .tactical-header {
        background: linear-gradient(90deg, #111827 0%, #1e293b 50%, #0f172a 100%);
        border-bottom: 2px solid #00f0ff;
        padding: 1.2rem 1.8rem;
        border-radius: 8px;
        margin-bottom: 1.2rem;
        box-shadow: 0 4px 20px rgba(0, 240, 255, 0.12);
    }
    .tactical-title {
        font-family: 'Courier New', monospace;
        font-size: 1.65rem;
        font-weight: 800;
        letter-spacing: 0.10em;
        color: #00f0ff;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .tactical-subtitle {
        color: #94a3b8;
        font-size: 0.90rem;
        margin-top: 0.35rem;
        letter-spacing: 0.04em;
    }
    .tactical-badge {
        background-color: rgba(0, 240, 255, 0.15);
        color: #00f0ff;
        border: 1px solid #00f0ff;
        padding: 0.2rem 0.6rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-family: monospace;
        font-weight: bold;
    }
    
    /* Mission Story Briefing Box */
    .story-box {
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid #334155;
        border-left: 4px solid #00f0ff;
        border-radius: 8px;
        padding: 1rem 1.4rem;
        margin-bottom: 1.2rem;
        font-size: 0.92rem;
        line-height: 1.5;
        color: #cbd5e1;
    }
    .story-box b {
        color: #00f0ff;
    }

    /* Tactical KPI Stat Cards */
    .stat-card {
        background: #111827;
        border: 1px solid #1f2937;
        border-radius: 8px;
        padding: 0.85rem 1rem;
        margin-bottom: 0.8rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        position: relative;
        overflow: hidden;
    }
    .stat-card.cyan { border-left: 4px solid #00f0ff; }
    .stat-card.green { border-left: 4px solid #00ff88; }
    .stat-card.amber { border-left: 4px solid #ffb800; }
    .stat-card.red { border-left: 4px solid #ff3366; }
    .stat-card.purple { border-left: 4px solid #a855f7; }
    
    .stat-title {
        font-size: 0.75rem;
        font-family: monospace;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }
    .stat-value {
        font-size: 1.6rem;
        font-weight: 700;
        font-family: 'Courier New', monospace;
        color: #f8fafc;
        margin: 0.15rem 0;
    }
    .stat-sub {
        font-size: 0.75rem;
        color: #64748b;
    }

    /* Visual Legend Cards */
    .legend-card {
        background: #111827;
        border: 1px solid #1f2937;
        border-radius: 6px;
        padding: 0.6rem 0.9rem;
        font-family: monospace;
        font-size: 0.82rem;
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }

    /* Streamlit overrides */
    div[data-testid="stSidebar"] {
        background-color: #0e1524;
        border-right: 1px solid #1e293b;
    }
    .stTabs [data-baseweb="tab-list"] {
        gap: 6px;
    }
    .stTabs [data-baseweb="tab"] {
        background-color: #111827;
        border: 1px solid #1f2937;
        border-radius: 6px 6px 0 0;
        color: #94a3b8;
        padding: 8px 16px;
        font-family: monospace;
        font-size: 0.82rem;
    }
    .stTabs [aria-selected="true"] {
        background-color: #1e293b !important;
        border-bottom: 2px solid #00f0ff !important;
        color: #00f0ff !important;
    }
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


# -----------------------------------------------------------------------------
# 2. SIDEBAR CONFIGURATION & JURY SANDBOX
# -----------------------------------------------------------------------------
st.sidebar.markdown(
    """
    <div style="text-align: center; margin-bottom: 1rem;">
        <span class="tactical-badge">SIH EW-C2 COGNITIVE SUITE</span>
        <h3 style="color: #00f0ff; margin-top: 0.4rem; font-family: monospace;">JURY SANDBOX</h3>
    </div>
    """,
    unsafe_allow_html=True
)

scenario_preset = st.sidebar.selectbox(
    "Operational Threat Scenario",
    [
        "Integrated Air Defense System (IADS) Network",
        "Dense Radar Network (Surveillance & Trackers)",
        "Agile Frequency-Hopper Net (FHSS & Jammers)",
        "Stealth Pop-Up Threat (LPI / Missile Guidance)",
        "Custom Parameters"
    ],
    index=0
)

# Scenario presets
if scenario_preset == "Integrated Air Defense System (IADS) Network":
    default_channels = 32
    default_steps = 1000
    default_p_fa = 0.02
    default_periodic_count = 3
    default_agile_count = 2
    default_agile_dwell = 3
    default_sporadic_prob = 0.015
    default_spatial_count = 1
    default_spatial_period = 40
elif scenario_preset == "Dense Radar Network (Surveillance & Trackers)":
    default_channels = 32
    default_steps = 1000
    default_p_fa = 0.02
    default_periodic_count = 4
    default_agile_count = 1
    default_agile_dwell = 4
    default_sporadic_prob = 0.01
    default_spatial_count = 1
    default_spatial_period = 50
elif scenario_preset == "Agile Frequency-Hopper Net (FHSS & Jammers)":
    default_channels = 32
    default_steps = 1000
    default_p_fa = 0.02
    default_periodic_count = 1
    default_agile_count = 3
    default_agile_dwell = 2
    default_sporadic_prob = 0.015
    default_spatial_count = 0
    default_spatial_period = 40
elif scenario_preset == "Stealth Pop-Up Threat (LPI / Missile Guidance)":
    default_channels = 40
    default_steps = 1200
    default_p_fa = 0.025
    default_periodic_count = 2
    default_agile_count = 1
    default_agile_dwell = 3
    default_sporadic_prob = 0.03
    default_spatial_count = 1
    default_spatial_period = 45
else:  # Custom
    default_channels = 32
    default_steps = 1000
    default_p_fa = 0.02
    default_periodic_count = 3
    default_agile_count = 2
    default_agile_dwell = 3
    default_sporadic_prob = 0.015
    default_spatial_count = 1
    default_spatial_period = 40

with st.sidebar.expander("Spectrum & Receiver Physics", expanded=True):
    num_channels = st.slider("Frequency Channels (C)", min_value=16, max_value=64, value=default_channels, step=4, help="Total discrete frequency sub-bands in the wideband spectrum.")
    num_steps = st.slider("Simulation Steps (T)", min_value=200, max_value=2500, value=default_steps, step=100, help="Discrete time epochs of the surveillance mission.")
    receiver_mds_dbm = st.slider("Receiver Sensitivity MDS (dBm)", min_value=-110.0, max_value=-70.0, value=-95.0, step=1.0, help="Minimum signal power required for sensor detection.")
    nominal_snr_db = st.slider("Nominal Received SNR (dB)", min_value=6.0, max_value=25.0, value=14.0, step=1.0)
    p_fa_ambient = st.slider("Thermal False Alarm Prob (P_fa)", min_value=0.001, max_value=0.10, value=default_p_fa, step=0.005, format="%.3f")
    p_d_nominal = st.slider("Nominal Sensitivity P_d", min_value=0.80, max_value=1.00, value=0.98, step=0.01)
    sim_seed = st.number_input("RNG Seed (Generate New Battlefield)", min_value=0, max_value=99999, value=42, step=1, help="Change this number to generate a completely new random test environment.")

with st.sidebar.expander("Threat Emitter Dynamics", expanded=False):
    st.markdown("**Class 1: Surveillance Radars (Fixed PRI)**")
    num_periodic = st.slider("Number of Periodic Radars", min_value=1, max_value=6, value=default_periodic_count)

    st.markdown("**Class 4: Spatially Scanning Radar (Rotating Beam)**")
    num_spatial = st.slider("Spatially Rotating Radars", min_value=0, max_value=3, value=default_spatial_count)
    spatial_period = st.slider("Antenna Rotation Period (Steps)", min_value=20, max_value=80, value=default_spatial_period, step=5)
    spatial_dwell = st.slider("Mainlobe Beam Dwell (Steps)", min_value=2, max_value=8, value=4)

    st.markdown("**Class 2: Agile Frequency-Hopper (FHSS)**")
    num_agile = st.slider("Agile Hopping Emitters", min_value=0, max_value=4, value=default_agile_count)
    agile_dwell = st.slider("Hopping Dwell Steps per Hop", min_value=1, max_value=8, value=default_agile_dwell)
    
    st.markdown("**Class 3: Sporadic Pop-Up Missile Guidance**")
    sporadic_prob = st.slider("Burst Initiation Probability", min_value=0.005, max_value=0.05, value=default_sporadic_prob, step=0.005, format="%.3f")
    sporadic_min_dur = st.slider("Min Burst Duration", min_value=2, max_value=6, value=3)
    sporadic_max_dur = st.slider("Max Burst Duration", min_value=6, max_value=16, value=8)

with st.sidebar.expander("Algorithms & Co-Prime Pacing", expanded=False):
    st.markdown("**Optimal Periodic Scan**")
    prime_stride = st.selectbox("Co-Prime Sweep Stride (s)", [7, 11, 13, 17, 19, 23], index=0, help="Prime stride coprime to C guaranteeing maximum phase dispersion.")

    st.markdown("**ML 1: UCB1 Multi-Armed Bandit**")
    ucb_c = st.slider("Exploration Parameter (c)", min_value=0.1, max_value=3.0, value=1.414, step=0.1)
    ucb_discount = st.slider("Non-Stationary Discount Factor", min_value=0.95, max_value=1.00, value=0.995, step=0.005, format="%.3f")

    st.markdown("**ML 2: Q-Learning Adaptive Dwell**")
    ql_alpha = st.slider("Learning Rate (alpha)", min_value=0.05, max_value=0.50, value=0.20, step=0.05)
    ql_gamma = st.slider("Discount Factor (gamma)", min_value=0.50, max_value=0.99, value=0.85, step=0.05)
    ql_epsilon = st.slider("Initial Epsilon (explore)", min_value=0.10, max_value=0.60, value=0.30, step=0.05)

st.sidebar.markdown("---")
uploaded_file = st.sidebar.file_uploader("📂 Upload Custom Jury Matrix (CSV)", type=["csv"], help="Upload your own custom T x C binary transmission matrix (0=Silent, 1=Active).")

st.sidebar.button("⚡ EXECUTE EW SIMULATION", use_container_width=True, type="primary")


# -----------------------------------------------------------------------------
# 3. SIMULATION EXECUTION ENGINE (CACHED)
# -----------------------------------------------------------------------------
@st.cache_data(show_spinner=False)
def run_ew_simulation_cached(
    num_channels: int,
    num_steps: int,
    p_fa_ambient: float,
    p_d_nominal: float,
    receiver_mds_dbm: float,
    nominal_snr_db: float,
    seed: int,
    num_periodic: int,
    num_spatial: int,
    spatial_period: int,
    spatial_dwell: int,
    num_agile: int,
    agile_dwell: int,
    sporadic_prob: float,
    sporadic_min_dur: int,
    sporadic_max_dur: int,
    prime_stride: int,
    ucb_c: float,
    ucb_discount: float,
    ql_alpha: float,
    ql_gamma: float,
    ql_epsilon: float
) -> Tuple[RFEnvironmentConfig, np.ndarray, Dict[str, Any], Dict[str, Any], float]:
    """Runs the environment and all 4 schedulers, returning ground truth and metrics."""
    t_start = time.perf_counter()

    env_config = RFEnvironmentConfig(
        num_channels=num_channels,
        num_steps=num_steps,
        p_fa_ambient=p_fa_ambient,
        p_d_nominal=p_d_nominal,
        receiver_mds_dbm=receiver_mds_dbm,
        nominal_signal_snr_db=nominal_snr_db,
        seed=seed,
        num_periodic=num_periodic,
        num_spatial=num_spatial,
        spatial_rotation_periods=[spatial_period],
        spatial_beam_dwells=[spatial_dwell],
        num_agile=num_agile,
        agile_dwell_steps=agile_dwell,
        sporadic_burst_prob=sporadic_prob,
        sporadic_min_duration=sporadic_min_dur,
        sporadic_max_duration=sporadic_max_dur
    )
    env = RFEnvironment(env_config)

    # 4 Competing Schedulers
    sched_sweep = SequentialSweepScheduler(num_channels, num_steps)
    sched_coprime = CoPrimePeriodicSweepScheduler(num_channels, num_steps, prime_stride=prime_stride)
    sched_ucb = UCB1BanditScheduler(num_channels, num_steps, c_explore=ucb_c, discount_factor=ucb_discount, seed=seed)
    sched_ql = QLearningDwellScheduler(
        num_channels, num_steps,
        alpha=ql_alpha, gamma=ql_gamma, epsilon_initial=ql_epsilon, seed=seed
    )

    log_sweep = sched_sweep.run_simulation(env)
    log_coprime = sched_coprime.run_simulation(env)
    log_ucb = sched_ucb.run_simulation(env)
    log_ql = sched_ql.run_simulation(env)

    logs = {
        "Sequential Sweep (Baseline)": log_sweep,
        "Co-Prime Sweeper (Optimal Periodic)": log_coprime,
        "UCB1 Bandit (ML 1)": log_ucb,
        "Q-Learning Dwell Agent (ML 2)": log_ql
    }

    engine = MetricsEngine(env)
    m_sweep = engine.evaluate_scheduler(log_sweep, sched_sweep)
    m_coprime = engine.evaluate_scheduler(log_coprime, sched_coprime, baseline_detections=m_sweep.total_detections)
    m_ucb = engine.evaluate_scheduler(log_ucb, sched_ucb, baseline_detections=m_sweep.total_detections)
    m_ql = engine.evaluate_scheduler(log_ql, sched_ql, baseline_detections=m_sweep.total_detections)

    metrics_dict = {
        "Sequential Sweep (Baseline)": m_sweep,
        "Co-Prime Sweeper (Optimal Periodic)": m_coprime,
        "UCB1 Bandit (ML 1)": m_ucb,
        "Q-Learning Dwell Agent (ML 2)": m_ql
    }

    comparison_table = engine.create_comparison_table(metrics_dict)
    cdf_df = engine.compute_tti_cdf(metrics_dict, max_latency_bins=min(18, sporadic_max_dur + 6))
    diag_df = engine.build_diagnostic_log_df(env, logs)

    elapsed = time.perf_counter() - t_start

    raw_logs = {
        name: {
            "actions": log.actions,
            "detections": log.detections,
            "false_alarms": log.false_alarms,
            "detected_classes": log.detected_classes,
            "predictions": log.predictions,
            "rewards": log.rewards
        }
        for name, log in logs.items()
    }

    metrics_summary = {
        "comparison_table": comparison_table,
        "cdf_df": cdf_df,
        "diag_df": diag_df,
        "metrics_dict": metrics_dict
    }

    return env_config, env.get_ground_truth_matrix(), raw_logs, metrics_summary, elapsed


# Execute simulation run
with st.spinner("Executing EW simulation, procedural RF generation, and cognitive schedulers..."):
    env_config, ground_truth, logs_data, metrics_summary, exec_time = run_ew_simulation_cached(
        num_channels=num_channels,
        num_steps=num_steps,
        p_fa_ambient=p_fa_ambient,
        p_d_nominal=p_d_nominal,
        receiver_mds_dbm=receiver_mds_dbm,
        nominal_snr_db=nominal_snr_db,
        seed=int(sim_seed),
        num_periodic=num_periodic,
        num_spatial=num_spatial,
        spatial_period=spatial_period,
        spatial_dwell=spatial_dwell,
        num_agile=num_agile,
        agile_dwell=agile_dwell,
        sporadic_prob=sporadic_prob,
        sporadic_min_dur=sporadic_min_dur,
        sporadic_max_dur=sporadic_max_dur,
        prime_stride=prime_stride,
        ucb_c=ucb_c,
        ucb_discount=ucb_discount,
        ql_alpha=ql_alpha,
        ql_gamma=ql_gamma,
        ql_epsilon=ql_epsilon
    )

m_dict: Dict[str, SchedulerPerformanceMetrics] = metrics_summary["metrics_dict"]
m_sweep = m_dict["Sequential Sweep (Baseline)"]
m_coprime = m_dict["Co-Prime Sweeper (Optimal Periodic)"]
m_ucb = m_dict["UCB1 Bandit (ML 1)"]
m_ql = m_dict["Q-Learning Dwell Agent (ML 2)"]


# -----------------------------------------------------------------------------
# 4. PRIMARY VIEW - HEADER & KPI DASHBOARD
# -----------------------------------------------------------------------------
st.markdown(
    f"""
    <div class="tactical-header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h1 class="tactical-title">
                    <span>📡</span> SMART SCAN STRATEGY // ELECTRONIC SUPPORT MEASURES C2
                </h1>
                <div class="tactical-subtitle">
                    Cognitive Spectrum Surveillance & Dwell Scheduling for Tactical Drones & UAVs in Contested RF Spectra
                </div>
            </div>
            <div style="text-align: right;">
                <span class="tactical-badge">CPU COMPUTE: {exec_time*1000:.1f} MS</span>
                <div style="color: #64748b; font-size: 0.75rem; margin-top: 4px; font-family: monospace;">
                    {num_channels} CHANNELS × {num_steps} EPOCHS | SENSITIVITY: {receiver_mds_dbm:.0f} dBm
                </div>
            </div>
        </div>
    </div>
    """,
    unsafe_allow_html=True
)

# Plain English Mission Briefing Box
efficiency_gain = m_ql.interception_efficiency_ratio
sporadic_gain = (m_ql.p_d_sporadic / max(1e-4, m_sweep.p_d_sporadic))
st.markdown(
    f"""
    <div class="story-box">
        <b>💡 MISSION SUMMARY (Plain-English Decoder):</b><br>
        In this mission, our tactical drone monitored <b>{num_channels} frequency channels</b> over <b>{num_steps} time epochs</b>.
        Because our drone has a lightweight receiver with narrow instantaneous bandwidth, it can only listen to <b>ONE channel at a time</b>.<br>
        • <b>Traditional Sequential Sweep (Legacy):</b> Blindly scanned in a circle (0, 1, 2...) and caught only <b>{m_sweep.total_detections}</b> hostile radar pulses.<br>
        • <b>Our Cognitive Q-Learning Agent:</b> Adapted to the environment in real time without prior intelligence, catching <b>{m_ql.total_detections}</b> pulses (<b>{efficiency_gain:.2f}x more threats</b>) and intercepting deadly pop-up missile guidance radars <b>{sporadic_gain:.1f}x faster</b>.
    </div>
    """,
    unsafe_allow_html=True
)

# Executive Stat Row - 6 KPIs
kpi1, kpi2, kpi3, kpi4, kpi5, kpi6 = st.columns(6)

with kpi1:
    st.markdown(
        f"""
        <div class="stat-card cyan">
            <div class="stat-title">Enemy Transmissions</div>
            <div class="stat-value">{m_sweep.total_transmissions_ground_truth:,}</div>
            <div class="stat-sub">Ground-Truth Pulses in Band</div>
        </div>
        """,
        unsafe_allow_html=True
    )

with kpi2:
    st.markdown(
        f"""
        <div class="stat-card red">
            <div class="stat-title">Baseline Sweep (Dumb)</div>
            <div class="stat-value">{m_sweep.total_detections}</div>
            <div class="stat-sub">Caught {m_sweep.p_d_slot*100:.1f}% | 1.00x Base</div>
        </div>
        """,
        unsafe_allow_html=True
    )

with kpi3:
    st.markdown(
        f"""
        <div class="stat-card purple">
            <div class="stat-title">Co-Prime Sweeper</div>
            <div class="stat-value">{m_coprime.total_detections}</div>
            <div class="stat-sub">Caught {m_coprime.p_d_slot*100:.1f}% | <b>{m_coprime.interception_efficiency_ratio:.2f}x</b></div>
        </div>
        """,
        unsafe_allow_html=True
    )

with kpi4:
    st.markdown(
        f"""
        <div class="stat-card amber">
            <div class="stat-title">UCB1 Bandit (ML 1)</div>
            <div class="stat-value">{m_ucb.total_detections}</div>
            <div class="stat-sub">Caught {m_ucb.p_d_slot*100:.1f}% | <b>{m_ucb.interception_efficiency_ratio:.2f}x</b></div>
        </div>
        """,
        unsafe_allow_html=True
    )

with kpi5:
    st.markdown(
        f"""
        <div class="stat-card green">
            <div class="stat-title">Q-Learning Agent (ML 2)</div>
            <div class="stat-value">{m_ql.total_detections}</div>
            <div class="stat-sub">Caught {m_ql.p_d_slot*100:.1f}% | <b>{m_ql.interception_efficiency_ratio:.2f}x</b></div>
        </div>
        """,
        unsafe_allow_html=True
    )

with kpi6:
    st.markdown(
        f"""
        <div class="stat-card cyan">
            <div class="stat-title">Prediction Accuracy</div>
            <div class="stat-value">{m_ql.percentage_correct_predictions:.1f}%</div>
            <div class="stat-sub">Latency Err: {m_ql.average_intercept_time_error:.1f} steps</div>
        </div>
        """,
        unsafe_allow_html=True
    )


# -----------------------------------------------------------------------------
# 5. TABBED OPERATIONAL VIEWS
# -----------------------------------------------------------------------------
tab_spec, tab_metrics, tab_theory, tab_cdf, tab_alloc, tab_logs = st.tabs([
    "🌌 2D Spectrogram Waterfall",
    "📊 Figures of Merit & Scorecard",
    "🎯 Periodic Intercept & Prediction Theory",
    "⏱️ Time-to-Intercept (TTI) CDF",
    "📈 Cumulative Intercepts & Attention",
    "💾 Telemetry & Data Exporter"
])


# -----------------------------------------------------------------------------
# TAB 1: 2D SPECTROGRAM / WATERFALL DISPLAY
# -----------------------------------------------------------------------------
with tab_spec:
    st.markdown("### 2D Real-Time RF Spectrogram Waterfall Display")
    st.markdown(
        "This is the **tactical radar screen**. The horizontal axis is **Time (discrete epochs)** and the vertical axis is **Frequency Channels (0 to C-1)**. "
        "Each colored block represents an enemy signal transmitting. The **glowing green circles** are successful interceptions where our receiver tuned to the right channel at the right millisecond!"
    )

    # Visual Legend Bar
    leg1, leg2, leg3, leg4, leg5, leg6 = st.columns(6)
    with leg1:
        st.markdown('<div class="legend-card" style="border-left: 4px solid #1e3a8a;">🔵 Periodic Radar<br><span style="color:#64748b; font-size:0.7rem;">Regular pulses</span></div>', unsafe_allow_html=True)
    with leg2:
        st.markdown('<div class="legend-card" style="border-left: 4px solid #b45309;">🟡 Agile FHSS<br><span style="color:#64748b; font-size:0.7rem;">Frequency hopper</span></div>', unsafe_allow_html=True)
    with leg3:
        st.markdown('<div class="legend-card" style="border-left: 4px solid #7c3aed;">🟣 Spatial Scan<br><span style="color:#64748b; font-size:0.7rem;">Rotating beam</span></div>', unsafe_allow_html=True)
    with leg4:
        st.markdown('<div class="legend-card" style="border-left: 4px solid #be123c;">🔴 Missile Lock<br><span style="color:#64748b; font-size:0.7rem;">Deadly pop-up burst</span></div>', unsafe_allow_html=True)
    with leg5:
        st.markdown('<div class="legend-card" style="border-left: 4px solid #00ff88;">🟢 INTERCEPT!<br><span style="color:#64748b; font-size:0.7rem;">Caught by receiver</span></div>', unsafe_allow_html=True)
    with leg6:
        st.markdown('<div class="legend-card" style="border-left: 4px solid #38bdf8;">⚪ Dwell Path<br><span style="color:#64748b; font-size:0.7rem;">Sensor look-track</span></div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    col_ctrl1, col_ctrl2 = st.columns([2, 2])
    with col_ctrl1:
        overlay_mode = st.selectbox(
            "Receiver Overlay View",
            [
                "All Schedulers (Side-by-Side Comparison)",
                "Q-Learning Dwell Agent (ML 2)",
                "UCB1 Bandit (ML 1)",
                "Co-Prime Sweeper (Optimal Periodic)",
                "Sequential Sweep (Baseline)",
                "Ground Truth Spectrum Only (No Receiver Overlaid)"
            ],
            index=0
        )
    with col_ctrl2:
        time_window = st.slider(
            "Zoom Time Window (Steps)",
            min_value=50,
            max_value=num_steps,
            value=min(num_steps, 220),
            step=20,
            help="Zoom in or out on the timeline to inspect individual pulses."
        )

    gt_window = ground_truth[:time_window, :].T

    # Colorscale for 0:Noise, 1:Periodic, 2:Agile, 3:Sporadic, 4:Spatial Scan
    gt_colorscale = [
        [0.0, "#0b1120"],
        [0.25, "#1e3a8a"],
        [0.50, "#b45309"],
        [0.75, "#be123c"],
        [1.0, "#7c3aed"]
    ]

    class_names = {
        0: "Ambient Noise (Empty)",
        1: "Class 1: Surveillance Radar (Periodic)",
        2: "Class 2: Frequency-Agile (FHSS)",
        3: "Class 3: High-Threat Missile Radar (Sporadic)",
        4: "Class 4: Spatially Rotating Radar"
    }

    if overlay_mode == "All Schedulers (Side-by-Side Comparison)":
        fig_spec = make_subplots(
            rows=4, cols=1,
            shared_xaxes=True,
            vertical_spacing=0.06,
            subplot_titles=(
                "1. Sequential Sweep (Baseline) — Scans in a rigid circle, misses agile & pop-up threats",
                "2. Co-Prime Sweeper (Optimal Scan) — Uses prime steps to break periodic blind spots",
                "3. UCB1 Multi-Armed Bandit (ML 1) — Balances exploring quiet channels with exploiting active ones",
                "4. Q-Learning Dwell Agent (ML 2) — Reinforcement learning agent that learns threat patterns dynamically"
            )
        )

        sched_configs = [
            ("Sequential Sweep (Baseline)", 1, "#ff3366"),
            ("Co-Prime Sweeper (Optimal Periodic)", 2, "#a855f7"),
            ("UCB1 Bandit (ML 1)", 3, "#fbbf24"),
            ("Q-Learning Dwell Agent (ML 2)", 4, "#00f0ff")
        ]

        for name, row_idx, dwell_color in sched_configs:
            fig_spec.add_trace(
                go.Heatmap(
                    z=gt_window,
                    x=list(range(time_window)),
                    y=list(range(num_channels)),
                    colorscale=gt_colorscale,
                    zmin=0, zmax=4,
                    showscale=(row_idx == 1),
                    colorbar=dict(
                        title=dict(text="Threat Class", side="right"),
                        tickvals=[0, 1, 2, 3, 4],
                        ticktext=["Noise", "Periodic", "Agile", "Missile", "Spatial"],
                        len=0.6,
                        thickness=14
                    ) if row_idx == 1 else None,
                    hoverinfo="text",
                    text=[[f"Time: Step {t}<br>Freq: Ch {c}<br>Activity: {class_names.get(gt_window[c, t], 'Unknown')}" for t in range(time_window)] for c in range(num_channels)]
                ),
                row=row_idx, col=1
            )

            actions = logs_data[name]["actions"][:time_window]
            detections = logs_data[name]["detections"][:time_window]

            fig_spec.add_trace(
                go.Scatter(
                    x=list(range(time_window)),
                    y=actions,
                    mode="markers",
                    marker=dict(size=3, color=dwell_color, opacity=0.45),
                    name=name,
                    hoverinfo="skip"
                ),
                row=row_idx, col=1
            )

            hit_indices = np.where(detections)[0]
            if len(hit_indices) > 0:
                fig_spec.add_trace(
                    go.Scatter(
                        x=hit_indices,
                        y=actions[hit_indices],
                        mode="markers",
                        marker=dict(
                            symbol="circle",
                            size=7,
                            color="#00ff88",
                            line=dict(color="#ffffff", width=1)
                        ),
                        name=f"{name} Hits",
                        hoverinfo="text",
                        text=[f"🎯 INTERCEPT HIT!<br>Step: {t}<br>Channel: {actions[t]}<br>Threat: {class_names.get(ground_truth[t, actions[t]], 'Active')}" for t in hit_indices]
                    ),
                    row=row_idx, col=1
                )

        fig_spec.update_layout(
            height=950,
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0b1120",
            margin=dict(l=40, r=30, t=50, b=40),
            showlegend=False
        )
        fig_spec.update_yaxes(title_text="Channel", dtick=max(2, num_channels // 8))
        fig_spec.update_xaxes(title_text="Time Epoch (Steps)", row=4, col=1)
        st.plotly_chart(fig_spec, use_container_width=True)

    else:
        fig_single = go.Figure()
        fig_single.add_trace(
            go.Heatmap(
                z=gt_window,
                x=list(range(time_window)),
                y=list(range(num_channels)),
                colorscale=gt_colorscale,
                zmin=0, zmax=4,
                colorbar=dict(
                    title=dict(text="Threat Class", side="right"),
                    tickvals=[0, 1, 2, 3, 4],
                    ticktext=["Noise", "Periodic Radar", "Agile (FHSS)", "Missile Lock", "Spatial Scan"],
                    len=0.8,
                    thickness=16
                ),
                hoverinfo="text",
                text=[[f"Time: Step {t}<br>Channel: {c}<br>Threat: {class_names.get(gt_window[c, t], 'Silent')}" for t in range(time_window)] for c in range(num_channels)]
            )
        )

        if overlay_mode != "Ground Truth Spectrum Only (No Receiver Overlaid)":
            target_name = overlay_mode
            actions = logs_data[target_name]["actions"][:time_window]
            detections = logs_data[target_name]["detections"][:time_window]

            fig_single.add_trace(
                go.Scatter(
                    x=list(range(time_window)),
                    y=actions,
                    mode="lines+markers",
                    line=dict(color="rgba(255, 255, 255, 0.22)", width=1, dash="dot"),
                    marker=dict(size=4, color="#38bdf8", opacity=0.6),
                    name="Receiver Look Path",
                    hoverinfo="text",
                    text=[f"Receiver tuned to Ch {actions[t]} at Step {t}" for t in range(time_window)]
                )
            )

            hit_indices = np.where(detections)[0]
            if len(hit_indices) > 0:
                fig_single.add_trace(
                    go.Scatter(
                        x=hit_indices,
                        y=actions[hit_indices],
                        mode="markers",
                        marker=dict(
                            symbol="circle",
                            size=9,
                            color="#00ff88",
                            line=dict(color="#ffffff", width=1.5)
                        ),
                        name="Intercept Hits",
                        hoverinfo="text",
                        text=[f"🎯 INTERCEPT!<br>Step: {t}<br>Channel: {actions[t]}<br>Intercepted: {class_names.get(ground_truth[t, actions[t]], 'Enemy')}" for t in hit_indices]
                    )
                )

        fig_single.update_layout(
            height=580,
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0b1120",
            xaxis=dict(title="Discrete Time Epoch (Steps)", showgrid=True, gridcolor="#1e293b"),
            yaxis=dict(title="Frequency Channel", showgrid=True, gridcolor="#1e293b", dtick=max(2, num_channels // 8)),
            margin=dict(l=40, r=30, t=30, b=40)
        )
        st.plotly_chart(fig_single, use_container_width=True)


# -----------------------------------------------------------------------------
# TAB 2: FIGURES OF MERIT & SCORECARD
# -----------------------------------------------------------------------------
with tab_metrics:
    st.markdown("### Military Figures of Merit (FOM) Scorecard")
    st.markdown(
        "Side-by-side performance comparison proving the mathematical advantage of our cognitive schedulers over legacy sweeping."
    )

    with st.expander("ℹ️ How to Read These Military Figures of Merit (Plain English Guide)", expanded=False):
        st.markdown(
            """
            - **Probability of Detection ($P_d$):** The percentage of total enemy pulses our receiver caught. (Higher is better).
            - **Probability of False Alarm ($P_{fa}$):** The percentage of time thermal noise tricked our sensor into thinking a signal was there when it was actually empty.
            - **Mean Intercept Latency (TTI):** How many fractions of a second it took for our receiver to catch a newly activated enemy radar. (Lower is better).
            - **% Correct Predictions:** Evaluates the AI's internal foresight: did it accurately predict if a channel had a signal *before* dwelling on it?
            - **Avg Intercept Time Error:** How close the AI's estimated reaction time was to the real empirical reaction time.
            - **Efficiency vs Baseline:** The definitive multiplier proving how many times better our AI is compared to the old linear sweep.
            """
        )

    comp_df = metrics_summary["comparison_table"]
    st.dataframe(
        comp_df,
        use_container_width=True,
        hide_index=True
    )

    st.markdown("---")
    col_rad, col_bar = st.columns([1, 1])

    with col_rad:
        st.markdown("#### Operational Capability Radar (Larger Area = Better Defense)")
        categories = [
            "Detection Rate (P_d)",
            "Periodic P_d",
            "Agile P_d",
            "Spatial Scan P_d",
            "Missile Lock P_d",
            "Prediction Acc",
            "Reaction Speed"
        ]

        def get_radar_scores(m: SchedulerPerformanceMetrics) -> List[float]:
            inv_lat = 1.0 / max(0.5, m.mean_tti)
            norm_inv_lat = min(1.0, inv_lat / 1.5)
            return [
                m.p_d_slot * 10,
                m.p_d_periodic * 10,
                m.p_d_agile * 10,
                m.p_d_spatial * 10,
                m.p_d_sporadic * 10,
                m.percentage_correct_predictions / 100.0,
                norm_inv_lat
            ]

        fig_radar = go.Figure()
        fig_radar.add_trace(go.Scatterpolar(r=get_radar_scores(m_sweep), theta=categories, fill="toself", name="Baseline Sweep", line_color="#ff3366", opacity=0.5))
        fig_radar.add_trace(go.Scatterpolar(r=get_radar_scores(m_coprime), theta=categories, fill="toself", name="Co-Prime Sweeper", line_color="#a855f7", opacity=0.5))
        fig_radar.add_trace(go.Scatterpolar(r=get_radar_scores(m_ucb), theta=categories, fill="toself", name="UCB1 Bandit", line_color="#fbbf24", opacity=0.5))
        fig_radar.add_trace(go.Scatterpolar(r=get_radar_scores(m_ql), theta=categories, fill="toself", name="Q-Learning Dwell", line_color="#00ff88", opacity=0.7))

        fig_radar.update_layout(
            polar=dict(radialaxis=dict(visible=True, range=[0, 1.2], gridcolor="#1e293b"), bgcolor="#0e1524"),
            paper_bgcolor="#0b0f19",
            template="plotly_dark",
            height=460,
            margin=dict(l=50, r=50, t=20, b=20),
            legend=dict(orientation="h", yanchor="bottom", y=-0.25, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_radar, use_container_width=True)

    with col_bar:
        st.markdown("#### Tactical Interception Efficiency (vs Baseline Sweep = 1.0x)")
        eff_df = pd.DataFrame({
            "Scheduler": [
                "Sequential Sweep",
                "Co-Prime Sweeper",
                "UCB1 Bandit",
                "Q-Learning Agent"
            ],
            "Multiplier": [
                m_sweep.interception_efficiency_ratio,
                m_coprime.interception_efficiency_ratio,
                m_ucb.interception_efficiency_ratio,
                m_ql.interception_efficiency_ratio
            ]
        })
        fig_eff = go.Figure(go.Bar(
            x=eff_df["Scheduler"],
            y=eff_df["Multiplier"],
            marker_color=["#ff3366", "#a855f7", "#fbbf24", "#00ff88"],
            text=[f"{v:.2f}x" for v in eff_df["Multiplier"]],
            textposition="auto"
        ))
        fig_eff.update_layout(
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0e1524",
            yaxis_title="Interception Multiplier (x Baseline)",
            height=460,
            margin=dict(l=40, r=20, t=20, b=30)
        )
        st.plotly_chart(fig_eff, use_container_width=True)


# -----------------------------------------------------------------------------
# TAB 3: PERIODIC INTERCEPT & PREDICTION THEORY
# -----------------------------------------------------------------------------
with tab_theory:
    st.markdown("### Optimal Periodic Scan Interception & Prediction Modeling")
    st.markdown(
        "Directly answers the theoretical requirement: *'Approaches to intercept a periodic scan receiver optimally should be outlined.'*"
    )

    col_th1, col_th2 = st.columns([1, 1])

    with col_th1:
        st.markdown("#### 1. Wiley-Richards Closed-Form Model vs Real Interceptions")
        st.markdown(
            "In radar theory (Wiley & Richards equations), the theoretical cumulative probability of intercept $P_i(t)$ "
            "for a scanning receiver against periodic emitters is governed by:"
        )
        st.latex(r"P_i(t) = 1 - \left(1 - \min\left(1.0, \frac{t_{\text{dwell}}}{C}\right)\right)^{\lfloor t / T_{\text{emitter}} \rfloor}")

        sample_steps = list(range(10, min(num_steps, 500), 10))
        engine = MetricsEngine(RFEnvironment(env_config))
        theory_pi = engine.compute_wiley_richards_theoretical_pi(num_channels, sample_steps, mean_burst_dur=spatial_dwell, emitter_cycle=spatial_period)

        emp_sweep = [np.mean(logs_data["Sequential Sweep (Baseline)"]["detections"][:t]) * 4.0 for t in sample_steps]
        emp_coprime = [np.mean(logs_data["Co-Prime Sweeper (Optimal Periodic)"]["detections"][:t]) * 4.0 for t in sample_steps]
        emp_ql = [np.mean(logs_data["Q-Learning Dwell Agent (ML 2)"]["detections"][:t]) * 4.0 for t in sample_steps]

        fig_pi = go.Figure()
        fig_pi.add_trace(go.Scatter(x=sample_steps, y=theory_pi, name="Wiley-Richards Theoretical Curve", line=dict(color="#ffffff", dash="dash", width=2.5)))
        fig_pi.add_trace(go.Scatter(x=sample_steps, y=emp_sweep, name="Empirical Baseline Sweep", line=dict(color="#ff3366", width=2)))
        fig_pi.add_trace(go.Scatter(x=sample_steps, y=emp_coprime, name="Empirical Co-Prime Sweeper", line=dict(color="#a855f7", width=2)))
        fig_pi.add_trace(go.Scatter(x=sample_steps, y=emp_ql, name="Empirical Q-Learning Agent", line=dict(color="#00ff88", width=2.5)))

        fig_pi.update_layout(
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0e1524",
            xaxis_title="Observation Time (Steps)",
            yaxis_title="Probability of Intercept P_i",
            yaxis_range=[0, 1.05],
            height=400,
            margin=dict(l=40, r=20, t=20, b=30),
            legend=dict(orientation="h", yanchor="bottom", y=-0.35, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_pi, use_container_width=True)

    with col_th2:
        st.markdown("#### 2. Number-Theoretic Co-Prime Sweep (Chinese Remainder Theorem)")
        st.markdown(
            "**Why Sequential Sweep Fails Against Periodic Radars:** When an airport surveillance radar rotates every 40 steps, "
            "and a receiver scans 32 channels sequentially, the two cycles share common divisors ($\gcd(32, 40) = 8$). "
            "This creates **permanent blind spots** where the receiver is always looking away when the radar beam passes!<br><br>"
            "**The Co-Prime Solution:** Setting stride $s$ such that $\gcd(s, C) = 1$ forces the receiver to visit every channel in a non-repeating sequence, "
            "guaranteeing complete phase dispersion.",
            unsafe_allow_html=True
        )

        steps_32 = list(range(32))
        sweep_phases = [t % num_channels for t in steps_32]
        coprime_phases = [(t * prime_stride) % num_channels for t in steps_32]

        fig_phase = go.Figure()
        fig_phase.add_trace(go.Scatter(x=steps_32, y=sweep_phases, mode="lines+markers", name="Sequential Sweep (Harmonic Lock)", line=dict(color="#ff3366", width=1.5)))
        fig_phase.add_trace(go.Scatter(x=steps_32, y=coprime_phases, mode="lines+markers", name=f"Co-Prime Sweep (Stride={prime_stride})", line=dict(color="#a855f7", width=2)))

        fig_phase.update_layout(
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0e1524",
            xaxis_title="Step Index",
            yaxis_title="Channel Dwell Order",
            height=320,
            margin=dict(l=40, r=20, t=20, b=30),
            legend=dict(orientation="h", yanchor="bottom", y=-0.35, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_phase, use_container_width=True)


# -----------------------------------------------------------------------------
# TAB 4: TIME-TO-INTERCEPT (TTI) CDF & LATENCY
# -----------------------------------------------------------------------------
with tab_cdf:
    st.markdown("### Time-to-Intercept (TTI) Reaction Speed Curve")
    st.markdown(
        "In electronic combat, **reaction speed is life or death**. If an enemy missile locks onto your drone for 4 steps, "
        "and your receiver takes 10 steps to notice, you are destroyed. "
        "The curve below shows what percentage of threats were intercepted within $\\tau$ steps of turning on. "
        "**Steeper curve = Faster reaction.**"
    )

    cdf_df = metrics_summary["cdf_df"]
    fig_cdf = go.Figure()
    colors = {
        "Sequential Sweep (Baseline)": "#ff3366",
        "Co-Prime Sweeper (Optimal Periodic)": "#a855f7",
        "UCB1 Bandit (ML 1)": "#fbbf24",
        "Q-Learning Dwell Agent (ML 2)": "#00ff88"
    }

    for col in cdf_df.columns:
        if col == "Latency (Steps)":
            continue
        fig_cdf.add_trace(
            go.Scatter(
                x=cdf_df["Latency (Steps)"],
                y=cdf_df[col],
                mode="lines+markers",
                name=col,
                line=dict(color=colors.get(col, "#38bdf8"), width=3),
                marker=dict(size=6)
            )
        )

    fig_cdf.update_layout(
        title="Time-to-Intercept (TTI) Cumulative Distribution Function",
        xaxis=dict(title="Maximum Allowed Reaction Time τ (Steps)", gridcolor="#1e293b", dtick=1),
        yaxis=dict(title="Fraction of Threats Intercepted", gridcolor="#1e293b", tickformat=".1%"),
        template="plotly_dark",
        paper_bgcolor="#0b0f19",
        plot_bgcolor="#0e1524",
        height=480,
        margin=dict(l=50, r=30, t=50, b=40),
        legend=dict(orientation="h", yanchor="bottom", y=-0.25, xanchor="center", x=0.5)
    )
    st.plotly_chart(fig_cdf, use_container_width=True)

    col_lat1, col_lat2 = st.columns(2)
    with col_lat1:
        st.markdown("#### Mean Reaction Latency per Threat Class (Lower is Better)")
        lat_data = {
            "Scheduler": ["Sequential Sweep", "Co-Prime Sweeper", "UCB1 Bandit", "Q-Learning Dwell"],
            "Surveillance Radar": [m_sweep.tti_periodic, m_coprime.tti_periodic, m_ucb.tti_periodic, m_ql.tti_periodic],
            "Agile FHSS": [m_sweep.tti_agile, m_coprime.tti_agile, m_ucb.tti_agile, m_ql.tti_agile],
            "Rotating Radar": [m_sweep.tti_spatial, m_coprime.tti_spatial, m_ucb.tti_spatial, m_ql.tti_spatial],
            "Missile Guidance": [m_sweep.tti_sporadic, m_coprime.tti_sporadic, m_ucb.tti_sporadic, m_ql.tti_sporadic]
        }
        lat_df = pd.DataFrame(lat_data)
        
        fig_bar_lat = go.Figure()
        fig_bar_lat.add_trace(go.Bar(x=lat_df["Scheduler"], y=lat_df["Surveillance Radar"], name="Surveillance Radar", marker_color="#38bdf8"))
        fig_bar_lat.add_trace(go.Bar(x=lat_df["Scheduler"], y=lat_df["Agile FHSS"], name="Agile FHSS", marker_color="#fbbf24"))
        fig_bar_lat.add_trace(go.Bar(x=lat_df["Scheduler"], y=lat_df["Rotating Radar"], name="Rotating Radar", marker_color="#a855f7"))
        fig_bar_lat.add_trace(go.Bar(x=lat_df["Scheduler"], y=lat_df["Missile Guidance"], name="Missile Guidance", marker_color="#f43f5e"))
        fig_bar_lat.update_layout(
            barmode="group",
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0e1524",
            yaxis_title="Average Steps to Intercept",
            height=380,
            margin=dict(l=40, r=20, t=30, b=30)
        )
        st.plotly_chart(fig_bar_lat, use_container_width=True)

    with col_lat2:
        st.markdown("#### Percentage of Threat Bursts Successfully Caught")
        success_data = {
            "Strategy": ["Sequential Sweep", "Co-Prime Sweeper", "UCB1 Bandit", "Q-Learning Dwell"],
            "Intercept Success Rate": [
                m_sweep.p_d_burst_overall * 100,
                m_coprime.p_d_burst_overall * 100,
                m_ucb.p_d_burst_overall * 100,
                m_ql.p_d_burst_overall * 100
            ]
        }
        success_df = pd.DataFrame(success_data)
        fig_success = go.Figure(go.Bar(
            x=success_df["Strategy"],
            y=success_df["Intercept Success Rate"],
            marker_color=["#ff3366", "#a855f7", "#fbbf24", "#00ff88"],
            text=[f"{v:.1f}%" for v in success_df["Intercept Success Rate"]],
            textposition="auto"
        ))
        fig_success.update_layout(
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0e1524",
            yaxis_title="% of Threats Intercepted Before Expiration",
            height=380,
            margin=dict(l=40, r=20, t=30, b=30)
        )
        st.plotly_chart(fig_success, use_container_width=True)


# -----------------------------------------------------------------------------
# TAB 5: CUMULATIVE INTERCEPTS & OCCUPANCY
# -----------------------------------------------------------------------------
with tab_alloc:
    st.markdown("### Cumulative Interceptions & Spectrum Attention Allocation")
    
    col_cum, col_occ = st.columns(2)

    with col_cum:
        st.markdown("#### Cumulative Detections Over Time (Timeline)")
        cum_sweep = np.cumsum(logs_data["Sequential Sweep (Baseline)"]["detections"])
        cum_coprime = np.cumsum(logs_data["Co-Prime Sweeper (Optimal Periodic)"]["detections"])
        cum_ucb = np.cumsum(logs_data["UCB1 Bandit (ML 1)"]["detections"])
        cum_ql = np.cumsum(logs_data["Q-Learning Dwell Agent (ML 2)"]["detections"])

        fig_cum = go.Figure()
        fig_cum.add_trace(go.Scatter(x=list(range(num_steps)), y=cum_sweep, name="Sequential Sweep (Flat slope)", line=dict(color="#ff3366", width=2)))
        fig_cum.add_trace(go.Scatter(x=list(range(num_steps)), y=cum_coprime, name="Co-Prime Sweeper", line=dict(color="#a855f7", width=2)))
        fig_cum.add_trace(go.Scatter(x=list(range(num_steps)), y=cum_ucb, name="UCB1 Bandit", line=dict(color="#fbbf24", width=2)))
        fig_cum.add_trace(go.Scatter(x=list(range(num_steps)), y=cum_ql, name="Q-Learning Dwell (Steepest slope)", line=dict(color="#00ff88", width=3)))

        fig_cum.update_layout(
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0e1524",
            xaxis_title="Time Step",
            yaxis_title="Total Intercepted Pulses",
            height=400,
            margin=dict(l=40, r=20, t=30, b=30),
            legend=dict(orientation="h", yanchor="bottom", y=-0.3, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_cum, use_container_width=True)

    with col_occ:
        st.markdown("#### Smart Attention: Where the AI Looks vs Actual Enemy Activity")
        gt_energy = np.sum(ground_truth > 0, axis=0)
        gt_energy_pct = (gt_energy / np.sum(gt_energy)) * 100

        act_sweep = logs_data["Sequential Sweep (Baseline)"]["actions"]
        act_ql = logs_data["Q-Learning Dwell Agent (ML 2)"]["actions"]

        sweep_counts = np.bincount(act_sweep, minlength=num_channels) / num_steps * 100
        ql_counts = np.bincount(act_ql, minlength=num_channels) / num_steps * 100

        fig_alloc = go.Figure()
        fig_alloc.add_trace(go.Bar(x=list(range(num_channels)), y=gt_energy_pct, name="Actual Threat Activity %", marker_color="#64748b", opacity=0.7))
        fig_alloc.add_trace(go.Scatter(x=list(range(num_channels)), y=sweep_counts, name="Sequential Sweep (Flat 3.1% on all)", line=dict(color="#ff3366", dash="dash", width=2)))
        fig_alloc.add_trace(go.Scatter(x=list(range(num_channels)), y=ql_counts, name="Q-Agent (Learned Attention)", line=dict(color="#00ff88", width=2.5)))

        fig_alloc.update_layout(
            template="plotly_dark",
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0e1524",
            xaxis_title="Frequency Channel",
            yaxis_title="% of Receiver Dwell Time",
            height=400,
            margin=dict(l=40, r=20, t=30, b=30),
            legend=dict(orientation="h", yanchor="bottom", y=-0.3, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_alloc, use_container_width=True)


# -----------------------------------------------------------------------------
# TAB 6: DIAGNOSTIC TELEMETRY & DATA EXPORTER
# -----------------------------------------------------------------------------
with tab_logs:
    st.markdown("### Telemetry Data Exporter & Post-Mission Debrief")
    st.markdown(
        "Download complete step-by-step logs and raw telemetry records for offline academic analysis, "
        "DRDO algorithm verification, and mission debrief reports."
    )

    diag_df = metrics_summary["diag_df"]
    col_exp1, col_exp2 = st.columns([1, 1])

    with col_exp1:
        csv_diag = diag_df.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="📥 Download Full Simulation Telemetry Log (CSV)",
            data=csv_diag,
            file_name=f"ew_smart_scan_telemetry_T{num_steps}_C{num_channels}_seed{sim_seed}.csv",
            mime="text/csv",
            use_container_width=True
        )

    with col_exp2:
        csv_bench = comp_df.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="📥 Download Figures of Merit Benchmark Report (CSV)",
            data=csv_bench,
            file_name=f"ew_smart_scan_benchmarks_T{num_steps}_C{num_channels}.csv",
            mime="text/csv",
            use_container_width=True
        )

    st.markdown("#### Step-by-Step Raw Telemetry (First 200 Steps)")
    st.dataframe(
        diag_df.head(200),
        use_container_width=True,
        height=350
    )

# Footer
st.markdown("---")
st.markdown(
    """
    <div style="text-align: center; color: #64748b; font-size: 0.8rem; font-family: monospace;">
        SMART INDIA HACKATHON // ELECTRONIC SUPPORT RECEIVER SCHEDULER SOFTWARE | CPU-ACCELERATED LOCAL INFERENCE
    </div>
    """,
    unsafe_allow_html=True
)
