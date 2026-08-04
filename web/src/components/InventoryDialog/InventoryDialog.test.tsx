import { describe, expect, it } from "vitest";
import type { AgentSnapshot } from "@/lib/protocol";
import { itemsFor } from "./InventoryDialog";

function agentWith(inventory: AgentSnapshot["inventory"]): AgentSnapshot {
  return {
    id: "a1",
    label: "Agent 1",
    task: "t",
    cwd: "/",
    model: "claude-sonnet-5",
    status: "idle",
    thought: "",
    contextTokens: 0,
    contextLimit: 200_000,
    tokensSpent: 0,
    costUsd: 0,
    sessionId: null,
    pendingPermission: null,
    lastResult: null,
    compactions: 0,
    inventory,
    toolUses: {},
    quests: [],
    permissionMode: "default",
    planPending: false,
    tomePreview: null,
    tasks: [],
  };
}

describe("itemsFor", () => {
  it("is empty before the init message arrives", () => {
    expect(itemsFor(agentWith(null))).toEqual([]);
  });

  it("labels built-ins, groups MCP tools by server, includes skills", () => {
    const items = itemsFor(
      agentWith({
        tools: ["Bash", "Read", "mcp__github__create_issue"],
        skills: ["frontend-dev"],
        slashCommands: [],
        mcpServers: [{ name: "github", status: "connected" }],
      }),
    );
    expect(items.map((i) => i.label)).toEqual([
      "Bash",
      "Read",
      "create_issue",
      "frontend-dev",
    ]);
    const mcpItem = items[2];
    expect(mcpItem?.source).toBe("MCP server: github");
    expect(mcpItem?.key).toBe("mcp__github__create_issue");
    expect(items[3]?.icon).toBe("📜");
  });
});
