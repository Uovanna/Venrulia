// Realms of Eldoria — realtime game server (Colyseus). Hosts authoritative PvE encounter
// rooms driven by the shared deterministic core. Deploy target: Railway.
import express from "express";
import { createServer } from "http";
// colyseus ^0.15 and its transport ship CommonJS — default-import and destructure.
// Named ESM imports (`import { Server } from "colyseus"`) throw at load under Node.
import colyseus from "colyseus";
import wsTransport from "@colyseus/ws-transport";
import { EncounterRoom } from "./rooms/EncounterRoom.mjs";

const { Server } = colyseus;
const { WebSocketTransport } = wsTransport;

const port = Number(process.env.PORT) || 2567;

const app = express();
app.get("/", (_req, res) => res.type("text").send("Realms of Eldoria — game server"));
app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

const httpServer = createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

// One room type for now; add per-content rooms as you expose them.
gameServer.define("encounter", EncounterRoom);

httpServer.listen(port, () => console.log(`Realms game server listening on :${port}`));

process.on("SIGTERM", () => gameServer.gracefullyShutdown().then(() => process.exit(0)));
