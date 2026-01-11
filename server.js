const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  maxHttpBufferSize: 50e6 // 50MB
});

const PORT = 3000;

// Create tmp directory if it doesn't exist
const tmpDir = path.join(os.tmpdir(), 'local-chat-files');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Serve static files
app.use(express.static('public'));
app.use('/files', express.static(tmpDir));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/files/${req.file.filename}`
  });
});

// Store active users and message cache
const users = new Map();
const messageCache = []; // Keep last 100 messages
const MAX_MESSAGES = 100;

// Add message to cache
function addToCache(message) {
  messageCache.push(message);
  if (messageCache.length > MAX_MESSAGES) {
    messageCache.shift();
  }
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Handle user joining
  socket.on('join', (username) => {
    const clientIP = socket.handshake.address.replace('::ffff:', '');
    const userWithIP = `${username} (${clientIP})`;
    users.set(socket.id, userWithIP);
    
    // Send message history to new user
    socket.emit('message history', messageCache);
    
    // Notify all users
    const joinMessage = {
      type: 'system',
      text: `${userWithIP} join chat`,
      userCount: users.size,
      timestamp: Date.now()
    };
    io.emit('user joined', joinMessage);
    addToCache(joinMessage);
    
    // Send current user list to the new user
    socket.emit('user list', Array.from(users.values()));
    
    console.log(`${userWithIP} joined. Total users: ${users.size}`);
  });

  // Handle chat messages
  socket.on('chat message', (msg) => {
    const username = users.get(socket.id);
    if (username) {
      const message = {
        type: 'message',
        username,
        message: msg,
        timestamp: Date.now()
      };
      io.emit('chat message', message);
      addToCache(message);
    }
  });

  // Handle image messages
  socket.on('image message', (data) => {
    const username = users.get(socket.id);
    if (username) {
      const message = {
        type: 'image',
        username,
        imageData: data.imageData,
        timestamp: Date.now()
      };
      io.emit('chat message', message);
      addToCache(message);
    }
  });

  // Handle file messages
  socket.on('file message', (data) => {
    const username = users.get(socket.id);
    if (username) {
      const message = {
        type: 'file',
        username,
        filename: data.filename,
        originalName: data.originalName,
        size: data.size,
        url: data.url,
        timestamp: Date.now()
      };
      io.emit('chat message', message);
      addToCache(message);
    }
  });

  // Handle voice messages
  socket.on('voice message', (data) => {
    const username = users.get(socket.id);
    if (username) {
      const message = {
        type: 'voice',
        username,
        audioData: data.audioData,
        duration: data.duration,
        timestamp: Date.now()
      };
      io.emit('chat message', message);
      addToCache(message);
    }
  });

  // Handle user typing
  socket.on('typing', (isTyping) => {
    const username = users.get(socket.id);
    if (username) {
      socket.broadcast.emit('user typing', { username, isTyping });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const userWithIP = users.get(socket.id);
    if (userWithIP) {
      users.delete(socket.id);
      const leaveMessage = {
        type: 'system',
        text: `${userWithIP} leave chat`,
        userCount: users.size,
        timestamp: Date.now()
      };
      io.emit('user left', leaveMessage);
      addToCache(leaveMessage);
      console.log(`${userWithIP} left. Total users: ${users.size}`);
    }
  });
});

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let iface in interfaces) {
    for (let alias of interfaces[iface]) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('=================================');
  console.log(`local addr: http://localhost:${PORT}`);
  console.log(`local netowrk: http://${localIP}:${PORT}`);
  console.log(`tmp file: ${tmpDir}`);
  console.log('=================================\n');
});