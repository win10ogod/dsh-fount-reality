import { x11Capture } from './x11.js'
import { waylandCapture } from './wayland.js'

const wait = (ms, signal) => new Promise(resolve => {
  if (signal.aborted) return resolve()
  const timer = setTimeout(done, ms)
  function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
  signal.addEventListener('abort', done, { once: true })
})

export async function nativeCapture(platform = process.platform, options = {}) {
  if (platform === 'linux' && !process.env.WAYLAND_DISPLAY && process.env.DISPLAY) return x11Capture()
  if (platform === 'linux' && process.env.WAYLAND_DISPLAY) return waylandCapture(options)
  const { ScreenCapture, ImageFormat, isSupported } = await import('@screen-capture/node')
  if (!isSupported()) throw new Error(`native screen capture is unavailable on ${platform}`)
  const capture = new ScreenCapture({ monitorIndex: 1, colorFormat: 'bgra8' })
  return {
    continuous: true,
    start: () => capture.start(),
    stop: () => capture.stop(),
    async nextFrame() {
      const frame = await capture.nextFrame()
      return frame ? { encodePng: () => frame.encode(ImageFormat.Png), width: frame.width, height: frame.height, timestamp: frame.timestamp } : undefined
    }
  }
}

export class ScreenSensor {
  constructor({ createCapture = nativeCapture, platform = process.platform, sampleIntervalMs = 30_000, retryIntervalMs = 60_000, onFrame, onState }) {
    this.createCapture = createCapture
    this.platform = platform
    this.sampleIntervalMs = sampleIntervalMs
    this.retryIntervalMs = retryIntervalMs
    this.onFrame = onFrame
    this.onState = onState
    this.controller = null
    this.worker = null
    this.capture = null
  }

  start() {
    if (this.worker) return
    this.controller = new AbortController()
    const active = this.run(this.controller.signal)
    this.worker = active
    void active.then(
      () => { if (this.worker === active) this.worker = null },
      error => { if (this.worker === active) this.worker = null; this.onState?.('error', error) }
    )
  }

  setSampleFps(fps) {
    if (!Number.isFinite(fps) || fps <= 0) throw new Error('sampling FPS must be positive')
    this.sampleIntervalMs = 1000 / fps
  }

  async stop() {
    this.controller?.abort()
    await this.capture?.stop().catch(() => {})
    await this.worker
    this.worker = null
    this.controller = null
    this.onState?.('stopped')
  }

  async run(signal) {
    while (!signal.aborted) {
      try {
        this.onState?.('starting')
        this.capture = await this.createCapture(this.platform)
        await this.capture.start()
        this.onState?.('capturing')
        if (this.capture.continuous) await this.runContinuous(this.capture, signal)
        else while (!signal.aborted) {
          const frame = await this.capture.nextFrame()
          if (!frame) throw new Error('screen capture session ended')
          await this.onFrame(frame)
          await wait(this.sampleIntervalMs, signal)
        }
      } catch (error) {
        if (signal.aborted) break
        const permissionRequired = error?.code === 'WAYLAND_ENROLLMENT_REQUIRED'
        this.onState?.(permissionRequired ? 'permission-required' : 'retrying', error)
        if (permissionRequired) break
        await wait(this.retryIntervalMs, signal)
      } finally {
        await this.capture?.stop().catch(() => {})
        this.capture = null
      }
    }
  }

  async runContinuous(capture, signal) {
    const attempt = new AbortController()
    const abort = () => attempt.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) attempt.abort()
    let latest
    const reader = (async () => {
      while (!attempt.signal.aborted) {
        const frame = await capture.nextFrame()
        if (!frame) throw new Error('screen capture session ended')
        latest = frame
      }
    })()
    const sampler = (async () => {
      while (!attempt.signal.aborted) {
        if (latest) await this.onFrame({ ...latest, png: latest.encodePng() })
        await wait(this.sampleIntervalMs, attempt.signal)
      }
    })()
    try { await Promise.race([reader, sampler]) }
    finally {
      attempt.abort()
      signal.removeEventListener('abort', abort)
      await capture.stop().catch(() => {})
      await Promise.allSettled([reader, sampler])
    }
  }
}
