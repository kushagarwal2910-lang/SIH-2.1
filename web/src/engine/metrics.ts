/**
 * Electronic Support (ES) Figures of Merit Engine in TypeScript.
 * Fulfills all SIH requirements with full mathematical rigor.
 */

import { BurstEvent, EmitterClass, RFEnvironment } from './environment';
import { BaseScheduler, SchedulerLog } from './schedulers';

export interface BurstInterceptRecord {
  eventId: number;
  emitterClass: EmitterClass;
  channel: number;
  startStep: number;
  endStep: number;
  duration: number;
  isHighPriority: boolean;
  intercepted: boolean;
  interceptStep?: number;
  timeToIntercept?: number;
  predictedTimeToIntercept: number;
  interceptTimeError?: number;
}

export interface SchedulerPerformanceMetrics {
  schedulerName: string;
  totalSteps: number;
  totalTransmissionsGroundTruth: number;
  totalDetections: number;
  totalFalseAlarms: number;
  totalEmptyDwells: number;

  // Detection probabilities
  pDSlot: number;
  pDPeriodic: number;
  pDAgile: number;
  pDSporadic: number;
  pDSpatial: number;
  pDBurstOverall: number;

  pFa: number;
  receiverSensitivityMdsDbm: number;
  averageInterceptRate: number; // /100 epochs

  // SIH Specific Metrics
  percentageCorrectPredictions: number;
  averageInterceptTimeError: number;

  // Latencies
  meanTti: number;
  medianTti: number;
  maxTti: number;
  ttiPeriodic: number;
  ttiAgile: number;
  ttiSporadic: number;
  ttiSpatial: number;

  interceptionEfficiencyRatio: number;
  totalReward: number;
  meanRewardPerStep: number;
  highPriorityMissedCount: number;

  burstRecords: BurstInterceptRecord[];
}

export class MetricsEngine {
  env: RFEnvironment;
  groundTruth: Uint8Array;
  burstEvents: BurstEvent[];
  numSteps: number;
  numChannels: number;

  constructor(env: RFEnvironment) {
    this.env = env;
    this.groundTruth = env.groundTruth;
    this.burstEvents = env.burstEvents;
    this.numSteps = env.config.numSteps;
    this.numChannels = env.config.numChannels;
  }

  evaluateScheduler(
    log: SchedulerLog,
    schedulerObj?: BaseScheduler,
    baselineDetections?: number
  ): SchedulerPerformanceMetrics {
    const T = this.numSteps;
    const C = this.numChannels;

    let totalGtSlots = 0;
    let gtPeriodicSlots = 0;
    let gtAgileSlots = 0;
    let gtSporadicSlots = 0;
    let gtSpatialSlots = 0;

    for (let t = 0; t < T; t++) {
      for (let c = 0; c < C; c++) {
        const val = this.env.getCell(t, c);
        if (val > 0) totalGtSlots++;
        if (val === EmitterClass.PERIODIC) gtPeriodicSlots++;
        else if (val === EmitterClass.AGILE) gtAgileSlots++;
        else if (val === EmitterClass.SPORADIC) gtSporadicSlots++;
        else if (val === EmitterClass.SPATIAL_SCAN) gtSpatialSlots++;
      }
    }

    let totalDetections = 0;
    let totalFalseAlarms = 0;
    let detectedPeriodic = 0;
    let detectedAgile = 0;
    let detectedSporadic = 0;
    let detectedSpatial = 0;

    let totalEmptyDwells = 0;
    let correctPredictions = 0;

    for (let t = 0; t < T; t++) {
      const ch = log.actions[t];
      const isHit = log.detections[t] === 1;
      const isFa = log.falseAlarms[t] === 1;
      const trueVal = this.env.getCell(t, ch);
      const trueOccupied = trueVal > 0;

      if (isHit) totalDetections++;
      if (isFa) totalFalseAlarms++;
      if (!trueOccupied) totalEmptyDwells++;

      if (isHit) {
        const cls = log.detectedClasses[t] as EmitterClass;
        if (cls === EmitterClass.PERIODIC) detectedPeriodic++;
        else if (cls === EmitterClass.AGILE) detectedAgile++;
        else if (cls === EmitterClass.SPORADIC) detectedSporadic++;
        else if (cls === EmitterClass.SPATIAL_SCAN) detectedSpatial++;
      }

      const predOccupied = log.predictions[t] === 1;
      if (predOccupied === trueOccupied) {
        correctPredictions++;
      }
    }

    const pDSlot = totalDetections / Math.max(1, totalGtSlots);
    const pDPeriodic = detectedPeriodic / Math.max(1, gtPeriodicSlots);
    const pDAgile = detectedAgile / Math.max(1, gtAgileSlots);
    const pDSporadic = detectedSporadic / Math.max(1, gtSporadicSlots);
    const pDSpatial = detectedSpatial / Math.max(1, gtSpatialSlots);
    const pFa = totalFalseAlarms / Math.max(1, totalEmptyDwells);

    const percentageCorrectPredictions = (correctPredictions / Math.max(1, T)) * 100.0;
    const averageInterceptRate = (totalDetections / Math.max(1, T)) * 100.0;

    // Burst-level analysis
    const burstRecords: BurstInterceptRecord[] = [];
    const ttisAll: number[] = [];
    const ttisPeriodic: number[] = [];
    const ttisAgile: number[] = [];
    const ttisSporadic: number[] = [];
    const ttisSpatial: number[] = [];
    const timeErrors: number[] = [];
    let interceptedBurstCount = 0;

    for (const b of this.burstEvents) {
      let intercepted = false;
      let interceptStep: number | undefined;
      let tti: number | undefined;
      const predTti = schedulerObj
        ? schedulerObj.estimateTimeToIntercept(b.channel, b.emitterClass)
        : C / 2.0;
      let err: number | undefined;

      for (let t = b.startStep; t < b.endStep; t++) {
        if (log.actions[t] === b.channel && log.detections[t] === 1) {
          intercepted = true;
          interceptStep = t;
          tti = t - b.startStep;
          err = Math.abs(predTti - tti);
          break;
        }
      }

      if (intercepted && tti !== undefined) {
        interceptedBurstCount++;
        ttisAll.push(tti);
        if (err !== undefined) timeErrors.push(err);

        if (b.emitterClass === EmitterClass.PERIODIC) ttisPeriodic.push(tti);
        else if (b.emitterClass === EmitterClass.AGILE) ttisAgile.push(tti);
        else if (b.emitterClass === EmitterClass.SPORADIC) ttisSporadic.push(tti);
        else if (b.emitterClass === EmitterClass.SPATIAL_SCAN) ttisSpatial.push(tti);
      }

      burstRecords.push({
        eventId: b.eventId,
        emitterClass: b.emitterClass,
        channel: b.channel,
        startStep: b.startStep,
        endStep: b.endStep,
        duration: b.duration,
        isHighPriority: b.isHighPriority,
        intercepted,
        interceptStep,
        timeToIntercept: tti,
        predictedTimeToIntercept: predTti,
        interceptTimeError: err
      });
    }

    const pDBurstOverall = interceptedBurstCount / Math.max(1, this.burstEvents.length);
    const avgTimeError =
      timeErrors.length > 0
        ? timeErrors.reduce((a, b) => a + b, 0) / timeErrors.length
        : 0.0;

    const mean = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0.0);
    const median = (arr: number[]) => {
      if (arr.length === 0) return 0.0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2.0;
    };

