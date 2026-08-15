require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://private-chat-app-ten.vercel.app", "http://localhost:5173", "http://localhost:5174"],
  }
});

app.use(cors({
  origin: ["https://private-chat-app-ten.vercel.app", "http://localhost:5173", "http://localhost:5174"],
}));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB successfully!'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => {
  res.send('Server is running!');
});

app.use('/api/auth', authRoutes);

const onlineUsers = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('registerUser', (username) => {
    onlineUsers[username] = socket.id;
    console.log(`${username} is online (${socket.id})`);
  });

  socket.on('sendPrivateMessage', ({ to, from, encryptedMessage, nonce }) => {
    const recipientSocketId = onlineUsers[to];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receivePrivateMessage', { from, encryptedMessage, nonce });
    }
    socket.emit('receivePrivateMessage', { from, encryptedMessage, nonce, self: true });
  });

  // ---- Voice Call Signaling ----

  // Caller starts a call
  socket.on('callUser', ({ to, from, offer }) => {
    const recipientSocketId = onlineUsers[to];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('incomingCall', { from, offer });
    }
  });

  // Receiver accepts and sends back an answer
  socket.on('answerCall', ({ to, answer }) => {
    const recipientSocketId = onlineUsers[to];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('callAnswered', { answer });
    }
  });

  // Exchange ICE candidates (network connection info)
  socket.on('iceCandidate', ({ to, candidate }) => {
    const recipientSocketId = onlineUsers[to];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('iceCandidate', { candidate });
    }
  });

  // Either side ends the call
  socket.on('endCall', ({ to }) => {
    const recipientSocketId = onlineUsers[to];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('callEnded');
    }
  });

  socket.on('disconnect', () => {
    for (const [username, id] of Object.entries(onlineUsers)) {
      if (id === socket.id) delete onlineUsers[username];
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});