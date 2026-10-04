import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { Write } from './logKinds';
import { supabase } from './supabase';

// Local-first writes: every log entry is saved on the phone first, then sent to Supabase in
// order. Rows carry ids generated here, and inserts ignore duplicates, so retrying after a
// dropped connection can never create a second copy.

type Op = Write & { opId: string; userId: string; queuedAt: string; error?: string };

type Snapshot = { pending: number; failed: Op[]; lastSyncedAt: number };

const STORAGE_KEY = 'norita.outbox.v1';
const RETRY_EVERY_MS = 30_000;

let queue: Op[] = [];
let failed: Op[] = [];
let lastSyncedAt = 0;
let flushing = false;
let snapshot: Snapshot = { pending: 0, failed: [], lastSyncedAt: 0 };
const listeners = new Set<() => void>();

const loaded = AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const saved = JSON.parse(raw) as { queue: Op[]; failed: Op[] };
    queue = saved.queue ?? [];
    failed = saved.failed ?? [];
    notify();
  })
  .catch((e) => console.warn('Could not read the offline queue', e));

function notify() {
  snapshot = { pending: queue.length, failed, lastSyncedAt };
  listeners.forEach((l) => l());
}

async function persist() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, failed }));
  notify();
}

export const newId = () => randomUUID();

export async function enqueue(userId: string, writes: Write[]) {
  await loaded;
  const queuedAt = new Date().toISOString();
  queue.push(...writes.map((w) => ({ ...w, opId: randomUUID(), userId, queuedAt })));
  await persist();
  void flush(userId);
}

// Network trouble, an expired session, rate limiting or a server hiccup: keep it and retry.
const isTransient = (status: number) => status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;

/** Sends this user's queued writes in order. Another user's entries stay queued until they sign in. */
export async function flush(userId: string) {
  await loaded;
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const op = queue.find((o) => o.userId === userId);
      if (!op) break;

      let status = 0;
      let message: string | undefined;
      try {
        const res = await supabase.from(op.table).upsert(op.row, { onConflict: 'id', ignoreDuplicates: true });
        status = res.status;
        message = res.error?.message;
        if (!res.error) status = 200;
      } catch (e) {
        message = String(e);
      }

      if (message && isTransient(status)) break;

      queue = queue.filter((o) => o !== op);
      if (message) {
        // Rejected by the database (e.g. a value out of range): park it so it doesn't block the rest.
        failed = [...failed, { ...op, error: message }];
      } else {
        lastSyncedAt = Date.now();
      }
      await persist();
    }
  } finally {
    flushing = false;
  }
}

export async function discardFailed() {
  failed = [];
  await persist();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOutbox() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** Keeps syncing in the background: on sign-in, every 30 s, and when the app comes to the foreground. */
export function useOutboxAutoFlush(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    void flush(userId);
    const timer = setInterval(() => void flush(userId), RETRY_EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush(userId);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId]);
}
