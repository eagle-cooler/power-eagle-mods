/* global eagle */
import JsonFile from '../utils/_jsonFile.js';
import path from 'path';
import { roamingPath } from '../utils/app.js';
import os from 'os';

// Scope enumeration
export const Scope = Object.freeze({
  APP: 'app',
  PLUGIN: 'plugin',
  ITEM: 'item',
  FOLDER: 'folder',
  LIBRARY: 'library',
  USER: 'user',
});

class FlagHandler {
  static #handlers = new Map();
  static #validations = new Map();

  /**
   * Register a flag handler with validation rules
   * @param {string} flag - The flag name
   * @param {Function} handler - The handler function that takes attributes and returns new attributes
   * @param {object} validation - Validation rules for the flag
   * @param {string[]} validation.invalidScopes - Scopes where this flag cannot be used
   * @param {Function} validation.requiresContext - Optional function to check if required context exists
   */
  static register(flag, handler, validation = {}) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    FlagHandler.#handlers.set(flag, handler);
    FlagHandler.#validations.set(flag, validation);
  }

  /**
   * Process flags and return additional attributes
   * @param {string} scope - The scope to process flags for
   * @param {Set<string>} flags - The flags to process
   * @param {object} attributes - Current attributes to extend
   * @return {object} The combined attributes
   */
  static processFlags(scope, flags, attributes = {}) {
    let result = { ...attributes };

    for (const flag of flags) {
      const handler = FlagHandler.#handlers.get(flag);
      if (handler) {
        result = handler(result);
      }
    }

    return result;
  }

  /**
   * Validate flags for a given scope
   * @param {string} scope - The scope to validate flags for
   * @param {string[]} flags - The flags to validate
   * @throws {Error} If invalid flag combination is found
   */
  static validateFlags(scope, flags) {
    for (const flag of flags) {
      const validation = FlagHandler.#validations.get(flag);
      if (!validation) continue;

      // Check invalid scopes
      if (validation.invalidScopes?.includes(scope)) {
        throw new Error(`Flag ${flag} cannot be used with scope ${scope}`);
      }

      // Check context requirements
      if (validation.requiresContext && !validation.requiresContext()) {
        throw new Error(
          `Flag ${flag} requires specific context that is not available`
        );
      }
    }
  }
}

// Register default flag handlers with their validation rules
FlagHandler.register(
  'pluginOnly',
  (attrs) => ({
    ...attrs,
    pluginId: eagle.plugin.manifest.id,
  }),
  {
    invalidScopes: ['plugin'],
    requiresContext: () => eagle?.plugin?.manifest?.id != null,
  }
);

FlagHandler.register(
  'folderOnly',
  (attrs) => ({
    ...attrs,
    folderOnly: true,
  }),
  {
    invalidScopes: ['folder'],
  }
);

class Config {
  constructor(scope, flags = []) {
    FlagHandler.validateFlags(scope, flags);
    this.scope = scope;
    this.flags = new Set(flags);
    this._args = null;
    this._cache = null;
    this.keyUpstreamToggle = true;
    this.keyUpstreamThreshold = 3;
  }

  /**
   * Supply arguments for the config instance
   * @param {object} args - Arguments object
   * @param {object | object[]} [args.item] - Single item or array of items
   * @param {object | object[]} [args.folder] - Single folder or array of folders
   * @return {Promise<Config>} The config instance for chaining
   * @throws {Error} If invalid arguments are provided
   */
  async supplyArgs(args = {}) {
    const { item, folder } = args;

    // Validate that we don't have both items and folders
    if (item && folder) {
      throw new Error('Cannot supply both items and folders');
    }

    // If no arguments provided, try to get from selection
    if (!item && !folder) {
      if (this.scope === Scope.ITEM) {
        const selected = await eagle.item.getSelected();
        if (!selected?.length) {
          throw new Error('No items selected');
        }
        this._args = { item: selected };
      } else if (this.scope === Scope.FOLDER) {
        const selected = await eagle.folder.getSelected();
        if (!selected?.length) {
          throw new Error('No folders selected');
        }
        this._args = { folder: selected };
      }
    } else {
      this._args = args;
    }

    // Create cache after args are set
    this._cache = this.#createCache();
    return this;
  }