    const meanTti = mean(ttisAll);
    const medianTti = median(ttisAll);
    const maxTti = ttisAll.length > 0 ? Math.max(...ttisAll) : 0;
    const ttiPeriodic = mean(ttisPeriodic);
    const ttiAgile = mean(ttisAgile);
    const ttiSporadic = mean(ttisSporadic);
    const ttiSpatial = mean(ttisSpatial);

    const baseDet = baselineDetections !== undefined ? baselineDetections : totalDetections;
    const efficiencyRatio = totalDetections / Math.max(1, baseDet);

    let totalReward = 0;
    for (let t = 0; t < T; t++) totalReward += log.rewards[t];
    const meanReward = totalReward / T;

    let missedHpCount = 0;
    for (const obs of log.dwellObservations) {
      if (obs.missedHighPriority) missedHpCount++;
    }

    return {
      schedulerName: log.schedulerName,
      totalSteps: T,
      totalTransmissionsGroundTruth: totalGtSlots,
      totalDetections,
      totalFalseAlarms,
      totalEmptyDwells,
      pDSlot,
      pDPeriodic,
      pDAgile,
      pDSporadic,
      pDSpatial,
      pDBurstOverall,
      pFa,
      receiverSensitivityMdsDbm: this.env.config.receiverMdsDbm,
      averageInterceptRate,
      percentageCorrectPredictions,
      averageInterceptTimeError: avgTimeError,
      meanTti,
      medianTti,
      maxTti,
      ttiPeriodic,
      ttiAgile,
      ttiSporadic,
      ttiSpatial,
      interceptionEfficiencyRatio: efficiencyRatio,
      totalReward,
      meanRewardPerStep: meanReward,
      highPriorityMissedCount: missedHpCount,
      burstRecords
    };
  }

  computeTtiCdf(
    metricsMap: Record<string, SchedulerPerformanceMetrics>,
    maxLatency = 15
  ): { latencies: number[]; curves: Record<string, number[]> } {
    const totalBursts = Math.max(1, this.burstEvents.length);
    const latencies = Array.from({ length: maxLatency + 1 }, (_, i) => i);
    const curves: Record<string, number[]> = {};

    for (const [name, metrics] of Object.entries(metricsMap)) {
      const validTtis = metrics.burstRecords
        .filter((r) => r.intercepted && r.timeToIntercept !== undefined)
        .map((r) => r.timeToIntercept as number);

      const curve: number[] = [];
      for (const tau of latencies) {
        const count = validTtis.filter((tti) => tti <= tau).length;
        curve.push(count / totalBursts);
      }
      curves[name] = curve;
    }

    return { latencies, curves };
  }

  computeWileyRichards(
    stepsRange: number[],
    meanBurstDur = 4.0,
    emitterCycle = 40.0
  ): number[] {
    const singleProb = Math.min(1.0, meanBurstDur / Math.max(1, this.numChannels));
    return stepsRange.map((t) => {
      const scans = Math.max(1.0, t / Math.max(1.0, emitterCycle));
      const pCum = 1.0 - Math.pow(Math.max(0.0, 1.0 - singleProb), scans);
      return Math.min(1.0, Math.max(0.0, pCum));
    });
  }
}
