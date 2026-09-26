import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { apply } from '../lib/index.js'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

test('sampled FPS gate starts one private Agent loop with a v4 source', async () => {
  const calls = []
  const tools = new Map()
  const effects = []
  const owner = { session: { id: 'human-session', header: { cwd: 'C:\\workspace', agentPreset: 'standard' } } }
  const background = {
    whenIdle: async () => {},
    cancel() {},
    followup(message) { calls.push(message) }
  }
  const values = [0, 255, 255]
  const ctx = {
    logger: { info() {}, warn(message) { throw new Error(message) } },
    agents: {
      roots: () => [owner],
      get: () => owner,
      async create(options) {
        await options.setup({ tools: { register(tool) { assertSupportedJsonSchema(tool.output.schema) } } })
        return { agent: background, dispose: async () => {} }
      }
    },
    agentPresets: { resolve: async () => ({ id: 'standard' }), mount: async () => {} },
    agentDefaultModel: { currentSelection: () => ({ provider: 'mock', model: 'vision' }) },
    sessionPersistence: { stat: async () => undefined },
    attachments: { saveImage: async () => ({ attachmentId: 'image-1', mediaType: 'image/png', bytes: 1, width: 1, height: 1 }) },
    llm: { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }), stream() { throw new Error('preflight model call was not expected') } },
    tools: { register(tool) { assertSupportedJsonSchema(tool.parameters); assertSupportedJsonSchema(tool.output.schema); tools.set(tool.name, tool) } },
    on: () => {},
    effect(fn) { effects.push(fn()) }
  }
  const createCapture = async () => ({
    start: async () => {}, stop: async () => {},
    nextFrame: async () => values.length ? { png: Buffer.from([values.shift()]) } : undefined
  })
  apply(ctx, { enabled: true, idleFps: 1_000, burstFps: 1_000, stableSamples: 2, minWakeGapMs: 0 }, {
    createCapture,
    platform: 'win32',
    thumbnail: async png => Buffer.alloc(32 * 18, png[0]),
    notify: async () => {}
  })
  for (let tries = 0; tries < 100 && calls.length === 0; tries++) await pause(5)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].source.kind, 'fount-reality')
  assert.ok(calls[0].content.some(block => block.type === 'image' && block.attachment.attachmentId === 'image-1'))
  const status = await tools.get('reality_status').execute()
  assert.equal(status.lastDecision.wake, true)
  const paused = await tools.get('reality_control').execute({ enabled: false })
  assert.deepEqual(paused, { enabled: false, capture: 'disabled' })
  for (const cleanup of effects) await cleanup()
})
