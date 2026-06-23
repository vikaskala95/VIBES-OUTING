const listeners = new Set();

const state = {
  user: null,
  token: null,
  outings: [],
  booking: null,
};

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch || {});
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
