import React, { useEffect, useState } from 'react';
import { apiGet, apiUpload } from '../hooks/useApi';

const inputClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
const buttonClass = 'rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';

export function BackupRestore() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const download = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const backup = await apiGet('/settings/backup');
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `caliberate-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Backup downloaded.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const select = async (selected) => {
    setFile(null); setPreview(null); setConfirm(''); setError(''); setMessage('');
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.size > 100 * 1024 * 1024) throw new Error('Backups must be 100 MB or smaller.');
      const data = JSON.parse(await selected.text());
      if (data.format !== 'caliberate-backup' || data.version !== 1 || !Array.isArray(data.tables?.users) || !Array.isArray(data.files)) throw new Error('Choose a Caliberate backup file.');
      setPreview({ createdAt: data.createdAt, users: data.tables.users.length, people: data.tables.people?.length || 0, files: data.files.length });
      setFile(selected);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const restore = async (event) => {
    event.preventDefault();
    if (!file || confirm !== 'RESTORE' || busy) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('confirm', confirm); form.append('backup', file);
      await apiUpload('/settings/restore', form);
      localStorage.removeItem('caliberate_user'); localStorage.removeItem('caliberate_token');
      setMessage('Backup restored. Sign in with an account and password from the backup.');
      setFile(null); setPreview(null);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const restored = message.startsWith('Backup restored.');
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900">Backup &amp; Restore</h1><p className="mt-1 text-sm text-slate-500">Save a complete copy of Caliberate or recover a previous snapshot.</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message} {restored && <a href="/login" className="font-bold underline">Go to sign in</a>}</div>}
    <div className="space-y-3 rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-bold">Download backup</h2>
      <p className="text-sm text-slate-600">Includes all accounts, password hashes, business records, settings, audit and login history, and uploaded resumes. Keep this file private. Maximum backup size: 100 MB.</p>
      <button className={buttonClass} disabled={busy || restored} onClick={download}>Download backup</button>
    </div>
    <form onSubmit={restore} className="space-y-4 rounded-2xl border border-amber-200 bg-white p-6">
      <h2 className="text-lg font-bold">Restore backup</h2>
      <p className="text-sm text-slate-600">Restoring replaces all current accounts, records and uploaded resumes. All sessions end. You must know an administrator password from the backup to sign in afterward. Download a current backup first if you may need to undo this.</p>
      <label className="block text-sm font-semibold">Backup file<input type="file" accept=".json,application/json" disabled={busy || restored} onChange={event => select(event.target.files?.[0])} className="mt-2 block w-full text-sm" /></label>
      {preview && <p className="rounded-lg bg-slate-50 p-3 text-sm">Created: {new Date(preview.createdAt).toLocaleString()} · {preview.users} users · {preview.people} employees · {preview.files} uploaded files</p>}
      <label className="block text-sm font-semibold">Type RESTORE to replace current data<input value={confirm} disabled={busy || restored} onChange={event => setConfirm(event.target.value)} autoComplete="off" className={`${inputClass} mt-2 block`} /></label>
      <button className={buttonClass} disabled={!file || confirm !== 'RESTORE' || busy || restored}>{busy ? 'Working…' : 'Restore backup'}</button>
    </form>
  </section>;
}

export function LoginHistory() {
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({ entries: [], total: 0, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      apiGet(`/users/login-history?${new URLSearchParams({ search, outcome, page })}`)
        .then(result => { if (!cancelled) setData(result); })
        .catch(err => { if (!cancelled) setError(err.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, outcome, page, refresh]);
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900">Login History</h1><p className="mt-1 text-sm text-slate-500">Successful and failed sign-in attempts across all users. Times use your local timezone. Recording starts with this feature.</p></div>
    <div className="flex flex-wrap gap-3">
      <input aria-label="Search login history" placeholder="Search name or email" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className={inputClass} />
      <select aria-label="Filter login outcome" value={outcome} onChange={event => { setOutcome(event.target.value); setPage(1); }} className={inputClass}>
        <option value="">All outcomes</option>{['Success', 'Invalid credentials', 'Account locked', 'Inactive account'].map(value => <option key={value}>{value}</option>)}
      </select>
      <button onClick={() => setRefresh(value => value + 1)} className={buttonClass}>Refresh</button>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {loading ? <p role="status">Loading login history…</p> : !error && <>
      <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600"><tr>{['Time', 'User', 'Role', 'Outcome', 'IP address', 'Browser / device'].map(title => <th key={title} className="p-3">{title}</th>)}</tr></thead>
        <tbody>{data.entries.map(entry => <tr key={entry.id} className="border-t">
          <td className="whitespace-nowrap p-3">{new Date(entry.time.replace(' ', 'T') + 'Z').toLocaleString()}</td>
          <td className="p-3"><p className="font-semibold">{entry.name || 'Unknown user'}</p><p className="text-slate-500">{entry.email}</p></td>
          <td className="p-3">{entry.role || '—'}</td><td className={`p-3 font-semibold ${entry.outcome === 'Success' ? 'text-emerald-700' : 'text-rose-700'}`}>{entry.outcome}</td>
          <td className="p-3">{entry.ip || '—'}</td><td className="max-w-xs break-words p-3 text-xs text-slate-500">{entry.user_agent || '—'}</td>
        </tr>)}{!data.entries.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No login attempts match these filters.</td></tr>}</tbody>
      </table></div>
      <div className="flex items-center justify-between gap-3 text-sm"><span>{data.total} attempts · Page {page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span><div className="flex gap-2">
        <button className={buttonClass} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
        <button className={buttonClass} disabled={page * data.limit >= data.total} onClick={() => setPage(value => value + 1)}>Next</button>
      </div></div>
    </>}
  </section>;
}
