import { io, type Socket } from 'socket.io-client';
import { webConfig } from '../config.js';

let socket: Socket | undefined;

export function getSocket(): Socket {
  socket ??= io(webConfig.socketUrl, {
    path: webConfig.socketPath,
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
}
