/**
 * RF Environment and Threat Emitter Simulator for Electronic Warfare (EW).
 * Ported from environment.py with 100% mathematical fidelity.
 */

export enum EmitterClass {
  EMPTY = 0,
  PERIODIC = 1,
  AGILE = 2,
  SPORADIC = 3,
  SPATIAL_SCAN = 4
}

export interface BurstEvent {
  eventId: number;
  emitterClass: EmitterClass;
  channel: number;
  startStep: number;
  endStep: number;
  duration: number;
  isHighPriority: boolean;
  revisitPeriod?: number;
}

export interface DwellObservation {
  step: number;
  channel: number;
  detected: boolean;
  emitterPresent: boolean;
  emitterClass: EmitterClass;
  isFalseAlarm: boolean;
  missedHighPriority: boolean;
  receivedPowerDbm: number;
  snrDb: number;
  groundTruthActiveChannels: number[];
}

export interface RFEnvironmentConfig {
  numChannels: number;
  numSteps: number;
  pFaAmbient: number;
  pDNominal: number;
  seed: number;

  // Physical Sensor Parameters
  receiverMdsDbm: number;
  noiseFloorDbm: number;
  nominalSignalSnrDb: number;

  // Class 1: Periodic Emitters
  numPeriodic: number;
  periodicPris: number[];
  periodicPws: number[];

  // Class 2: Agile Emitters
  numAgile: number;
  agileDwellSteps: number;

  // Class 3: Sporadic High-Threat Bursts
  sporadicBurstProb: number;
  sporadicMinDuration: number;
  sporadicMaxDuration: number;

  // Class 4: Spatially Scanning Radar
  numSpatial: number;
  spatialRotationPeriod: number;
  spatialBeamDwell: number;
}

export const DEFAULT_CONFIG: RFEnvironmentConfig = {
  numChannels: 32,
  numSteps: 1000,
  pFaAmbient: 0.02,
  pDNominal: 0.98,
  seed: 42,

  receiverMdsDbm: -95.0,
  noiseFloorDbm: -105.0,
  nominalSignalSnrDb: 14.0,

  numPeriodic: 3,
  periodicPris: [12, 18, 25],
  periodicPws: [2, 3, 2],

  numAgile: 2,
  agileDwellSteps: 3,

  sporadicBurstProb: 0.015,
  sporadicMinDuration: 3,
  sporadicMaxDuration: 8,

  numSpatial: 1,
  spatialRotationPeriod: 40,
  spatialBeamDwell: 4
};

// Deterministic PRNG (Mulberry32)
export class SeededRng {
  private s: number;

  constructor(seed: number) {
    this.s = Math.floor(seed) >>> 0;
    if (this.s === 0) this.s = 1;
  }

  random(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  randomRange(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.randomRange(min, max));
  }

  normal(mean = 0, std = 1): number {
    // Box-Muller transform
    const u = 1 - this.random();
    const v = this.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * std;
  }
}

export class RFEnvironment {
  config: RFEnvironmentConfig;
  rng: SeededRng;
  groundTruth: Uint8Array; // Flattened 1D array representing (T x C)
  burstEvents: BurstEvent[] = [];

  constructor(config: RFEnvironmentConfig) {
    this.config = config;
    this.rng = new SeededRng(config.seed);
    this.groundTruth = new Uint8Array(config.numSteps * config.numChannels);
    this.generateGroundTruth();
  }

  private setCell(t: number, c: number, val: EmitterClass) {
    this.groundTruth[t * this.config.numChannels + c] = val;
  }

  public getCell(t: number, c: number): EmitterClass {
    return this.groundTruth[t * this.config.numChannels + c];
  }

