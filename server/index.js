require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // we'll restrict this later for security
  }
});

// Middleware to understand JSON data sent from frontend
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB successfully!'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Basic test route
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Auth routes (signup/login)
app.use('/api/auth', authRoutes);

// Track which username belongs to which socket connection
const onlineUsers = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // When a user logs in on the frontend, they announce themselves here
  socket.on('registerUser', (username) => {
    onlineUsers[username] = socket.id;
    console.log(`${username} is online (${socket.id})`);
  });

  // Handle a private, already-encrypted message
  socket.on('sendPrivateMessage', ({ to, from, encryptedMessage, nonce }) => {
    const recipientSocketId = onlineUsers[to];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receivePrivateMessage', { from, encryptedMessage, nonce });
    }
    // Also send it back to the sender so their own chat window updates
    socket.emit('receivePrivateMessage', { from, encryptedMessage, nonce, self: true });
  });

  socket.on('disconnect', () => {
    // Remove this user from the online list
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