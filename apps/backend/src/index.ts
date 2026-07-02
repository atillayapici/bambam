import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import { ArenaRoom } from "./rooms/ArenaRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

const server = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
  }),
});

gameServer.define("arena", ArenaRoom);

gameServer.listen(port).then(() => {
  console.log(`[GameServer] Listening on ws://localhost:${port}`);
});
