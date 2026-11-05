import { X } from 'lucide-react';
import React, { useState } from 'react';
import { SKILL_TAXONOMY } from '../utils/constants';

const inputCls = 'w-full rounded-lg border border-slate-200 p-2 outline-none focus:border-teal-500';
const labelCls = 'block text-slate-500 font-semibold mb-1';

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Actions({ onCancel, submitLabel }) {
  return (
    <div className="pt-3 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
      <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 font-bold text-white hover:bg-teal-800">{submitLabel}</button>
    </div>
  );
}

const TITLES = {
  allocate: 'Project Deployment Allocation',
  'add-employee': 'Add New Resource',
  'post-job': 'Post Internal Opening',
  'add-skill': 'Add Skill to Profile',
  'add-cert': 'Add Certification',
  'request-allocation': 'Request Staffing Allocation',
  'bulk-import': 'Bulk CSV Import',
  'resume-parsed': 'Resume Uploaded',
  'user-form': 'User Account',
  'edit-preferences': 'Career Preferences',
  'edit-override': 'Bench Policy Override',
  'change-password': 'Change Password',
  'external-request': 'Raise External Hire Request',
  'external-candidate': 'Update External Candidate',
  'panel-form': 'Panel Member',
  'panel-profile': 'My Interview Profile',
  'schedule-interview': 'Schedule Interview',
  'reschedule-interview': 'Reschedule Interview'
};

const parseSkills = (value) => String(value || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const HOUR_STARTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Next two working weeks (Monday–Friday) starting from the current calendar
// week (Monday) — the only window a panel member can set availability for.
const slotDays = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const weekday = d.getDay();
    if (weekday === 0 || weekday === 6) continue;
    days.push(toDateKey(d));
  }
  return days; // 10 working days (5 current week + 5 next week)
};

