import { X } from 'lucide-react';
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
  'change-password': 'Change Password'
};

export default function Modals({ modal, onClose, today, handlers, notify, onChangePassword, forcedPasswordChange = false }) {
  if (!modal) return null;
  const { type, data } = modal;
  const fd = (e) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.target).entries());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900 font-heading">{TITLES[type] || 'Action'}</h3>
          {!forcedPasswordChange && <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>}
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
              className="w-full rounded-xl border border-slate-200 font-mono text-[11px] p-2.5 outline-none"
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
            <p className="text-[11px] text-slate-400">At least 12 characters with uppercase, lowercase, a number, and a symbol.</p>
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
                  <option>Admin</option><option>Operations</option><option>Manager</option><option>Resource</option><option>Sales</option>
                </select>
              </Field>
              <Field label="Default Landing Page">
                <select name="defaultPage" defaultValue={data?.defaultPage || 'Dashboard'} className={inputCls}>
                  <option>Dashboard</option><option>Employees</option><option>Bench Watch</option><option>Deployments</option>
                  <option>Roll-offs</option><option>Openings</option><option>Requests</option><option>Supply Demand</option>
                  <option>Reports</option><option>Settings</option><option>My Profile</option><option>My Applications</option>
                  <option>Who's Free</option><option>Upskilling</option>
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
      </div>
    </div>
  );
}

