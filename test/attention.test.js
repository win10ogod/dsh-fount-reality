import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { AttentionGate, visualDifference } from '../lib/attention.js'

const frame = value => Buffer.alloc(32 * 18, value)

test('stable scene change enters burst sampling before waking once', () => {
  const gate = new AttentionGate({ noveltyThreshold: 0.1, stableThreshold: 0.01, stableSamples: 3, minWakeGapMs: 1_000 })
  assert.deepEqual(gate.observe(frame(0), 0), { action: 'sample', mode: 'idle' })
  assert.equal(gate.observe(frame(1), 1).action, 'sample')
  assert.equal(gate.observe(frame(230), 2).action, 'burst')
  assert.equal(gate.observe(frame(230), 3).action, 'sample')
  const wake = gate.observe(frame(230), 4)
  assert.equal(wake.action, 'wake')
  assert.equal(wake.mode, 'idle')
  assert.equal(gate.observe(frame(0), 5).action, 'sample')
  assert.equal(gate.observe(frame(0), 1_005).action, 'burst')
})

test('continuous motion is suppressed without waking the Agent loop', () => {
  const gate = new AttentionGate({ noveltyThreshold: 0.1, stableThreshold: 0.01, stableSamples: 3, maxBurstSamples: 4, motionCooldownMs: 1_000, minWakeGapMs: 0 })
  gate.observe(frame(0), 0)
  assert.equal(gate.observe(frame(255), 1).action, 'burst')
  assert.equal(gate.observe(frame(120), 2).action, 'sample')
  assert.equal(gate.observe(frame(230), 3).action, 'sample')
  assert.equal(gate.observe(frame(80), 4).action, 'motion')
  assert.equal(gate.observe(frame(255), 5).action, 'sample')
  assert.equal(gate.observe(frame(255), 1_005).action, 'burst')
})

test('visual difference is normalized and rejects unequal images', () => {
  assert.equal(visualDifference(frame(0), frame(255)), 1)
  assert.equal(visualDifference(frame(3), frame(3)), 0)
  assert.throws(() => visualDifference(frame(0), Buffer.alloc(1)))
})
