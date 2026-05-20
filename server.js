const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'public')));

// Cache of the last execution logs
let lastExecution = {
  status: 'idle',
  output: '',
  timestamp: null,
};

// 1. Get System Status & Last Run
app.get('/api/status', (req, res) => {
  const uptime = process.uptime();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memUsagePercentage = (((totalMem - freeMem) / totalMem) * 100).toFixed(1);

  res.json({
    status: 'online',
    system: {
      platform: os.platform(),
      arch: os.arch(),
      uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
      memory: `${memUsagePercentage}% used`,
      cpuCount: os.cpus().length,
    },
    lastRun: lastExecution,
  });
});

// 2. Stream Script Execution Logs using Server-Sent Events (SSE)
app.get('/api/run', (req, res) => {
  // Set headers for Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('info', { message: 'Initializing script execution...' });
  lastExecution.status = 'running';
  lastExecution.output = '';
  lastExecution.timestamp = new Date().toISOString();

  // Path to our tool/script
  const scriptPath = path.join(__dirname, 'tools', 'my_script.js');

  // Spawn the child process (running node tools/my_script.js)
  // You can easily change this to 'python', ['my_script.py'] or any other executable
  const child = spawn('node', [scriptPath]);

  child.stdout.on('data', (data) => {
    const chunk = data.toString();
    lastExecution.output += chunk;
    sendEvent('log', { text: chunk });
  });

  child.stderr.on('data', (data) => {
    const chunk = data.toString();
    lastExecution.output += `[ERROR] ${chunk}`;
    sendEvent('error', { text: chunk });
  });

  child.on('close', (code) => {
    lastExecution.status = code === 0 ? 'success' : 'failed';
    sendEvent('done', {
      code,
      message: code === 0 ? 'Script completed successfully!' : `Script exited with error code ${code}`,
      status: lastExecution.status,
    });
    res.end();
  });

  child.on('error', (err) => {
    lastExecution.status = 'failed';
    lastExecution.output += `[SYSTEM ERROR] ${err.message}`;
    sendEvent('system-error', { message: err.message });
    res.end();
  });

  // If the user cancels/disconnects the HTTP request, kill the child process
  req.on('close', () => {
    if (child && !child.killed) {
      child.kill();
    }
  });
});

// Wildcard endpoint to serve index.html for undefined routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Server is active at: http://localhost:${PORT}`);
  console.log(`🖥️  Local Platform: ${os.platform()} (${os.arch()})`);
  console.log(`====================================================`);
});
