"""
Unit and Integration Test Suite for EW Smart Scan Schedulers.

Verifies:
- RF Environment generation across various channel configurations (16, 32, 64 channels).
- Presence and dynamics of all 4 tactical emitter classes (Periodic, Agile, Sporadic, Spatial Scan).
- Receiver instantaneous bandwidth constraint (exactly 1 channel per step).
- Deterministic and ML schedulers (Sequential Sweep, Co-Prime Sweeper, UCB1, Q-Learning).
- Exact reward function mechanics (+10 hit, -1 empty, -5 missed high-priority).
- ES Figures of Merit (P_d per class, P_fa, Latency, % Correct Predictions, Avg Intercept Time Error).
- Theoretical Wiley-Richards closed-form model calculation.
- CPU Execution performance benchmark (< 3 seconds for 10,000 total iterations).
"""

import time
import unittest
import numpy as np
import pandas as pd

from environment import RFEnvironment, RFEnvironmentConfig, EmitterClass
from schedulers import (
    SequentialSweepScheduler,
    CoPrimePeriodicSweepScheduler,
    UCB1BanditScheduler,
    QLearningDwellScheduler
)
from metrics import MetricsEngine


class TestEWEnvironment(unittest.TestCase):
    """Test suite for RFEnvironment and Emitter dynamics."""

    def test_environment_dimensions_and_classes(self):
        """Verifies environment shape and presence of all 4 emitter classes."""
        for c in [16, 32, 64]:
            config = RFEnvironmentConfig(num_channels=c, num_steps=500, seed=123, num_spatial=1)
            env = RFEnvironment(config)
            gt = env.get_ground_truth_matrix()
            self.assertEqual(gt.shape, (500, c))

            unique_classes = set(np.unique(gt))
            self.assertIn(EmitterClass.EMPTY.value, unique_classes)
            self.assertIn(EmitterClass.PERIODIC.value, unique_classes)
            self.assertIn(EmitterClass.AGILE.value, unique_classes)
            self.assertIn(EmitterClass.SPORADIC.value, unique_classes)
            self.assertIn(EmitterClass.SPATIAL_SCAN.value, unique_classes)

    def test_receiver_dwell_observation(self):
        """Verifies receiver single-channel observation mechanics, sensitivity, and noise injection."""
        config = RFEnvironmentConfig(
            num_channels=16,
            num_steps=200,
            p_fa_ambient=0.05,
            receiver_mds_dbm=-95.0,
            seed=42
        )
        env = RFEnvironment(config)
        gt = env.get_ground_truth_matrix()

        for t in range(50):
            ch = t % 16
            obs = env.step(t, ch)
            self.assertEqual(obs.step, t)
            self.assertEqual(obs.channel, ch)

            expected_class = EmitterClass(gt[t, ch])
            self.assertEqual(obs.emitter_class, expected_class)
            self.assertEqual(obs.emitter_present, expected_class != EmitterClass.EMPTY)
            self.assertTrue(obs.received_power_dbm > -150.0)


class TestEWSchedulers(unittest.TestCase):
    """Test suite for Interception Schedulers and Prediction Engines."""

    def setUp(self):
        self.config = RFEnvironmentConfig(num_channels=32, num_steps=600, seed=42)
        self.env = RFEnvironment(self.config)

    def test_sequential_sweep_determinism(self):
        """Verifies sequential sweep scans channels 0..C-1 in modulo order."""
        sweep = SequentialSweepScheduler(num_channels=32, num_steps=600)
        log = sweep.run_simulation(self.env)
        self.assertEqual(len(log.actions), 600)
        for t in range(600):
            self.assertEqual(log.actions[t], t % 32)

    def test_coprime_sweep_coverage(self):
        """Verifies co-prime sweeper covers all channels uniformly with prime stride."""
        coprime = CoPrimePeriodicSweepScheduler(num_channels=32, num_steps=600, prime_stride=7)
        log = coprime.run_simulation(self.env)
        # In 32 steps, every single channel from 0 to 31 must be visited exactly once
        first_32_actions = set(log.actions[:32])
        self.assertEqual(len(first_32_actions), 32)

    def test_q_learning_reward_mechanics(self):
        """Verifies exact user-specified reward function (+10 hit, -1 empty, -5 missed high-priority)."""
        ql = QLearningDwellScheduler(num_channels=32, num_steps=600, seed=42)
        log = ql.run_simulation(self.env)

        for t in range(len(log.rewards)):
            obs = log.dwell_observations[t]
            rew = log.rewards[t]
            hit = obs.detected and not obs.is_false_alarm

            expected_reward = 0.0
            if hit:
                expected_reward += 10.0
            else:
                expected_reward -= 1.0

            if obs.missed_high_priority:
                expected_reward -= 5.0

            self.assertAlmostEqual(rew, expected_reward, places=2)

    def test_ucb1_bandit_pulls(self):
        """Verifies UCB1 pulls all arms during initial exploration phase."""
        ucb = UCB1BanditScheduler(num_channels=32, num_steps=600, seed=42)
        log = ucb.run_simulation(self.env)
        visited_channels = set(log.actions)
        self.assertEqual(len(visited_channels), 32)


