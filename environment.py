"""
RF Environment and Threat Emitter Simulator for Electronic Warfare (EW).

Models a discrete multi-channel RF spectrum over time steps with:
- Class 1: Fixed-Frequency Periodic Emitters (regular PRI and pulse width).
- Class 2: Frequency-Agile / Fast-Hopping Emitters (FHSS across designated sub-bands).
- Class 3: Sporadic / Burst Emitters (low duty-cycle, high-priority pop-up threats).
- Class 4: Spatially Scanning Radars (rotating directional antenna beam with mainlobe sweep).
- Physical receiver parameters: Minimum Detectable Signal (MDS in dBm), nominal SNR, and noise floor.
- Instantaneous bandwidth constraints (dwells on exactly ONE channel per time step).
- Thermal noise injection and false alarm generation.
"""

from dataclasses import dataclass, field
from enum import IntEnum
from typing import List, Dict, Any, Optional, Tuple
import numpy as np


class EmitterClass(IntEnum):
    """Enumeration of tactical emitter threat classes."""
    EMPTY = 0
    PERIODIC = 1
    AGILE = 2
    SPORADIC = 3
    SPATIAL_SCAN = 4


@dataclass
class BurstEvent:
    """Ground truth record of a continuous RF burst, pulse train, or mainlobe dwell event."""
    event_id: int
    emitter_class: EmitterClass
    channel: int
    start_step: int
    end_step: int
    duration: int
    is_high_priority: bool = False
    revisit_period: Optional[int] = None  # e.g., PRI or antenna rotation period


@dataclass
class DwellObservation:
    """Receiver measurement obtained from dwelling on a specific channel at time t."""
    step: int
    channel: int
    detected: bool
    emitter_present: bool
    emitter_class: EmitterClass
    is_false_alarm: bool
    missed_high_priority: bool
    received_power_dbm: float = -110.0
    snr_db: float = 0.0
    ground_truth_active_channels: List[int] = field(default_factory=list)


@dataclass
class RFEnvironmentConfig:
    """Configuration parameters for the RF environment simulation."""
    num_channels: int = 32
    num_steps: int = 1000
    p_fa_ambient: float = 0.02
    p_d_nominal: float = 0.98
    seed: Optional[int] = 42

    # Physical Sensor Sensitivity Parameters
    receiver_mds_dbm: float = -95.0      # Minimum Detectable Signal in dBm
    noise_floor_dbm: float = -105.0      # Thermal noise floor (kTB + Noise Figure)
    nominal_signal_snr_db: float = 14.0  # Nominal received SNR in mainlobe

    # Class 1: Periodic Emitter configuration overrides
    num_periodic: int = 3
    periodic_pris: List[int] = field(default_factory=lambda: [12, 18, 25])
    periodic_pws: List[int] = field(default_factory=lambda: [2, 3, 2])
    periodic_channels: Optional[List[int]] = None

    # Class 2: Agile / Hopping Emitters
    num_agile: int = 2
    agile_sub_bands: Optional[List[List[int]]] = None
    agile_dwell_steps: int = 3

    # Class 3: Sporadic / Burst Emitters
    sporadic_channels: Optional[List[int]] = None
    sporadic_burst_prob: float = 0.015
    sporadic_min_duration: int = 4
    sporadic_max_duration: int = 8

    # Class 4: Spatially Scanning Radar (Rotating Antenna Beam)
    num_spatial: int = 1
    spatial_rotation_periods: List[int] = field(default_factory=lambda: [45])  # 360-degree scan period
    spatial_beam_dwells: List[int] = field(default_factory=lambda: [4])       # Mainlobe illumination dwell
    spatial_channels: Optional[List[int]] = None


