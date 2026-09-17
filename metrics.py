"""
Figures of Merit Engine for Electronic Support (ES) and Electronic Warfare (EW).

Calculates military-grade ES performance metrics satisfying all SIH requirements:
- Probability of Detection (P_d): Slot-level and burst-level, overall and per-class
  (Periodic, Agile FHSS, Sporadic Threat, Spatially Scanning Radar).
- Probability of False Alarm (P_fa): Thermal false alarms on empty spectrum dwells.
- Sensitivity: Receiver Minimum Detectable Signal (MDS in dBm) and SNR margin.
- Average Intercept Rate: Interceptions per 100 time epochs (rate of collection).
- Percentage of Correct Predictions: Accuracy of agent's pre-dwell occupancy forecasts.
- Average Intercept Time Error: Mean deviation between predicted vs actual intercept latency.
- Time-to-Intercept (TTI) / Latency: Empirical CDF and class-stratified response times.
- Interception Efficiency Ratio (IER): Factor improvement over baseline sequential sweep.
- Theoretical Wiley-Richards Closed-Form Model for Probability of Intercept (P_i).
"""

from dataclasses import dataclass, field
import math
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd

from environment import BurstEvent, DwellObservation, EmitterClass, RFEnvironment
from schedulers import BaseScheduler, SchedulerLog


@dataclass
class BurstInterceptRecord:
    """Detailed telemetry on whether and when an individual threat burst was intercepted."""
    event_id: int
    emitter_class: EmitterClass
    channel: int
    start_step: int
    end_step: int
    duration: int
    is_high_priority: bool
    intercepted: bool
    intercept_step: Optional[int] = None
    time_to_intercept: Optional[int] = None      # Measured latency (steps)
    predicted_time_to_intercept: float = 0.0     # Model predicted latency
    intercept_time_error: Optional[float] = None # |predicted - measured|


@dataclass
class SchedulerPerformanceMetrics:
    """Comprehensive performance benchmarks for an EW receiver scheduler."""
    scheduler_name: str
    total_steps: int
    total_transmissions_ground_truth: int
    total_detections: int
    total_false_alarms: int
    total_empty_dwells: int
    
    # 1. Probabilities of Detection (P_d)
    p_d_slot: float                  # Detected transmission slots / total transmission slots
    p_d_periodic: float              # P_d for Class 1 Periodic
    p_d_agile: float                 # P_d for Class 2 Agile
    p_d_sporadic: float              # P_d for Class 3 Sporadic
    p_d_spatial: float               # P_d for Class 4 Spatially Scanning Radar
    p_d_burst_overall: float         # Fraction of all bursts intercepted at least once
    
    # 2. Probability of False Alarm (P_fa)
    p_fa: float                      # False detections on empty dwells / total empty dwells
    
    # 3. Sensitivity & Intercept Rate
    receiver_sensitivity_mds_dbm: float # Minimum Detectable Signal (dBm)
    average_intercept_rate: float       # Interceptions per 100 steps
    
    # 4. Predictions & Latency Error (Explicit SIH Requirements)
    percentage_correct_predictions: float # Accuracy of channel occupancy predictions (%)
    average_intercept_time_error: float   # Mean absolute error |T_predicted - T_actual|
    
    # 5. Latency / Time-to-Intercept (TTI)
    mean_tti: float
    median_tti: float
    max_tti: int
    tti_periodic: float
    tti_agile: float
    tti_sporadic: float
    tti_spatial: float
    
    # 6. Efficiency & Tactical Rewards
    interception_efficiency_ratio: float  # Interceptions / Baseline Interceptions
    total_reward: float
    mean_reward_per_step: float
    high_priority_missed_count: int

    # Raw telemetry records
    burst_records: List[BurstInterceptRecord] = field(default_factory=list)


