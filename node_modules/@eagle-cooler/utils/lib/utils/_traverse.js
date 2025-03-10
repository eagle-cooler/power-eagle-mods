/**
 * Internal traversal helper for deep object operations
 * @param {object} obj - Target object
 * @param {string[]} keys - Path keys
 * @param {boolean} createMissing - Create missing keys
 * @return {any} Traversed value
 * @private
 */
function _traverse(obj, keys, createMissing = false) {
  let curr = obj;
  for (const key of keys) {
    if (curr === null || curr === undefined) {
      throw new Error(`Cannot traverse through null/undefined at key ${key}`);
    }

    if (Array.isArray(curr)) {
      const index = parseInt(key);
      if (createMissing && index >= curr.length) {
        curr.push(...Array(index - curr.length + 1).fill({}));
      }
      curr = curr[index];
    } else if (typeof curr === 'object') {
      if (createMissing && !(key in curr)) {
        curr[key] = {};
      }
      curr = curr[key];
    } else {
      throw new Error(`Cannot traverse through non-object type at key ${key}`);
    }
  }
  return curr;
}

/**
 * Gets deep property from object using path
 * @param {object} obj - Target object
 * @param {string} path - Path in format 'a/b/c'
 * @return {any} Found value
 */
function getDeep(obj, path) {
  const keys = path.split('/');
  return _traverse(obj, keys);
}

/**
 * Sets deep property in object using path
 * @param {object} obj - Target object
 * @param {string} path - Path in format 'a/b/c'
 * @param {any} value - Value to set
 */
function setDeep(obj, path, value) {
  const keys = path.split('/');
  const lastKey = keys.pop();
  const target = _traverse(obj, keys, true);

  if (Array.isArray(target)) {
    const index = parseInt(lastKey);
    if (index >= target.length) {
      target.push(...Array(index - target.length + 1).fill(null));
    }
    target[index] = value;
  } else if (typeof target === 'object') {
    target[lastKey] = value;
  } else {
    throw new Error('Cannot set property of non-object type');
  }
}

/**
 * Sets default value if path doesn't exist
 * @param {object} obj - Target object
 * @param {string} path - Path in format 'a/b/c'
 * @param {any} defaultValue - Default value to set
 * @return {any} Existing or newly set value
 */
function setDefaultDeep(obj, path, defaultValue) {
  const keys = path.split('/');
  const lastKey = keys.pop();
  const target = _traverse(obj, keys, true);

  if (Array.isArray(target)) {
    const index = parseInt(lastKey);
    if (index >= target.length) {
      target.push(...Array(index - target.length + 1).fill(null));
    }
    if (target[index] === undefined) {
      target[index] = defaultValue;
    }
    return target[index];
  } else if (typeof target === 'object') {
    if (!(lastKey in target)) {
      target[lastKey] = defaultValue;
    }
    return target[lastKey];
  }
  throw new Error('Cannot set default property of non-object type');
}

/**
 * Removes and returns value at path
 * @param {object} obj - Target object
 * @param {string} path - Path in format 'a/b/c'
 * @param {any} [defaultValue] - Default value if not found
 * @return {any} Removed value or default
 */
function popDeep(obj, path, defaultValue = null) {
  const keys = path.split('/');
  const lastKey = keys.pop();
  const target = _traverse(obj, keys);

  let value;
  if (Array.isArray(target)) {
    const index = parseInt(lastKey);
    value = index < target.length ? target[index] : defaultValue;
    if (index < target.length) {
      target.splice(index, 1);
    }
  } else if (typeof target === 'object') {
    value = lastKey in target ? target[lastKey] : defaultValue;
    delete target[lastKey];
  } else {
    throw new Error('Cannot pop property of non-object type');
  }
  return value;
}

export { getDeep, setDeep, setDefaultDeep, popDeep };
