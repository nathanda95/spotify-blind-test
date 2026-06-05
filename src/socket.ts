import { io } from 'socket.io-client';

export const roomSocket = io('/', {
  autoConnect: false,
  withCredentials: true,
});
