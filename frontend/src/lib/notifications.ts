/**
 * Simple client-side notification store for DD check completions.
 * Persisted in localStorage so they survive page reloads.
 */

export interface AppNotification {
  id: string;
  message: string;
  projectId: string;
  projectTitle: string;
  read: boolean;
  createdAt: string;
}

const STORAGE_KEY = "dd_notifications";

function load(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function save(notifications: AppNotification[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 50)));
  } catch { /* ignore */ }
}

export function getNotifications(): AppNotification[] {
  return load();
}

export function getUnreadCount(): number {
  return load().filter((n) => !n.read).length;
}

export function addNotification(projectId: string, projectTitle: string, message: string) {
  const all = load();
  all.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    message,
    projectId,
    projectTitle,
    read: false,
    createdAt: new Date().toISOString(),
  });
  save(all);
}

export function markAllRead() {
  const all = load().map((n) => ({ ...n, read: true }));
  save(all);
}

export function clearNotifications() {
  save([]);
}
