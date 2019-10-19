import Redis from "ioredis";
import ws from "ws";
import uuid from "uuid/v4";

const { REDIS_HOST, REDIS_PORT, REDIS_PSW } = process.env;

const redisConfig: { [key: string]: string | number } = { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PSW };

const pub = new Redis(redisConfig);

const wss = new ws.Server({
  port: 8080,
});

export interface ClientMessage {
  status: ClientMessageStatus;
  message: string | null;
}

export enum ClientMessageStatus {
  JOIN = 0,
  LEAVE,
  MSG_REQ,
}

export enum ServerMessageStatus {
  JOIN = 0,
  LEAVE,
  MSG_REQ,
  MSG_EMIT,
  USR_JOINED,
  USR_LEFT,
  OTHER,
}

export type UserType = { id: string; ws: ws; roomId: string };
export type RoomType = { id: string; sub: any; limit: number; userIds: string[] };
// userId: ws
const users = new Map<string, UserType>();
// ids[]
let freeRooms: string[] = [];
// roomId: { roomId, usersId: userId[] }
const rooms = new Map<string, RoomType>();

function joinServer(ws: ws) {
  const id = uuid();
  users.set(id, { id, ws, roomId: null });
  console.table([`User ${id} joined the server`]);
  console.log(`Number of connections: ${users.size}`)
  // NOTIFY USER
  // ws.send(`your id: ${id}.`);
  ws.on("message", m => {
    const user = users.get(id);
    const msg: ClientMessage = JSON.parse(m.toString());
    if (!user) {
      ws.send(JSON.stringify({ status: ServerMessageStatus.OTHER, success: false, message: `User not found`, timestamp: Date.now() }));
    } else {
      processMessage(user, msg);
    }
  });
  ws.on("close", () => {
    quit(users.get(id));
  });
}

function processMessage(user: UserType, msg: ClientMessage) {
  switch (msg.status) {
    case ClientMessageStatus.JOIN:
      joinRoom(user);
      break;
    case ClientMessageStatus.LEAVE:
      leaveRoom(user);
      break;
    case ClientMessageStatus.MSG_REQ:
      sendMessage(user, msg);
      break;
    default:
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.OTHER, success: false, message: `Invalid request status`, timestamp: Date.now() }));
      break;
  }
}

function sendMessage(user: UserType, msg: ClientMessage, ): void {
  if (!user.roomId) {
    user.ws.send(JSON.stringify({ status: ServerMessageStatus.MSG_REQ, success: false, message: `You cannot send messages when not in a room`, timestamp: Date.now() }));
  } else {
    if (!msg.message) {
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.MSG_REQ, success: false, message: `Your message has no content.`, timestamp: Date.now() }))
    } else {
      pub.publish(user.roomId, msg.message);
    }
  }
}

function broadcastMessage(roomId: string, msg: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.userIds.forEach(id => users.get(id).ws.send(JSON.stringify({ status: ServerMessageStatus.MSG_EMIT, success: true, message: msg, timestamp: Date.now() })))
}

function broadcastJoiningRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.userIds.forEach(id => {
    if (id !== userId) {
      users.get(id).ws.send(JSON.stringify({ status: ServerMessageStatus.USR_LEFT, success: true, message: `User ${userId} joined your room`, timestamp: Date.now() }))
    }
  })
}

function broadcastLeavingRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.userIds.forEach(id => {
    if (id !== userId) {
      users.get(id).ws.send(JSON.stringify({ status: ServerMessageStatus.USR_LEFT, success: true, message: `User ${userId} left your room`, timestamp: Date.now() }))
    }
  })
}

function joinRoom(user: UserType): string {
  let id: string = null;
  if (user.roomId) {
    user.ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: false, message: `You are already a member of room ${user.roomId}`, timestamp: Date.now() }));
    return id;
  } else {
    if (freeRooms.length) {
      const freeRoomId = freeRooms[0];
      const room = rooms.get(freeRoomId);
      id = room.id;
      if (room.userIds.length + 1 === room.limit) freeRooms = freeRooms.filter(fid => fid !== id);
      users.set(user.id, { ...user, roomId: id });
      rooms.set(id, { ...room, userIds: [...room.userIds, user.id] });
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: true, message: `You have joined room ${id}`, timestamp: Date.now() }));
      broadcastJoiningRoom(id, user.id);
    } else {
      createRoom(user);
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: true, message: `You have created a new room`, timestamp: Date.now() }));
    }
  }
  return id;
}

// IF NO FREE ROOMS
async function createRoom(user: UserType) {
  const id = uuid();
  const newSub = new Redis(redisConfig)
  await newSub.subscribe(id);
  newSub.on("message", (_: any, msg: any) => broadcastMessage(id, msg))
  users.set(user.id, { ...user, roomId: id });
  rooms.set(id, { id, sub: newSub, limit: 2, userIds: [user.id] });
  freeRooms.push(id);
  console.table([`New room created`]);
}

function deleteRoom(user: UserType): void {
  if (!user.roomId) return;
  const room = rooms.get(user.roomId);
  if (room && room.userIds.includes(user.id) && room.userIds.length === 1) {
    console.table([`Room ${user.roomId} deleted`]);
    rooms.delete(user.roomId);
    freeRooms = freeRooms.filter(fid => fid !== user.roomId);
  }
}

function leaveRoom(user: UserType): void {
  const room = rooms.get(user.roomId);
  if (room) {
    if (room.userIds.includes(user.id)) {
      if (room.userIds.length >= 2) {
        rooms.set(room.id, { ...room, userIds: room.userIds.filter(id => id !== user.id) });
        freeRooms.push(room.id);
        broadcastLeavingRoom(room.id, user.id);
      } else {
        deleteRoom(user);
      }
      users.set(user.id, { ...user, roomId: null });
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.LEAVE, success: true, message: `You have left room ${room.id}`, timestamp: Date.now() }));
    } else {
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.LEAVE, success: false, message: `You are not a member of this room`, timestamp: Date.now() }));
    }
  } else {
    user.ws.send(JSON.stringify({ status: ServerMessageStatus.LEAVE, success: false, message: `You are not a member of any room`, timestamp: Date.now() }));
  }
}

function quit(user: UserType) {
  if (user.roomId) {
    leaveRoom(user)
  }
  users.delete(user.id);
}

wss.on("connection", ws => {
  joinServer(ws);
});