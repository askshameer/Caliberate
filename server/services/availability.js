// Panel availability helpers.
// A panel member keeps explicit one-hour slots (YYYY-MM-DD + HH:MM) and an
// optional weekly recurring pattern ({ weekday: 1-5, time: 'HH:MM' }). The
// recurring pattern is expanded on the fly into the current + next calendar
// week so availability "rolls forward" without the panel re-entering it.

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function expandRecurring(recurring, now = new Date()) {
  if (!Array.isArray(recurring) || recurring.length === 0) return [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const slots = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const weekday = d.getDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const r of recurring) {
      if (Number(r.weekday) !== weekday) continue;
      const start = new Date(`${dateKey(d)}T${r.time}:00`);
      if (Number.isNaN(start.getTime()) || start <= now) continue;
      slots.push({ date: dateKey(d), time: r.time });
    }
  }
  return slots;
}

export function effectiveSlots(timeSlots, recurring, now = new Date()) {
  const merged = new Map();
  for (const s of [...(timeSlots || []), ...expandRecurring(recurring, now)]) {
    merged.set(`${s.date}|${s.time}`, { date: s.date, time: s.time });
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

