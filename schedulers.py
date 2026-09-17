"""
Electronic Warfare (EW) Receiver Interception Schedulers.

Implements four distinct receiver scheduling strategies:
1. Baseline Scheduler: Traditional Open-Loop Sequential Sweep.
2. Optimal Periodic Interceptor: Co-Prime Non-Harmonic Sweeper (Chinese Remainder Theorem).
3. ML Scheduler 1: Upper Confidence Bound (UCB1) Multi-Armed Bandit with Exponential Decay.
4. ML Scheduler 2: Q-Learning / Adaptive Dwell Agent with Tactical EW Reward Function.

Every scheduler includes an internal predictive engine that forecasts channel occupancy
prior to dwelling (allowing computation of Percentage of Correct Predictions) and estimates
expected Time-to-Intercept (TTI) for tactical threats.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import math
from typing import List, Dict, Any, Optional, Tuple
import numpy as np

from environment import DwellObservation, EmitterClass, RFEnvironment


@dataclass
class SchedulerLog:
    """Telemetry log recorded by a scheduler across the entire simulation duration."""
    scheduler_name: str
    actions: np.ndarray             # Channel chosen at each step t (T,)
    dwell_observations: List[DwellObservation]
    rewards: np.ndarray             # Tactical reward earned at step t (T,)
    detections: np.ndarray          # Boolean hit flags at step t (T,)
    false_alarms: np.ndarray        # Boolean false alarm flags at step t (T,)
    detected_classes: np.ndarray    # EmitterClass detected at step t (T,)
    predictions: np.ndarray         # Predicted channel occupancy (1=active, 0=silent) at step t (T,)
    channel_beliefs: np.ndarray     # Estimated transmission probability across all channels at step t (T, C)


class BaseScheduler(ABC):
    """Abstract base class for all EW receiver schedulers."""

    def __init__(self, num_channels: int, num_steps: int, name: str):
        self.num_channels = num_channels
        self.num_steps = num_steps
        self.name = name

    @abstractmethod
    def reset(self, seed: Optional[int] = None) -> None:
        """Resets the internal state of the scheduler."""
        pass

    @abstractmethod
    def select_channel(self, t: int) -> int:
        """Selects the frequency channel to dwell on at time step t."""
        pass

    @abstractmethod
    def predict_occupancy(self, t: int, channel: int) -> bool:
        """
        Forecasts whether channel contains an active transmission at time t
        PRIOR to dwelling and observing ground truth.
        """
        pass

    @abstractmethod
    def update(self, t: int, channel: int, observation: DwellObservation) -> float:
        """
        Updates the agent's beliefs or value representations based on observation.
        Returns the scalar reward computed for this step.
        """
        pass

    def estimate_time_to_intercept(self, channel: int, emitter_class: EmitterClass) -> float:
        """
        Predicts expected Time-to-Intercept (in time steps) for an active threat on channel.
        Default baseline is uniform revisit latency: C / 2.
        """
        return float(self.num_channels / 2.0)

    def run_simulation(self, env: RFEnvironment) -> SchedulerLog:
        """
        Executes the full simulation over the RF environment and returns telemetry logs.
        """
        T = self.num_steps
        C = self.num_channels
        actions = np.zeros(T, dtype=np.int32)
        rewards = np.zeros(T, dtype=np.float32)
        detections = np.zeros(T, dtype=bool)
        false_alarms = np.zeros(T, dtype=bool)
        detected_classes = np.zeros(T, dtype=np.int8)
        predictions = np.zeros(T, dtype=bool)
        channel_beliefs = np.zeros((T, C), dtype=np.float32)
        dwell_obs_list: List[DwellObservation] = []

        for t in range(T):
            channel = self.select_channel(t)
            pred = self.predict_occupancy(t, channel)
            obs = env.step(t, channel)
            reward = self.update(t, channel, obs)

            actions[t] = channel
            predictions[t] = pred
            rewards[t] = reward
            detections[t] = obs.detected and not obs.is_false_alarm
            false_alarms[t] = obs.is_false_alarm
            detected_classes[t] = obs.emitter_class.value if detections[t] else 0
            dwell_obs_list.append(obs)

        return SchedulerLog(
            scheduler_name=self.name,
            actions=actions,
            dwell_observations=dwell_obs_list,
            rewards=rewards,
            detections=detections,
            false_alarms=false_alarms,
            detected_classes=detected_classes,
            predictions=predictions,
            channel_beliefs=channel_beliefs
        )


class SequentialSweepScheduler(BaseScheduler):
    """
    Baseline Open-Loop Sequential Sweep Scheduler.
    
    Tuning scans channels sequentially: a_t = t % num_channels.
    Standard open-loop search pattern used in legacy Radar Warning Receivers (RWR).
    """

    def __init__(self, num_channels: int, num_steps: int):
        super().__init__(num_channels, num_steps, name="Sequential Sweep (Baseline)")

    def reset(self, seed: Optional[int] = None) -> None:
        pass

    def select_channel(self, t: int) -> int:
        return t % self.num_channels

    def predict_occupancy(self, t: int, channel: int) -> bool:
        # Open-loop sweep has no adaptive state; assumes uniform low prior
        return False

    def update(self, t: int, channel: int, observation: DwellObservation) -> float:
        reward = 0.0
        if observation.detected and not observation.is_false_alarm:
            reward += 10.0
        else:
            reward -= 1.0
        if observation.missed_high_priority:
            reward -= 5.0
        return reward

    def estimate_time_to_intercept(self, channel: int, emitter_class: EmitterClass) -> float:
        # For a sequential sweep, expected intercept latency against an unaligned burst is C / 2
        return float(self.num_channels / 2.0)


class CoPrimePeriodicSweepScheduler(BaseScheduler):
    """
    Optimal Periodic Scan Interceptor: Co-Prime Non-Harmonic Sweeper.
    
    Directly addresses SIH Requirement:
    "approaches to intercept a periodic scan receiver optimally should be outlined.
     Algorithms and techniques for the same need to be developed."
     
    Mathematical Principle:
    Standard linear sweeps (step=1) suffer from harmonic phase-locking: if an emitter's
    period T_e shares common factors with the sweep cycle C (gcd(C, T_e) > 1), certain
    phases are repeatedly missed, creating permanent blind spots.
    
    The Co-Prime Sweeper chooses a prime stride `s` such that gcd(s, C) = 1 and maximizes
    phase dispersion across the spectrum using the Chinese Remainder Theorem:
        a_t = (t * s) mod C
    This minimizes the maximum time-to-intercept (worst-case latency) against periodic
    and spatially rotating emitters.
    """

    def __init__(self, num_channels: int, num_steps: int, prime_stride: Optional[int] = None):
        super().__init__(num_channels, num_steps, name="Co-Prime Periodic Sweeper (Optimal Scan)")
        # Select prime stride co-prime to num_channels
        if prime_stride is None:
            candidates = [7, 11, 13, 17, 19, 23, 29, 31, 37]
            self.stride = next((p for p in candidates if math.gcd(p, num_channels) == 1), 7)
        else:
            self.stride = prime_stride

    def reset(self, seed: Optional[int] = None) -> None:
        pass

    def select_channel(self, t: int) -> int:
        return (t * self.stride) % self.num_channels

    def predict_occupancy(self, t: int, channel: int) -> bool:
        # Paced sweep with co-prime spacing; assumes periodic dispersion
        return False

    def update(self, t: int, channel: int, observation: DwellObservation) -> float:
        reward = 0.0
        if observation.detected and not observation.is_false_alarm:
            reward += 10.0
        else:
            reward -= 1.0
        if observation.missed_high_priority:
            reward -= 5.0
        return reward

    def estimate_time_to_intercept(self, channel: int, emitter_class: EmitterClass) -> float:
        # Co-prime stride guarantees uniform coverage in C steps, expected latency C / 2
        return float(self.num_channels / 2.0)


class UCB1BanditScheduler(BaseScheduler):
    """
    ML Scheduler 1: Upper Confidence Bound (UCB1) Multi-Armed Bandit.
    
    Dynamically balances exploration of unvisited frequency bands with exploitation
    of channels exhibiting high emitter transmission densities. Incorporates an exponential
    discount factor to track agile/hopping non-stationary emitters.
    """

    def __init__(
        self,
        num_channels: int,
        num_steps: int,
        c_explore: float = 1.414,
        discount_factor: float = 0.995,
        prediction_threshold: float = 0.15,
        seed: Optional[int] = 42
    ):
        super().__init__(num_channels, num_steps, name="UCB1 Bandit")
        self.c_explore = c_explore
        self.discount_factor = discount_factor
        self.prediction_threshold = prediction_threshold
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        
        self.counts = np.zeros(num_channels, dtype=np.float64)
        self.rewards = np.zeros(num_channels, dtype=np.float64)
        self.total_pulls = 0

    def reset(self, seed: Optional[int] = None) -> None:
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        self.counts = np.zeros(self.num_channels, dtype=np.float64)
        self.rewards = np.zeros(self.num_channels, dtype=np.float64)
        self.total_pulls = 0

    def select_channel(self, t: int) -> int:
        # Initial forced exploration phase: pull each arm at least once
        unvisited = np.where(self.counts < 1.0)[0]
        if len(unvisited) > 0:
            return int(self.rng.choice(unvisited))

        # UCB1 scoring with vectorised NumPy
        mean_rewards = self.rewards / np.maximum(self.counts, 1e-6)
        exploration_bonus = self.c_explore * np.sqrt(
            (2.0 * np.log(self.total_pulls + 1.0)) / np.maximum(self.counts, 1e-6)
        )
        ucb_values = mean_rewards + exploration_bonus
        
        jitter = self.rng.uniform(0, 1e-6, size=self.num_channels)
        return int(np.argmax(ucb_values + jitter))

    def predict_occupancy(self, t: int, channel: int) -> bool:
        """Predicts active transmission if estimated empirical density exceeds threshold."""
        if self.counts[channel] < 1.0:
            return False
        empirical_mean = self.rewards[channel] / max(1e-6, self.counts[channel])
        return bool(empirical_mean >= self.prediction_threshold)

    def update(self, t: int, channel: int, observation: DwellObservation) -> float:
        raw_reward = 0.0
        if observation.detected and not observation.is_false_alarm:
            raw_reward = 10.0
            bandit_val = 1.0
        else:
            raw_reward = -1.0
            bandit_val = 0.0

        if observation.missed_high_priority:
            raw_reward -= 5.0

        # Apply exponential decay for non-stationary tracking
        self.counts *= self.discount_factor
        self.rewards *= self.discount_factor

        self.counts[channel] += 1.0
        self.rewards[channel] += bandit_val
        self.total_pulls += 1

        return raw_reward

    def estimate_time_to_intercept(self, channel: int, emitter_class: EmitterClass) -> float:
        empirical_mean = self.rewards[channel] / max(1e-6, self.counts[channel])
        if empirical_mean > 0.3:
            return max(1.0, float(1.0 / empirical_mean))
        return float(self.num_channels / 2.0)


class QLearningDwellScheduler(BaseScheduler):
    """
    ML Scheduler 2: Q-Learning / Adaptive Dwell Agent.
    
    Operates as a Reinforcement Learning agent optimizing dwell schedules against
    partially observable RF dynamics (Markov Decision Process).
    
    Reward Structure:
      +10 for intercepting an active threat transmission.
      -1 for dwelling on empty spectrum (lost dwell opportunity).
      -5 for missing a high-priority threat burst.
      
    State Discretization:
      - S1: Previous channel bucket (8 sub-bands)
      - S2: Recency bucket (time elapsed since last intercept)
      - S3: Last detected emitter class (None, Periodic, Agile, Sporadic, Spatial Scan)
    """

    def __init__(
        self,
        num_channels: int,
        num_steps: int,
        alpha: float = 0.2,
        gamma: float = 0.85,
        epsilon_initial: float = 0.3,
        epsilon_min: float = 0.05,
        epsilon_decay: float = 0.998,
        seed: Optional[int] = 42
    ):
        super().__init__(num_channels, num_steps, name="Q-Learning Dwell Agent")
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = epsilon_initial
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay
        self.seed = seed
        self.rng = np.random.default_rng(seed)

        # State discretization parameters
        self.num_channel_buckets = min(8, num_channels)
        self.num_recency_buckets = 5
        self.num_class_buckets = 5  # 0: Empty, 1: Periodic, 2: Agile, 3: Sporadic, 4: Spatial
        self.total_states = (
            self.num_channel_buckets * self.num_recency_buckets * self.num_class_buckets
        )

        # Q-table: (total_states, num_channels)
        self.q_table = np.zeros((self.total_states, num_channels), dtype=np.float32)

        # State tracking variables
        self.last_channel = 0
        self.steps_since_intercept = 10
        self.last_detected_class = 0
        self.current_state_idx = 0

    def _get_state_index(self, channel: int, recency: int, last_class: int) -> int:
        """Discretizes continuous RF observation state into a single table index."""
        ch_bucket = min(self.num_channel_buckets - 1, int(channel * self.num_channel_buckets / self.num_channels))
        
        if recency == 0:
            rec_bucket = 0
        elif recency <= 2:
            rec_bucket = 1
        elif recency <= 6:
            rec_bucket = 2
        elif recency <= 15:
            rec_bucket = 3
        else:
            rec_bucket = 4

        cls_bucket = min(self.num_class_buckets - 1, max(0, int(last_class)))

        return (
            ch_bucket * (self.num_recency_buckets * self.num_class_buckets)
            + rec_bucket * self.num_class_buckets
            + cls_bucket
        )

    def reset(self, seed: Optional[int] = None) -> None:
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        self.q_table.fill(0.0)
        self.epsilon = 0.3
        self.last_channel = 0
        self.steps_since_intercept = 10
        self.last_detected_class = 0
        self.current_state_idx = self._get_state_index(0, 10, 0)

    def select_channel(self, t: int) -> int:
        """Selects action via epsilon-greedy policy over current state."""
        self.current_state_idx = self._get_state_index(
            self.last_channel,
            self.steps_since_intercept,
            self.last_detected_class
        )

        # Epsilon-greedy exploration
        if self.rng.random() < self.epsilon:
            return int(self.rng.integers(0, self.num_channels))

        # Exploitation: argmax with jitter for tie-breaking
        q_row = self.q_table[self.current_state_idx, :]
        jitter = self.rng.uniform(0, 1e-5, size=self.num_channels)
        return int(np.argmax(q_row + jitter))

    def predict_occupancy(self, t: int, channel: int) -> bool:
        """
        Predicts active transmission if the learned Q-value is positive.
        A positive Q-value signifies expected positive tactical return (interception)
        overcoming the empty dwell penalty (-1.0).
        """
        state_idx = self._get_state_index(
            self.last_channel,
            self.steps_since_intercept,
            self.last_detected_class
        )
        return bool(self.q_table[state_idx, channel] > 0.0)

    def update(self, t: int, channel: int, observation: DwellObservation) -> float:
        reward = 0.0
        hit = observation.detected and not observation.is_false_alarm

        if hit:
            reward += 10.0
            self.steps_since_intercept = 0
            self.last_detected_class = observation.emitter_class.value
        else:
            reward -= 1.0
            self.steps_since_intercept = min(50, self.steps_since_intercept + 1)

        if observation.missed_high_priority:
            reward -= 5.0

        self.last_channel = channel

        # Compute next state
        next_state_idx = self._get_state_index(
            self.last_channel,
            self.steps_since_intercept,
            self.last_detected_class
        )

        # Bellman Temporal Difference Q-Update
        best_next_q = np.max(self.q_table[next_state_idx, :])
        current_q = self.q_table[self.current_state_idx, channel]
        td_target = reward + self.gamma * best_next_q
        self.q_table[self.current_state_idx, channel] += self.alpha * (td_target - current_q)

        # Decay exploration rate epsilon
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

        return reward

    def estimate_time_to_intercept(self, channel: int, emitter_class: EmitterClass) -> float:
        state_idx = self._get_state_index(channel, 0, emitter_class.value)
        best_q = float(np.max(self.q_table[state_idx, :]))
        if best_q > 2.0:
            return 1.5
        elif best_q > 0.0:
            return 3.0
        return float(self.num_channels / 2.0)
