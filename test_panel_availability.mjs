import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveSlots, expandRecurring } from './server/services/availability.js';
import { editableSlots, slotDays } from './client/src/utils/availability.js';

test('hidden third-week demo slots and expired slots are removed from the save payload', () => {
  const now = new Date('2026-11-12T12:00:00');
  const slots = [
    { date: '2026-11-09', time: '08:00' },
    { date: '2026-11-12', time: '10:00' },
    { date: '2026-11-12', time: '13:00' },
    { date: '2026-11-20', time: '17:00' },
    { date: '2026-11-23', time: '08:00' },
    { date: '2026-11-26', time: '17:00' },
    { date: '2026-11-14', time: '08:00' },
  ];
  const expected = [slots[2], slots[3]];
  assert.deepEqual(editableSlots(slots, now), expected);
  assert.deepEqual(effectiveSlots(slots, [], now), expected);
});

test('saving after a week rollover recalculates the editable window', () => {
  const slots = [{ date: '2026-11-13', time: '17:00' }, { date: '2026-11-20', time: '17:00' }];
  assert.equal(editableSlots(slots, new Date('2026-11-12T12:00:00')).length, 2);
  assert.deepEqual(editableSlots(slots, new Date('2026-11-16T08:00:00')), [slots[1]]);
  assert.deepEqual(editableSlots(slots, new Date('2026-11-23T08:00:00')), []);
});

test('demo and recurring availability fit the picker on every day of the week', () => {
  const pattern = [1, 2, 3, 4, 5].flatMap(weekday => ['08:00', '10:00', '13:00', '15:00', '17:00'].map(time => ({ weekday, time })));
  for (let day = 9; day <= 15; day++) {
    const now = new Date(2026, 10, day, 12);
    const slots = expandRecurring(pattern, now);
    assert.equal(slotDays(now).length, 10);
    assert.ok(slots.length > 0);
    assert.deepEqual(editableSlots(slots, now), slots);
    const merged = effectiveSlots(slots, pattern, now);
    assert.equal(merged.length, slots.length, 'Recurring and explicit slots are deduplicated');
  }
});

test('calendar window handles year boundaries', () => {
  const now = new Date('2026-12-31T12:00:00');
  assert.equal(slotDays(now)[0], '2026-12-28');
  assert.equal(slotDays(now).at(-1), '2027-01-08');
  assert.deepEqual(editableSlots([{ date: '2027-01-08', time: '17:00' }, { date: '2027-01-11', time: '08:00' }], now), [{ date: '2027-01-08', time: '17:00' }]);
});