  #createCache() {
    switch (this.scope) {
      case Scope.APP:
        return JsonFile.getInstance(
          path.join(roamingPath, 'coolerConfig.json')
        );

      case Scope.PLUGIN:
        if (!eagle?.plugin?.manifest?.id) {
          throw new Error('Plugin scope requires active plugin context');
        }
        return JsonFile.getInstance(
          path.join(eagle.plugin.path, 'coolerConfig.json')
        );

      case Scope.ITEM: {
        if (!this._args?.item) {
          throw new Error('Item scope requires items to be supplied');
        }
        const items = Array.isArray(this._args.item)
          ? this._args.item
          : [this._args.item];

        // For multiple items, use the first item's directory
        return JsonFile.getInstance(
          path.join(path.dirname(items[0].filePath), 'coolerConfig.json')
        );
      }

      case Scope.FOLDER:
        if (!eagle?.library?.path) {
          throw new Error('Folder scope requires active library context');
        }
        return JsonFile.getInstance(
          path.join(eagle.library.path, 'coolerConfig.json')
        );

      case Scope.LIBRARY:
        if (!eagle?.library?.path) {
          throw new Error('Library scope requires active library context');
        }
        return JsonFile.getInstance(
          path.join(eagle.library.path, 'coolerConfig.json')
        );

      case Scope.USER:
        return JsonFile.getInstance(
          path.join(os.homedir(), '.eaglecooler', 'coolerConfig.json')
        );

      default:
        throw new Error(`Invalid scope: ${this.scope}`);
    }
  }

  #getCache() {
    if (!this._cache) {
      this._cache = this.#createCache();
    }
    return this._cache;
  }

  #parseKeyWithAttributes(key) {
    // Check if key starts with a JSON object
    const match = key.match(/^\{([^}]+)\}(.+)$/);
    if (!match) {
      return { attributes: {}, key };
    }

    const [, attrsStr, actualKey] = match;

    // Parse the attributes string
    const attributes = {};
    const pairs = attrsStr.split('&');

    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (k && v) {
        attributes[k] = v;
      }
    }

    return { attributes, key: actualKey };
  }

  #buildKeyWithAttributes(attributes, key) {
    if (!attributes || Object.keys(attributes).length === 0) {
      return key;
    }

    // Sort attributes to ensure consistent key generation
    const sortedEntries = Object.entries(attributes).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const attrsStr = sortedEntries.map(([k, v]) => `${k}=${v}`).join('&');

    return `{${attrsStr}}${key}`;
  }

  #buildKey(key) {
    // Parse any existing attributes from the key
    const { attributes, key: baseKey } = this.#parseKeyWithAttributes(key);

    // Process flags to add additional attributes
    const scopeAttributes = FlagHandler.processFlags(
      this.scope,
      this.flags,
      attributes
    );

    // Build the final key with all attributes
    return this.#buildKeyWithAttributes(scopeAttributes, baseKey);
  }

  /**
   * Check if we should use upstream storage based on the number of items/folders
   * @private
   * @return {boolean} Whether upstream storage should be used
   */
  #shouldUseUpstream() {
    if (!this.keyUpstreamToggle) return false;

    const items = this._args?.item;
    const folders = this._args?.folder;
    const count = Array.isArray(items)
      ? items.length
      : Array.isArray(folders)
        ? folders.length
        : 0;

    return count > this.keyUpstreamThreshold;
  }

  /**
   * Generate a unique reference ID
   * @private
   * @return {string} A unique reference ID
   */
  #generateRefId() {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Store data at library level with references
   * @private
   * @param {string} key - The key to store
   * @param {*} value - The value to store
   * @return {string} The reference ID
   */
  #storeUpstream(key, value) {
    const refId = this.#generateRefId();
    const libraryConfig = JsonFile.getInstance(
      path.join(eagle.library.path, 'coolerConfig.json')
    );

    // Get the items/folders to store in the reference
    const items = this._args?.item;
    const folders = this._args?.folder;
    const affected = Array.isArray(items)
      ? items
      : Array.isArray(folders)
        ? folders
        : [];

    // Store the reference mapping
    libraryConfig.set(`@${refId}`, affected);

    // Store the actual data with reference ID in attributes
    const { attributes, key: baseKey } = this.#parseKeyWithAttributes(key);
    const dataKey = this.#buildKeyWithAttributes(
      { ...attributes, ref: refId },
      baseKey
    );
    libraryConfig.set(dataKey, value);

    return refId;
  }

  /**
   * Get data from library level using references
   * @private
   * @param {string} key - The key to retrieve
   * @return {*} The stored value or undefined
   */
  #getUpstream(key) {
    const libraryConfig = JsonFile.getInstance(
      path.join(eagle.library.path, 'coolerConfig.json')
    );

    // Get current items/folders
    const items = this._args?.item;
    const folders = this._args?.folder;
    const current = Array.isArray(items)
      ? items
      : Array.isArray(folders)
        ? folders
        : [];

    // Find a reference that matches our current items/folders
    for (const [refKey, affected] of Object.entries(libraryConfig.getAll())) {
      if (refKey.startsWith('@')) {
        const refId = refKey.substring(1);
        if (this.#areArraysEqual(affected, current)) {
          // Found matching reference, get the data
          const { attributes, key: baseKey } =
            this.#parseKeyWithAttributes(key);
          const dataKey = this.#buildKeyWithAttributes(
            { ...attributes, ref: refId },
            baseKey
          );
          return libraryConfig.get(dataKey);
        }
      }
    }

    return undefined;
  }

  /**
   * Compare two arrays for equality
   * @private
   * @param {Array} arr1 - First array
   * @param {Array} arr2 - Second array
   * @return {boolean} Whether the arrays are equal
   */
  #areArraysEqual(arr1, arr2) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) return false;
    if (arr1.length !== arr2.length) return false;

    // Sort both arrays by filePath for comparison
    const sorted1 = [...arr1].sort((a, b) =>
      a.filePath.localeCompare(b.filePath)
    );
    const sorted2 = [...arr2].sort((a, b) =>
      a.filePath.localeCompare(b.filePath)
    );

    return sorted1.every((item, i) => item.filePath === sorted2[i].filePath);
  }

  get(key) {
    if (this.#shouldUseUpstream()) {
      return this.#getUpstream(key);
    }
    return this.#getCache().get(this.#buildKey(key));
  }

  set(key, value) {
    if (this.#shouldUseUpstream()) {
      this.#storeUpstream(key, value);
    } else {
      this.#getCache().set(this.#buildKey(key), value);
    }
  }

  /**
   * Set a value only if it doesn't already exist
   * @param {string} key - The key to set
   * @param {*} value - The default value to set if key doesn't exist
   * @return {*} The existing value if present, otherwise the new value
   */
  setdefault(key, value) {
    const existingValue = this.get(key);
    if (existingValue === undefined) {
      this.set(key, value);
      return value;
    }
    return existingValue;
  }

  /**
   * Remove and return the value for a key
   * @param {string} key - The key to remove
   * @return {*} The value that was removed, or undefined if not found
   */
  pop(key) {
    const value = this.get(key);
    this.delete(key);
    return value;
  }

  delete(key) {
    if (this.#shouldUseUpstream()) {
      const libraryConfig = JsonFile.getInstance(
        path.join(eagle.library.path, 'coolerConfig.json')
      );

      // Get current items/folders
      const items = this._args?.item;
      const folders = this._args?.folder;
      const current = Array.isArray(items)
        ? items
        : Array.isArray(folders)
          ? folders
          : [];

      // Find and remove matching reference
      for (const [refKey, affected] of Object.entries(libraryConfig.getAll())) {
        if (refKey.startsWith('@')) {
          const refId = refKey.substring(1);
          if (this.#areArraysEqual(affected, current)) {
            // Remove the reference mapping
            libraryConfig.delete(refKey);

            // Remove the data entry
            const { attributes, key: baseKey } =
              this.#parseKeyWithAttributes(key);
            const dataKey = this.#buildKeyWithAttributes(
              { ...attributes, ref: refId },
              baseKey
            );
            libraryConfig.delete(dataKey);
            break;
          }
        }
      }
    } else {
      this.#getCache().delete(this.#buildKey(key));
    }
  }
}

/**
 * Creates a new Config instance for the given scope and flags.
 *
 * @param {string} scope - The scope of the configuration.
 * @param {string[]} flags - The flags to apply to the configuration.
 * @return {Config} A new Config instance.
 */
export function config(scope, flags = []) {
  return new Config(scope, flags);
}