class TestMetricsEngine(unittest.TestCase):
    """Test suite for Figures of Merit calculation and SIH requirements."""

    def test_metrics_bounds_predictions_and_error(self):
        """Verifies mathematical validity of figures of merit including SIH specific metrics."""
        config = RFEnvironmentConfig(num_channels=32, num_steps=800, seed=99, num_spatial=1)
        env = RFEnvironment(config)

        sweep = SequentialSweepScheduler(32, 800)
        coprime = CoPrimePeriodicSweepScheduler(32, 800)
        ucb = UCB1BanditScheduler(32, 800, seed=99)
        ql = QLearningDwellScheduler(32, 800, seed=99)

        log_sweep = sweep.run_simulation(env)
        log_coprime = coprime.run_simulation(env)
        log_ucb = ucb.run_simulation(env)
        log_ql = ql.run_simulation(env)

        engine = MetricsEngine(env)
        m_sweep = engine.evaluate_scheduler(log_sweep, sweep)
        m_coprime = engine.evaluate_scheduler(log_coprime, coprime, baseline_detections=m_sweep.total_detections)
        m_ucb = engine.evaluate_scheduler(log_ucb, ucb, baseline_detections=m_sweep.total_detections)
        m_ql = engine.evaluate_scheduler(log_ql, ql, baseline_detections=m_sweep.total_detections)

        # Bounded probabilities
        for m in [m_sweep, m_coprime, m_ucb, m_ql]:
            self.assertTrue(0.0 <= m.p_d_slot <= 1.0)
            self.assertTrue(0.0 <= m.p_d_periodic <= 1.0)
            self.assertTrue(0.0 <= m.p_d_agile <= 1.0)
            self.assertTrue(0.0 <= m.p_d_sporadic <= 1.0)
            self.assertTrue(0.0 <= m.p_d_spatial <= 1.0)
            self.assertTrue(0.0 <= m.p_fa <= 1.0)
            self.assertTrue(m.mean_tti >= 0.0)

            # SIH Specific Metrics
            self.assertTrue(0.0 <= m.percentage_correct_predictions <= 100.0)
            self.assertTrue(m.average_intercept_time_error >= 0.0)
            self.assertTrue(m.average_intercept_rate >= 0.0)
            self.assertEqual(m.receiver_sensitivity_mds_dbm, -95.0)

        # Baseline efficiency must be 1.0
        self.assertAlmostEqual(m_sweep.interception_efficiency_ratio, 1.0, places=3)

        # CDF monotonicity test
        cdf_df = engine.compute_tti_cdf({"Sweep": m_sweep, "CoPrime": m_coprime, "UCB1": m_ucb, "QL": m_ql})
        for col in ["Sweep", "CoPrime", "UCB1", "QL"]:
            values = cdf_df[col].tolist()
            for i in range(len(values) - 1):
                self.assertGreaterEqual(values[i + 1], values[i] - 1e-9)

        # Wiley-Richards closed-form model test
        steps_range = [10, 20, 50, 100]
        theory_pi = engine.compute_wiley_richards_theoretical_pi(32, steps_range)
        self.assertEqual(len(theory_pi), 4)
        for p in theory_pi:
            self.assertTrue(0.0 <= p <= 1.0)
        # Must be non-decreasing with observation time
        for i in range(len(theory_pi) - 1):
            self.assertGreaterEqual(theory_pi[i + 1], theory_pi[i])


class TestBenchmarkExecutionSpeed(unittest.TestCase):
    """Verifies execution time constraint: thousands of steps in under 3 seconds on CPU."""

    def test_high_density_scale_performance(self):
        """Simulate maximum scale: 64 channels, 2500 steps across all 4 schedulers (10,000 iterations)."""
        config = RFEnvironmentConfig(num_channels=64, num_steps=2500, seed=777, num_spatial=1)
        
        t_start = time.perf_counter()
        env = RFEnvironment(config)

        sweep = SequentialSweepScheduler(64, 2500)
        coprime = CoPrimePeriodicSweepScheduler(64, 2500)
        ucb = UCB1BanditScheduler(64, 2500, seed=777)
        ql = QLearningDwellScheduler(64, 2500, seed=777)

        log_sweep = sweep.run_simulation(env)
        log_coprime = coprime.run_simulation(env)
        log_ucb = ucb.run_simulation(env)
        log_ql = ql.run_simulation(env)

        engine = MetricsEngine(env)
        m_sweep = engine.evaluate_scheduler(log_sweep, sweep)
        m_coprime = engine.evaluate_scheduler(log_coprime, coprime, baseline_detections=m_sweep.total_detections)
        m_ucb = engine.evaluate_scheduler(log_ucb, ucb, baseline_detections=m_sweep.total_detections)
        m_ql = engine.evaluate_scheduler(log_ql, ql, baseline_detections=m_sweep.total_detections)

        cdf_df = engine.compute_tti_cdf({"Sweep": m_sweep, "CoPrime": m_coprime, "UCB1": m_ucb, "QL": m_ql})
        table_df = engine.create_comparison_table({"Sweep": m_sweep, "CoPrime": m_coprime, "UCB1": m_ucb, "QL": m_ql})
        diag_df = engine.build_diagnostic_log_df(env, {"Sweep": log_sweep, "CoPrime": log_coprime, "UCB1": log_ucb, "QL": log_ql})

        total_time = time.perf_counter() - t_start

        print(f"\n[BENCHMARK] 64 Channels x 2,500 Steps (10,000 total scheduler iterations + full metrics): {total_time:.3f} seconds.")
        self.assertLess(total_time, 3.0, "Execution must take under 3.0 seconds on CPU.")


if __name__ == "__main__":
    unittest.main()
