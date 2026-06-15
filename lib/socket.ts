import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

export const getSocket = () => {
  if (!socket) {
    socket = io({
      autoConnect: true,
      reconnection: true,
    });
  }
  return socket;
};
