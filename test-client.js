const WebSocket = require('./node_modules/ws');
global.WebSocket = WebSocket;

const { Client } = require('./apps/frontend/node_modules/colyseus.js');

async function test() {
  console.log("Connecting to ws://localhost:2567...");
  const client = new Client("ws://localhost:2567");
  try {
    const room = await client.joinOrCreate("arena");
    console.log("Joined room successfully! SessionId:", room.sessionId);
    
    // Test if onAdd is a method
    if (typeof room.state.players.onAdd === 'function') {
      room.state.players.onAdd((player, sessionId) => {
        console.log("Player added in test client via method:", sessionId, player.x);
      });
    } else {
      room.state.players.onAdd = (player, sessionId) => {
        console.log("Player added in test client via property:", sessionId, player.x);
      };
    }

    setTimeout(() => {
      console.log("Exiting test client...");
      room.leave();
      process.exit(0);
    }, 2000);
  } catch (err) {
    console.error("Test client error:", err);
    process.exit(1);
  }
}

test();
