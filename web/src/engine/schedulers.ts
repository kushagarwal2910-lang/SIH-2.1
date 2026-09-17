/**
 * EW Receiver Interception Schedulers ported to high-performance TypeScript.
 * Exact mathematical logic matching schedulers.py.
 */

import { DwellObservation, EmitterClass, RFEnvironment, SeededRng } from './environment';

export interface SchedulerLog {
  schedulerName: string;
  actions: Int32Array;
  dwellObservations: DwellObservation[];
  rewards: Float32Array;
  detections: Uint8Array;
  falseAlarms: Uint8Array;
  detectedClasses: Uint8Array;
  predictions: Uint8Array;
}

export abstract class BaseScheduler {
  numChannels: number;
  numSteps: number;
  name: string;

  constructor(numChannels: number, numSteps: number, name: string) {
    this.numChannels = numChannels;
    this.numSteps = numSteps;
    this.name = name;
  }

  abstract reset(seed?: number): void;
  abstract selectChannel(t: number): number;
  abstract predictOccupancy(t: number, channel: number): boolean;
  abstract update(t: number, channel: number, obs: DwellObservation): number;

  estimateTimeToIntercept(channel: number, emitterClass: EmitterClass): number {
    return this.numChannels / 2.0;
  }

  runSimulation(env: RFEnvironment): SchedulerLog {
    const T = this.numSteps;
    const actions = new Int32Array(T);
    const rewards = new Float32Array(T);
    const detections = new Uint8Array(T);
    const falseAlarms = new Uint8Array(T);
    const detectedClasses = new Uint8Array(T);
    const predictions = new Uint8Array(T);
    const dwellObservations: DwellObservation[] = [];

    for (let t = 0; t < T; t++) {
      const ch = this.selectChannel(t);
      const pred = this.predictOccupancy(t, ch);
      const obs = env.step(t, ch);
      const rew = this.update(t, ch, obs);

      actions[t] = ch;
      predictions[t] = pred ? 1 : 0;
      rewards[t] = rew;
      const hit = obs.detected && !obs.isFalseAlarm;
      detections[t] = hit ? 1 : 0;
      falseAlarms[t] = obs.isFalseAlarm ? 1 : 0;
      detectedClasses[t] = hit ? obs.emitterClass : 0;
      dwellObservations.push(obs);
    }

    return {
      schedulerName: this.name,
      actions,
      dwellObservations,
      rewards,
      detections,
      falseAlarms,
      detectedClasses,
      predictions
    };
  }
}

export class SequentialSweepScheduler extends BaseScheduler {
  constructor(numChannels: number, numSteps: number) {
    super(numChannels, numSteps, 'Sequential Sweep (Baseline)');
  }

  reset(): void {}

  selectChannel(t: number): number {
    return t % this.numChannels;
  }

  predictOccupancy(): boolean {
    return false;
  }

  update(t: number, channel: number, obs: DwellObservation): number {
    let rew = 0.0;
    if (obs.detected && !obs.isFalseAlarm) {
      rew += 10.0;
    } else {
      rew -= 1.0;
    }
    if (obs.missedHighPriority) {
      rew -= 5.0;
    }
    return rew;
  }
}

export class CoPrimePeriodicSweepScheduler extends BaseScheduler {
  stride: number;

  constructor(numChannels: number, numSteps: number, primeStride = 7) {
    super(numChannels, numSteps, 'Co-Prime Sweeper (Optimal Scan)');
    this.stride = primeStride;
  }

  reset(): void {}

  selectChannel(t: number): number {
    return (t * this.stride) % this.numChannels;
  }

  predictOccupancy(): boolean {
    return false;
  }

  update(t: number, channel: number, obs: DwellObservation): number {
    let rew = 0.0;
    if (obs.detected && !obs.isFalseAlarm) {
      rew += 10.0;
    } else {
      rew -= 1.0;
    }
    if (obs.missedHighPriority) {
      rew -= 5.0;
    }
    return rew;
  }
}

export class UCB1BanditScheduler extends BaseScheduler {
  cExplore: number;
  discountFactor: number;
  predictionThreshold: number;
  rng: SeededRng;
  counts: Float64Array;
  rewardsTable: Float64Array;
  totalPulls = 0;

