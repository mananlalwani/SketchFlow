const path = require('path');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10 * 1024 * 1024
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

io.on('connection', (socket) => {
  if (latestCanvasPayload) {
    socket.emit('canvas:snapshot', latestCanvasPayload);
  }

  socket.on('draw:stroke', (stroke) => {
    socket.broadcast.emit('draw:stroke', stroke);
  });

  socket.on('draw:strokes', (strokes) => {
    // Expect an array of stroke segments
    if (Array.isArray(strokes) && strokes.length) {
      socket.broadcast.emit('draw:strokes', strokes);
    }
  });

  socket.on('canvas:snapshot', (payload) => {
    latestCanvasPayload = payload;
    socket.broadcast.emit('canvas:snapshot', payload);
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



