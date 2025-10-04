const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const spawn = require('child_process').spawn;
const dgram = require('dgram');
const eol = require('os').EOL;
const readline = require('readline');

// Enable keypress events
readline.emitKeypressEvents(process.stdin);
if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
}

// Configuration
const HTTP_PORT = 3000;
const STREAM_PORT = 3001;
const TELLO_IP = '192.168.10.1';
const TELLO_PORT = 8889;
const LOCAL_PORT = 8001; // Port to bind for receiving Tello responses

// =====================================================
// 1. SHARED UDP CLIENT (Single point of communication)
// =====================================================
const telloClient = dgram.createSocket('udp4');

// Try to bind, but handle if port is in use
telloClient.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[UDP Error] Port ${LOCAL_PORT} is in use. Kill the process or wait a moment.`);
        process.exit(1);
    } else {
        console.error(`[UDP Error] ${err}`);
    }
});

telloClient.bind(LOCAL_PORT, () => {
    console.log(`[UDP Client] Bound to port ${LOCAL_PORT}`);
});

// Handle incoming messages from Tello
telloClient.on('message', (msg, info) => {
    console.log('info:',info)
    console.log(`[Tello Response] ${msg.toString()}`);
    console.log(`[Received ${msg.length} bytes from ${info.address}:${info.port}]`);
});

// Generic function to send commands to Tello
function sendToTello(command) {
    const message = Buffer.from(command);
    telloClient.send(message, 0, message.length, TELLO_PORT, TELLO_IP, (err) => {
        if (err) {
            console.error(`[Error sending '${command}'] ${err}`);
        } else {
            console.log(`[Sent to Tello] ${command}`);
        }
    });
}

// =====================================================
// 2. HTTP SERVER (Serves the web page for video viewing)
// =====================================================
const httpServer = http.createServer(function(request, response) {
    console.log(
        `[HTTP Connection] ${HTTP_PORT} from ${request.socket.remoteAddress}:${request.socket.remotePort}`
    );

    fs.readFile(__dirname + '/www/' + request.url, function (err, data) {
        if (err) {
            response.writeHead(404);
            response.end(JSON.stringify(err));
            return;
        }
        response.writeHead(200);
        response.end(data);
    });
}).listen(HTTP_PORT);

console.log(`[HTTP Server] Listening on port ${HTTP_PORT}`);

// =====================================================
// 3. STREAM SERVER (Receives video from FFmpeg)
// =====================================================
const streamServer = http.createServer(function(request, response) {
    console.log(
        `[Stream Connection] ${STREAM_PORT} from ${request.socket.remoteAddress}:${request.socket.remotePort}`
    );

    request.on('data', function(data) {
        webSocketServer.broadcast(data);
    });
}).listen(STREAM_PORT);

console.log(`[Stream Server] Listening on port ${STREAM_PORT}`);

// =====================================================
// 4. WEBSOCKET SERVER (Broadcasts video to browsers)
// =====================================================
const webSocketServer = new WebSocket.Server({
    server: streamServer
});

webSocketServer.broadcast = function(data) {
    webSocketServer.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

webSocketServer.on('connection', (ws) => {
    console.log('[WebSocket] Client connected');
});

console.log('[WebSocket Server] Ready');

// =====================================================
// 5. TELLO INITIALIZATION (Enable SDK mode and video)
// =====================================================
console.log('[Initializing Tello]...');
sendToTello('command');

setTimeout(() => {
    sendToTello('streamon');
    console.log('[Tello] Stream command sent');
}, 1000);

// =====================================================
// 6. FFMPEG VIDEO STREAM (Start after delay)
// =====================================================
setTimeout(function() {
    console.log('[Starting FFmpeg]...');

    const args = [
        "-i", "udp://0.0.0.0:11111",
        "-r", "30",
        "-s", "960x720",
        "-codec:v", "mpeg1video",
        "-b", "800k",
        "-f", "mpegts",
        "http://127.0.0.1:3001/stream"
    ];

    const streamer = spawn('ffmpeg', args);

    // Uncomment to see FFmpeg output
    // streamer.stderr.pipe(process.stderr);

    streamer.on("exit", function(code) {
        console.log(`[FFmpeg] Exited with code ${code}`);
    });

    console.log('[FFmpeg] Started successfully');
}, 3000);

// =====================================================
// 7. KEYBOARD CONTROL (Interactive command interface)
// =====================================================
const keyMap = new Map();
keyMap.set('h', 'help');
keyMap.set('c', 'command');
keyMap.set('t', 'takeoff');
keyMap.set(' ', 'land');
keyMap.set('f', 'forward');
keyMap.set('b', 'back');
keyMap.set('l', 'left');
keyMap.set('r', 'right');
keyMap.set('u', 'up');
keyMap.set('d', 'down');
keyMap.set('a', 'cw');
keyMap.set('s', 'ccw');
keyMap.set('w', 'battery?');
keyMap.set('z', 'time?');
keyMap.set('x', 'speed?');
keyMap.set('q', 'flip');
keyMap.set('v', 'streamon');
keyMap.set('n', 'streamoff');

function listKeys() {
    console.log(`${eol}[KEYBOARD CONTROLS]`);
    keyMap.forEach((value, key) => {
        console.log(`  ${key} - ${value}`);
    });
    console.log();
}

function executeCommand(command) {
    let distance, angle, direction;

    switch (command) {
        case 'help':
            listKeys();
            break;

        case 'command':
        case 'takeoff':
        case 'land':
        case 'streamon':
        case 'streamoff':
        case 'battery?':
        case 'time?':
        case 'speed?':
            sendToTello(command);
            break;

        case 'up':
        case 'down':
            distance = 40;
            sendToTello(`${command} ${distance}`);
            break;

        case 'left':
        case 'right':
        case 'forward':
        case 'back':
            distance = 50;
            sendToTello(`${command} ${distance}`);
            break;

        case 'cw':
        case 'ccw':
            angle = 90;
            sendToTello(`${command} ${angle}`);
            break;

        case 'flip':
            direction = 'f'; // forward flip
            sendToTello(`flip ${direction}`);
            break;

        default:
            console.log(`[Unknown command] ${command}`);
    }
}

process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
        console.log('\n[Shutting down]...');
        sendToTello('land'); // Safety: land before exiting
        setTimeout(() => {
            telloClient.close();
            process.exit();
        }, 1000);
    } else if (key.name === 'h') {
        listKeys();
    } else {
        if (keyMap.has(str)) {
            executeCommand(keyMap.get(str));
        } else {
            console.log(`[No command mapped to key: "${str}"]`);
        }
    }
});

// =====================================================
// 8. STARTUP MESSAGE
// =====================================================
console.log('===============================================');
console.log('   TELLO CONTROLLER WITH VIDEO STREAMING');
console.log('===============================================');
console.log(`Video URL: http://localhost:${HTTP_PORT}/index.html`);
console.log('Press H for keyboard controls');
console.log('Press Ctrl+C to exit safely');
console.log('===============================================\n');

listKeys();