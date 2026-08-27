/**
 * DailyScreen, ExecutiveScreen, and LuxuryScreen are presentational — they
 * receive `reply`/`chatReply`/`transcript`/`liveTranscript` as plain props
 * from the single shared hook wiring in app/(tabs)/index.tsx (exercised by
 * voice-text-reply-masking.test.tsx) and all three render the exact same
 * `reply || chatReply` / `transcript || liveTranscript` fallback.
 *
 * That "exact same" part is precisely what makes the masking bug easy to
 * reintroduce in just one screen (e.g. a screen-specific rewrite that reads
 * `chatReply || reply` instead, or drops one side of the fallback). This
 * guards the invariant at the source level across all three screens, since
 * there is no shared component the display logic could otherwise be pinned to.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const SCREENS = ["DailyScreen.tsx", "ExecutiveScreen.tsx", "LuxuryScreen.tsx"];
const SCREENS_DIR = path.join(__dirname, "..", "components", "modes");

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, name), "utf8");
}

describe("shared reply/transcript fallback pattern across all three mode screens", () => {
  it.each(SCREENS)("%s displays the reply via the shared `reply || chatReply` fallback", (name) => {
    const src = readScreen(name);
    // This is the exact JSX text node the user sees. Diverging it in just
    // one screen (e.g. rewriting to `chatReply || reply`, or dropping one
    // side) is precisely how the masking bug reappears silently.
    expect(src).toMatch(/aiReply\}[^>]*>\{reply \|\| chatReply\}/);
  });

  it.each(SCREENS)("%s renders the final transcript before the live one (`transcript || liveTranscript`)", (name) => {
    const src = readScreen(name);
    expect(src).toMatch(/transcript \|\| liveTranscript/);
  });
});
