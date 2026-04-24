# oc-bg-color-sync

Synchronize the terminal's native background color with OpenTUI's renderer background color. Fixes mismatched border/gutter colors in terminals that draw padding outside the application viewport.

## Why

OpenTUI renders its own background, but the terminal emulator may show its own default color in gutters, borders, or padding areas around the app. This plugin emits **OSC 11** whenever the renderer background changes so the terminal stays in sync.

On cleanup it emits **OSC 111** to restore the terminal's original background.

## The Bug

### What you see

When OpenCode's TUI renders with a dark theme but your terminal profile has a light background (or vice versa), you get visible color mismatches in:

- Terminal gutters/padding around the app
- Border areas not covered by the renderer
- Scrollback regions showing the "wrong" background

### Root cause

This was originally fixed upstream in `@opentui/core` via [PR #951](https://github.com/anomalyco/opentui/pull/951) by having `setBackgroundColor()` emit **OSC 11** to sync the terminal's native background with the renderer's background.

However, [PR #969](https://github.com/anomalyco/opentui/pull/969) ("more reliable theme mode") **removed** the OSC 11 emission from `setBackgroundColor()` because it caused issues in Ghostty:

> "Do not mirror renderer background to terminal default background via OSC 11 for now. In Ghostty, once OSC 11 has been used, later system light/dark theme changes can leave OSC 11 queries stuck on stale bg values even after OSC 111 resets. Theme detection relies on fresh OSC 10/11 replies, so mutating terminal default bg here breaks that."

The PR also disabled the **OSC 111** reset in `terminal.zig`'s `resetState()`:

> "OSC 111 is intentionally disabled for now. In Ghostty, sending the reset alone is enough to poison later OSC 11 background reporting for system light/dark theme changes, which breaks theme detection on the next app startup even though the immediate reset appears to work."

So after PR #969:

- `renderer.setBackgroundColor()` only updates the internal render buffer
- The terminal's native background stays at its profile default
- Theme detection is more reliable, but border/gutter colors break

This plugin restores the OSC 11 sync as a userland workaround until upstream finds a solution that works for both use cases.

## How it works

- Wraps `renderer.setBackgroundColor()`
- After the native call, converts the RGBA color to hex and writes `OSC 11;rgb:rr/gg/bb\x07` to stdout
- On plugin dispose, calls `renderer.resetTerminalBgColor()` which writes `OSC 111\x07`

### Timing fix

`ThemeProvider` calls `setBackgroundColor()` during initial render **before** plugins are loaded. If we only patched the method, the terminal would stay out of sync until the theme changed again. The plugin therefore reads `api.theme.current.background` after patching and calls the patched method once to force an immediate sync.

### OSC sequence reference

- **OSC 11** — Set terminal background color  
  Format: `\x1b]11;rgb:RR/GG/BB\x07`
- **OSC 111** — Reset terminal background to default  
  Format: `\x1b]111\x07`

See [VT100.net OSC 11 docs](https://vtdn.dev/docs/osc/osc11) and [OSC 110-112](https://vtdn.dev/docs/osc/osc110-112) for more.

## Install

Add the plugin to your OpenCode config (`tui.json` or equivalent):

```json
{
  "plugin": ["oc-bg-color-sync"]
}
```

## Debugging

To verify the plugin is emitting OSC sequences, run OpenCode in a terminal that logs escape sequences, or sniff stdout with `script`:

```bash
# Start a typescript session; all escape sequences are recorded
script -q /tmp/opencode-osc.log
opencode
# quit opencode, then exit the script shell
exit
# Search for OSC 11/111 in the log
grep -o $'\x1b]11;[^\x07]*\x07' /tmp/opencode-osc.log
grep -o $'\x1b]111\x07' /tmp/opencode-osc.log
```

You should see an `OSC 11` on startup and an `OSC 111` on exit.

## Requirements

- A terminal emulator that supports OSC 11/111 (most modern terminals do; Ghostty has quirks with theme detection after OSC 11/111 usage)

## License

MIT
