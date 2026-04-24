import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { hexToRgb } from "@opentui/core";

const tui: TuiPlugin = async (api) => {
  const renderer = api.renderer;
  const original = renderer.setBackgroundColor.bind(renderer);

  renderer.setBackgroundColor = (color) => {
    original(color);
    const rgba = typeof color === "string" ? hexToRgb(color) : color;

    if (rgba.a > 0) {
      const hex = (n: number) => n.toString(16).padStart(2, "0");
      process.stdout.write(
        `\x1b]11;rgb:${hex(rgba.r)}/${hex(rgba.g)}/${hex(rgba.b)}\x07`,
      );
    }
  };

  api.lifecycle.onDispose(() => {
    renderer.resetTerminalBgColor();
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: "bg-sync",
  tui,
};

export default plugin;
