import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") targetAngle: number = 0;
  @type("number") currentAngle: number = 0;
  @type("number") speed: number = 4;
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
