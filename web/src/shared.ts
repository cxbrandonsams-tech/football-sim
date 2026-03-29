/** Strip "Error: " prefix that JS adds to String(e) */
export function friendlyError(e: unknown): string {
  if (e instanceof TypeError && e.message.toLowerCase().includes('fetch')) {
    return 'Network error — the server may be unavailable or starting up. Please try again.';
  }
  const s = String(e);
  return s.startsWith('Error: ') ? s.slice(7) : s;
}

/** Format a timestamp: time-only if today, date+time otherwise */
export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}