function SlotPicker({ slotKeys, onToggle }) {
  const days = slotDays();
  const [currentWeek, nextWeek] = [days.slice(0, 5), days.slice(5)];
  const renderWeek = (week) => {
    const todayKey = toDateKey(new Date());
    return (
      <div className="slot-picker-scroll overflow-x-auto rounded-lg border border-slate-200" tabIndex={0} role="region" aria-label="Interview availability, scroll horizontally to see all days">
        <div className="grid grid-cols-[3.5rem_repeat(5,1fr)] bg-slate-50 border-b border-slate-200">
          <div className="px-1.5 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Start time</div>
          {week.map(date => {
            const d = new Date(`${date}T00:00:00`);
            return (
              <div key={date} className="px-1 py-1.5 text-center">
                <p className="text-xs font-bold text-slate-600">{WEEKDAY_LABELS[d.getDay()]}</p>
                <p className={`text-xs ${date === todayKey ? 'font-bold text-teal-700' : 'text-slate-400'}`}>{date.slice(5)}</p>
              </div>
            );
          })}
        </div>
        {HOUR_STARTS.map(time => (
          <div key={time} className="grid grid-cols-[3.5rem_repeat(5,1fr)] border-t border-slate-100 first:border-t-0">
            <div className={`px-1.5 py-1 text-xs font-semibold flex items-center justify-end pr-1.5 ${week.every(date => isPastSlot(date, time)) ? 'text-slate-300' : 'text-slate-500'}`}>{time}</div>
            {week.map(date => {
              const key = `${date}|${time}`;
              const checked = slotKeys.has(key);
              const past = isPastSlot(date, time);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={past}
                  onClick={() => onToggle(key)}
                  className={`h-6 rounded border text-xs font-semibold transition ${past ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed' : checked ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-400 border-slate-200 hover:border-teal-400 hover:text-teal-600'}`}
                >
                  {checked ? '✓' : ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };
  return (
    <div className="space-y-4 overflow-x-auto">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Current Week</p>
        {renderWeek(currentWeek)}
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Next Week</p>
        {renderWeek(nextWeek)}
      </div>
      <p className="text-xs text-slate-400">Each selected slot is a 1-hour interview block starting at the chosen time (08:00 – 18:00).</p>
    </div>
  );
}

const skillOptions = SKILL_TAXONOMY.map((s) => s.name);

const DOMAIN_OPTIONS = ['Digital', 'Cloud', 'Data', 'Enterprise / SAP', 'FinTech', 'HealthTech', 'Retail', 'Manufacturing', 'Telecom', 'Media', 'Analytics', 'Logistics'];

const localNowKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const isPastSlot = (date, time) => `${date} ${time}` <= localNowKey();

export default function Modals({ modal, onClose, today, handlers, notify, onChangePassword, forcedPasswordChange = false, externalRequests = [], panels = [], roster = [] }) {
  const isResched = modal?.type === 'reschedule-interview';
  const [selectedRequestId, setSelectedRequestId] = useState(() => (isResched ? modal?.data?.requestId : modal?.data?.id) || null);
  const [selectedPanelId, setSelectedPanelId] = useState(() => (isResched ? String(modal?.data?.panelId || '') : null));
  const [selectedSlot, setSelectedSlot] = useState(() => (isResched ? modal?.data?.scheduledAt || '' : ''));
  const [slotKeys, setSlotKeys] = useState(() => new Set((modal?.data?.timeSlots || []).map((s) => `${s.date}|${s.time}`)));
  const [selectedDomain, setSelectedDomain] = useState(() => (isResched ? (panels.find((p) => p.id === modal?.data?.panelId)?.domains || [])[0] || '' : ''));
  const [recurring, setRecurring] = useState(() => (modal?.data?.recurringSlots || []).length > 0);

  const toggleSlot = (key) => setSlotKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  // Past slots can no longer be offered, so they are dropped on save.
  const slotKeysToArray = () => [...slotKeys].sort()
    .filter((key) => !isPastSlot(...key.split('|')))
    .map((key) => {
      const [date, time] = key.split('|');
      return { date, time };
    });

  // Weekly pattern (Mon=1 ... Fri=5) derived from the selected slots.
  const recurringSlotsArray = () => {
    if (!recurring) return [];
    const seen = new Map();
    for (const key of slotKeys) {
      const [date, time] = key.split('|');
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (weekday >= 1 && weekday <= 5) seen.set(`${weekday}|${time}`, { weekday, time });
    }
    return [...seen.values()];
  };

  if (!modal) return null;
  const { type, data } = modal;
  const fd = (e) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.target).entries());
  };

  const selectedReq = externalRequests.find((r) => r.id === Number(selectedRequestId)) || null;
  const MAX_PER_WEEK = 4;
  const weekKey = (dateStr) => {
    const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toDateKey(d);
  };
  const weekLoad = (panelId, dateStr) => roster.filter((r) => r.panelId === panelId
    && r.status !== 'Cancelled'
    && !(isResched && r.id === data?.id)
    && weekKey(String(r.scheduledAt)) === weekKey(dateStr)).length;
  const domainOptions = [...new Set(panels.flatMap((p) => p.domains || []))].sort();
  const matchingPanels = selectedReq && selectedDomain
    ? panels
        .filter((p) => (p.domains || []).includes(selectedDomain))
        .filter((p) => (p.skills || []).some((s) => (selectedReq.skills || []).includes(s)))
        .map((p) => ({ ...p, matchedSkills: (p.skills || []).filter((s) => (selectedReq.skills || []).includes(s)) }))
    : [];
  const selectedPanel = panels.find((p) => p.id === Number(selectedPanelId)) || null;
  const isBooked = (s) => roster.some((r) => {
    if (r.status === 'Cancelled' || r.status === 'Completed') return false;
    if (isResched && r.id === data?.id) return false;
    if (r.panelId !== selectedPanel?.id || String(r.scheduledAt).slice(0, 10) !== s.date) return false;
    const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const start = mins(String(r.scheduledAt).slice(11, 16));
    return start >= mins(s.time) && start < mins(s.time) + 60;
  });
  const panelSlots = (selectedPanel?.timeSlots || [])
    .filter((s) => `${s.date} ${s.time}` > localNowKey() && !isBooked(s) && weekLoad(selectedPanel.id, s.date) < MAX_PER_WEEK)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return (
    <div key={`${type}-${data?.id || 'new'}`} className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="workspace-dialog w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900 font-heading">{TITLES[type] || 'Action'}</h3>
          {!forcedPasswordChange && <button aria-label="Close dialog" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>}
        </div>

        {type === 'allocate' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              if (!v.project.trim() || !v.customer.trim()) return notify('Project and customer are required.', 'error');
              if (v.end < v.start) return notify('End date must be on or after the start date.', 'error');
              const pct = Number(v.pct);
              if (!(pct >= 1 && pct <= 100)) return notify('Allocation must be between 1 and 100%.', 'error');
              handlers.saveAllocation(data, { ...v, project: v.project.trim(), customer: v.customer.trim(), pct, rate: Number(v.rate) || 0 });
            }}
          >
            <p className="rounded-lg bg-teal-50 p-2.5 font-semibold text-teal-800">Deploying: {data?.name} ({data?.title})</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer"><input name="customer" defaultValue={data?.customer || ''} required className={inputCls} /></Field>
              <Field label="Project Name"><input name="project" defaultValue={data?.project || ''} required className={inputCls} /></Field>
              <Field label="Start Date"><input name="start" type="date" defaultValue={data?.start || today} required className={inputCls} /></Field>
              <Field label="End Date"><input name="end" type="date" defaultValue={data?.end || ''} required className={inputCls} /></Field>
              <Field label="Allocation (%)"><input name="pct" type="number" min="1" max="100" defaultValue={data?.allocationPct || 100} className={inputCls} /></Field>
              <Field label="Billing Rate (USD/h)"><input name="rate" type="number" min="0" defaultValue={data?.rate || 90} className={inputCls} /></Field>
              <Field label="Extension Likelihood" className="col-span-2">
                <select name="extensionLikelihood" defaultValue={data?.extensionLikelihood || 'Unknown'} className={inputCls}>
                  <option value="Likely">Likely to Extend</option>
                  <option value="Unlikely">Unlikely (Will roll off)</option>
                  <option value="Unknown">Unknown (Follow up needed)</option>
                </select>
              </Field>
            </div>
            <Actions onCancel={onClose} submitLabel="Save Allocation" />
          </form>
        )}

        {type === 'add-employee' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              handlers.addEmployee({
                ...v,
                skills: v.skills.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ name, level: 'Intermediate', years: 3, lastUsed: today.slice(0, 7) })),
                dailyCost: Number(v.dailyCost) || 0,
                rate: Number(v.rate) || 0,
              });
            }}
          >
            <Field label="Full Name"><input name="name" placeholder="e.g. Maya Lin" required className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Corporate Email"><input name="email" type="email" placeholder="maya.lin@caliberate.io" className={inputCls} /></Field>
              <Field label="Job Designation"><input name="title" placeholder="Senior Frontend Engineer" required className={inputCls} /></Field>
              <Field label="Practice">
                <select name="practice" className={inputCls}>
                  <option>Digital</option><option>Cloud</option><option>Data</option><option>Enterprise / SAP</option>
                </select>
              </Field>
              <Field label="Reporting Manager"><input name="manager" defaultValue="Rachel Shah" required className={inputCls} /></Field>
              <Field label="Location"><input name="location" defaultValue="Bengaluru" required className={inputCls} /></Field>
              <Field label="Join Date"><input name="joinDate" type="date" defaultValue={today} required className={inputCls} /></Field>
              <Field label="Type">
                <select name="type" className={inputCls}><option>FTE</option><option>Contractor</option></select>
              </Field>
              <Field label="Cost Center"><input name="costCenter" defaultValue="CC-DIG-01" className={inputCls} /></Field>
              <Field label="Daily Loaded Cost (USD)"><input name="dailyCost" type="number" min="0" defaultValue="500" className={inputCls} /></Field>
              <Field label="Billing Rate (USD/h)"><input name="rate" type="number" min="0" defaultValue="90" className={inputCls} /></Field>
            </div>
            <Field label="Primary Skills (comma separated)"><input name="skills" defaultValue="React, TypeScript" className={inputCls} /></Field>
            <Actions onCancel={onClose} submitLabel="Add Employee" />
          </form>
        )}

        {type === 'post-job' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              if (v.end < v.start) return notify('End date must be after start date.', 'error');
              handlers.postJob({
                title: v.title.trim(), project: v.project.trim(), customer: v.customer.trim(), practice: v.practice,
                mustHave: v.mustHave.split(',').map((s) => s.trim()).filter(Boolean),
                niceToHave: v.niceToHave.split(',').map((s) => s.trim()).filter(Boolean),
                minExp: Number(v.minExp) || 0, location: v.location, start: v.start, end: v.end,
                positions: Number(v.positions) || 1, description: v.description, status: 'Open',
              });
            }}
          >
            <Field label="Job Title / Role"><input name="title" required className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer"><input name="customer" required className={inputCls} /></Field>
              <Field label="Project Name"><input name="project" required className={inputCls} /></Field>
              <Field label="Practice">
                <select name="practice" className={inputCls}><option>Digital</option><option>Cloud</option><option>Data</option><option>Enterprise / SAP</option></select>
              </Field>
              <Field label="Open Positions"><input name="positions" type="number" min="1" defaultValue="1" className={inputCls} /></Field>
              <Field label="Start Date"><input name="start" type="date" defaultValue={today} required className={inputCls} /></Field>
              <Field label="End Date"><input name="end" type="date" required className={inputCls} /></Field>
              <Field label="Location"><input name="location" defaultValue="Remote · Flexible" className={inputCls} /></Field>
              <Field label="Min. Experience (yrs)"><input name="minExp" type="number" min="0" defaultValue="3" className={inputCls} /></Field>
            </div>
            <Field label="Must-Have Skills (comma-separated)"><input name="mustHave" required className={inputCls} /></Field>
            <Field label="Nice-to-Have Skills (comma-separated)"><input name="niceToHave" className={inputCls} /></Field>
            <Field label="Description"><textarea name="description" rows={2} className={inputCls} /></Field>
            <Actions onCancel={onClose} submitLabel="Publish Opening" />
          </form>
        )}

        {type === 'add-skill' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              if (data.skills.some((s) => s.name.toLowerCase() === v.skillName.toLowerCase())) return notify('That skill already exists on your profile.', 'error');
              handlers.addSkill(data, { name: v.skillName, level: v.level, years: Number(v.years) || 1, lastUsed: today.slice(0, 7) });
            }}
          >
            <Field label="Skill Name">
              <select name="skillName" className={inputCls}>
                {SKILL_TAXONOMY.map((s) => <option key={s.id} value={s.name}>{s.name} ({s.category})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Proficiency">
                <select name="level" defaultValue="Intermediate" className={inputCls}><option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>Expert</option></select>
              </Field>
              <Field label="Years of Experience"><input name="years" type="number" min="1" defaultValue="3" className={inputCls} /></Field>
            </div>
            <Actions onCancel={onClose} submitLabel="Add Skill" />
          </form>
        )}

        {type === 'add-cert' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              handlers.addCert(data, { name: v.certName.trim(), issuer: v.issuer.trim(), expiry: v.expiry, verified: false });
            }}
          >
            <Field label="Certification Name"><input name="certName" required className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Issuer"><input name="issuer" required className={inputCls} /></Field>
              <Field label="Expiry Date"><input name="expiry" type="date" required className={inputCls} /></Field>
            </div>
            <Actions onCancel={onClose} submitLabel="Save Certification" />
          </form>
        )}

        {type === 'request-allocation' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              if (v.action === 'Deploy' && v.end < v.start) return notify('End date must be after start date.', 'error');
              handlers.requestAllocation(data, { ...v, pct: Number(v.pct) || 100, rate: Number(v.rate) || 0 });
            }}
          >
            <p className="rounded-lg bg-purple-50 p-2.5 font-semibold text-purple-800">Request for: {data?.name} ({data?.title})</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Action">
                <select name="action" className={inputCls}><option value="Deploy">Deploy to project</option><option value="Release">Release to bench</option></select>
              </Field>
              <Field label="Allocation (%)"><input name="pct" type="number" min="1" max="100" defaultValue="100" className={inputCls} /></Field>
              <Field label="Customer"><input name="customer" defaultValue={data?.customer || ''} className={inputCls} /></Field>
              <Field label="Project"><input name="project" defaultValue={data?.project || ''} className={inputCls} /></Field>
              <Field label="Start Date"><input name="start" type="date" defaultValue={today} className={inputCls} /></Field>
              <Field label="End Date"><input name="end" type="date" defaultValue="" className={inputCls} /></Field>
            </div>
            <input type="hidden" name="rate" value={data?.rate || 0} />
            <Field label="Justification"><textarea name="reason" rows={3} required className={inputCls} placeholder="Why should this change be approved?" /></Field>
            <Actions onCancel={onClose} submitLabel="Submit Request" />
          </form>
        )}

        {type === 'bulk-import' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              handlers.bulkImport(v.csv);
            }}
          >
            <p className="text-slate-600">
              One employee per line: <code>Name, Title, Practice, Manager, Location, Skill1; Skill2</code>
            </p>
            <textarea
              name="csv"
              rows={6}
              required
              defaultValue={'Devon Vance, Staff SRE, Cloud, Sam Rivera, New York, AWS; Terraform; Docker\nSunita Rao, QA Automation Engineer, Digital, Rachel Shah, Bengaluru, Java; Selenium'}
              className="w-full rounded-xl border border-slate-200 font-mono text-xs p-2.5 outline-none"
            />
            <Actions onCancel={onClose} submitLabel="Import Records" />
          </form>
        )}

        {type === 'resume-parsed' && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">Resume <strong>{data}</strong> was attached to your profile.</p>
            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-teal-700 px-4 py-2 font-bold text-white hover:bg-teal-800">Done</button>
            </div>
          </div>
        )}

        {type === 'change-password' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = fd(e);
              if (v.newPassword !== v.confirmPassword) return notify('New password and confirmation do not match.', 'error');
              try {
                await onChangePassword(v.currentPassword, v.newPassword);
              } catch (err) {
                notify(err.message || 'Could not update password.', 'error');
              }
            }}
          >
            {forcedPasswordChange && (
              <p className="rounded-lg bg-amber-50 p-2.5 font-semibold text-amber-800">
                Your administrator requires a password change before you can continue.
              </p>
            )}
            <Field label="Current Password"><input name="currentPassword" type="password" required className={inputCls} /></Field>
            <Field label="New Password"><input name="newPassword" type="password" minLength={12} required className={inputCls} /></Field>
            <Field label="Confirm New Password"><input name="confirmPassword" type="password" minLength={12} required className={inputCls} /></Field>
            <p className="text-xs text-slate-400">At least 12 characters with uppercase, lowercase, a number, and a symbol.</p>
            <div className="pt-3 flex justify-end gap-2">
              {!forcedPasswordChange && <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>}
              <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 font-bold text-white hover:bg-teal-800">Update Password</button>
            </div>
          </form>
        )}

        {type === 'edit-preferences' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              handlers.savePreferences(data, {
                relocate: v.relocate === 'on',
                travel: v.travel,
                domains: v.domains.split(',').map((s) => s.trim()).filter(Boolean)
              });
            }}
          >
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-3">
              <input id="relocate" name="relocate" type="checkbox" defaultChecked={Boolean(data?.preferences?.relocate)} className="rounded border-slate-300" />
              <label htmlFor="relocate" className="font-semibold text-slate-700">Willing to relocate</label>
            </div>
            <Field label="Travel Preference"><input name="travel" defaultValue={data?.preferences?.travel || 'Up to 25%'} className={inputCls} /></Field>
            <Field label="Preferred Domains (comma-separated)"><input name="domains" defaultValue={(data?.preferences?.domains || []).join(', ')} className={inputCls} /></Field>
            <Actions onCancel={onClose} submitLabel="Save Preferences" />
          </form>
        )}

        {type === 'edit-override' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              const override = {
                id: data?.id || `ovr-${Date.now()}`,
                scope: v.scope,
                scopeName: v.scopeName.trim(),
                amber: Number(v.amber),
                red: Number(v.red),
                critical: Number(v.critical)
              };
              if (!(override.amber < override.red && override.red < override.critical)) {
                return notify('Override thresholds must satisfy amber < red < critical.', 'error');
              }
              handlers.saveOverride(override);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Scope">
                <select name="scope" defaultValue={data?.scope || 'Practice'} className={inputCls}>
                  <option value="Practice">Practice</option>
                  <option value="Skill">Skill</option>
                </select>
              </Field>
              <Field label="Practice or Skill Name"><input name="scopeName" defaultValue={data?.scopeName || ''} required className={inputCls} /></Field>
              <Field label="Amber (days)"><input name="amber" type="number" min="1" defaultValue={data?.amber || 20} className={inputCls} /></Field>
              <Field label="Red (days)"><input name="red" type="number" min="2" defaultValue={data?.red || 30} className={inputCls} /></Field>
              <Field label="Critical (days)"><input name="critical" type="number" min="3" defaultValue={data?.critical || 50} className={inputCls} /></Field>
            </div>
            <Actions onCancel={onClose} submitLabel="Save Override" />
          </form>
        )}

        {type === 'user-form' && (
          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              const v = fd(e);
              const payload = {
                name: v.name.trim(),
                email: v.email.trim(),
                role: v.role,
                roleTitle: v.roleTitle.trim(),
                department: v.department.trim(),
                description: v.description.trim(),
                defaultPage: v.defaultPage,
                personId: v.personId ? Number(v.personId) : null,
                mustChangePassword: v.mustChangePassword === 'on',
                active: v.active === 'on'
              };
              if (v.password) payload.password = v.password;
              if (data) handlers.updateUser(data.id, payload);
              else handlers.createUser(payload);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full Name"><input name="name" defaultValue={data?.name || ''} required className={inputCls} /></Field>
              <Field label="Corporate Email"><input name="email" type="email" defaultValue={data?.email || ''} required className={inputCls} /></Field>
              <Field label="Role">
                <select name="role" defaultValue={data?.role || 'Resource'} className={inputCls}>
                  <option>Admin</option><option>Operations</option><option>Manager</option><option>Resource</option><option>Sales</option><option>Panel</option><option>TA</option>
                </select>
              </Field>
              <Field label="Default Landing Page">
                <select name="defaultPage" defaultValue={data?.defaultPage || 'Dashboard'} className={inputCls}>
                  <option>Dashboard</option><option>Employees</option><option>Bench Watch</option><option>Deployments</option>
                  <option>Roll-offs</option><option>Openings</option><option>Requests</option><option>Supply Demand</option>
                  <option>Reports</option><option>Settings</option><option>My Profile</option><option>My Applications</option>
                  <option>Who's Free</option><option>Upskilling</option><option>External Hires</option><option>Panels</option>
                  <option>Interview Roster</option><option>Interview Profile</option><option>My Schedule</option>
                </select>
              </Field>
              <Field label="Job Title / Role Title"><input name="roleTitle" defaultValue={data?.roleTitle || ''} className={inputCls} /></Field>
              <Field label="Department"><input name="department" defaultValue={data?.department || ''} className={inputCls} /></Field>
              <Field label="Linked Employee ID (optional)"><input name="personId" type="number" min="1" defaultValue={data?.personId || ''} className={inputCls} /></Field>
              <Field label={data ? 'Reset Password (optional)' : 'Temporary Password'}><input name="password" type="password" minLength={data ? undefined : 12} required={!data} className={inputCls} /></Field>
            </div>
            <Field label="Description"><textarea name="description" rows={2} defaultValue={data?.description || ''} className={inputCls} /></Field>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 font-semibold text-slate-700"><input name="mustChangePassword" type="checkbox" defaultChecked={data ? Boolean(data.mustChangePassword) : true} className="rounded border-slate-300" /> Require password change</label>
              <label className="flex items-center gap-2 font-semibold text-slate-700"><input name="active" type="checkbox" defaultChecked={data ? Boolean(data.active) : true} className="rounded border-slate-300" /> Account active</label>
            </div>
            <Actions onCancel={onClose} submitLabel={data ? 'Save User' : 'Create User'} />
          </form>
        )}

        {type === 'external-request' && (
          <form className="space-y-3 text-xs" onSubmit={(e) => {
            const v = fd(e);
            const payload = {
              jobTitle: v.jobTitle.trim(),
              project: v.project.trim(),
              customer: v.customer.trim(),
              practice: v.practice.trim(),
              skills: parseSkills(v.skills),
              experienceYears: Number(v.experienceYears) || 0,
              location: v.location.trim(),
              budgetRate: Number(v.budgetRate) || 0,
              reason: v.reason.trim()
            };
            if (payload.skills.length === 0) return notify('At least one required skill is needed.', 'error');
            handlers.createExternalRequest(payload);
          }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Job Title" className="col-span-2"><input name="jobTitle" required className={inputCls} placeholder="e.g. Senior Java & Cloud Engineer" /></Field>
              <Field label="Project"><input name="project" required className={inputCls} /></Field>
              <Field label="Customer"><input name="customer" required className={inputCls} /></Field>
              <Field label="Practice"><input name="practice" defaultValue="Digital" required className={inputCls} /></Field>
              <Field label="Location"><input name="location" defaultValue="Remote" className={inputCls} /></Field>
              <Field label="Required Skills (comma-separated)" className="col-span-2"><input name="skills" required className={inputCls} list="panel-skill-options" placeholder="e.g. Java, Spring Boot, Kafka" /></Field>
              <Field label="Experience (years)"><input name="experienceYears" type="number" min="0" className={inputCls} /></Field>
              <Field label="Budget Rate (USD/h)"><input name="budgetRate" type="number" min="0" className={inputCls} /></Field>
              <Field label="Justification" className="col-span-2"><textarea name="reason" rows={3} required minLength={5} className={inputCls} placeholder="Why is this requirement not covered internally?" /></Field>
            </div>
            <datalist id="panel-skill-options">{skillOptions.map((s) => <option key={s} value={s} />)}</datalist>
            <Actions onCancel={onClose} submitLabel="Raise Request" />
          </form>
        )}

        {type === 'external-candidate' && (
          <form className="space-y-3 text-xs" onSubmit={(e) => {
            const v = fd(e);
            handlers.updateCandidate(data.id, {
              candidateName: v.candidateName.trim(),
              candidateEmail: v.candidateEmail.trim() || null,
              candidateSkills: parseSkills(v.candidateSkills),
              candidateStatus: v.candidateStatus
            });
          }}>
            <p className="rounded-lg bg-slate-50 p-2.5 text-slate-600">Approved request: <strong className="text-slate-800">{data.jobTitle}</strong></p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Candidate Name" className="col-span-2"><input name="candidateName" defaultValue={data.candidateName || ''} required className={inputCls} /></Field>
              <Field label="Candidate Email"><input name="candidateEmail" type="email" defaultValue={data.candidateEmail || ''} className={inputCls} /></Field>
              <Field label="Candidate Status"><select name="candidateStatus" defaultValue={data.candidateStatus || 'Sourcing'} className={inputCls}><option>Sourcing</option><option>Interviewing</option><option>Offered</option><option>Hired</option><option>Rejected</option></select></Field>
              <Field label="Candidate Skills (comma-separated)" className="col-span-2"><input name="candidateSkills" defaultValue={(data.candidateSkills || []).join(', ')} className={inputCls} /></Field>
            </div>
            <Actions onCancel={onClose} submitLabel="Save Candidate" />
          </form>
        )}

        {type === 'panel-form' && (
          <form className="space-y-3 text-xs" onSubmit={(e) => {
            const form = e.target;
            const v = fd(e);
            const domains = Array.from(form.querySelectorAll('select[name="domains"] option:checked')).map(o => o.value);
            const payload = {
              name: v.name.trim(),
              email: v.email.trim() || null,
              skills: parseSkills(v.skills),
              domains,
              timeSlots: slotKeysToArray()
            };
            if (data) handlers.updatePanel(data.id, { ...payload, active: data.active });
            else handlers.savePanel({ ...payload, password: v.password || undefined });
          }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full Name"><input name="name" defaultValue={data?.name || ''} required className={inputCls} /></Field>
              <Field label="Email"><input name="email" type="email" defaultValue={data?.email || ''} className={inputCls} /></Field>
              {!data && <Field label="Temporary Password"><input name="password" type="password" minLength={12} className={inputCls} /></Field>}
              <Field label="Domain (multi-select)" className="col-span-2">
                <select name="domains" multiple size={4} defaultValue={data?.domains || []} className={inputCls}>
                  {DOMAIN_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Skills to interview (comma-separated)" className="col-span-2"><input name="skills" defaultValue={(data?.skills || []).join(', ')} className={inputCls} list="panel-skill-options" /></Field>
              <Field label="Availability (current & next week, 1-hour slots)" className="col-span-2"><SlotPicker slotKeys={slotKeys} onToggle={toggleSlot} /></Field>
            </div>
            <datalist id="panel-skill-options">{skillOptions.map((s) => <option key={s} value={s} />)}</datalist>
            <Actions onCancel={onClose} submitLabel={data ? 'Save Panel' : 'Add Panel'} />
          </form>
        )}

        {type === 'panel-profile' && (
          <form className="space-y-3 text-xs" onSubmit={(e) => {
            const form = e.target;
            const v = fd(e);
            const domains = Array.from(form.querySelectorAll('select[name="domains"] option:checked')).map(o => o.value);
            handlers.updateMyPanel({
              id: data.id,
              skills: parseSkills(v.skills),
              domains,
              timeSlots: slotKeysToArray(),
              recurringSlots: recurringSlotsArray()
            });
          }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Domain (multi-select)" className="col-span-2">
                <select name="domains" multiple size={4} defaultValue={data?.domains || []} className={inputCls}>
                  {DOMAIN_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Skills you can interview (comma-separated)" className="col-span-2"><input name="skills" defaultValue={(data?.skills || []).join(', ')} className={inputCls} list="panel-skill-options" /></Field>
              <Field label="Availability (current & next week, 1-hour slots)" className="col-span-2"><SlotPicker slotKeys={slotKeys} onToggle={toggleSlot} /></Field>
              <label className="col-span-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="mt-0.5 h-4 w-4 accent-teal-700" />
                <span>
                  <span className="block font-semibold text-teal-900">Repeat weekly (recurring availability)</span>
                  <span className="block text-xs text-teal-800/80">Every selected day &amp; time stays available each week, so you don't need to re-enter it. Untick to keep these slots for this period only.</span>
                </span>
              </label>
            </div>
            <datalist id="panel-skill-options">{skillOptions.map((s) => <option key={s} value={s} />)}</datalist>
            <Actions onCancel={onClose} submitLabel="Save Profile" />
          </form>
        )}

        {(type === 'schedule-interview' || type === 'reschedule-interview') && (
          <form className="space-y-3 text-xs" onSubmit={(e) => {
            e.preventDefault();
            const v = fd(e);
            const request = externalRequests.find((r) => r.id === Number(isResched ? selectedRequestId : v.requestId));
            if (!request) return notify('Select an approved external hire request.', 'error');
            if (!request.candidateName) return notify('Candidate details must be added before scheduling.', 'error');
            const panel = panels.find((p) => p.id === Number(v.panelId));
            if (!panel) return notify('Select a matching panel member.', 'error');
            if (!v.scheduledAt) return notify('Select an available time slot for this panel member.', 'error');
            const payload = {
              panelId: panel.id,
              roundNumber: Number(v.roundNumber) || 1,
              level: v.level.trim(),
              interviewType: v.interviewType.trim(),
              scheduledAt: v.scheduledAt,
              durationMinutes: 60,
              notes: v.notes.trim()
            };
            if (isResched) handlers.updateInterview(data.id, { ...payload, status: 'Rescheduled' });
            else handlers.scheduleInterview({ requestId: request.id, ...payload });
          }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="External Hire Request" className="col-span-2">
                <select name="requestId" disabled={isResched} value={selectedRequestId || ''} onChange={(e) => { setSelectedRequestId(e.target.value); setSelectedPanelId(''); setSelectedSlot(''); }} className={inputCls}>
                  <option value="">Select request…</option>
                  {externalRequests.filter((r) => r.status === 'Approved' && r.candidateName).map((r) => <option key={r.id} value={r.id}>{r.jobTitle} — {r.candidateName}</option>)}
                </select>
              </Field>
              {selectedReq && (
                <div className="col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="font-semibold text-slate-700">{selectedReq.jobTitle}</p>
                  <p className="text-xs text-slate-500">Candidate: {selectedReq.candidateName} · {selectedReq.customer}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(selectedReq.skills || []).map((s) => <span key={s} className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">{s}</span>)}
                  </div>
                </div>
              )}
              <Field label="Domain" className="col-span-2">
                <select name="domain" required value={selectedDomain} onChange={(e) => { setSelectedDomain(e.target.value); setSelectedPanelId(''); setSelectedSlot(''); }} className={inputCls}>
                  <option value="">Select domain first…</option>
                  {domainOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Panel Member (matching domain & skills, max 4 interviews/week)" className="col-span-2">
                <select name="panelId" required disabled={!selectedDomain || !selectedReq} value={selectedPanelId || ''} onChange={(e) => { setSelectedPanelId(e.target.value); setSelectedSlot(''); }} className={inputCls}>
                  <option value="">{selectedDomain ? 'Select matching panel…' : 'Select a domain to see panels'}</option>
                  {matchingPanels.map((p) => {
                    const loads = [0, 7].map((off) => {
                      const d = new Date(); d.setDate(d.getDate() + off);
                      return weekLoad(p.id, toDateKey(d));
                    });
                    const hasFullWeek = loads.some((n) => n >= MAX_PER_WEEK);
                    return <option key={p.id} value={p.id}>{p.name} — {p.matchedSkills.join(', ')} · this week {loads[0]}/{MAX_PER_WEEK}, next {loads[1]}/{MAX_PER_WEEK}{hasFullWeek ? ' (full week)' : ''}</option>;
                  })}
                </select>
              </Field>
              {selectedDomain && selectedReq && matchingPanels.length === 0 && <p className="col-span-2 text-xs text-rose-600">No panel members in {selectedDomain} match this job's skills.</p>}
              <Field label="Available Time Slot (from panel's availability)" className="col-span-2">
                <select name="scheduledAt" required value={selectedSlot || ''} onChange={(e) => setSelectedSlot(e.target.value)} className={inputCls}>
                  <option value="">Select an available 1-hour slot…</option>
                  {panelSlots.map((s) => <option key={`${s.date}|${s.time}`} value={`${s.date} ${s.time}`}>{s.date} · {s.time}</option>)}
                </select>
              </Field>
              {selectedPanelId && panelSlots.length === 0 && <p className="col-span-2 text-xs text-rose-600">No open availability slots left for this panel member.</p>}
              <Field label="Round Number"><input name="roundNumber" type="number" min="1" defaultValue={isResched ? data.roundNumber : 1} className={inputCls} /></Field>
              <Field label="Level"><input name="level" defaultValue={isResched ? (data.level || '') : 'L1'} className={inputCls} placeholder="L1 / L2 / L3 / Lead" /></Field>
              <Field label="Interview Type"><select name="interviewType" defaultValue={isResched ? data.interviewType : 'Technical'} className={inputCls}><option>Technical</option><option>HR</option><option>Managerial</option><option>Cultural</option></select></Field>
              <Field label="Notes" className="col-span-2"><textarea name="notes" rows={2} defaultValue={isResched ? (data.notes || '') : ''} className={inputCls} /></Field>
            </div>
            <Actions onCancel={onClose} submitLabel={isResched ? 'Reschedule & Block Panel Time' : 'Schedule & Block Panel Time'} />
          </form>
        )}
      </div>
    </div>
  );
}

