import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { waylandCapture } from '../lib/wayland.js'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])

test('Wayland uses a persistent restore-token directory and resumes an existing daemon', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'reality-wayland-'))
  const calls = []
  try {
    const capture = waylandCapture({ stateDir, maxCaptureBytes: 1024, run: async (_command, args, options) => {
      calls.push({ args, options })
      return args[1] === 'status' ? { stdout: '{"running":true}' } : { stdout: png }
    }, spawnProcess() { throw new Error('running daemon should not be restarted') } })
    await capture.start()
    assert.equal((await capture.nextFrame()).png.equals(png), true)
    await capture.stop()
    assert.equal(calls[0].options.env.WAYLAND_SCREENSHOT_STATE_DIR, stateDir)
    assert.deepEqual(calls.map(call => call.args), [['cast', 'status', '--json'], ['snap']])
  } finally { await rm(stateDir, { recursive: true, force: true }) }
})

test('Wayland reports missing enrollment instead of opening a repeated picker', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'reality-wayland-'))
  try {
    const capture = waylandCapture({ stateDir, maxCaptureBytes: 1024,
      async run() { const error = new Error('no daemon'); error.code = 3; throw error },
      spawnProcess() {
        const child = new EventEmitter()
        child.stdout = new PassThrough()
        child.stderr = new PassThrough()
        child.exitCode = null
        child.kill = () => { child.exitCode = 4; child.emit('exit', 4) }
        queueMicrotask(() => { child.stderr.write('no restore_token'); child.exitCode = 4; child.emit('exit', 4) })
        return child
      }
    })
    await assert.rejects(capture.start(), error => error.code === 'WAYLAND_ENROLLMENT_REQUIRED')
    await capture.stop()
  } finally { await rm(stateDir, { recursive: true, force: true }) }
})
