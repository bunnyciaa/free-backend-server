document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const runBtn = document.getElementById('run-btn');
  const clearBtn = document.getElementById('clear-btn');
  const refreshBtn = document.getElementById('refresh-status-btn');
  const terminalOutput = document.getElementById('terminal-output');
  const terminalDot = document.getElementById('terminal-dot');
  const serverStatusTag = document.getElementById('server-status-tag');
  const executionStatusText = document.getElementById('execution-status');
  
  // System widgets
  const sysPlatform = document.getElementById('sys-platform');
  const sysArch = document.getElementById('sys-arch');
  const sysUptime = document.getElementById('sys-uptime');
  const sysMem = document.getElementById('sys-mem');

  let eventSource = null;

  // Initialize Lucide Icons
  lucide.createIcons();

  // Helper: Append a line to terminal with a custom CSS class
  function appendTerminalLine(text, className = 'log-line') {
    const line = document.createElement('div');
    line.className = className;
    line.textContent = text;
    terminalOutput.appendChild(line);
    
    // Auto-scroll to bottom of the terminal body
    const body = terminalOutput.parentElement;
    body.scrollTop = body.scrollHeight;
  }

  // Helper: Update Terminal Status Pill & Glowing Dot
  function updateTerminalStatus(status) {
    terminalDot.className = `pulse-dot ${status}`;
    executionStatusText.textContent = `STATUS: ${status.toUpperCase()}`;

    if (status === 'running') {
      runBtn.disabled = true;
      runBtn.innerHTML = `<i data-lucide="loader" class="btn-icon animate-spin"></i> Running...`;
    } else {
      runBtn.disabled = false;
      runBtn.innerHTML = `<i data-lucide="play" class="btn-icon"></i> Execute Tool`;
    }
    lucide.createIcons();
  }

  // Fetch Server & System Status
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('Server returned error status');
      const data = await res.json();

      // Update widgets
      sysPlatform.textContent = data.system.platform.toUpperCase();
      sysArch.textContent = data.system.arch;
      sysUptime.textContent = data.system.uptime;
      sysMem.textContent = data.system.memory;

      // Update status tag
      serverStatusTag.innerHTML = `
        <span class="status-indicator online"></span>
        <span class="status-text">Server Online</span>
      `;
    } catch (err) {
      console.error('Error fetching system status:', err);
      // Update widgets to fallback
      sysPlatform.textContent = 'Offline';
      sysArch.textContent = '-';
      sysUptime.textContent = '-';
      sysMem.textContent = '-';

      serverStatusTag.innerHTML = `
        <span class="status-indicator offline"></span>
        <span class="status-text">Server Offline</span>
      `;
    }
  }

  // Execute Script / Tool (SSE EventSource Connection)
  function executeTool() {
    // If an old connection exists, close it
    if (eventSource) {
      eventSource.close();
    }

    // Set UI to running
    updateTerminalStatus('running');
    appendTerminalLine('\n>>> [SYSTEM] Starting remote command execution stream...', 'system-line');

    // Create standard SSE EventSource connecting to /api/run
    eventSource = new EventSource('/api/run');

    // Handle initial connection info
    eventSource.addEventListener('info', (e) => {
      const data = JSON.parse(e.data);
      appendTerminalLine(`[SYSTEM] ${data.message}`, 'system-line');
    });

    // Handle normal stdout logs
    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      appendTerminalLine(data.text, 'log-line');
    });

    // Handle stderr errors
    eventSource.addEventListener('error', (e) => {
      // EventSource sends generic error events for network dropouts
      if (e.readyState === EventSource.CLOSED) {
        return;
      }
      try {
        const data = JSON.parse(e.data);
        appendTerminalLine(`[ERROR] ${data.text}`, 'error-line');
      } catch (err) {
        // Fallback for general connection issue
        appendTerminalLine('[SYSTEM] Disconnected from server.', 'error-line');
        updateTerminalStatus('error');
        eventSource.close();
      }
    });

    // Handle done event (script close)
    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      if (data.code === 0) {
        appendTerminalLine(`\n>>> [SYSTEM] Success: ${data.message}`, 'success-line');
        updateTerminalStatus('success');
      } else {
        appendTerminalLine(`\n>>> [SYSTEM] Failed: ${data.message}`, 'error-line');
        updateTerminalStatus('error');
      }
      eventSource.close();
      fetchStatus(); // Refresh widgets after completion
    });

    // Handle catastrophic system error
    eventSource.addEventListener('system-error', (e) => {
      const data = JSON.parse(e.data);
      appendTerminalLine(`[CRITICAL ERROR] ${data.message}`, 'error-line');
      updateTerminalStatus('error');
      eventSource.close();
    });
  }

  // Event Listeners
  runBtn.addEventListener('click', executeTool);

  clearBtn.addEventListener('click', () => {
    terminalOutput.innerHTML = '<div class="system-line">[SYSTEM] Terminal logs cleared. Ready to execute.</div>';
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
      // Keep running status if active
    } else {
      updateTerminalStatus('idle');
    }
  });

  refreshBtn.addEventListener('click', () => {
    fetchStatus();
    appendTerminalLine('[SYSTEM] Manually updated resource metrics.', 'system-line');
  });

  // Initial Load & Polling (every 15 seconds)
  fetchStatus();
  setInterval(fetchStatus, 15000);
});
