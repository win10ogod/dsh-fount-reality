import { execFile } from 'node:child_process'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)

export function x11Capture({ command = 'gnome-screenshot', run = execute } = {}) {
  if (!process.env.DISPLAY) throw new Error('X11 capture requires DISPLAY')
  let controller
  return {
    continuous: false,
    async start() { controller = new AbortController() },
    async stop() { controller?.abort() },
    async nextFrame() {
      const directory = await mkdtemp(join(tmpdir(), 'dsh-reality-x11-'))
      const output = join(directory, 'screen.png')
      try {
        await run(command, ['--file', output], { signal: controller.signal })
        const png = await readFile(output)
        return { png, width: null, height: null, timestamp: Date.now() }
      } finally { await rm(directory, { recursive: true, force: true }) }
    }
  }
}
