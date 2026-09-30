const TTL_MS = 5 * 60 * 1000;
const store = new Map();
const inflight = new Map();

function cacheKey(action, params) {
  return `${action}:${JSON.stringify(params)}`;
}

function readEntry(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function getCachedCatalog(action, params = {}) {
  return readEntry(cacheKey(action, params));
}

export function fetchCatalog(catalogFn, action, params = {}) {
  const key = cacheKey(action, params);
  const cached = readEntry(key);
  if (cached !== null) {
    return Promise.resolve(cached);
  }
  if (inflight.has(key)) {
    return inflight.get(key);
  }
  const promise = catalogFn(action, params)
    .then((data) => {
      store.set(key, { data, at: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, promise);
  return promise;
}

export function invalidateCatalog(action, params = {}) {
  store.delete(cacheKey(action, params));
}
