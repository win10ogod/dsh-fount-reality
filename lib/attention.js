const WIDTH = 32
const HEIGHT = 18

export async function thumbnail(png, sharpFactory) {
  const sharp = sharpFactory || (await import('sharp')).default
  return sharp(png).resize(WIDTH, HEIGHT, { fit: 'fill' }).greyscale().raw().toBuffer()
}

export function visualDifference(left, right) {
  if (!left || !right || left.length !== right.length || left.length === 0)
    throw new Error('attention thumbnails must have equal, non-empty dimensions')
  let sum = 0
  for (let index = 0; index < left.length; index++) sum += Math.abs(left[index] - right[index])
  return sum / (left.length * 255)
}

export class AttentionGate {
  constructor({ noveltyThreshold = 0.06, stableThreshold = 0.025, stableSamples = 3, maxBurstSamples = 24, minWakeGapMs = 5 * 60_000, motionCooldownMs = 60_000 } = {}) {
    this.noveltyThreshold = noveltyThreshold
    this.stableThreshold = stableThreshold
    this.stableSamples = stableSamples
    this.maxBurstSamples = maxBurstSamples
    this.minWakeGapMs = minWakeGapMs
    this.motionCooldownMs = motionCooldownMs
    this.baseline = null
    this.pending = null
    this.mode = 'idle'
    this.lastWakeAt = -Infinity
    this.suppressedUntil = -Infinity
  }

  observe(pixels, now = Date.now()) {
    if (!this.baseline) {
      this.baseline = Buffer.from(pixels)
      return { action: 'sample', mode: 'idle' }
    }
    if (now < this.suppressedUntil || now - this.lastWakeAt < this.minWakeGapMs)
      return { action: 'sample', mode: 'idle' }

    const novelty = visualDifference(this.baseline, pixels)
    if (this.mode === 'idle') {
      if (novelty < this.noveltyThreshold) return { action: 'sample', mode: 'idle' }
      this.mode = 'burst'
      this.pending = { pixels: Buffer.from(pixels), stable: 1, total: 1 }
      return { action: 'burst', mode: 'burst', novelty }
    }

    this.pending.total++
    if (visualDifference(this.pending.pixels, pixels) <= this.stableThreshold) this.pending.stable++
    else { this.pending.pixels = Buffer.from(pixels); this.pending.stable = 1 }

    if (this.pending.stable >= this.stableSamples && novelty >= this.noveltyThreshold) {
      this.baseline = Buffer.from(pixels)
      this.pending = null
      this.mode = 'idle'
      this.lastWakeAt = now
      return { action: 'wake', mode: 'idle', novelty }
    }
    if (this.pending.total >= this.maxBurstSamples) {
      this.baseline = Buffer.from(pixels)
      this.pending = null
      this.mode = 'idle'
      this.suppressedUntil = now + this.motionCooldownMs
      return { action: 'motion', mode: 'idle', novelty }
    }
    return { action: 'sample', mode: 'burst', novelty }
  }

  reset() {
    this.baseline = null
    this.pending = null
    this.mode = 'idle'
    this.lastWakeAt = -Infinity
    this.suppressedUntil = -Infinity
  }
}
