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
// filterBy is what makes matchmaking respect the request: without it joinOrCreate hands you
// ANY open "encounter" room, so a player queuing a 6-player raid could be dropped into
// someone else's dungeon. `code` lets friends guarantee they land together — same code, same
// room; empty code is ordinary public matchmaking.
gameServer.define("encounter", EncounterRoom).filterBy(["contentId", "code"]);

httpServer.listen(port, () => console.log(`Realms game server listening on :${port}`));

process.on("SIGTERM", () => gameServer.gracefullyShutdown().then(() => process.exit(0)));
