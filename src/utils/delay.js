import { sleep } from './download.js';

/**
 * Compute a human-like delay around a base interval.
 * Uses ±jitter plus an occasional longer pause so request timing looks less robotic.
 *
 * @param {number} baseMs
 * @param {{
 *   minFactor?: number,
 *   maxFactor?: number,
 *   pauseChance?: number,
 *   pauseMinMs?: number,
 *   pauseMaxMs?: number,
 * }} [options]
 * @returns {number}
 */
export function jitterMs(baseMs, options = {}) {
  const base = Math.max(0, Number(baseMs) || 0);
  if (base <= 0) return 0;

  const minFactor = Number.isFinite(options.minFactor) ? options.minFactor : 0.7;
  const maxFactor = Number.isFinite(options.maxFactor) ? options.maxFactor : 1.65;
  const span = Math.max(0, maxFactor - minFactor);
  let ms = Math.round(base * (minFactor + Math.random() * span));

  const pauseChance = Number.isFinite(options.pauseChance)
    ? options.pauseChance
    : 0.12;
  if (Math.random() < pauseChance) {
    const pauseMin = Number.isFinite(options.pauseMinMs) ? options.pauseMinMs : 350;
    const pauseMax = Number.isFinite(options.pauseMaxMs) ? options.pauseMaxMs : 1400;
    ms += Math.round(
      pauseMin + Math.random() * Math.max(0, pauseMax - pauseMin),
    );
  }

  return Math.max(0, ms);
}

/**
 * Sleep for a jittered duration around `baseMs`.
 * @param {number} baseMs
 * @param {Parameters<typeof jitterMs>[1]} [options]
 * @returns {Promise<void>}
 */
export function sleepJitter(baseMs, options) {
  return sleep(jitterMs(baseMs, options));
}