  private generateGroundTruth(): void {
    const T = this.config.numSteps;
    const C = this.config.numChannels;
    let eventCounter = 0;

    // 1. Class 1: Fixed-Frequency Periodic Emitters (Surveillance Radars)
    const step = Math.max(1, Math.floor(C / (this.config.numPeriodic + 2)));
    const periodicChannels = Array.from({ length: this.config.numPeriodic }, (_, i) =>
      Math.min(C - 1, (i + 1) * step)
    );

    const pris = this.config.periodicPris;
    const pws = this.config.periodicPws;

    periodicChannels.forEach((ch, idx) => {
      const pri = pris[idx % pris.length];
      const pw = Math.max(1, Math.min(pws[idx % pws.length], pri - 1));
      const phase = this.rng.randomInt(0, pri);

      let curr = phase;
      while (curr < T) {
        const burstEnd = Math.min(T, curr + pw);
        for (let t = curr; t < burstEnd; t++) {
          this.setCell(t, ch, EmitterClass.PERIODIC);
        }

        this.burstEvents.push({
          eventId: eventCounter++,
          emitterClass: EmitterClass.PERIODIC,
          channel: ch,
          startStep: curr,
          endStep: burstEnd,
          duration: burstEnd - curr,
          isHighPriority: false,
          revisitPeriod: pri
        });
        curr += pri;
      }
    });

    // 2. Class 4: Spatially Scanning Radar (Rotating Antenna Beam)
    if (this.config.numSpatial > 0) {
      const spatialChannel = Math.max(1, Math.floor(C / 3));
      const tRot = this.config.spatialRotationPeriod;
      const tBeam = this.config.spatialBeamDwell;
      const initPhase = this.rng.randomInt(0, tRot);

      let curr = initPhase;
      while (curr < T) {
        const illumEnd = Math.min(T, curr + tBeam);
        for (let t = curr; t < illumEnd; t++) {
          if (this.getCell(t, spatialChannel) === EmitterClass.EMPTY) {
            this.setCell(t, spatialChannel, EmitterClass.SPATIAL_SCAN);
          }
        }

        this.burstEvents.push({
          eventId: eventCounter++,
          emitterClass: EmitterClass.SPATIAL_SCAN,
          channel: spatialChannel,
          startStep: curr,
          endStep: illumEnd,
          duration: illumEnd - curr,
          isHighPriority: false,
          revisitPeriod: tRot
        });
        curr += tRot;
      }
    }

    // 3. Class 2: Frequency-Agile / Hopping Emitters (FHSS)
    const halfC = Math.floor(C / 2);
    const subBand1 = Array.from({ length: 8 }, (_, i) => Math.max(0, Math.min(C - 1, halfC - 4 + i)));
    const subBand2 = Array.from({ length: 8 }, (_, i) => Math.max(0, C - 8 + i));
    const agileBands = [subBand1, subBand2];

    for (let agIdx = 0; agIdx < this.config.numAgile; agIdx++) {
      const band = agileBands[agIdx % agileBands.length];
      let t = 0;
      while (t < T) {
        const ch = band[this.rng.randomInt(0, band.length)];
        const dur = Math.max(1, this.config.agileDwellSteps + this.rng.randomInt(-1, 2));
        const endT = Math.min(T, t + dur);

        for (let stepT = t; stepT < endT; stepT++) {
          if (this.getCell(stepT, ch) === EmitterClass.EMPTY) {
            this.setCell(stepT, ch, EmitterClass.AGILE);
          }
        }

        this.burstEvents.push({
          eventId: eventCounter++,
          emitterClass: EmitterClass.AGILE,
          channel: ch,
          startStep: t,
          endStep: endT,
          duration: endT - t,
          isHighPriority: false
        });
        t = endT;
      }
    }

    // 4. Class 3: Sporadic / Burst Emitters (High-Priority Threat / Missile Guidance)
    const sporadicChannels = [Math.floor(C / 4), Math.floor((3 * C) / 4)];
    const pBurst = this.config.sporadicBurstProb;
    const minDur = this.config.sporadicMinDuration;
    const maxDur = Math.max(minDur, this.config.sporadicMaxDuration);

    sporadicChannels.forEach((ch) => {
      let t = this.rng.randomInt(5, 20);
      while (t < T - minDur) {
        if (this.rng.random() < pBurst) {
          const dur = this.rng.randomInt(minDur, maxDur + 1);
          const endT = Math.min(T, t + dur);

          for (let stepT = t; stepT < endT; stepT++) {
            this.setCell(stepT, ch, EmitterClass.SPORADIC);
          }

          this.burstEvents.push({
            eventId: eventCounter++,
            emitterClass: EmitterClass.SPORADIC,
            channel: ch,
            startStep: t,
            endStep: endT,
            duration: endT - t,
            isHighPriority: true
          });
          t = endT + this.rng.randomInt(30, 80);
        } else {
          t += 1;
        }
      }
    });
  }

  public step(t: number, channel: number): DwellObservation {
    const C = this.config.numChannels;
    const activeChannels: number[] = [];
    let sporadicActive = false;

    for (let c = 0; c < C; c++) {
      const val = this.getCell(t, c);
      if (val > 0) activeChannels.push(c);
      if (val === EmitterClass.SPORADIC) sporadicActive = true;
    }

    const trueVal = this.getCell(t, channel);
    const emitterPresent = trueVal > 0;
    const emitterClass = trueVal as EmitterClass;

    let detected = false;
    let isFalseAlarm = false;
    let rxPowerDbm = -110.0;
    let snrDb = 0.0;

    if (emitterPresent) {
      const fading = this.rng.normal(0, 1.2);
      snrDb = this.config.nominalSignalSnrDb + fading;
      rxPowerDbm = this.config.noiseFloorDbm + snrDb;

      if (rxPowerDbm >= this.config.receiverMdsDbm) {
        if (this.rng.random() <= this.config.pDNominal) {
          detected = true;
        }
      }
    } else {
      rxPowerDbm = this.config.noiseFloorDbm + this.rng.normal(0, 1.0);
      if (this.rng.random() <= this.config.pFaAmbient) {
        detected = true;
        isFalseAlarm = true;
      }
    }

    let missedHighPriority = false;
    if (sporadicActive) {
      if (!(detected && emitterClass === EmitterClass.SPORADIC)) {
        missedHighPriority = true;
      }
    }

    return {
      step: t,
      channel,
      detected,
      emitterPresent,
      emitterClass,
      isFalseAlarm,
      missedHighPriority,
      receivedPowerDbm: rxPowerDbm,
      snrDb,
      groundTruthActiveChannels: activeChannels
    };
  }
}