  constructor(
    numChannels: number,
    numSteps: number,
    cExplore = 1.414,
    discountFactor = 0.995,
    predictionThreshold = 0.15,
    seed = 42
  ) {
    super(numChannels, numSteps, 'UCB1 Bandit (ML 1)');
    this.cExplore = cExplore;
    this.discountFactor = discountFactor;
    this.predictionThreshold = predictionThreshold;
    this.rng = new SeededRng(seed);
    this.counts = new Float64Array(numChannels);
    this.rewardsTable = new Float64Array(numChannels);
  }

  reset(seed?: number): void {
    if (seed !== undefined) this.rng = new SeededRng(seed);
    this.counts.fill(0);
    this.rewardsTable.fill(0);
    this.totalPulls = 0;
  }

  selectChannel(t: number): number {
    // Force initial exploration of unvisited channels
    for (let c = 0; c < this.numChannels; c++) {
      if (this.counts[c] < 1.0) {
        return c;
      }
    }

    let bestArm = 0;
    let maxUcb = -Infinity;

    for (let c = 0; c < this.numChannels; c++) {
      const mean = this.rewardsTable[c] / Math.max(1e-6, this.counts[c]);
      const bonus = this.cExplore * Math.sqrt((2.0 * Math.log(this.totalPulls + 1.0)) / Math.max(1e-6, this.counts[c]));
      const ucb = mean + bonus + this.rng.random() * 1e-6;

      if (ucb > maxUcb) {
        maxUcb = ucb;
        bestArm = c;
      }
    }

    return bestArm;
  }

  predictOccupancy(t: number, channel: number): boolean {
    if (this.counts[channel] < 1.0) return false;
    const mean = this.rewardsTable[channel] / Math.max(1e-6, this.counts[channel]);
    return mean >= this.predictionThreshold;
  }

  update(t: number, channel: number, obs: DwellObservation): number {
    let rawRew = 0.0;
    let banditVal = 0.0;

    if (obs.detected && !obs.isFalseAlarm) {
      rawRew = 10.0;
      banditVal = 1.0;
    } else {
      rawRew = -1.0;
      banditVal = 0.0;
    }

    if (obs.missedHighPriority) {
      rawRew -= 5.0;
    }

    // Apply exponential decay for non-stationary agility
    for (let c = 0; c < this.numChannels; c++) {
      this.counts[c] *= this.discountFactor;
      this.rewardsTable[c] *= this.discountFactor;
    }

    this.counts[channel] += 1.0;
    this.rewardsTable[channel] += banditVal;
    this.totalPulls += 1;

    return rawRew;
  }

  estimateTimeToIntercept(channel: number): number {
    const mean = this.rewardsTable[channel] / Math.max(1e-6, this.counts[channel]);
    if (mean > 0.3) {
      return Math.max(1.0, 1.0 / mean);
    }
    return this.numChannels / 2.0;
  }
}

export class QLearningDwellScheduler extends BaseScheduler {
  alpha: number;
  gamma: number;
  epsilon: number;
  epsilonMin: number;
  epsilonDecay: number;
  rng: SeededRng;

  numChannelBuckets: number;
  numRecencyBuckets = 5;
  numClassBuckets = 5;
  totalStates: number;

  qTable: Float32Array; // Flattened (totalStates x numChannels)

  lastChannel = 0;
  stepsSinceIntercept = 10;
  lastDetectedClass = 0;
  currentStateIdx = 0;

  constructor(
    numChannels: number,
    numSteps: number,
    alpha = 0.2,
    gamma = 0.85,
    epsilonInitial = 0.3,
    epsilonMin = 0.05,
    epsilonDecay = 0.998,
    seed = 42
  ) {
    super(numChannels, numSteps, 'Q-Learning Dwell Agent (ML 2)');
    this.alpha = alpha;
    this.gamma = gamma;
    this.epsilon = epsilonInitial;
    this.epsilonMin = epsilonMin;
    this.epsilonDecay = epsilonDecay;
    this.rng = new SeededRng(seed);

    this.numChannelBuckets = Math.min(8, numChannels);
    this.totalStates = this.numChannelBuckets * this.numRecencyBuckets * this.numClassBuckets;
    this.qTable = new Float32Array(this.totalStates * numChannels);
    this.currentStateIdx = this.getStateIndex(0, 10, 0);
  }

