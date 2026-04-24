import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { hexToRgb } from "@opentui/core";
import { writeSync } from "fs";

const tui: TuiPlugin = async (api) => {
  const renderer = api.renderer;
  const original = renderer.setBackgroundColor.bind(renderer);

  renderer.setBackgroundColor = (color) => {
    original(color);
    const rgba = typeof color === "string" ? hexToRgb(color) : color;

    if (rgba && rgba.a > 0) {
      const hex = (n: number) =>
        Math.round(n * 255)
          .toString(16)
          .padStart(2, "0");
      const seq = `\x1b]11;rgb:${hex(rgba.r)}/${hex(rgba.g)}/${hex(rgba.b)}\x07`;
      try {
        writeSync(1, seq);
      } catch {
        process.stdout.write(seq);
      }
    }
  };

  // ThemeProvider calls setBackgroundColor during initial render, which happens
  // *before* plugins are loaded. After patching we must force a re-sync with the
  // current theme background so the terminal matches on startup.
  renderer.setBackgroundColor(api.theme.current.background);

  api.lifecycle.onDispose(() => {
    // Use writeSync(1, …) instead of process.stdout.write so the OSC 111
    // sequence bypasses Node.js stream buffering and is flushed to the kernel
    // before the process exits.  renderer.resetTerminalBgColor() uses
    // process.stdout.write, which can leave bytes in the stream buffer that
    // never get drained when the event loop shuts down.
    try {
      writeSync(1, "\x1b]111\x07");
    } catch {
      renderer.resetTerminalBgColor();
    }
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: "bg-sync",
  tui,
};

export default plugin;
