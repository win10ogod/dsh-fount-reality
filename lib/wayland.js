import { execFile, spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)

export function defaultWaylandStateDir() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'storages', 'fount-reality', 'wayland')
}

export function waylandCapture({ stateDir = defaultWaylandStateDir(), command = 'wayland-screenshot', maxCaptureBytes, run = execute, spawnProcess = spawn } = {}) {
  if (!Number.isSafeInteger(maxCaptureBytes) || maxCaptureBytes < 1) throw new Error('Wayland capture requires the DSH image byte limit')
  const env = { ...process.env, WAYLAND_SCREENSHOT_STATE_DIR: stateDir }
  let child = null
  let owned = false

  return {
    continuous: false,
    async start() {
      await mkdir(stateDir, { recursive: true, mode: 0o700 })
      try {
        const { stdout } = await run(command, ['cast', 'status', '--json'], { env })
        if (JSON.parse(String(stdout)).running) return
      } catch (error) {
        if (error.code === 'ENOENT') throw new Error('wayland-screenshot CLI is required for unattended Wayland capture', { cause: error })
        if (Number(error.code) !== 3) throw error
      }
      child = spawnProcess(command, ['cast', 'start'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      owned = true
      await new Promise((resolve, reject) => {
        let stderr = ''
        let settled = false
        const finish = (error) => {
          if (settled) return
          settled = true
          child.stdout.off('data', onData)
          child.off('error', onError)
          child.off('exit', onExit)
          error ? reject(error) : resolve()
        }
        const onData = data => { if (String(data).includes('started')) finish() }
        const onError = error => finish(error)
        const onExit = code => {
          const error = new Error(`Wayland capture daemon exited ${code}: ${stderr.trim()}`)
          if (code === 4 && stderr.includes('restore_token')) error.code = 'WAYLAND_ENROLLMENT_REQUIRED'
          finish(error)
        }
        child.stderr.on('data', data => { stderr += String(data) })
        child.stdout.on('data', onData)
        child.on('error', onError)
        child.on('exit', onExit)
      })
    },
    async nextFrame() {
      const { stdout } = await run(command, ['snap'], { env, encoding: 'buffer', maxBuffer: maxCaptureBytes })
      const png = Buffer.from(stdout)
      if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Wayland capture did not return a PNG')
      return { png, width: null, height: null, timestamp: Date.now() }
    },
    async stop() {
      if (!owned || !child) return
      const active = child
      child = null
      owned = false
      if (active.exitCode !== null) return
      await new Promise(resolve => {
        active.once('exit', resolve)
        active.kill('SIGTERM')
      })
    }
  }
}