  private getStateIndex(ch: number, recency: number, lastClass: number): number {
    const chBucket = Math.min(
      this.numChannelBuckets - 1,
      Math.floor((ch * this.numChannelBuckets) / this.numChannels)
    );

    let recBucket = 0;
    if (recency === 0) recBucket = 0;
    else if (recency <= 2) recBucket = 1;
    else if (recency <= 6) recBucket = 2;
    else if (recency <= 15) recBucket = 3;
    else recBucket = 4;

    const clsBucket = Math.min(this.numClassBuckets - 1, Math.max(0, lastClass));

    return (
      chBucket * (this.numRecencyBuckets * this.numClassBuckets) +
      recBucket * this.numClassBuckets +
      clsBucket
    );
  }

  reset(seed?: number): void {
    if (seed !== undefined) this.rng = new SeededRng(seed);
    this.qTable.fill(0);
    this.epsilon = 0.3;
    this.lastChannel = 0;
    this.stepsSinceIntercept = 10;
    this.lastDetectedClass = 0;
    this.currentStateIdx = this.getStateIndex(0, 10, 0);
  }

  selectChannel(t: number): number {
    this.currentStateIdx = this.getStateIndex(
      this.lastChannel,
      this.stepsSinceIntercept,
      this.lastDetectedClass
    );

    // Epsilon-greedy
    if (this.rng.random() < this.epsilon) {
      return this.rng.randomInt(0, this.numChannels);
    }

    // Argmax Q-value with tie-breaking jitter
    const offset = this.currentStateIdx * this.numChannels;
    let bestArm = 0;
    let maxQ = -Infinity;

    for (let c = 0; c < this.numChannels; c++) {
      const qVal = this.qTable[offset + c] + this.rng.random() * 1e-5;
      if (qVal > maxQ) {
        maxQ = qVal;
        bestArm = c;
      }
    }

    return bestArm;
  }

  predictOccupancy(t: number, channel: number): boolean {
    const stateIdx = this.getStateIndex(
      this.lastChannel,
      this.stepsSinceIntercept,
      this.lastDetectedClass
    );
    return this.qTable[stateIdx * this.numChannels + channel] > 0.0;
  }

  update(t: number, channel: number, obs: DwellObservation): number {
    let rew = 0.0;
    const hit = obs.detected && !obs.isFalseAlarm;

    if (hit) {
      rew += 10.0;
      this.stepsSinceIntercept = 0;
      this.lastDetectedClass = obs.emitterClass;
    } else {
      rew -= 1.0;
      this.stepsSinceIntercept = Math.min(50, this.stepsSinceIntercept + 1);
    }

    if (obs.missedHighPriority) {
      rew -= 5.0;
    }

    this.lastChannel = channel;

    const nextStateIdx = this.getStateIndex(
      this.lastChannel,
      this.stepsSinceIntercept,
      this.lastDetectedClass
    );

    // Max next Q
    const nextOffset = nextStateIdx * this.numChannels;
    let bestNextQ = -Infinity;
    for (let c = 0; c < this.numChannels; c++) {
      if (this.qTable[nextOffset + c] > bestNextQ) {
        bestNextQ = this.qTable[nextOffset + c];
      }
    }

    const currIdx = this.currentStateIdx * this.numChannels + channel;
    const currentQ = this.qTable[currIdx];
    const tdTarget = rew + this.gamma * bestNextQ;
    this.qTable[currIdx] += this.alpha * (tdTarget - currentQ);

    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);

    return rew;
  }

  estimateTimeToIntercept(channel: number, emitterClass: EmitterClass): number {
    const stateIdx = this.getStateIndex(channel, 0, emitterClass);
    let bestQ = -Infinity;
    const offset = stateIdx * this.numChannels;
    for (let c = 0; c < this.numChannels; c++) {
      if (this.qTable[offset + c] > bestQ) bestQ = this.qTable[offset + c];
    }
    if (bestQ > 2.0) return 1.5;
    if (bestQ > 0.0) return 3.0;
    return this.numChannels / 2.0;
  }
}
