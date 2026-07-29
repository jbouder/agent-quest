import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientCommand, ServerEvent } from "../../shared/protocol";
import { SessionManager } from "./sessionManager";

const PORT = Number(process.env.AGENT_QUEST_PORT ?? 8787);
const BUDGET_USD = Number(process.env.AGENT_QUEST_BUDGET_USD ?? 5);

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "⚠ ANTHROPIC_API_KEY is not set — summoning agents will fail until it is.",
  );
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("agent-quest control server\n");
});
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

function broadcast(event: ServerEvent): void {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

const manager = new SessionManager(broadcast, BUDGET_USD);

wss.on("connection", (socket) => {
  console.log(`[ws] client connected (${wss.clients.size} total)`);
  socket.send(JSON.stringify(manager.snapshotEvent()));
  socket.on("message", (raw) => {
    try {
      const command = JSON.parse(String(raw)) as ClientCommand;
      manager.handle(command);
    } catch (error) {
      console.error("bad client command:", error);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`agent-quest control server on ws://localhost:${PORT}/ws`);
  console.log(`player budget: $${BUDGET_USD}`);
});
