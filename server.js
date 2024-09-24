const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('join room', (roomId) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, []);
    }
    console.log(`Client joined room ${roomId}`);
  });

  socket.on('draw', (data) => {
    socket.to(data.roomId).emit('draw', data);
  });

  socket.on('clear', (roomId) => {
    socket.to(roomId).emit('clear');
  });
  socket.on('addWhitePage', (data) => {
  socket.to(data.roomId).emit('addWhitePage', data);
});

  socket.on('pageChange', (data) => {
    socket.to(data.roomId).emit('pageChange', { pageNum: data.pageNum });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
