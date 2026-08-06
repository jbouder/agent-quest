import { describe, expect, it } from "vitest";
import { formatElapsed } from "./BossBar";

describe("formatElapsed", () => {
  it("reads as mm:ss with a zero-padded seconds field", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9_000)).toBe("0:09");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_600_000)).toBe("60:00");
  });

  it("clamps a clock that has drifted backwards rather than showing -1", () => {
    expect(formatElapsed(-5_000)).toBe("0:00");
  });
});
