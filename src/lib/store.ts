import { useSyncExternalStore } from 'react'

/** Tiny external store: immutable snapshots, subscribe-able, usable from hooks. */
export function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  const get = () => state
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  return {
    get,
    subscribe,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
      listeners.forEach((l) => l())
    },
    use(): T {
      return useSyncExternalStore(subscribe, get)
    },
  }
}
