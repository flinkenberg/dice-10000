import Redis from "ioredis";
import ws from "ws";
import uuid from "uuid/v4";

const { REDIS_HOST, REDIS_PORT, REDIS_PSW } = process.env;

const redisConfig: { [key: string]: string | number } = { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PSW };

const pub = new Redis(redisConfig);
const sub = new Redis(redisConfig);

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
  // QUIT,
  MESSAGE,
}

export enum ServerMessageStatus {
  JOIN = 0,
  LEAVE,
  // QUIT,
  MESSAGE,
  OTHER,
}

export type UserType = { id: string; ws: ws; roomId: string };
export type RoomType = { id: string; sub: string; limit: number; userIds: string[] };
// userId: ws
const users = new Map<string, UserType>();
// ids[]
let freeRooms: string[] = [];
// roomId: { roomId, usersId: userId[] }
const rooms = new Map<string, RoomType>();

function joinServer(ws: ws) {
  const id = uuid();
  users.set(id, { id, ws, roomId: null });
  console.table([`User ${id} joined the server`])
  // NOTIFY USER
  // ws.send(`your id: ${id}.`);
  ws.on("message", m => {
    const user = users.get(id);
    const msg: ClientMessage = JSON.parse(m.toString());
    if (!user) {
      ws.send(JSON.stringify({ status: ServerMessageStatus.OTHER, success: false, message: `User not found` }));
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
    case ClientMessageStatus.MESSAGE:
      sendMessage(user, msg);
      break;
    default:
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.OTHER, success: false, message: `Invalid request status` }));
      break;
  }
}

function sendMessage(user: UserType, msg: ClientMessage, ): void {
  if (!user.roomId) {
    user.ws.send(JSON.stringify({ status: ServerMessageStatus.MESSAGE, success: false, message: `You cannot send messages when not in a room` }));
  } else {
    if (!msg.message) {
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.MESSAGE, success: false, message: `Your message has no content.` }))
    } else {
      pub.publish(user.roomId, msg.message);
    }
  }
}

function broadcastMessage(roomId: string, msg: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.userIds.forEach(id => users.get(id).ws.send(JSON.stringify({ status: ServerMessageStatus.MESSAGE, success: true, message: msg })))
}

function joinRoom(user: UserType): string {
  let id: string = null;
  if (user.roomId) {
    user.ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: false, message: `You are already a member of room ${user.roomId}` }));
    return id;
  } else {
    if (freeRooms.length) {
      const freeRoomId = freeRooms[0];
      const room = rooms.get(freeRoomId);
      id = room.id;
      if (room.userIds.length + 1 === room.limit) freeRooms = freeRooms.filter(fid => fid !== id);
      users.set(user.id, { ...user, roomId: id });
      rooms.set(id, { ...room, userIds: [...room.userIds, user.id] });
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: true, message: `You have joined room ${id}` }));
    } else {
      id = createRoom(user);
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: true, message: `You have created and joined room ${id}` }));
    }
  }
  return id;
}

// IF NO FREE ROOMS
function createRoom(user: UserType): string {
  const id = uuid();
  sub.subscribe(id);
  sub.on("message", (_, msg) => broadcastMessage(id, msg))
  users.set(user.id, { ...user, roomId: id });
  rooms.set(id, { id, sub: null, limit: 2, userIds: [user.id] });
  freeRooms.push(id);
  console.table([`New room ${id} created`]);
  return id;
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
      } else {
        deleteRoom(user);
      }
      users.set(user.id, { ...user, roomId: null });
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.LEAVE, success: true, message: `You have left room ${room.id}` }));
    } else {
      user.ws.send(JSON.stringify({ status: ServerMessageStatus.LEAVE, success: false, message: `You are not a member of this room` }));
    }
  } else {
    user.ws.send(JSON.stringify({ status: ServerMessageStatus.LEAVE, success: false, message: `You are not a member of any room` }));
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


// export type UserType = { id: string };
// export type RoomType = { id: string; userIds: string[]; };
// export interface Message {
//   roomId: string;
//   serverTime: number;
//   content: {
//     text: string;
//   }
// }
// const rooms = new Map<string, RoomType>();
// const queue = new Map<string, UserType>();
// const users = new Map<string, ws>();

// function joinQueue(user: UserType): void {
//   console.table([`User ${user.id} joined a queue`]);
//   queue.set(user.id, { id: user.id });
// }

// function createAndJoinRoom(user: UserType) {
//   const newRoomId = uuid();
//   const usrTwoId = queue.entries().next().value[1].id;
//   console.table([`New room ${newRoomId}`, `User ${user.id} joined`, `User ${usrTwoId} joined`]);
//   rooms.set(newRoomId, { id: newRoomId, userIds: [user.id, usrTwoId] });
//   queue.delete(usrTwoId);
//   [user.id, usrTwoId].forEach(id => {
//     const ws = users.get(id);
//     ws.on("message", (msg: Message) => {
//       const room = rooms.get(msg.roomId)
//       if (room.id) {
//         cli.publish("channel", JSON.stringify({
//           roomId: room.id,
//           serverTime: Date.now(),
//           content: {
//             text: msg
//           }
//         }))
//       }
//     });
//     ws.on("close", () => {
//       quit(user.id, newRoomId);
//     });
//   })
// }

// function leaveRoom(roomId: string, userId: string): void {
//   const room: RoomType = rooms.get(roomId);
//   const otherUserId: string = rooms.get(roomId).userIds.find(id => id !== userId);
//   queue.set(otherUserId, { id: otherUserId });
//   console.table([`User ${userId} left`, `User ${otherUserId} joined a queue`]);
//   rooms.delete(room.id);
//   users.delete(userId);
// }

// function quit(userId: string, roomId: string) {
//   if (roomId) {
//     leaveRoom(roomId, userId);
//   } else {
//     users.delete(userId);
//   }
// }

// wss.on("connection", ws => {
//   const userId = uuid();
//   users.set(userId, ws);
//   if (!queue.size) {
//     joinQueue({ id: userId });
//   } else {
//     createAndJoinRoom({ id: userId });
//   }
// })

// sub.on("message", (_, data) => {
//   const msg = JSON.parse(data);
//   console.log("----");
//   console.log(JSON.stringify(rooms.get(msg.roomId)));
//   console.log("----");
//   rooms.get(msg.roomId).userIds.forEach(id => users.get(id).send(JSON.stringify(msg)))
// })

// sub.subscribe("channel");