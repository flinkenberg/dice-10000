import { ServerResponse, ServerMessageStatus } from "../types/general";
import { users } from "..";

export default function dispatcher(res: ServerResponse, userId: string, msg?: string): void {
  const { ws } = users.get(userId);
  switch (res) {
    case ServerResponse.USER_NOT_FOUND:
      ws.send(JSON.stringify({ status: ServerMessageStatus.OTHER, success: false, message: `User not found`, timestamp: Date.now() }));
      break;
    case ServerResponse.UNKNOWN_MSG_TYPE:
      ws.send(JSON.stringify({ status: ServerMessageStatus.OTHER, success: false, message: `Invalid request status`, timestamp: Date.now() }));
      break;
    case ServerResponse.MSG_NO_ROOM:
      ws.send(JSON.stringify({ status: ServerMessageStatus.MSG_REQ, success: false, message: `You cannot send messages when not in a room`, timestamp: Date.now() }));
      break;
    case ServerResponse.MSG_NO_CONTENT:
      ws.send(JSON.stringify({ status: ServerMessageStatus.MSG_REQ, success: false, message: `Your message has no content.`, timestamp: Date.now() }))
      break;
    case ServerResponse.MSG_BROADCAST:
      ws.send(JSON.stringify({ status: ServerMessageStatus.MSG_EMIT, success: true, message: msg, timestamp: Date.now() }))
      break;
    case ServerResponse.ROOM_USER_JOIN:
      ws.send(JSON.stringify({ status: ServerMessageStatus.USR_LEFT, success: true, message: `User ${userId} joined your room`, timestamp: Date.now() }))
      break;
    case ServerResponse.ROOM_USER_LEFT:
      ws.send(JSON.stringify({ status: ServerMessageStatus.USR_LEFT, success: true, message: `User ${userId} left your room`, timestamp: Date.now() }))
      break;
    case ServerResponse.ROOM_JOIN_ERR:
      ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: false, message: msg, timestamp: Date.now() }));
      break;
    case ServerResponse.ROOM_JOIN:
      ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: true, message: msg, timestamp: Date.now() }));
      break;
    case ServerResponse.ROOM_CREATE:
      ws.send(JSON.stringify({ status: ServerMessageStatus.JOIN, success: true, message: msg, timestamp: Date.now() }));
      break;
    case ServerResponse.ROOM_LEAVE:
      ws.send(JSON.stringify({ status: ServerMessageStatus.LEAVE, success: true, message: msg, timestamp: Date.now() }));
      break;
    case ServerResponse.ROOM_LEAVE_ERR:
      ws.send(JSON.stringify({ status: ServerMessageStatus.LEAVE, success: false, message: msg, timestamp: Date.now() }));
      break;
    default: break;
  }
}