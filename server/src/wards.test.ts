import { describe, expect, it } from "vitest";
import { describeWard, type SettingsSource, wardsFromSources } from "./wards";

const source = (
  name: string,
  hooks: SettingsSource["settings"]["hooks"],
): SettingsSource => ({ source: name, settings: { hooks } });

describe("wardsFromSources", () => {
  it("maps a configured hook to a ward carrying its tier", () => {
    const wards = wardsFromSources([
      source("project", {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "./gate.sh" }],
          },
        ],
      }),
    ]);

    expect(wards).toHaveLength(1);
    expect(wards[0]).toMatchObject({
      event: "PreToolUse",
      matcher: "Bash",
      commands: ["./gate.sh"],
      scope: "project",
      blocking: true,
    });
  });

  it("marks observe-only events as non-blocking", () => {
    const wards = wardsFromSources([
      source("user", {
        PostToolUse: [{ hooks: [{ command: "notify" }] }],
      }),
    ]);

    expect(wards[0]?.blocking).toBe(false);
    // An absent matcher means "every tool", not the literal string.
    expect(wards[0]?.matcher).toBeNull();
  });

  it("keeps hooks from every tier, since hooks accumulate rather than override", () => {
    const wards = wardsFromSources([
      source("user", { Stop: [{ hooks: [{ command: "user-stop" }] }] }),
      source("project", { Stop: [{ hooks: [{ command: "project-stop" }] }] }),
    ]);

    expect(wards.map((w) => w.scope)).toEqual(["user", "project"]);
  });

  it("attributes a hook duplicated across tiers to the lowest one", () => {
    const wards = wardsFromSources([
      source("user", { Stop: [{ hooks: [{ command: "same" }] }] }),
      source("local", { Stop: [{ hooks: [{ command: "same" }] }] }),
    ]);

    expect(wards).toHaveLength(1);
    expect(wards[0]?.scope).toBe("user");
  });

  it("ignores hook entries that declare no command", () => {
    const wards = wardsFromSources([
      source("project", { PreToolUse: [{ matcher: "Write", hooks: [] }] }),
    ]);

    expect(wards).toEqual([]);
  });

  it("tolerates a source with no hooks at all", () => {
    expect(wardsFromSources([{ source: "user", settings: {} }])).toEqual([]);
  });
});

describe("describeWard", () => {
  it("reads as a rule the player can act on", () => {
    const [ward] = wardsFromSources([
      source("project", {
        PreToolUse: [{ matcher: "Bash", hooks: [{ command: "./gate.sh" }] }],
      }),
    ]);

    expect(ward && describeWard(ward)).toBe(
      "guards PreToolUse on Bash — ./gate.sh",
    );
  });

  it("says 'watches' for a ward that cannot block", () => {
    const [ward] = wardsFromSources([
      source("user", { PostToolUse: [{ hooks: [{ command: "log.sh" }] }] }),
    ]);

    expect(ward && describeWard(ward)).toBe("watches PostToolUse — log.sh");
  });
});
