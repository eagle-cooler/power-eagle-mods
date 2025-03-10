import fs from 'fs';
import { getDeep, setDeep, setDefaultDeep, popDeep } from './_traverse.js';

class JsonFile {
  // Add static instance tracker
  static _instances = new Map();

  // Singleton accessor
  static getInstance(filename, options = {}) {
    if (!JsonFile._instances.has(filename)) {
      JsonFile._instances.set(filename, new JsonFile(filename, options));
    }
    return JsonFile._instances.get(filename);
  }

  constructor(filename, options = {}) {
    // Singleton enforcement
    if (JsonFile._instances.has(filename)) {
      throw new Error(
        `JsonFile instance for ${filename} already exists. Use JsonFile.getInstance() instead.`
      );
    }
    JsonFile._instances.set(filename, this);

    this.filename = filename;
    this._lockPath = `${filename}.lock`;
    this._lockHolder = null;
    this._lastModified = 0;
    this._batchMode = false;
    this._queuedSave = false;

    // Configuration
    this.lockRetryInterval = options.lockRetryInterval || 100;
    this._lockTimeout = options.lockTimeout || 5000;
    this.lockMaxAge = options.lockMaxAge || 30;
    this.watchInterval = options.watchInterval || 3000;

    // Initialize data and watchers
    this.loadSync();
    this._setupWatcher();
    this._setupProxy();
  }

  _setupProxy() {
    this.data = new Proxy(this._data, {
      set: (target, prop, value) => {
        target[prop] = value;
        if (!this._batchMode) {
          this.save();
        } else {
          this._queuedSave = true;
        }
        return true;
      },
      deleteProperty: (target, prop) => {
        delete target[prop];
        if (!this._batchMode) {
          this.save();
        } else {
          this._queuedSave = true;
        }
        return true;
      },
    });
  }

  _setupWatcher() {
    this._watcherInterval = setInterval(async () => {
      try {
        const stats = fs.statSync(this.filename);
        if (stats.mtimeMs > this._lastModified) {
          await this.load();
        }
      } catch (error) {
        // File might be temporarily missing
      }
    }, this.watchInterval);
  }

  loadSync() {
    try {
      const content = fs.readFileSync(this.filename, 'utf8');
      this._data = JSON.parse(content);
      this._lastModified = fs.statSync(this.filename).mtimeMs;
    } catch (error) {
      this._data = {};
    }
  }

  async load() {
    await this.#acquireLock();
    try {
      this.loadSync();
    } finally {
      this.#releaseLock();
    }
  }

  async save() {
    if (this._batchMode) return;

    await this.#acquireLock();
    try {
      fs.writeFileSync(this.filename, JSON.stringify(this.data, null, 2));
      this._lastModified = fs.statSync(this.filename).mtimeMs;
    } finally {
      this.#releaseLock();
    }
  }

  async #acquireLock() {
    if (this._lockHolder === process.pid) return;

    const start = Date.now();
    while (fs.existsSync(this._lockPath)) {
      const stats = fs.statSync(this._lockPath);
      const lockAge = Date.now() - stats.ctimeMs;

      if (lockAge > this.lockMaxAge * 1000) {
        fs.unlinkSync(this._lockPath);
        break;
      }

      await new Promise((resolve) => setImmediate(resolve));
      if (Date.now() - start > this._lockTimeout) {
        throw new Error(
          `Lock acquisition timeout after ${this._lockTimeout}ms`
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.lockRetryInterval)
      );
    }

    try {
      fs.writeFileSync(this._lockPath, '', { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') return this.#acquireLock();
      throw error;
    }
    this._lockHolder = process.pid;
  }

  #releaseLock() {
    try {
      if (this._lockHolder === process.pid) {
        fs.unlinkSync(this._lockPath);
        this._lockHolder = null;
      }
    } catch (error) {
      console.error(`Lock release failed for ${this._lockPath}:`, error);
    }
  }

  // Batch mode handling
  beginBatch() {
    this._batchMode = true;
    this._queuedSave = false;
  }

  endBatch() {
    this._batchMode = false;
    if (this._queuedSave) {
      this.save();
      this._queuedSave = false;
    }
  }

  // Data manipulation methods
  get(key, defaultValue = null) {
    try {
      return getDeep(this.data, key);
    } catch (error) {
      return defaultValue;
    }
  }

  set(key, value) {
    setDeep(this.data, key, value);
  }

  setDefault(key, defaultValue) {
    return setDefaultDeep(this.data, key, defaultValue);
  }

  pop(key, defaultValue = null) {
    return popDeep(this.data, key, defaultValue);
  }

  // Cleanup
  close() {
    clearInterval(this._watcherInterval);
    JsonFile._instances.delete(this.filename);
  }
}

export default JsonFile;
