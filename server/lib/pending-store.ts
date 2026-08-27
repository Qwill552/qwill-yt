import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Priority } from "../../src/lib/queue-store";

export type PendingItem = {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number | null;
  publishedAt: string | null;
  priority: Priority;
  addedAt: number;
};

const PENDING_FILE = join(process.cwd(), "data", "pending-queue.json");

let chain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<PendingItem[]> {
  try {
    const raw = await readFile(PENDING_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(items: PendingItem[]): Promise<void> {
  await mkdir(dirname(PENDING_FILE), { recursive: true });
  await writeFile(PENDING_FILE, JSON.stringify(items), "utf8");
}

export function enqueuePendingItem(item: PendingItem): Promise<void> {
  const task = chain.then(async () => {
    const items = await readAll();
    const next = [item, ...items.filter((existing) => existing.videoId !== item.videoId)];
    await writeAll(next);
  });
  chain = task.catch(() => undefined);
  return task;
}

export function drainPendingItems(): Promise<PendingItem[]> {
  const task = chain.then(async () => {
    const items = await readAll();
    if (items.length > 0) await writeAll([]);
    return items;
  });
  chain = task.catch(() => undefined) as Promise<unknown>;
  return task;
}
