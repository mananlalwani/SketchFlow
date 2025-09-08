const path = require('path');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 50 * 1024 * 1024, // Increased for better canvas snapshots
  pingTimeout: 60000,
  pingInterval: 25000,
  compression: true,
  perMessageDeflate: {
    threshold: 1024,
    concurrencyLimit: 10,
    memLevel: 8
  },
  httpCompression: {
    threshold: 1024
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect('/view');
});

app.get('/draw', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'draw.html'));
});

app.get('/view', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

let latestCanvasPayload = null;
let activeConnections = 0;
const strokeBuffer = [];
const STROKE_BATCH_SIZE = 20;
const STROKE_BATCH_TIMEOUT = 16; // ~60fps

// Throttled snapshot broadcasting
let snapshotTimeout = null;
function broadcastSnapshotThrottled(payload) {
  if (snapshotTimeout) return;
  snapshotTimeout = setTimeout(() => {
    io.emit('canvas:snapshot', payload);
    snapshotTimeout = null;
  }, 100); // Max 10 snapshots per second
}

// Batch stroke processing for better performance
let strokeBatchTimeout = null;
function flushStrokeBatch() {
  if (strokeBuffer.length === 0) return;
  
  const batchToSend = strokeBuffer.splice(0, STROKE_BATCH_SIZE);
  io.emit('draw:strokes', batchToSend);
  
  if (strokeBuffer.length > 0) {
    strokeBatchTimeout = setTimeout(flushStrokeBatch, STROKE_BATCH_TIMEOUT);
  } else {
    strokeBatchTimeout = null;
  }
}

io.on('connection', (socket) => {
  activeConnections++;
  console.log(`Client connected. Active connections: ${activeConnections}`);
  
  // Send latest canvas state to new client
  if (latestCanvasPayload) {
    socket.emit('canvas:snapshot', latestCanvasPayload);
  }

  socket.on('disconnect', () => {
    activeConnections--;
    console.log(`Client disconnected. Active connections: ${activeConnections}`);
  });

  socket.on('draw:stroke', (stroke) => {
    // Validate stroke data
    if (!stroke || typeof stroke !== 'object') return;
    
    // Add to batch buffer
    strokeBuffer.push(stroke);
    
    // Start batch processing if not already running
    if (!strokeBatchTimeout) {
      strokeBatchTimeout = setTimeout(flushStrokeBatch, STROKE_BATCH_TIMEOUT);
    }
    
    // Immediate broadcast for small batches or single strokes
    if (strokeBuffer.length === 1) {
      socket.broadcast.emit('draw:stroke', stroke);
    }
  });

  socket.on('draw:strokes', (strokes) => {
    // Validate and batch process multiple strokes
    if (!Array.isArray(strokes) || strokes.length === 0) return;
    
    // Limit batch size to prevent memory issues
    const validStrokes = strokes.slice(0, 50).filter(s => s && typeof s === 'object');
    if (validStrokes.length === 0) return;
    
    strokeBuffer.push(...validStrokes);
    
    if (!strokeBatchTimeout) {
      strokeBatchTimeout = setTimeout(flushStrokeBatch, STROKE_BATCH_TIMEOUT);
    }
    
    // Immediate broadcast for real-time feedback
    socket.broadcast.emit('draw:strokes', validStrokes);
  });

  socket.on('canvas:snapshot', (payload) => {
    // Validate payload
    if (!payload) return;
    
    latestCanvasPayload = payload;
    broadcastSnapshotThrottled(payload);
  });
  
  // Handle connection errors gracefully
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

function getLocalIPs() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

server.listen(PORT, HOST, () => {
  const ips = getLocalIPs();
  console.log(`Live draw server running on:`);
  console.log(` - http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(` - http://${ip}:${PORT}`));
  console.log('Drawer: /draw  |  Viewer: /view');
});



