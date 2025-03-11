import { EventSource } from 'eventsource';
import { spawn } from 'child_process';
import path from 'path';
import { resolve_python_env } from './run.js';
import { pip_install } from './setup.js';

const SERVER_PORT = 41599;

// Server management
let serverProcess = null;

/**
 * Check if the Python Flask server is available
 * @returns {Promise<boolean>}
 */
export async function is_server_available() {
  try {
    const response = await fetch(`http://localhost:${SERVER_PORT}/health`, {
      method: 'GET',
      timeout: 1000,
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Start the Python Flask server if not already running
 * @returns {Promise<void>}
 */
export async function start_server() {
  // Check if server is already available
  if (await is_server_available()) {
    console.log('Server already available on port', SERVER_PORT);
    return;
  }

  // Check if we have a process running in this instance
  if (serverProcess) {
    console.log('Cleaning up stale server process');
    try {
      serverProcess.kill();
    } catch (e) {
      console.warn('Failed to kill stale server process:', e);
    }
    serverProcess = null;
  }

  // Install Flask if not already installed
  await pip_install(['flask']);

  const pythonPath = await resolve_python_env();
  const serverScript = path.join(
    path.dirname(import.meta.url.substring(7)),
    'server.py'
  );

  // Set environment variables for the server
  const env = {
    ...process.env,
    PYTHON_PATH: pythonPath,
    PORT: SERVER_PORT.toString(),
  };

  console.log('Starting Python server...');

  // Start server process using spawn instead of execSync
  serverProcess = spawn(pythonPath, [serverScript], {
    env,
    stdio: 'inherit',
    detached: true,
  });

  // Wait for server to become available
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    if (await is_server_available()) {
      console.log('Server started and available on port', SERVER_PORT);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    attempts++;
  }

  throw new Error('Server failed to start after multiple attempts');
}

// Global subscriber instance
let globalSubscriber = null;

/**
 * StatefulSubscriber class for managing plugin subscriptions
 */
export class StatefulSubscriber {
  constructor(pluginId) {
    this.pluginId = pluginId;
    this.baseUrl = `http://localhost:${SERVER_PORT}`;
    this.handlers = {
      stdout: new Map(),
      stderr: new Map(),
      stdin: new Map(),
    };
    this.eventSources = {
      stdout: null,
      stderr: null,
    };
  }

  /**
   * Register a handler for a stream type
   * @param {string} streamType - Type of stream ('stdout' or 'stderr')
   * @param {Function} handler - Handler function
   * @param {Function} [matchFn] - Optional matching function
   * @returns {string} Handler ID
   */
  on(streamType, handler, matchFn = null) {
    if (!['stdout', 'stderr'].includes(streamType)) {
      throw new Error('Invalid stream type');
    }

    const handlerId = Math.random().toString(36).substring(7);
    this.handlers[streamType].set(handlerId, { handler, matchFn });

    // Start listening if not already
    if (!this.eventSources[streamType]) {
      this._startListening(streamType);
    }

    return handlerId;
  }

  /**
   * Remove a handler
   * @param {string} streamType - Type of stream
   * @param {string} handlerId - Handler ID to remove
   */
  off(streamType, handlerId) {
    if (this.handlers[streamType].has(handlerId)) {
      this.handlers[streamType].delete(handlerId);

      // Stop listening if no handlers left
      if (this.handlers[streamType].size === 0) {
        this._stopListening(streamType);
      }
    }
  }

  /**
   * Send input to the plugin
   * @param {string} input - Input to send
   */
  async sendBack(input) {
    const response = await fetch(`${this.baseUrl}/stdin/${this.pluginId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      throw new Error('Failed to send input');
    }
  }

  /**
   * Fire a function in the plugin
   * @param {string} funcName - Function name to execute
   * @param {Array} args - Arguments for the function
   * @param {Object} kwargs - Keyword arguments for the function
   */
  async fire(funcName, args = [], kwargs = {}) {
    const response = await fetch(`${this.baseUrl}/fire/${this.pluginId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ func: funcName, args, kwargs }),
    });

    if (!response.ok) {
      throw new Error('Failed to fire function');
    }
  }

  /**
   * Start listening to a stream
   * @private
   */
  _startListening(streamType) {
    const eventSource = new EventSource(
      `${this.baseUrl}/subscribe/${this.pluginId}/${streamType}`
    );

    eventSource.onmessage = (event) => {
      const data = event.data;

      // Call all matching handlers
      for (const [id, { handler, matchFn }] of this.handlers[streamType]) {
        if (!matchFn || matchFn(data)) {
          handler(data, this);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error(`Error in ${streamType} stream:`, error);
      this._stopListening(streamType);
      // Attempt to reconnect after a delay
      setTimeout(() => this._startListening(streamType), 5000);
    };

    this.eventSources[streamType] = eventSource;
  }

  /**
   * Stop listening to a stream
   * @private
   */
  _stopListening(streamType) {
    if (this.eventSources[streamType]) {
      this.eventSources[streamType].close();
      this.eventSources[streamType] = null;
    }
  }

  /**
   * Clean up all subscriptions
   */
  cleanup() {
    Object.keys(this.eventSources).forEach((streamType) => {
      this._stopListening(streamType);
    });
  }
}

/**
 * StatelessSubscriber class for simple event handling
 */
export class StatelessSubscriber {
  constructor(pluginId) {
    this.pluginId = pluginId;
    this.baseUrl = `http://localhost:${SERVER_PORT}`;
    this.eventSource = null;
  }

  /**
   * Subscribe to stdout with optional matching
   * @param {Function} handler - Handler function
   * @param {Function} [matchFn] - Optional matching function
   */
  onStdout(handler, matchFn = null) {
    this._subscribe('stdout', handler, matchFn);
  }

  /**
   * Subscribe to stderr
   * @param {Function} handler - Handler function
   */
  onError(handler) {
    this._subscribe('stderr', handler);
  }

  /**
   * Subscribe to a stream
   * @private
   */
  _subscribe(streamType, handler, matchFn = null) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const eventSource = new EventSource(
      `${this.baseUrl}/subscribe/${this.pluginId}/${streamType}`
    );

    eventSource.onmessage = (event) => {
      const data = event.data;
      if (!matchFn || matchFn(data)) {
        handler(data);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`Error in ${streamType} stream:`, error);
      eventSource.close();
      this.eventSource = null;
    };

    this.eventSource = eventSource;
  }

  /**
   * Clean up the subscription
   */
  cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

/**
 * GlobalSubscriber class for monitoring all plugin outputs
 */
class GlobalSubscriber {
  constructor() {
    this.baseUrl = `http://localhost:${SERVER_PORT}`;
    this.pluginHandlers = new Map();
    this.globalHandlers = {
      stdout: new Set(),
      stderr: new Set(),
    };
    this.eventSources = {
      stdout: null,
      stderr: null,
    };
    this.running = false;
  }

  /**
   * Start the global subscriber
   */
  async start() {
    if (this.running) return;

    // Ensure server is running
    await start_server();

    // Start listening to both streams
    this._startListening('stdout');
    this._startListening('stderr');

    this.running = true;
    console.log('Global subscriber started');
  }

  /**
   * Register a handler for a specific plugin
   * @param {string} pluginId - Plugin ID to monitor
   * @param {Object} handlers - Handler configuration
   * @param {Function} [handlers.stdout] - stdout handler
   * @param {Function} [handlers.stderr] - stderr handler
   * @param {Function} [handlers.match] - Optional matching function
   */
  onPlugin(pluginId, handlers) {
    this.pluginHandlers.set(pluginId, handlers);
  }

  /**
   * Remove handlers for a specific plugin
   * @param {string} pluginId - Plugin ID to remove handlers for
   */
  offPlugin(pluginId) {
    this.pluginHandlers.delete(pluginId);
  }

  /**
   * Register a global handler
   * @param {string} streamType - Type of stream ('stdout' or 'stderr')
   * @param {Function} handler - Handler function
   */
  onGlobal(streamType, handler) {
    if (streamType in this.globalHandlers) {
      this.globalHandlers[streamType].add(handler);
    }
  }

  /**
   * Remove a global handler
   * @param {string} streamType - Type of stream ('stdout' or 'stderr')
   * @param {Function} handler - Handler function to remove
   */
  offGlobal(streamType, handler) {
    if (streamType in this.globalHandlers) {
      this.globalHandlers[streamType].delete(handler);
    }
  }

  /**
   * Start listening to a stream
   * @private
   */
  _startListening(streamType) {
    if (this.eventSources[streamType]) {
      this.eventSources[streamType].close();
    }

    const eventSource = new EventSource(
      `${this.baseUrl}/subscribe/global/${streamType}`
    );

    eventSource.onmessage = (event) => {
      const data = event.data;

      // Parse plugin ID from output format: <plugin_id> [stream_type] message
      const match = data.match(/^<([^>]+)> \[([^\]]+)\] (.+)$/);
      if (match) {
        const [_, pluginId, type, message] = match;

        // Call plugin-specific handlers
        const pluginHandler = this.pluginHandlers.get(pluginId);
        if (pluginHandler) {
          const streamHandler = pluginHandler[streamType];
          const matchFn = pluginHandler.match;

          if (streamHandler && (!matchFn || matchFn(message))) {
            streamHandler(message, pluginId);
          }
        }

        // Call global handlers
        for (const handler of this.globalHandlers[streamType]) {
          handler(message, pluginId);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error(`Error in global ${streamType} stream:`, error);
      this.eventSources[streamType] = null;
      // Attempt to reconnect after a delay
      setTimeout(() => this._startListening(streamType), 5000);
    };

    this.eventSources[streamType] = eventSource;
  }

  /**
   * Stop the global subscriber
   */
  stop() {
    Object.values(this.eventSources).forEach((source) => {
      if (source) source.close();
    });
    this.eventSources = { stdout: null, stderr: null };
    this.running = false;
    console.log('Global subscriber stopped');
  }
}

/**
 * Get or create the global subscriber instance
 * @returns {GlobalSubscriber}
 */
export function getGlobalSubscriber() {
  if (!globalSubscriber) {
    globalSubscriber = new GlobalSubscriber();
  }
  return globalSubscriber;
}
