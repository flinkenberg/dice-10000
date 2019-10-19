import WebSocket from "ws";

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

export enum ServerResponse {
  USER_NOT_FOUND = 0,
  UNKNOWN_MSG_TYPE,
  MSG_NO_ROOM,
  MSG_NO_CONTENT,
  MSG_BROADCAST,
  ROOM_USER_JOIN,
  ROOM_USER_LEFT,
  ROOM_JOIN_ERR,
  ROOM_JOIN,
  ROOM_CREATE,
  ROOM_LEAVE_ERR,
  ROOM_LEAVE
}

export type UserType = { id: string; ws: WebSocket; roomId: string };
export type RoomType = { id: string; sub: any; limit: number; userIds: string[] };