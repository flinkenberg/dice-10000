import Redis from "ioredis";
import ws from "ws";
import uuid from "uuid/v4";
import { UserType, RoomType, ClientMessage, ClientMessageStatus, ServerResponse } from "./types/general";
import dispatcher from "./utils/dispatcher";

const { REDIS_HOST, REDIS_PORT, REDIS_PSW } = process.env;

const redisConfig: { [key: string]: string | number } = { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PSW };

const pub = new Redis(redisConfig);

const wss = new ws.Server({
  port: 8080,
});

export const users = new Map<string, UserType>();
let freeRooms: string[] = [];
const rooms = new Map<string, RoomType>();

function joinServer(ws: ws) {
  const id = uuid();
  users.set(id, { id, ws, roomId: null });
  console.log([`User ${id} joined the server`]);
  console.log(`Number of connections: ${users.size}`);
  ws.on("message", m => {
    const user = users.get(id);
    const msg: ClientMessage = JSON.parse(m.toString());
    if (!user) {
      dispatcher(ServerResponse.USER_NOT_FOUND, user.id);
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
      dispatcher(ServerResponse.UNKNOWN_MSG_TYPE, user.id);
      break;
  }
}

function sendMessage(user: UserType, msg: ClientMessage, ): void {
  if (!user.roomId) {
    dispatcher(ServerResponse.MSG_NO_ROOM, user.id)
  } else {
    if (!msg.message) {
      dispatcher(ServerResponse.MSG_NO_CONTENT, user.id)
    } else {
      pub.publish(user.roomId, msg.message);
    }
  }
}

function broadcastMessage(roomId: string, msg: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.userIds.forEach(id => dispatcher(ServerResponse.MSG_BROADCAST, id, msg))
}

function broadcastJoiningRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.userIds.forEach(id => {
    if (id !== userId) {
      dispatcher(ServerResponse.ROOM_USER_JOIN, id);
    }
  })
}

function broadcastLeavingRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.userIds.forEach(id => {
    if (id !== userId) {
      dispatcher(ServerResponse.ROOM_USER_LEFT, id)
    }
  })
}

function joinRoom(user: UserType): string {
  let id: string = null;
  if (user.roomId) {
    dispatcher(ServerResponse.ROOM_JOIN_ERR, user.id, `You are already a member of room ${user.roomId}`);
    return id;
  } else {
    if (freeRooms.length) {
      const freeRoomId = freeRooms[0];
      const room = rooms.get(freeRoomId);
      id = room.id;
      if (room.userIds.length + 1 === room.limit) freeRooms = freeRooms.filter(fid => fid !== id);
      users.set(user.id, { ...user, roomId: id });
      rooms.set(id, { ...room, userIds: [...room.userIds, user.id] });
      dispatcher(ServerResponse.ROOM_JOIN, user.id, `You have joined room ${id}`);
      broadcastJoiningRoom(id, user.id);
    } else {
      createRoom(user);
      dispatcher(ServerResponse.ROOM_CREATE, user.id, `You have created a new room`);
    }
  }
  return id;
}

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
      dispatcher(ServerResponse.ROOM_LEAVE, user.id, `You have left room ${room.id}`);
    } else {
      dispatcher(ServerResponse.ROOM_LEAVE_ERR, user.id, `You are not a member of this room`);
    }
  } else {
    dispatcher(ServerResponse.ROOM_LEAVE_ERR, user.id, `You are not a member of any room`);
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