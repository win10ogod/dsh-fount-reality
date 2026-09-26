import { nativeCapture } from '../lib/sensor.js'
import { thumbnail } from '../lib/attention.js'

const capture = await nativeCapture(process.platform, { maxCaptureBytes: 64 * 1024 * 1024 })
let timer
try {
  await capture.start()
  const frame = await Promise.race([
    capture.nextFrame(),
    new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('screen frame timeout')), 10_000) })
  ])
  const png = frame?.png || frame?.encodePng?.()
  if (!png || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error('capture returned no PNG frame')
  const sample = await thumbnail(png)
  console.log(JSON.stringify({ width: frame.width, height: frame.height, bytes: png.length, sampleBytes: sample.length }))
} finally {
  clearTimeout(timer)
  await capture.stop()
}
