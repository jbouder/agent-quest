import { describe, expect, it } from "vitest";
import { parseQuests, QuestTracker, summarizeToolInput } from "./agentSession";

describe("parseQuests", () => {
  it("maps a TodoWrite payload to quest entries", () => {
    const quests = parseQuests({
      todos: [
        { content: "Read the code", status: "completed", activeForm: "…" },
        { content: "Write the fix", status: "in_progress", activeForm: "…" },
        { content: "Run the tests", status: "pending", activeForm: "…" },
      ],
    });
    expect(quests).toEqual([
      { title: "Read the code", status: "completed" },
      { title: "Write the fix", status: "in_progress" },
      { title: "Run the tests", status: "pending" },
    ]);
  });

  it("returns null when there is no todos array", () => {
    expect(parseQuests({})).toBeNull();
    expect(parseQuests({ todos: "nope" })).toBeNull();
  });

  it("skips malformed entries and defaults odd statuses to pending", () => {
    const quests = parseQuests({
      todos: [
        null,
        { status: "completed" },
        { content: "Real task", status: "someday" },
      ],
    });
    expect(quests).toEqual([{ title: "Real task", status: "pending" }]);
  });
});

describe("QuestTracker", () => {
  it("tracks TaskCreate/TaskUpdate with sequential inferred ids", () => {
    const tracker = new QuestTracker();
    expect(tracker.handleToolUse("TaskCreate", { subject: "Greet" })).toBe(
      true,
    );
    tracker.handleToolUse("TaskCreate", { subject: "Inspect" });
    tracker.handleToolUse("TaskCreate", { subject: "Report" });
    tracker.handleToolUse("TaskUpdate", { taskId: "1", status: "completed" });
    tracker.handleToolUse("TaskUpdate", { taskId: 2, status: "in_progress" });
    expect(tracker.list()).toEqual([
      { title: "Greet", status: "completed" },
      { title: "Inspect", status: "in_progress" },
      { title: "Report", status: "pending" },
    ]);
  });

  it("ignores updates for unknown tasks and unrelated tools", () => {
    const tracker = new QuestTracker();
    expect(tracker.handleToolUse("TaskUpdate", { taskId: "9" })).toBe(false);
    expect(tracker.handleToolUse("Bash", { command: "ls" })).toBe(false);
  });

  it("replaces the whole list on TodoWrite", () => {
    const tracker = new QuestTracker();
    tracker.handleToolUse("TaskCreate", { subject: "Old" });
    tracker.handleToolUse("TodoWrite", {
      todos: [{ content: "New", status: "in_progress" }],
    });
    expect(tracker.list()).toEqual([{ title: "New", status: "in_progress" }]);
  });
});

describe("summarizeToolInput", () => {
  it("prefers well-known descriptive keys", () => {
    expect(summarizeToolInput("Bash", { command: "npm test" })).toBe(
      "Bash: npm test",
    );
    expect(summarizeToolInput("Read", { file_path: "/tmp/a.ts" })).toBe(
      "Read: /tmp/a.ts",
    );
  });

  it("falls back to JSON and truncates long input", () => {
    const summary = summarizeToolInput("Weird", { blob: "x".repeat(200) });
    expect(summary.startsWith("Weird: ")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(90);
  });
});
