import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { AttentionGate } from '../lib/attention.js'
import { ScreenSensor } from '../lib/sensor.js'

test('continuous source can confirm a stable new scene after it stops emitting frames', async () => {
  const gate = new AttentionGate({ noveltyThreshold: 0.1, stableSamples: 3, stableThreshold: 0.01, minWakeGapMs: 0 })
  const actions = []
  let release
  let reads = 0
  const createCapture = async () => ({
    continuous: true,
    start: async () => {},
    stop: async () => release?.(undefined),
    async nextFrame() {
      reads++
      if (reads === 1) return { encodePng: () => Buffer.alloc(32 * 18, 0) }
      if (reads === 2) {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { encodePng: () => Buffer.alloc(32 * 18, 255) }
      }
      return new Promise(resolve => { release = resolve })
    }
  })
  const sensor = new ScreenSensor({
    createCapture, platform: 'win32', sampleIntervalMs: 2,
    onState: () => {},
    onFrame: async frame => {
      const decision = gate.observe(frame.png)
      actions.push(decision.action)
      sensor.setSampleFps(decision.mode === 'burst' ? 1_000 : 500)
    }
  })
  sensor.start()
  try {
    for (let count = 0; count < 100 && !actions.includes('wake'); count++)
      await new Promise(resolve => setTimeout(resolve, 2))
    assert.equal(actions.filter(action => action === 'wake').length, 1)
    assert.equal(reads, 3)
  } finally { await sensor.stop() }
})
