export type Thread = {
  id: string;
  title: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  updatedAt: number;
};

const KEY = 'ramana_threads_v1';

export function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Thread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveThreads(threads: Thread[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(threads));
  } catch {
    /* ignore */
  }
}

export function upsertThread(thread: Thread): void {
  const threads = loadThreads();
  const idx = threads.findIndex((t) => t.id === thread.id);
  if (idx >= 0) threads[idx] = thread; else threads.push(thread);
  saveThreads(threads.sort((a,b)=>b.updatedAt - a.updatedAt).slice(0, 10));
}