class RFEnvironment:
    """
    Discrete-time, discrete-frequency RF Electronic Support (ES) Environment.
    
    Generates realistic ground-truth RF activity matrix (T x C) and simulates
    instantaneous receiver dwells subject to thermal noise, directional antenna beam sweeps,
    and physical receiver sensitivity constraints.
    """

    def __init__(self, config: RFEnvironmentConfig):
        if config.num_channels < 4:
            raise ValueError("num_channels must be at least 4.")
        if config.num_steps < 10:
            raise ValueError("num_steps must be at least 10.")
        if not (0.0 <= config.p_fa_ambient <= 1.0):
            raise ValueError("p_fa_ambient must be within [0.0, 1.0].")
        if not (0.0 <= config.p_d_nominal <= 1.0):
            raise ValueError("p_d_nominal must be within [0.0, 1.0].")

        self.config = config
        self.rng = np.random.default_rng(config.seed)

        # Ground truth tensor: T x C, stores EmitterClass values (0..4)
        self.ground_truth = np.zeros((config.num_steps, config.num_channels), dtype=np.int8)
        self.burst_events: List[BurstEvent] = []
        self._generate_ground_truth()

    def _generate_ground_truth(self) -> None:
        """Procedurally populates the ground-truth matrix and indexes discrete burst events."""
        T = self.config.num_steps
        C = self.config.num_channels
        event_counter = 0

        # -------------------------------------------------------------
        # 1. Class 1: Fixed-Frequency Periodic Emitters (Surveillance Radars)
        # -------------------------------------------------------------
        periodic_channels = self.config.periodic_channels
        if periodic_channels is None:
            step = max(1, C // (self.config.num_periodic + 2))
            periodic_channels = [min(C - 1, (i + 1) * step) for i in range(self.config.num_periodic)]

        pris = self.config.periodic_pris
        pws = self.config.periodic_pws

        for idx, ch in enumerate(periodic_channels):
            pri = pris[idx % len(pris)]
            pw = max(1, min(pws[idx % len(pws)], pri - 1))
            phase = int(self.rng.integers(0, pri))

            curr_step = phase
            while curr_step < T:
                burst_end = min(T, curr_step + pw)
                self.ground_truth[curr_step:burst_end, ch] = EmitterClass.PERIODIC
                
                self.burst_events.append(
                    BurstEvent(
                        event_id=event_counter,
                        emitter_class=EmitterClass.PERIODIC,
                        channel=ch,
                        start_step=curr_step,
                        end_step=burst_end,
                        duration=burst_end - curr_step,
                        is_high_priority=False,
                        revisit_period=pri
                    )
                )
                event_counter += 1
                curr_step += pri

        # -------------------------------------------------------------
        # 2. Class 4: Spatially Scanning Radar (Rotating Antenna Mainlobe Sweep)
        # -------------------------------------------------------------
        if self.config.num_spatial > 0:
            spatial_channels = self.config.spatial_channels
            if spatial_channels is None:
                spatial_channels = [max(1, C // 3)]
            
            rot_periods = self.config.spatial_rotation_periods
            beam_dwells = self.config.spatial_beam_dwells

            for idx, ch in enumerate(spatial_channels):
                t_rot = rot_periods[idx % len(rot_periods)]
                t_beam = max(1, beam_dwells[idx % len(beam_dwells)])
                init_phase = int(self.rng.integers(0, t_rot))

                curr_step = init_phase
                while curr_step < T:
                    illum_end = min(T, curr_step + t_beam)
                    # Mainlobe illumination creates a burst on channel ch
                    mask = self.ground_truth[curr_step:illum_end, ch] == EmitterClass.EMPTY
                    self.ground_truth[curr_step:illum_end, ch][mask] = EmitterClass.SPATIAL_SCAN

                    self.burst_events.append(
                        BurstEvent(
                            event_id=event_counter,
                            emitter_class=EmitterClass.SPATIAL_SCAN,
                            channel=ch,
                            start_step=curr_step,
                            end_step=illum_end,
                            duration=illum_end - curr_step,
                            is_high_priority=False,
                            revisit_period=t_rot
                        )
                    )
                    event_counter += 1
                    curr_step += t_rot

        # -------------------------------------------------------------
        # 3. Class 2: Frequency-Agile / Hopping Emitters (FHSS Comms / Agile Radars)
        # -------------------------------------------------------------
        agile_bands = self.config.agile_sub_bands
        if agile_bands is None:
            agile_bands = []
            half_c = C // 2
            sub_band_1 = list(range(max(0, half_c - 4), min(C, half_c + 4)))
            sub_band_2 = list(range(max(0, C - 8), C))
            agile_bands.append(sub_band_1 if len(sub_band_1) > 0 else list(range(C)))
            if self.config.num_agile > 1:
                agile_bands.append(sub_band_2 if len(sub_band_2) > 0 else list(range(C)))

        hop_dwell = max(1, self.config.agile_dwell_steps)

        for ag_idx in range(self.config.num_agile):
            band = agile_bands[ag_idx % len(agile_bands)]
            if not band:
                band = list(range(C))
            
            t = 0
            while t < T:
                ch = int(self.rng.choice(band))
                dur = int(hop_dwell + self.rng.integers(-1, 2))
                dur = max(1, dur)
                end_t = min(T, t + dur)

                mask = self.ground_truth[t:end_t, ch] == EmitterClass.EMPTY
                self.ground_truth[t:end_t, ch][mask] = EmitterClass.AGILE

                self.burst_events.append(
                    BurstEvent(
                        event_id=event_counter,
                        emitter_class=EmitterClass.AGILE,
                        channel=ch,
                        start_step=t,
                        end_step=end_t,
                        duration=end_t - t,
                        is_high_priority=False
                    )
                )
                event_counter += 1
                t = end_t

        # -------------------------------------------------------------
        # 4. Class 3: Sporadic / Burst Emitters (High-Priority Threat / Missile Guidance)
        # -------------------------------------------------------------
        sporadic_channels = self.config.sporadic_channels
        if sporadic_channels is None:
            sporadic_channels = [C // 4, (3 * C) // 4]

        p_burst = self.config.sporadic_burst_prob
        min_dur = self.config.sporadic_min_duration
        max_dur = max(min_dur, self.config.sporadic_max_duration)

        for ch in sporadic_channels:
            t = int(self.rng.integers(5, 20))
            while t < T - min_dur:
                if self.rng.random() < p_burst:
                    dur = int(self.rng.integers(min_dur, max_dur + 1))
                    end_t = min(T, t + dur)
                    # Class 3 overrides lower priority ground truth
                    self.ground_truth[t:end_t, ch] = EmitterClass.SPORADIC

                    self.burst_events.append(
                        BurstEvent(
                            event_id=event_counter,
                            emitter_class=EmitterClass.SPORADIC,
                            channel=ch,
                            start_step=t,
                            end_step=end_t,
                            duration=end_t - t,
                            is_high_priority=True
                        )
                    )
                    event_counter += 1
                    t = end_t + int(self.rng.integers(30, 80))
                else:
                    t += 1

    def get_ground_truth_matrix(self) -> np.ndarray:
        """Returns the (num_steps, num_channels) ground truth matrix."""
        return self.ground_truth

    def get_burst_events(self) -> List[BurstEvent]:
        """Returns the comprehensive list of discrete burst events."""
        return self.burst_events

    def step(self, t: int, channel: int) -> DwellObservation:
        """
        Simulate an instantaneous receiver dwell on a single channel at time step t.
        
        Evaluates presence of active emitter, physical SNR / receiver sensitivity (MDS),
        thermal false alarms, and missed high-priority threat bursts.
        """
        if not (0 <= t < self.config.num_steps):
            raise IndexError(f"Time step {t} out of range [0, {self.config.num_steps}).")
        if not (0 <= channel < self.config.num_channels):
            raise IndexError(f"Channel {channel} out of range [0, {self.config.num_channels}).")

        slice_t = self.ground_truth[t, :]
        active_channels = np.where(slice_t > 0)[0].tolist()

        true_emitter_val = slice_t[channel]
        emitter_present = bool(true_emitter_val > 0)
        emitter_class = EmitterClass(true_emitter_val)

        detected = False
        is_false_alarm = False

        if emitter_present:
            # Nominal SNR with slight shadow fading/scintillation
            fading = float(self.rng.normal(0.0, 1.2))
            snr_db = self.config.nominal_signal_snr_db + fading
            rx_power_dbm = self.config.noise_floor_dbm + snr_db

            # Detection governed by receiver sensitivity threshold (MDS) & nominal P_d
            if rx_power_dbm >= self.config.receiver_mds_dbm:
                if self.rng.random() <= self.config.p_d_nominal:
                    detected = True
        else:
            # Thermal noise floor
            noise_power = self.config.noise_floor_dbm + float(self.rng.normal(0.0, 1.0))
            rx_power_dbm = noise_power
            snr_db = 0.0

            # Empty channel dwell subject to thermal noise false alarms
            if self.rng.random() <= self.config.p_fa_ambient:
                detected = True
                is_false_alarm = True

        # Check if an active high-priority (Class 3 Sporadic) threat was transmitting elsewhere
        active_sporadic = np.where(slice_t == EmitterClass.SPORADIC)[0]
        missed_high_priority = False
        if len(active_sporadic) > 0:
            if not (detected and emitter_class == EmitterClass.SPORADIC):
                missed_high_priority = True

        return DwellObservation(
            step=t,
            channel=channel,
            detected=detected,
            emitter_present=emitter_present,
            emitter_class=emitter_class,
            is_false_alarm=is_false_alarm,
            missed_high_priority=missed_high_priority,
            received_power_dbm=rx_power_dbm,
            snr_db=snr_db,
            ground_truth_active_channels=active_channels
        )
