import { Plugin } from "@opencode/plugin/tui"
import { parseColor, type ColorInput } from "@opentui/core"
import { writeSync } from "fs"

const hexByte = (n: number) =>
  Math.round(n * 255)
    .toString(16)
    .padStart(2, "0")

const writeOsc = (sequence: string) => {
  // writeSync(1, …) bypasses Node.js stream buffering so the sequence is
  // flushed to the kernel immediately, even while the process is shutting
  // down. process.stdout.write can leave bytes in the stream buffer that
  // never get drained once the event loop exits.
  try {
    writeSync(1, sequence)
  } catch {
    process.stdout.write(sequence)
  }
}

export default Plugin.define({
  id: "bg-sync",
  setup(context) {
    const renderer = context.renderer

    // Capture whatever is installed right now: normally the prototype
    // method, but possibly another plugin's wrapper or an earlier
    // hot-reload generation of this plugin.
    const descriptor = Object.getOwnPropertyDescriptor(renderer, "setBackgroundColor")
    const previous = renderer.setBackgroundColor.bind(renderer)

    const patched = (color: ColorInput) => {
      previous(color)
      const rgba = parseColor(color)
      // "transparent" parses to a = 0; leave the terminal's default alone
      // instead of forcing an opaque background.
      if (rgba.a > 0) {
        writeOsc(`\x1b]11;rgb:${hexByte(rgba.r)}/${hexByte(rgba.g)}/${hexByte(rgba.b)}\x07`)
      }
    }
    renderer.setBackgroundColor = patched

    // The theme provider calls setBackgroundColor during its initial render,
    // which happens before plugins load. After patching, re-apply the
    // current theme background once so the terminal matches on startup.
    renderer.setBackgroundColor(context.theme.background.base)

    return () => {
      // Only unwind our own patch. The host tears the old generation down
      // before setting up a new one, but if a newer generation (or another
      // plugin) has already replaced the method, restoring here would
      // silently break it — and resetting the terminal background would
      // clobber the state that replacement just installed.
      if (renderer.setBackgroundColor !== patched) return

      if (descriptor) Object.defineProperty(renderer, "setBackgroundColor", descriptor)
      else delete (renderer as { setBackgroundColor?: (color: ColorInput) => void }).setBackgroundColor

      // OSC 111 restores the terminal's default background. Prefer writeSync
      // so the bytes are flushed before the process exits; the renderer's
      // resetTerminalBgColor() writes through a path that may not drain in
      // time.
      try {
        writeSync(1, "\x1b]111\x07")
      } catch {
        renderer.resetTerminalBgColor()
      }
    }
  },
})
