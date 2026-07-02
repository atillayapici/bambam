import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "./schema/ArenaState";

export class ArenaRoom extends Room<ArenaState> {
  maxClients = 50;

  onCreate(options: any) {
    this.setState(new ArenaState());

    // Game Loop (60 times per second)
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    // Listen for move messages from the client
    this.onMessage("move", (client, message: { targetAngle: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.targetAngle = message.targetAngle;
      }
    });
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");
    const player = new Player();
    // Spawn randomly in a 2000x2000 area
    player.x = Math.random() * 2000;
    player.y = Math.random() * 2000;
    
    this.state.players.set(client.sessionId, player);
    console.log("Player added. Current server players size:", this.state.players.size);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    this.state.players.delete(client.sessionId);
  }

  update(deltaTime: number) {
    // Math logic for movement based on angle and speed
    const dt = deltaTime / (1000 / 60);

    this.state.players.forEach((player) => {
      // Smoothly rotate current angle towards target angle
      // (Simplified for now: snap to angle)
      player.currentAngle = player.targetAngle; 
      
      const vx = Math.cos(player.currentAngle) * player.speed;
      const vy = Math.sin(player.currentAngle) * player.speed;

      player.x += vx * dt;
      player.y += vy * dt;
      
      // Simple bounds checking (Arena 2000x2000)
      player.x = Math.max(0, Math.min(2000, player.x));
      player.y = Math.max(0, Math.min(2000, player.y));
    });
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