class MetricsEngine:
    """
    Engine to evaluate and cross-compare EW receiver scheduling algorithms.
    """

    def __init__(self, env: RFEnvironment):
        self.env = env
        self.ground_truth = env.get_ground_truth_matrix()
        self.burst_events = env.get_burst_events()
        self.num_steps, self.num_channels = self.ground_truth.shape

    def evaluate_scheduler(
        self,
        log: SchedulerLog,
        scheduler_obj: Optional[BaseScheduler] = None,
        baseline_detections: Optional[int] = None
    ) -> SchedulerPerformanceMetrics:
        """
        Evaluates a single scheduler log against the ground truth RF environment.
        """
        T = self.num_steps
        C = self.num_channels
        gt = self.ground_truth

        # 1. Slot-level ground truth and detections
        total_gt_slots = int(np.sum(gt > 0))
        gt_periodic_slots = int(np.sum(gt == EmitterClass.PERIODIC))
        gt_agile_slots = int(np.sum(gt == EmitterClass.AGILE))
        gt_sporadic_slots = int(np.sum(gt == EmitterClass.SPORADIC))
        gt_spatial_slots = int(np.sum(gt == EmitterClass.SPATIAL_SCAN))

        total_detections = int(np.sum(log.detections))
        total_false_alarms = int(np.sum(log.false_alarms))

        detected_periodic = int(np.sum((log.detections) & (log.detected_classes == EmitterClass.PERIODIC)))
        detected_agile = int(np.sum((log.detections) & (log.detected_classes == EmitterClass.AGILE)))
        detected_sporadic = int(np.sum((log.detections) & (log.detected_classes == EmitterClass.SPORADIC)))
        detected_spatial = int(np.sum((log.detections) & (log.detected_classes == EmitterClass.SPATIAL_SCAN)))

        p_d_slot = total_detections / max(1, total_gt_slots)
        p_d_periodic = detected_periodic / max(1, gt_periodic_slots)
        p_d_agile = detected_agile / max(1, gt_agile_slots)
        p_d_sporadic = detected_sporadic / max(1, gt_sporadic_slots)
        p_d_spatial = detected_spatial / max(1, gt_spatial_slots)

        # 2. Probability of False Alarm
        actions = log.actions
        is_empty_dwell = np.array([gt[t, actions[t]] == EmitterClass.EMPTY for t in range(T)], dtype=bool)
        total_empty_dwells = int(np.sum(is_empty_dwell))
        p_fa = total_false_alarms / max(1, total_empty_dwells)

        # 3. Percentage of Correct Predictions
        # True channel occupancy at the chosen dwell channel for each step
        true_occupancies = np.array([gt[t, actions[t]] > 0 for t in range(T)], dtype=bool)
        pred_matches = (log.predictions == true_occupancies)
        percentage_correct_predictions = float(np.mean(pred_matches) * 100.0)

        # 4. Average Intercept Rate (Interceptions per 100 epochs)
        average_intercept_rate = (total_detections / max(1, T)) * 100.0

        # 5. Burst-level analysis (Latency & Intercept Time Error)
        burst_records: List[BurstInterceptRecord] = []
        ttis_all: List[int] = []
        ttis_periodic: List[int] = []
        ttis_agile: List[int] = []
        ttis_sporadic: List[int] = []
        ttis_spatial: List[int] = []
        time_errors: List[float] = []
        intercepted_burst_count = 0

        for b in self.burst_events:
            intercepted = False
            intercept_step = None
            tti = None
            pred_tti = scheduler_obj.estimate_time_to_intercept(b.channel, b.emitter_class) if scheduler_obj else float(C / 2.0)
            err = None

            for t in range(b.start_step, b.end_step):
                if actions[t] == b.channel and log.detections[t]:
                    intercepted = True
                    intercept_step = t
                    tti = t - b.start_step
                    err = abs(pred_tti - float(tti))
                    break

            if intercepted and tti is not None:
                intercepted_burst_count += 1
                ttis_all.append(tti)
                if err is not None:
                    time_errors.append(err)

                if b.emitter_class == EmitterClass.PERIODIC:
                    ttis_periodic.append(tti)
                elif b.emitter_class == EmitterClass.AGILE:
                    ttis_agile.append(tti)
                elif b.emitter_class == EmitterClass.SPORADIC:
                    ttis_sporadic.append(tti)
                elif b.emitter_class == EmitterClass.SPATIAL_SCAN:
                    ttis_spatial.append(tti)

            burst_records.append(
                BurstInterceptRecord(
                    event_id=b.event_id,
                    emitter_class=b.emitter_class,
                    channel=b.channel,
                    start_step=b.start_step,
                    end_step=b.end_step,
                    duration=b.duration,
                    is_high_priority=b.is_high_priority,
                    intercepted=intercepted,
                    intercept_step=intercept_step,
                    time_to_intercept=tti,
                    predicted_time_to_intercept=pred_tti,
                    intercept_time_error=err
                )
            )

        p_d_burst_overall = intercepted_burst_count / max(1, len(self.burst_events))
        avg_time_error = float(np.mean(time_errors)) if len(time_errors) > 0 else 0.0

        mean_tti = float(np.mean(ttis_all)) if len(ttis_all) > 0 else 0.0
        median_tti = float(np.median(ttis_all)) if len(ttis_all) > 0 else 0.0
        max_tti = int(np.max(ttis_all)) if len(ttis_all) > 0 else 0
        mean_tti_periodic = float(np.mean(ttis_periodic)) if len(ttis_periodic) > 0 else 0.0
        mean_tti_agile = float(np.mean(ttis_agile)) if len(ttis_agile) > 0 else 0.0
        mean_tti_sporadic = float(np.mean(ttis_sporadic)) if len(ttis_sporadic) > 0 else 0.0
        mean_tti_spatial = float(np.mean(ttis_spatial)) if len(ttis_spatial) > 0 else 0.0

        # 6. Interception Efficiency Ratio
        base_det = baseline_detections if baseline_detections is not None else total_detections
        efficiency_ratio = total_detections / max(1, base_det)

        # 7. Rewards & Missed high priority
        total_reward = float(np.sum(log.rewards))
        mean_reward = total_reward / T
        missed_hp_count = sum(1 for obs in log.dwell_observations if obs.missed_high_priority)

        return SchedulerPerformanceMetrics(
            scheduler_name=log.scheduler_name,
            total_steps=T,
            total_transmissions_ground_truth=total_gt_slots,
            total_detections=total_detections,
            total_false_alarms=total_false_alarms,
            total_empty_dwells=total_empty_dwells,
            p_d_slot=p_d_slot,
            p_d_periodic=p_d_periodic,
            p_d_agile=p_d_agile,
            p_d_sporadic=p_d_sporadic,
            p_d_spatial=p_d_spatial,
            p_d_burst_overall=p_d_burst_overall,
            p_fa=p_fa,
            receiver_sensitivity_mds_dbm=self.env.config.receiver_mds_dbm,
            average_intercept_rate=average_intercept_rate,
            percentage_correct_predictions=percentage_correct_predictions,
            average_intercept_time_error=avg_time_error,
            mean_tti=mean_tti,
            median_tti=median_tti,
            max_tti=max_tti,
            tti_periodic=mean_tti_periodic,
            tti_agile=mean_tti_agile,
            tti_sporadic=mean_tti_sporadic,
            tti_spatial=mean_tti_spatial,
            interception_efficiency_ratio=efficiency_ratio,
            total_reward=total_reward,
            mean_reward_per_step=mean_reward,
            high_priority_missed_count=missed_hp_count,
            burst_records=burst_records
        )

    def compute_tti_cdf(
        self,
        metrics_dict: Dict[str, SchedulerPerformanceMetrics],
        max_latency_bins: int = 15
    ) -> pd.DataFrame:
        """
        Computes Empirical Cumulative Distribution Function (CDF) for Time-to-Intercept.
        """
        total_bursts = max(1, len(self.burst_events))
        tau_range = list(range(0, max_latency_bins + 1))
        cdf_data: Dict[str, List[float]] = {"Latency (Steps)": tau_range}

        for name, metrics in metrics_dict.items():
            curve: List[float] = []
            ttis = [r.time_to_intercept for r in metrics.burst_records if r.intercepted and r.time_to_intercept is not None]
            for tau in tau_range:
                cum_count = sum(1 for tti in ttis if tti <= tau)
                fraction = cum_count / total_bursts
                curve.append(fraction)
            cdf_data[name] = curve

        return pd.DataFrame(cdf_data)

    def compute_wiley_richards_theoretical_pi(
        self,
        num_channels: int,
        steps_range: List[int],
        mean_burst_dur: float = 4.0,
        emitter_cycle: float = 20.0
    ) -> List[float]:
        """
        Closed-Form Wiley-Richards Probability of Intercept (P_i) Model.
        
        Evaluates the analytical cumulative probability of intercepting an uncooperative
        emitter active for `mean_burst_dur` slots within `t` time steps across `num_channels`.
            P_i(t) = 1 - (1 - min(1.0, mean_burst_dur / num_channels)) ** (t / emitter_cycle)
        """
        single_scan_prob = min(1.0, mean_burst_dur / max(1, num_channels))
        theoretical_curve = []
        for t in steps_range:
            scans = max(1.0, t / max(1.0, emitter_cycle))
            p_cum = 1.0 - math.pow(max(0.0, 1.0 - single_scan_prob), scans)
            theoretical_curve.append(min(1.0, max(0.0, p_cum)))
        return theoretical_curve

    def create_comparison_table(
        self,
        metrics_dict: Dict[str, SchedulerPerformanceMetrics]
    ) -> pd.DataFrame:
        """
        Generates a clean, formatted comparison table of ES Figures of Merit
        fulfilling all SIH requirements.
        """
        rows = []
        for name, m in metrics_dict.items():
            rows.append({
                "Scheduler Strategy": name,
                "Probability of Detection (P_d)": f"{m.p_d_slot * 100:.2f}%",
                "Periodic P_d": f"{m.p_d_periodic * 100:.2f}%",
                "Agile P_d": f"{m.p_d_agile * 100:.2f}%",
                "Spatial Scan P_d": f"{m.p_d_spatial * 100:.2f}%",
                "High-Threat Sporadic P_d": f"{m.p_d_sporadic * 100:.2f}%",
                "Burst Intercept Rate": f"{m.p_d_burst_overall * 100:.2f}%",
                "False Alarm Prob (P_fa)": f"{m.p_fa * 100:.3f}%",
                "Mean Intercept Latency (TTI)": f"{m.mean_tti:.2f} steps",
                "% Correct Predictions": f"{m.percentage_correct_predictions:.1f}%",
                "Avg Intercept Time Error": f"{m.average_intercept_time_error:.2f} steps",
                "Avg Intercept Rate": f"{m.average_intercept_rate:.1f} /100ep",
                "Efficiency vs Baseline": f"{m.interception_efficiency_ratio:.2f}x",
                "Cumulative Reward": f"{m.total_reward:,.0f}"
            })
        return pd.DataFrame(rows)

    def build_diagnostic_log_df(
        self,
        env: RFEnvironment,
        logs: Dict[str, SchedulerLog]
    ) -> pd.DataFrame:
        """
        Compiles a step-by-step diagnostic log comparing all schedulers for export.
        """
        T = env.config.num_steps
        gt = env.get_ground_truth_matrix()
        
        data: Dict[str, Any] = {
            "step": list(range(T)),
            "active_channels_count": [int(np.sum(gt[t, :] > 0)) for t in range(T)],
        }

        for name, log in logs.items():
            slug = name.lower().replace(" ", "_").replace("(", "").replace(")", "").replace("-", "_")
            data[f"{slug}_dwell_channel"] = log.actions
            data[f"{slug}_prediction"] = log.predictions
            data[f"{slug}_detection"] = log.detections
            data[f"{slug}_false_alarm"] = log.false_alarms
            data[f"{slug}_reward"] = log.rewards

        return pd.DataFrame(data)
