import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * State holder for one screen (ScreenModel in Kotlin): plain fields and async methods, with
 * [changed] telling the screen to re-render. Lives until the screen is closed.
 */
export abstract class Model {
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private readonly timers = new Set<ReturnType<typeof setInterval>>();
  disposed = false;

  protected changed() {
    if (this.disposed) return;
    this.version++;
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  getVersion = () => this.version;

  /** Runs [f] every [ms] until the screen closes (a `while (true) { delay(); … }` loop in Kotlin). */
  protected every(ms: number, f: () => void) {
    this.timers.add(setInterval(() => !this.disposed && f(), ms));
  }

  /** Called when the screen appears (again); start loops here. */
  start() {}

  dispose() {
    this.disposed = true;
    this.timers.forEach(clearInterval);
    this.timers.clear();
  }
}

/** The screen's model: made once, re-rendering the screen whenever it changes. */
export function useModel<M extends Model>(create: () => M): M {
  const ref = useRef<M | null>(null);
  ref.current ??= create();
  const m = ref.current;
  useSyncExternalStore(m.subscribe, m.getVersion);
  useEffect(() => {
    m.disposed = false;
    m.start();
    return () => m.dispose();
  }, [m]);
  return m;
}
