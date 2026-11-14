const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function slotDays(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    if (day.getDay() !== 0 && day.getDay() !== 6) days.push(dateKey(day));
  }
  return days;
}

// Use the same visible calendar window both when opening and saving the picker.
// Recalculate at save time in case the form has remained open across a week.
export function editableSlots(slots, now = new Date()) {
  const days = new Set(slotDays(now));
  return slots.filter(slot => days.has(slot.date) && /^(08|09|1[0-7]):00$/.test(slot.time)
    && new Date(`${slot.date}T${slot.time}:00`) > now);
}
