import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard, Users, Flag, Layers, Briefcase, Settings,
  Search, Bell, ArrowUpRight, Download, Plus, X,
  UserCircle, ChevronRight, Shield, Calendar, CheckCircle2, AlertTriangle,
  Upload, Building, BookOpen,
  RefreshCw, Award, CheckSquare, BarChart2, Flame, Inbox,
  LogOut, Menu, UserCog, KeyRound, Pencil, UserPlus, CalendarDays
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from '../hooks/useApi';
import { dateDiff, getBenchFlagStatus, calculateMatch, calculateCompleteness } from '../utils/helpers';
import { TODAY } from '../utils/constants';
import Modals from './Modals';

export default function CaliberateApp() {
  const { currentUser, logout, role, isPrivileged, isAdmin, demoMode, changePassword } = useAuth();

  const [people, setPeople] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [externalRequests, setExternalRequests] = useState([]);
  const [panels, setPanels] = useState([]);
  const [roster, setRoster] = useState([]);
  const [myPanel, setMyPanel] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({ global: { amber: 10, red: 15, critical: 30 }, overrides: [], notifications: {} });

  const [page, setPage] = useState(() => currentUser?.defaultPage || 'Dashboard');
  const [activeResourcePersonId] = useState(() => currentUser?.personId || 1);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [practiceFilter, setPracticeFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [toast, setToast] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [selectedPersonForDrawer, setSelectedPersonForDrawer] = useState(null);
  const [drawerTab, setDrawerTab] = useState('overview');
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [rosterWeekOffset, setRosterWeekOffset] = useState(0);
  const [managerOrgView, setManagerOrgView] = useState('direct');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [evalPersonId, setEvalPersonId] = useState(null);
  const [draftSettings, setDraftSettings] = useState(null);
  const [experienceDraft, setExperienceDraft] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load data from API
  const loadData = useCallback(async () => {
    try {
      const [peopleData, jobsData, appsData, reqsData, settingsData, extData, panelsData, rosterData, myPanelData, notifData] = await Promise.all([
        apiGet(`/people?managerView=${managerOrgView}`),
        apiGet('/jobs'),
        apiGet('/applications').catch(() => []),
        apiGet('/requests').catch(() => []),
        apiGet('/settings'),
        apiGet('/external-requests').catch(() => []),
        apiGet('/panels').catch(() => []),
        apiGet('/interview-roster').catch(() => []),
        apiGet('/panels/me').catch(() => null),
        apiGet('/notifications').catch(() => [])
      ]);
      setPeople(peopleData);
      setJobs(jobsData);
      setApplications(appsData);
      setRequests(reqsData);
      setSettings(settingsData);
      setExternalRequests(extData);
      setPanels(panelsData);
      setRoster(rosterData);
      setMyPanel(myPanelData);
      setNotifications(notifData);
      setDataLoaded(true);
    } catch (err) {
      console.error('Failed to load data:', err);
      showToast(`Failed to load data: ${err.message}`, 'error');
    }
  }, [managerOrgView, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const loadAuditLog = useCallback(async () => {
    try {
      setAuditLog(await apiGet('/settings/audit-log'));
    } catch { setAuditLog([]); }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setUsers(await apiGet('/users'));
    } catch (err) {
      showToast(err.message || 'Could not load users.', 'error');
    }
  }, [isAdmin, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    if (isAdmin && page === 'Users') loadUsers();
  }, [isAdmin, page, loadUsers]);

  useEffect(() => {
    const openPasswordModal = () => setPasswordModalOpen(true);
    window.addEventListener('caliberate:password-change-required', openPasswordModal);
    return () => window.removeEventListener('caliberate:password-change-required', openPasswordModal);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    if (currentUser?.mustChangePassword) setPasswordModalOpen(true);
  }, [currentUser?.mustChangePassword]);

  // Runs an async action and reports success/failure via toast
  const run = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      return true;
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
      return false;
    }
  };

  const mergePerson = (updated) => {
    setPeople(prev => prev.map(x => (x.id === updated.id ? { ...x, ...updated } : x)));
    setSelectedPersonForDrawer(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  };

  const handlers = {
    saveAllocation: (person, v) => run(async () => {
      const started = v.start <= TODAY;
      const updated = await apiPut(`/people/${person.id}`, {
        ...person,
        project: v.project, customer: v.customer, start: v.start, end: v.end,
        rate: v.rate, allocationPct: v.pct, extensionLikelihood: v.extensionLikelihood,
        status: started ? 'Deployed' : 'Allocated',
        days: started ? 0 : person.days,
        benchStart: started ? null : person.benchStart
      });
      mergePerson(updated);
      setActiveModal(null);
    }, 'Allocation saved.'),

    addEmployee: (v) => run(async () => {
      const created = await apiPost('/people', {
        ...v,
        code: `EMP-${String(Date.now()).slice(-6)}`,
        joinDate: v.joinDate || TODAY, status: 'Bench', benchStart: v.joinDate || TODAY, days: 0, allocationPct: 0,
        extensionLikelihood: 'Unknown', experience: '', certs: [], notes: [], preferences: {}
      });
      setPeople(prev => [created, ...prev]);
      setActiveModal(null);
    }, 'Resource added to directory.'),

    postJob: (job) => run(async () => {
      await apiPost('/jobs', { ...job, postedBy: currentUser?.name });
      setJobs(await apiGet('/jobs'));
      setActiveModal(null);
    }, 'Opening posted to marketplace.'),

    addSkill: (person, skill) => run(async () => {
      mergePerson(await apiPut(`/people/${person.id}`, { skills: [...person.skills, skill] }));
      setActiveModal(null);
    }, `Added ${skill.name} to skills matrix.`),

    removeSkill: (person, name) => run(async () => {
      mergePerson(await apiPut(`/people/${person.id}`, { skills: person.skills.filter(s => s.name !== name) }));
    }, `Removed skill ${name}.`),

    addCert: (person, cert) => run(async () => {
      mergePerson(await apiPut(`/people/${person.id}`, { certs: [...person.certs, cert] }));
      setActiveModal(null);
    }, `Certification ${cert.name} added.`),

    removeCert: (person, idx) => run(async () => {
      mergePerson(await apiPut(`/people/${person.id}`, { certs: person.certs.filter((_, i) => i !== idx) }));
    }, 'Certification removed.'),

    saveExperience: (person, experience) => run(async () => {
      mergePerson(await apiPut(`/people/${person.id}`, { experience }));
    }, 'Experience summary saved.'),

    uploadResume: (person, file) => run(async () => {
      const formData = new FormData();
      formData.append('resume', file);
      const updated = await apiUpload(`/people/${person.id}/resume`, formData);
      mergePerson(updated);
      setActiveModal({ type: 'resume-parsed', data: file.name });
    }, 'Resume uploaded.'),

    savePreferences: (person, preferences) => run(async () => {
      mergePerson(await apiPut(`/people/${person.id}`, { preferences }));
      setActiveModal(null);
    }, 'Preferences saved.'),

    addNote: (person, text) => run(async () => {
      const note = { date: TODAY, author: currentUser?.name || 'Staffing Ops', text };
      mergePerson(await apiPut(`/people/${person.id}`, { notes: [note, ...(person.notes || [])] }));
    }, 'Bench note added.'),

    endAllocation: (person) => run(async () => {
      mergePerson(await apiPut(`/people/${person.id}`, {
        status: 'Bench', benchStart: TODAY, days: 0, allocationPct: 0,
        project: '', customer: '', start: '', end: ''
      }));
    }, `${person.name} returned to Bench.`),

    apply: (job, person, notes = 'Submitted application via marketplace', status = 'Applied') => run(async () => {
      await apiPost('/applications', { jobId: job.id, personId: person.id, status, notes, date: TODAY });
      setApplications(await apiGet('/applications'));
    }, status === 'Applied' ? 'Application submitted! Track it under My Applications.' : `${person.name} proposed for ${job.title}.`),

    withdraw: (app) => run(async () => {
      await apiPut(`/applications/${app.id}`, { status: 'Withdrawn' });
      setApplications(prev => prev.map(a => (a.id === app.id ? { ...a, status: 'Withdrawn' } : a)));
    }, 'Application withdrawn.'),

    requestAllocation: (person, v) => run(async () => {
      await apiPost('/requests', {
        manager: currentUser?.name, personId: person.id, personName: person.name,
        project: v.project, customer: v.customer, action: v.action,
        start: v.start, end: v.end, pct: v.pct, rate: v.rate, reason: v.reason
      });
      setRequests(await apiGet('/requests'));
      setActiveModal(null);
    }, 'Staffing request submitted for Operations review.'),

    reviewRequest: (req, status, rejectionReason = '') => run(async () => {
      await apiPut(`/requests/${req.id}`, { status, rejectionReason });
      await loadData();
    }, status === 'Approved' ? `Approved. ${req.personName}'s allocation was updated.` : 'Staffing request rejected.'),

    bulkImport: (csv) => run(async () => {
      const result = await apiPost('/people/import', { csv });
      setPeople(await apiGet(`/people?managerView=${managerOrgView}`));
      if (result.errors?.length) {
        showToast(`Imported ${result.imported} records. ${result.errors.length} row(s) skipped: ${result.errors.slice(0, 2).map(e => `line ${e.line} ${e.error}`).join('; ')}`, 'error');
      }
      setActiveModal(null);
    }, 'Employee records imported.'),

    saveSettings: (next) => run(async () => {
      await apiPut('/settings', next);
      setSettings(next);
      setDraftSettings(null);
      loadAuditLog();
    }, 'Bench thresholds saved and recalculated.'),

    resetDemo: () => run(async () => {
      await apiPost('/settings/reset', { confirm: 'RESET' });
      await loadData();
      loadAuditLog();
    }, 'Demo data reset.'),

    saveOverride: (override) => run(async () => {
      const base = draftSettings ?? settings;
      const overrides = [...(base.overrides || [])];
      const index = overrides.findIndex(o => o.id === override.id);
      if (index >= 0) overrides[index] = override;
      else overrides.push({ ...override, id: override.id || `ovr-${Date.now()}` });
      const next = { ...base, overrides };
      await apiPut('/settings', next);
      setSettings(next);
      setDraftSettings(null);
      setActiveModal(null);
    }, 'Override saved.'),

    createUser: (user) => run(async () => {
      const created = await apiPost('/users', user);
      setUsers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setActiveModal(null);
    }, 'User account created.'),

    createExternalRequest: (v) => run(async () => {
      await apiPost('/external-requests', { ...v, manager: currentUser?.name });
      await loadData();
      setActiveModal(null);
    }, 'External hire request raised.'),

    reviewExternal: (id, status, rejectionReason = '') => run(async () => {
      await apiPut(`/external-requests/${id}/review`, { status, rejectionReason });
      await loadData();
    }, status === 'Approved' ? 'External hire request approved.' : 'External hire request rejected.'),

    updateCandidate: (id, v) => run(async () => {
      await apiPut(`/external-requests/${id}/candidate`, v);
      await loadData();
      setActiveModal(null);
    }, 'Candidate details updated.'),

    savePanel: (panel) => run(async () => {
      const result = await apiPost('/panels', panel);
      setPanels(prev => [...prev, result.panel]);
      setActiveModal(null);
      if (result.tempPassword) showToast(`Panel created. Temporary password: ${result.tempPassword}`, 'success');
      else showToast('Panel member added.');
    }, null),

    updatePanel: (id, v) => run(async () => {
      const updated = await apiPut(`/panels/${id}`, v);
      setPanels(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      if (updated.id === myPanel?.id) setMyPanel(updated);
      setActiveModal(null);
    }, 'Panel profile saved.'),

    updateMyPanel: (v) => run(async () => {
      const updated = await apiPut(`/panels/${v.id}`, v);
      setMyPanel(updated);
      setPanels(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      setActiveModal(null);
    }, 'Interview profile saved.'),

    deactivatePanel: (panel) => run(async () => {
      await apiDelete(`/panels/${panel.id}`);
      setPanels(prev => prev.filter(p => p.id !== panel.id));
    }, 'Panel member deactivated.'),

    scheduleInterview: (v) => run(async () => {
      await apiPost('/interview-roster', v);
      await loadData();
      setActiveModal(null);
    }, 'Interview scheduled and panel time blocked.'),

    updateInterview: (id, v) => run(async () => {
      await apiPut(`/interview-roster/${id}`, v);
      await loadData();
      setActiveModal(null);
    }, 'Interview updated.'),

    markNotificationRead: (id) => run(async () => {
      await apiPost(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    }, null),

    markAllNotificationsRead: () => run(async () => {
      await apiPost('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, null),

    updateUser: (id, user) => run(async () => {
      const updated = await apiPut(`/users/${id}`, user);
      setUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)));
      setActiveModal(null);
    }, 'User account updated.'),

    deactivateUser: (user) => run(async () => {
      const result = await apiDelete(`/users/${user.id}`);
      setUsers(prev => prev.map(u => (u.id === result.user.id ? result.user : u)));
    }, 'User account deactivated.')
  };

  const privileged = isPrivileged;

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    if (page === 'Settings' && privileged) loadAuditLog();
  }, [page, privileged, loadAuditLog]);
  const currentResourcePerson = people.find(p => p.id === activeResourcePersonId) || people[0];

  const scopedPeople = useMemo(() => {
    return people.filter(p => {
      if (!p.active) return false;
      return true; // Server already scopes by role
    });
  }, [people]);

  const filteredPeople = useMemo(() => {
    return scopedPeople.filter(p => {
      const matchStatus = statusFilter === 'All' || p.status === statusFilter ||
        (statusFilter === 'BenchFlags' && p.status === 'Bench' && getBenchFlagStatus(p, settings) !== 'Green');
      const matchPractice = practiceFilter === 'All' || p.practice === practiceFilter;
      const matchLocation = locationFilter === 'All' || p.location === locationFilter;

      const query = searchQuery.toLowerCase().trim();
      const matchQuery = !query ||
        p.name.toLowerCase().includes(query) ||
        p.code.toLowerCase().includes(query) ||
        p.title.toLowerCase().includes(query) ||
        p.practice.toLowerCase().includes(query) ||
        p.location.toLowerCase().includes(query) ||
        (p.project && p.project.toLowerCase().includes(query)) ||
        (p.customer && p.customer.toLowerCase().includes(query)) ||
        p.skills.some(s => s.name.toLowerCase().includes(query)) ||
        p.certs.some(c => c.name.toLowerCase().includes(query));

      return matchStatus && matchPractice && matchLocation && matchQuery;
    });
  }, [scopedPeople, statusFilter, practiceFilter, locationFilter, searchQuery, settings]);

  const metrics = useMemo(() => {
    const total = scopedPeople.length;
    const deployed = scopedPeople.filter(p => p.status === 'Deployed');
    const allocated = scopedPeople.filter(p => p.status === 'Allocated' || (p.project && p.start > TODAY));
    const bench = scopedPeople.filter(p => p.status === 'Bench');
    const onLeave = scopedPeople.filter(p => p.status === 'On Leave');

    const flags = bench.filter(p => {
      const f = getBenchFlagStatus(p, settings);
      return f === 'Amber' || f === 'Red' || f === 'Critical';
    });
    const redFlags = bench.filter(p => {
      const f = getBenchFlagStatus(p, settings);
      return f === 'Red' || f === 'Critical';
    });

    const eligibleHeadcount = total - onLeave.length;
    const totalAllocationCapacity = deployed.reduce((acc, curr) => acc + (curr.allocationPct || 100), 0);
    const utilizationRate = eligibleHeadcount > 0 ? Math.round(totalAllocationCapacity / eligibleHeadcount) : 0;

    const rolloffs30d = scopedPeople.filter(p =>
      p.status === 'Deployed' && p.end && dateDiff(p.end) >= 0 && dateDiff(p.end) <= 30
    );

    const expiringCerts = scopedPeople.flatMap(p =>
      p.certs
        .filter(c => c.expiry && dateDiff(c.expiry) >= 0 && dateDiff(c.expiry) <= 90)
        .map(c => ({ person: p, cert: c }))
    );

    const totalBenchDailyCost = bench.reduce((sum, p) => sum + (p.dailyCost || (p.rate ? p.rate * 8 * 0.7 : 0)), 0);

    return {
      total, deployedCount: deployed.length, allocatedCount: allocated.length,
      benchCount: bench.length, onLeaveCount: onLeave.length,
      flagsCount: flags.length, redFlagsCount: redFlags.length,
      utilizationRate, rolloffs30d, expiringCerts, totalBenchDailyCost
    };
  }, [scopedPeople, settings]);

  const learningRecommendations = useMemo(() => {
    const person = currentResourcePerson;
    const owned = new Set((person?.skills || []).map((skill) => skill.name.toLowerCase()));
    const demand = new Map();

    jobs.filter((job) => job.status === 'Open').forEach((job) => {
      [...(job.mustHave || []), ...(job.niceToHave || [])].forEach((skill) => {
        const key = skill.trim();
        if (!key || owned.has(key.toLowerCase())) return;
        const current = demand.get(key) || { skill: key, count: 0, mustHave: 0, practices: new Set() };
        current.count += 1;
        if ((job.mustHave || []).includes(skill)) current.mustHave += 1;
        current.practices.add(job.practice);
        demand.set(key, current);
      });
    });

    return [...demand.values()]
      .sort((a, b) => (b.mustHave - a.mustHave) || (b.count - a.count))
      .slice(0, 3)
      .map((item) => ({
        skill: item.skill,
        reason: `Requested by ${item.count} open role${item.count === 1 ? '' : 's'}${item.practices.size ? ` across ${[...item.practices].join(', ')}` : ''}. ${item.mustHave ? 'It is a must-have on at least one opening.' : 'It strengthens your match for current demand.'}`,
        time: item.mustHave ? '3–6 weeks' : '2–4 weeks'
      }));
  }, [jobs, currentResourcePerson]);

  const benchChartData = useMemo(() => {
    const benchList = scopedPeople.filter(p => p.status === 'Bench');
    const amber = settings?.global?.amber || 10;
    const red = settings?.global?.red || 15;
    const critical = settings?.global?.critical || 30;
    return [
      { bucket: `0–${amber - 1} days`, count: benchList.filter(p => p.days < amber).length, fill: '#10b981' },
      { bucket: `${amber}–${red - 1} days`, count: benchList.filter(p => p.days >= amber && p.days < red).length, fill: '#f59e0b' },
      { bucket: `${red}–${critical - 1} days`, count: benchList.filter(p => p.days >= red && p.days < critical).length, fill: '#f43f5e' },
      { bucket: `${critical}+ days`, count: benchList.filter(p => p.days >= critical).length, fill: '#9f1239' }
    ];
  }, [scopedPeople, settings]);

  const exportCSV = (filename = 'caliberate-report.csv', list = filteredPeople) => {
    const headers = [
      'Code', 'Name', 'Title', 'Practice', 'Manager', 'Location', 'Status',
      'Bench Days', 'Allocation %', 'Project', 'Customer', 'Start Date', 'End Date',
      ...(privileged ? ['Billing Rate USD/hr', 'Daily Loaded Cost'] : [])
    ];

    const rows = list.map(p => [
      p.code, p.name, p.title, p.practice, p.manager, p.location, p.status,
      p.days, p.allocationPct + '%', p.project || '—', p.customer || '—', p.start || '—', p.end || '—',
      ...(privileged ? [p.rate, p.dailyCost] : [])
    ]);

    // Neutralise spreadsheet formula injection
    const safe = (v) => {
      const s = String(v ?? '');
      return /^[=+\-@]/.test(s) && isNaN(Number(s)) ? `'${s}` : s;
    };
    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(e => e.map(item => `"${safe(item).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    apiPost('/settings/export-audit', { filename, count: list.length }).catch(() => {});
    showToast(`Exported ${list.length} records to CSV.`);
  };

  const navigationItems = useMemo(() => {
    if (role === 'Resource') {
      return [
        { id: 'My Profile', label: 'My Profile', icon: UserCircle },
        { id: 'Openings', label: 'Internal Openings', icon: Briefcase },
        { id: 'My Applications', label: 'My Applications', icon: CheckSquare },
        { id: 'Upskilling', label: 'Upskill', icon: BookOpen }
      ];
    }
    if (role === 'Sales') {
      return [
        { id: "Who's Free", label: "Who's Free (Capacity)", icon: Users },
        { id: 'Supply Demand', label: 'Supply vs Demand', icon: Flame },
        { id: 'Openings', label: 'Open Positions', icon: Briefcase }
      ];
    }
    if (role === 'Panel') {
      return [
        { id: 'Interview Profile', label: 'Interview Profile', icon: UserCircle },
        { id: 'My Schedule', label: 'My Schedule', icon: Calendar }
      ];
    }
    if (role === 'TA') {
      return [
        { id: 'Interview Roster', label: 'Interview Roster', icon: Calendar, badge: roster.filter(r => r.status === 'Scheduled').length },
        { id: 'External Hires', label: 'External Hires', icon: UserPlus, badge: externalRequests.filter(r => r.status === 'Pending').length }
      ];
    }
    return [
      { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'Employees', label: 'Resource Directory', icon: Users },
      { id: 'Bench Watch', label: 'Bench Watch', icon: Flag, badge: metrics.redFlagsCount },
      { id: 'Deployments', label: 'Projects & Deployments', icon: Layers },
      { id: 'Roll-offs', label: 'Roll-off Pipeline', icon: Calendar, badge: metrics.rolloffs30d.length },
      { id: 'Openings', label: 'Talent Marketplace', icon: Briefcase },
      { id: 'Requests', label: 'Staffing Requests', icon: Inbox, badge: requests.filter(r => r.status?.includes('Pending')).length },
      { id: 'External Hires', label: 'External Hires', icon: UserPlus, badge: externalRequests.filter(r => r.status === 'Pending').length },
      { id: 'Panels', label: 'Interview Panels', icon: Users },
      { id: 'Interview Roster', label: 'Interview Roster', icon: Calendar },
      { id: 'Supply Demand', label: 'Supply vs Demand', icon: Flame },
      { id: 'Reports', label: 'Analytics & Reports', icon: BarChart2 },
      ...(privileged ? [{ id: 'Settings', label: 'Settings & Policies', icon: Settings }] : []),
      ...(isAdmin ? [{ id: 'Users', label: 'Users & Access', icon: UserCog }] : [])
    ];
  }, [role, metrics.redFlagsCount, metrics.rolloffs30d.length, requests, externalRequests, roster, privileged, isAdmin]);

  // Panel & TA are confined to their own workspace: any page outside their
  // navigation (e.g. Roll-offs, Bench Watch) is never rendered for them.
  const restrictedRole = role === 'Panel' || role === 'TA';
  const activePage = restrictedRole && !navigationItems.some(i => i.id === page) ? navigationItems[0]?.id : page;

  if (!dataLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-700 to-emerald-600 text-white shadow-md shadow-teal-700/20 mb-4">
            <Layers className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Loading Caliberate...</p>
        </div>
      </div>
    );
  }

  // ============================================================
  //  RENDER: Dashboard Page
  // ============================================================
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-600">
              {role === 'Manager' ? 'Practice Management · Digital Team' : 'Global Workforce Intelligence'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading sm:text-3xl">
            {role === 'Manager' ? 'Team Capacity & Roll-off Radar' : 'Workforce Utilization & Deployment Radar'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {role === 'Manager'
              ? 'Real-time visibility into direct reports, utilization rate against 85% target, and project roll-off dates.'
              : 'Real-time deployment status, bench aging risk, loaded cost impact, and upcoming roll-offs across all practices.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role === 'Manager' && (
            <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium">
              <button onClick={() => setManagerOrgView('direct')} className={`rounded-md px-2.5 py-1 ${managerOrgView === 'direct' ? 'bg-teal-700 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'}`}>Direct Reports</button>
              <button onClick={() => setManagerOrgView('org')} className={`rounded-md px-2.5 py-1 ${managerOrgView === 'org' ? 'bg-teal-700 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'}`}>Full Org Tree</button>
            </div>
          )}
          <button onClick={() => exportCSV('caliberate-executive-summary.csv')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export CSV
          </button>
          {privileged && (
            <button onClick={() => setActiveModal({ type: 'add-employee' })} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 transition">
              <Plus className="h-4 w-4" /> Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Executive Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-semibold uppercase tracking-wider">Active Headcount</span><Users className="h-4 w-4 text-teal-600" /></div>
          <div className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-extrabold text-slate-900 font-heading">{metrics.total}</span><span className="text-xs text-slate-400">resources</span></div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2"><span>{metrics.allocatedCount} future allocated</span><span className="text-slate-400">{metrics.onLeaveCount} on leave</span></div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-semibold uppercase tracking-wider">Currently Deployed</span><Briefcase className="h-4 w-4 text-emerald-600" /></div>
          <div className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-extrabold text-emerald-700 font-heading">{metrics.deployedCount}</span><span className="text-xs text-emerald-600 font-medium">billing active</span></div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2"><span>Client projects</span><span className="font-semibold text-emerald-700">100% billable</span></div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-semibold uppercase tracking-wider">On Bench</span><Flag className={`h-4 w-4 ${metrics.redFlagsCount > 0 ? 'text-rose-600' : 'text-amber-500'}`} /></div>
          <div className="mt-3 flex items-baseline gap-2"><span className={`text-3xl font-extrabold font-heading ${metrics.redFlagsCount > 0 ? 'text-rose-600' : 'text-amber-600'}`}>{metrics.benchCount}</span><span className="text-xs text-slate-500">available</span></div>
          <div className="mt-2 flex items-center justify-between text-xs border-t border-slate-100 pt-2">
            <span className="text-rose-600 font-semibold">{metrics.redFlagsCount} red flags (&gt;{settings?.global?.red || 15}d)</span>
            {privileged && <span className="text-slate-400 font-mono">${metrics.totalBenchDailyCost}/day</span>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-semibold uppercase tracking-wider">Utilization Rate</span><ArrowUpRight className="h-4 w-4 text-indigo-600" /></div>
          <div className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-extrabold text-indigo-700 font-heading">{metrics.utilizationRate}%</span><span className="text-xs font-medium text-slate-400">Target: 85%</span></div>
          <div className="mt-2 flex items-center justify-between text-xs border-t border-slate-100 pt-2">
            <span className={metrics.utilizationRate >= 85 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{metrics.utilizationRate >= 85 ? 'On Track' : `${85 - metrics.utilizationRate}% below target`}</span>
            <span className="text-slate-400">Deployed ÷ Eligible</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-heading">Bench Aging Distribution</h2>
              <p className="text-xs text-slate-400">Calendar days elapsed on bench · Tiered thresholds applied</p>
            </div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{metrics.benchCount} Total Available</span>
          </div>
          <div className="mt-6 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={benchChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }} formatter={(val) => [`${val} Resources`, 'Count']} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={48}>
                  {benchChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> &lt;{settings?.global?.amber || 10}d Safe</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {settings?.global?.amber || 10}-{(settings?.global?.red || 15) - 1}d Amber</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> {settings?.global?.red || 15}-{(settings?.global?.critical || 30) - 1}d Red</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-900" /> {settings?.global?.critical || 30}d+ Critical</span>
            </div>
            <button onClick={() => setPage('Bench Watch')} className="text-teal-700 font-semibold hover:underline">Explore Bench Watch →</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div><h2 className="text-base font-bold text-slate-900 font-heading">Upcoming Roll-offs</h2><p className="text-xs text-slate-400">Allocations ending within next 30 days</p></div>
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">{metrics.rolloffs30d.length} resources</span>
            </div>
            <div className="mt-4 space-y-3">
              {metrics.rolloffs30d.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">No allocations ending within 30 days.</p>
              ) : (
                metrics.rolloffs30d.map(p => {
                  const daysLeft = dateDiff(p.end);
                  return (
                    <div key={p.id} onClick={() => { setSelectedPersonForDrawer(p); setDrawerTab('allocations'); }} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 hover:bg-slate-100/80 cursor-pointer transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-800 text-xs font-bold">{p.name.split(' ').map(s => s[0]).join('')}</div>
                        <div className="truncate"><p className="text-xs font-semibold text-slate-800 truncate">{p.name}</p><p className="text-[11px] text-slate-400 truncate">{p.project} · {p.customer}</p></div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-amber-600">{daysLeft}d left</span>
                        <span className={`block text-[10px] font-semibold ${p.extensionLikelihood === 'Likely' ? 'text-emerald-600' : p.extensionLikelihood === 'Unlikely' ? 'text-rose-600' : 'text-slate-400'}`}>Ext: {p.extensionLikelihood}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <button onClick={() => setPage('Roll-offs')} className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800">
              <span>Open 90-Day Roll-off Pipeline</span><ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Red Flags Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><AlertTriangle className="h-5 w-5" /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900 font-heading">Priority Red Flags — Bench Aging Exceeded</h2>
              <p className="text-xs text-slate-400">Resources on bench exceeding {settings?.global?.red || 15} days policy · Ordered by urgency</p>
            </div>
          </div>
          <button onClick={() => setPage('Bench Watch')} className="text-xs font-semibold text-teal-700 hover:underline">View all bench ({metrics.benchCount}) →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Employee</th>
                <th className="px-5 py-3.5">Practice</th>
                <th className="px-5 py-3.5">Days on Bench</th>
                <th className="px-5 py-3.5">Flag Urgency</th>
                <th className="px-5 py-3.5">Primary Skills</th>
                <th className="px-5 py-3.5">Manager</th>
                {privileged && <th className="px-5 py-3.5">Daily Cost</th>}
                <th className="px-5 py-3.5 text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scopedPeople
                .filter(p => p.status === 'Bench' && (getBenchFlagStatus(p, settings) === 'Red' || getBenchFlagStatus(p, settings) === 'Critical'))
                .sort((a, b) => b.days - a.days)
                .map(p => {
                  const flag = getBenchFlagStatus(p, settings);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition cursor-pointer" onClick={() => { setSelectedPersonForDrawer(p); setDrawerTab('overview'); }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{p.name.split(' ').map(s => s[0]).join('')}</div>
                          <div><p className="font-semibold text-slate-800">{p.name}</p><p className="text-[11px] text-slate-400">{p.code} · {p.title}</p></div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{p.practice}</span></td>
                      <td className="px-5 py-3"><span className="text-sm font-bold text-rose-600">{p.days}d</span></td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${flag === 'Critical' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>⚑ {flag}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">{p.skills.slice(0, 3).map(s => (<span key={s.name} className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800">{s.name}</span>))}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{p.manager}</td>
                      {privileged && <td className="px-5 py-3 font-mono text-slate-600">${p.dailyCost}/d</td>}
                      <td className="px-5 py-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); setPage('Openings'); }} className="rounded-lg bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-100 transition">Match Jobs</button>
                      </td>
                    </tr>
                  );
                })}
              {scopedPeople.filter(p => p.status === 'Bench' && (getBenchFlagStatus(p, settings) === 'Red' || getBenchFlagStatus(p, settings) === 'Critical')).length === 0 && (
                <tr><td colSpan={privileged ? 8 : 7} className="px-5 py-12 text-center text-slate-400">No resources currently exceed the red flag threshold. 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ============================================================
  //  RENDER: Resource Directory / Employees
  // ============================================================
  const renderEmployees = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Resource Directory</h1><p className="text-xs text-slate-500">Complete workforce roster with skills, allocations, and status tracking.</p></div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportCSV('caliberate-directory.csv')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export
          </button>
          {privileged && (
            <>
              <button onClick={() => setActiveModal({ type: 'bulk-import' })} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5 text-slate-500" /> Bulk CSV Import
              </button>
              <button onClick={() => setActiveModal({ type: 'add-employee' })} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-800">
                <Plus className="h-4 w-4" /> Add Employee
              </button>
            </>
          )}
        </div>
      </div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Search by name, code, skill, project..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full text-xs outline-none bg-transparent" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none">
          <option value="All">All Statuses</option><option value="Deployed">Deployed</option><option value="Allocated">Allocated</option><option value="Bench">Bench</option><option value="On Leave">On Leave</option><option value="BenchFlags">Bench Flags Only</option>
        </select>
        <select value={practiceFilter} onChange={e => setPracticeFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none">
          <option value="All">All Practices</option>
          {[...new Set(scopedPeople.map(p => p.practice))].sort().map(pr => <option key={pr} value={pr}>{pr}</option>)}
        </select>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none">
          <option value="All">All Locations</option>
          {[...new Set(scopedPeople.map(p => p.location))].sort().map(loc => <option key={loc} value={loc}>{loc}</option>)}
        </select>
      </div>
      {/* Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Employee</th>
                <th className="px-5 py-3.5">Practice</th>
                <th className="px-5 py-3.5">Location</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Project / Customer</th>
                <th className="px-5 py-3.5">Skills</th>
                {privileged && <th className="px-5 py-3.5">Rate</th>}
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPeople.map(p => {
                const statusColors = { Deployed: 'bg-emerald-50 text-emerald-700 border-emerald-200', Allocated: 'bg-blue-50 text-blue-700 border-blue-200', Bench: 'bg-amber-50 text-amber-700 border-amber-200', 'On Leave': 'bg-slate-100 text-slate-500 border-slate-200' };
                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition cursor-pointer" onClick={() => { setSelectedPersonForDrawer(p); setDrawerTab('overview'); }}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{p.name.split(' ').map(s => s[0]).join('')}</div>
                        <div><p className="font-semibold text-slate-800">{p.name}</p><p className="text-[11px] text-slate-400">{p.code} · {p.title}</p></div>
                      </div>
                    </td>
                    <td className="px-5 py-3"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{p.practice}</span></td>
                    <td className="px-5 py-3 text-slate-600">{p.location}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${statusColors[p.status] || ''}`}>
                        {p.status}{p.status === 'Deployed' && p.allocationPct < 100 ? ` (${p.allocationPct}%)` : ''}{p.status === 'Bench' ? ` · ${p.days}d` : ''}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.project ? `${p.project} · ${p.customer}` : '—'}</td>
                    <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{p.skills.slice(0, 3).map(s => (<span key={s.name} className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800">{s.name}</span>))}</div></td>
                    {privileged && <td className="px-5 py-3 font-mono text-slate-600">${p.rate}/hr</td>}
                    <td className="px-5 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {privileged && (
                        <button onClick={() => setActiveModal({ type: 'allocate', data: p })} className="rounded-md bg-teal-50 px-2 py-1 font-semibold text-teal-700 hover:bg-teal-100">Allocate</button>
                      )}
                      {role === 'Manager' && p.manager === currentUser?.name && (
                        <button onClick={() => setActiveModal({ type: 'request-allocation', data: p })} className="rounded-md bg-purple-50 px-2 py-1 font-semibold text-purple-700 hover:bg-purple-100">Request</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredPeople.length === 0 && (
                <tr><td colSpan={privileged ? 8 : 7} className="px-5 py-12 text-center text-slate-400">No resources match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Showing {filteredPeople.length} of {scopedPeople.length} resources</div>
      </div>
    </div>
  );

  // ============================================================
  //  RENDER: Bench Watch
  // ============================================================
  const renderBenchWatch = () => {
    const benchPeople = scopedPeople.filter(p => p.status === 'Bench').sort((a, b) => b.days - a.days);
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Bench Watch — Aging Radar</h1><p className="text-xs text-slate-500">Real-time tracking of all bench resources with tiered policy thresholds.</p></div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: `Green (<${settings?.global?.amber || 10}d)`, count: benchPeople.filter(p => getBenchFlagStatus(p, settings) === 'Green').length, color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: `Amber (${settings?.global?.amber || 10}-${(settings?.global?.red || 15) - 1}d)`, count: benchPeople.filter(p => getBenchFlagStatus(p, settings) === 'Amber').length, color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: `Red (${settings?.global?.red || 15}-${(settings?.global?.critical || 30) - 1}d)`, count: benchPeople.filter(p => getBenchFlagStatus(p, settings) === 'Red').length, color: 'text-rose-700', bg: 'bg-rose-50' },
            { label: `Critical (≥${settings?.global?.critical || 30}d)`, count: benchPeople.filter(p => getBenchFlagStatus(p, settings) === 'Critical').length, color: 'text-rose-900', bg: 'bg-rose-100' }
          ].map(b => (
            <div key={b.label} className={`rounded-2xl border border-slate-200/80 ${b.bg} p-4`}>
              <span className={`text-2xl font-extrabold font-heading ${b.color}`}>{b.count}</span>
              <p className="text-xs font-medium text-slate-600 mt-1">{b.label}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-5 py-3.5">Practice</th>
                  <th className="px-5 py-3.5">Days</th>
                  <th className="px-5 py-3.5">Flag</th>
                  <th className="px-5 py-3.5">Bench Since</th>
                  <th className="px-5 py-3.5">Skills</th>
                  <th className="px-5 py-3.5">Manager</th>
                  {privileged && <th className="px-5 py-3.5">Daily Cost</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {benchPeople.map(p => {
                  const flag = getBenchFlagStatus(p, settings);
                  const flagColors = { Green: 'bg-emerald-50 text-emerald-700 border-emerald-200', Amber: 'bg-amber-50 text-amber-700 border-amber-200', Red: 'bg-rose-50 text-rose-700 border-rose-200', Critical: 'bg-rose-100 text-rose-800 border-rose-300' };
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition cursor-pointer" onClick={() => { setSelectedPersonForDrawer(p); setDrawerTab('overview'); }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{p.name.split(' ').map(s => s[0]).join('')}</div>
                          <div><p className="font-semibold text-slate-800">{p.name}</p><p className="text-[11px] text-slate-400">{p.code} · {p.title}</p></div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{p.practice}</span></td>
                      <td className="px-5 py-3"><span className="text-sm font-bold" style={{ color: flag === 'Critical' ? '#9f1239' : flag === 'Red' ? '#e11d48' : flag === 'Amber' ? '#d97706' : '#059669' }}>{p.days}d</span></td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${flagColors[flag] || ''}`}>⚑ {flag}</span></td>
                      <td className="px-5 py-3 text-slate-500">{p.benchStart || '—'}</td>
                      <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{p.skills.slice(0, 3).map(s => (<span key={s.name} className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800">{s.name}</span>))}</div></td>
                      <td className="px-5 py-3 text-slate-600">{p.manager}</td>
                      {privileged && <td className="px-5 py-3 font-mono text-slate-600">${p.dailyCost}/d</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  RENDER: Roll-offs
  // ============================================================
  const renderRolloffs = () => {
    const rolloffPeople = scopedPeople.filter(p => p.status === 'Deployed' && p.end && dateDiff(p.end) >= 0 && dateDiff(p.end) <= 90).sort((a, b) => dateDiff(a.end) - dateDiff(b.end));
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">90-Day Roll-off Pipeline</h1><p className="text-xs text-slate-500">All deployments ending within the next 90 days, ordered by urgency.</p></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr><th className="px-5 py-3.5">Employee</th><th className="px-5 py-3.5">Project</th><th className="px-5 py-3.5">Customer</th><th className="px-5 py-3.5">End Date</th><th className="px-5 py-3.5">Days Left</th><th className="px-5 py-3.5">Extension</th><th className="px-5 py-3.5">Skills</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rolloffPeople.map(p => {
                  const daysLeft = dateDiff(p.end);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition cursor-pointer" onClick={() => { setSelectedPersonForDrawer(p); setDrawerTab('allocations'); }}>
                      <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{p.name.split(' ').map(s => s[0]).join('')}</div><div><p className="font-semibold text-slate-800">{p.name}</p><p className="text-[11px] text-slate-400">{p.title}</p></div></div></td>
                      <td className="px-5 py-3 font-medium text-slate-800">{p.project}</td>
                      <td className="px-5 py-3 text-slate-600">{p.customer}</td>
                      <td className="px-5 py-3 text-slate-600">{p.end}</td>
                      <td className="px-5 py-3"><span className={`text-sm font-bold ${daysLeft <= 14 ? 'text-rose-600' : daysLeft <= 30 ? 'text-amber-600' : 'text-slate-600'}`}>{daysLeft}d</span></td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${p.extensionLikelihood === 'Likely' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : p.extensionLikelihood === 'Unlikely' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{p.extensionLikelihood}</span></td>
                      <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{p.skills.slice(0, 3).map(s => (<span key={s.name} className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800">{s.name}</span>))}</div></td>
                    </tr>
                  );
                })}
                {rolloffPeople.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">No deployments ending within 90 days.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  RENDER: Talent Marketplace / Openings
  // ============================================================
  const renderOpenings = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">{role === 'Resource' ? 'Internal Openings — Apply Now' : 'Talent Marketplace'}</h1><p className="text-xs text-slate-500">Active project openings with skills-based match scoring.</p></div>
        {(privileged || role === 'Manager') && (
          <button onClick={() => setActiveModal({ type: 'post-job' })} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-800">
            <Plus className="h-4 w-4" /> Post Internal Opening
          </button>
        )}
      </div>
      {role !== 'Resource' && scopedPeople.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-xs">
          <span className="font-bold text-teal-900">Evaluating match for candidate:</span>
          <select value={(people.find(p => p.id === evalPersonId) || scopedPeople[0]).id} onChange={e => setEvalPersonId(Number(e.target.value))} className="rounded-lg border border-teal-300 bg-white px-2.5 py-1 font-bold text-teal-800 outline-none">
            {scopedPeople.map(p => <option key={p.id} value={p.id}>{p.name} ({p.status})</option>)}
          </select>
          <span className="text-teal-700">Score = (2× must-have + 1× nice-to-have) / total points</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {jobs.filter(j => j.status === 'Open').map(j => {
          const matchPerson = role === 'Resource' ? currentResourcePerson : (people.find(p => p.id === evalPersonId) || scopedPeople[0] || null);
          const match = matchPerson ? calculateMatch(matchPerson, j) : null;
          const hasApplied = !!matchPerson && applications.some(a => a.jobId === j.id && a.personId === matchPerson.id && a.status !== 'Withdrawn');
          return (
            <div key={j.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{j.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{j.project} · {j.customer} · {j.practice}</p>
                </div>
                {match && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${match.score >= 80 ? 'bg-emerald-100 text-emerald-800' : match.score >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{match.score}% Match</span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">{j.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase mr-1">Must Have:</span>
                {j.mustHave.map(s => (<span key={s} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${match?.matchedMust?.includes(s) ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{s}</span>))}
                {j.niceToHave.length > 0 && (<><span className="text-[10px] font-semibold text-slate-400 uppercase ml-2 mr-1">Nice:</span>{j.niceToHave.map(s => (<span key={s} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${match?.matchedNice?.includes(s) ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>{s}</span>))}</>)}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {j.start} → {j.end}</span>
                  <span>{j.positions} position{j.positions > 1 ? 's' : ''}</span>
                  <span>{j.location}</span>
                </div>
                {role === 'Resource' && (
                  <button disabled={hasApplied} onClick={() => handlers.apply(j, currentResourcePerson)} className={`rounded-lg px-3 py-1 text-[11px] font-bold transition ${hasApplied ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-teal-700 text-white hover:bg-teal-800'}`}>{hasApplied ? 'Already Applied' : 'Apply Now'}</button>
                )}
                {(role === 'Admin' || role === 'Operations' || role === 'Manager') && matchPerson && (
                  <div className="flex gap-1.5">
                    {(role === 'Admin' || role === 'Operations') && (
                      <button onClick={() => setActiveModal({ type: 'allocate', data: { ...matchPerson, project: j.project, customer: j.customer, start: j.start, end: j.end } })} className="rounded-lg bg-teal-700 px-3 py-1 text-[11px] font-bold text-white hover:bg-teal-800">Direct Allocate</button>
                    )}
                    <button disabled={hasApplied} onClick={() => handlers.apply(j, matchPerson, 'Proposed by Operations', 'Shortlisted')} className={`rounded-lg border px-3 py-1 text-[11px] font-semibold ${hasApplied ? 'border-slate-100 text-slate-300 cursor-not-allowed' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{hasApplied ? 'Proposed' : 'Propose'}</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ============================================================
  //  RENDER: Staffing Requests
  // ============================================================
  const renderRequests = () => (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Staffing Requests Queue</h1><p className="text-xs text-slate-500">Manager-initiated allocation & deployment requests awaiting Operations review.</p></div>
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr><th className="px-5 py-3.5">Requested By</th><th className="px-5 py-3.5">Resource</th><th className="px-5 py-3.5">Project</th><th className="px-5 py-3.5">Dates</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Reason</th>{privileged && <th className="px-5 py-3.5">Actions</th>}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80">
                  <td className="px-5 py-3 font-medium text-slate-800">{r.manager}</td>
                  <td className="px-5 py-3">{r.personName}</td>
                  <td className="px-5 py-3">{r.project} · {r.customer}</td>
                  <td className="px-5 py-3 text-slate-500">{r.start} → {r.end}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${r.status.includes('Pending') ? 'bg-amber-50 text-amber-700 border-amber-200' : r.status.includes('Approved') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{r.status}</span></td>
                  <td className="px-5 py-3 text-slate-500 max-w-xs truncate">{r.reason}{r.rejectionReason ? <span className="block text-[10px] text-rose-600">Rejected: {r.rejectionReason}</span> : null}</td>
                  {privileged && (
                    <td className="px-5 py-3">
                      {r.status.includes('Pending') && (
                        <div className="flex gap-1">
                          <button onClick={() => handlers.reviewRequest(r, 'Approved')} className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Approve</button>
                          <button onClick={() => { const reason = window.prompt('Enter rejection reason:'); if (reason !== null) handlers.reviewRequest(r, 'Rejected', reason.trim()); }} className="rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100">Reject</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan={privileged ? 7 : 6} className="px-5 py-12 text-center text-slate-400">No staffing requests in queue.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ============================================================
  //  RENDER: My Profile (Resource role)
  // ============================================================
  const renderMyProfile = () => {
    const person = currentResourcePerson;
    if (!person) return <div className="text-center text-sm text-slate-400 py-20">Profile not found.</div>;
    const { pct, missing } = calculateCompleteness(person);
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">My Profile</h1><p className="text-xs text-slate-500">Your deployment status, verified skills, and career preferences.</p></div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-6">
            {/* Profile Header */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-700 to-emerald-600 text-2xl font-bold text-white">{person.name.split(' ').map(s => s[0]).join('')}</div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-900 font-heading">{person.name}</h2>
                  <p className="text-sm text-slate-500">{person.title} · {person.code}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{person.practice}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{person.location}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">Manager: {person.manager}</span>
                    <span className={`rounded-full px-2 py-0.5 font-bold border ${person.status === 'Deployed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : person.status === 'Bench' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{person.status}{person.status === 'Bench' ? ` · ${person.days}d` : ''}</span>
                  </div>
                </div>
              </div>
              {person.status === 'Deployed' && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-semibold text-slate-700">Current Deployment:</span>
                    <span className="text-slate-600">{person.project} · {person.customer}</span>
                    <span className="text-slate-400">{person.start} → {person.end}</span>
                    {person.end && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700 font-semibold">{dateDiff(person.end)}d until roll-off</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 font-heading">Verified Skills Matrix ({person.skills.length})</h3>
                <button onClick={() => setActiveModal({ type: 'add-skill', data: person })} className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800"><Plus className="h-3.5 w-3.5" /> Add Skill</button>
              </div>
              <div className="mt-4 space-y-3">
                {person.skills.length === 0 && <p className="text-xs text-slate-400 text-center py-3">No skills added yet.</p>}
                {person.skills.map(s => (
                  <div key={s.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${s.level === 'Expert' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s.level === 'Advanced' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{s.level}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{s.years} yrs · Last: {s.lastUsed}</span>
                      <button onClick={() => handlers.removeSkill(person, s.name)} title="Remove skill" className="text-slate-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Certifications */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 font-heading">Certifications ({person.certs.length})</h3>
                <button onClick={() => setActiveModal({ type: 'add-cert', data: person })} className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800"><Plus className="h-3.5 w-3.5" /> Add Certification</button>
              </div>
              <div className="mt-4 space-y-3">
                {person.certs.length === 0 && <p className="text-xs text-slate-400 text-center py-3">No certifications added yet.</p>}
                {person.certs.map((c, idx) => (
                  <div key={`${c.name}-${idx}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.issuer} · Expires: {c.expiry}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.verified && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</span>}
                      <button onClick={() => handlers.removeCert(person, idx)} title="Remove certification" className="text-slate-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Experience & Resume */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
              <h3 className="text-base font-bold text-slate-900 font-heading">Project &amp; Tech Experience</h3>
              <textarea rows={3} value={experienceDraft ?? person.experience ?? ''} onChange={e => setExperienceDraft(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-teal-500" placeholder="Summarize your hands-on engineering accomplishments..." />
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
                    <span>{person.resumeUrl ? `Resume: ${person.resumeUrl} (replace)` : 'Upload resume (PDF/DOCX)'}</span>
                    <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) return showToast('Resume must be under 5 MB.', 'error');
                      handlers.uploadResume(person, file);
                      e.target.value = '';
                    }} />
                  </label>
                  {person.resumeUrl && (
                    <button onClick={() => window.open(`/api/people/${person.id}/resume`, '_blank', 'noopener')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Open</button>
                  )}
                </div>
                <button disabled={experienceDraft === null || experienceDraft === person.experience} onClick={async () => { if (await handlers.saveExperience(person, experienceDraft)) setExperienceDraft(null); }} className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed">Save Experience</button>
              </div>
            </div>
          </div>

          {/* Right Column: Completeness */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 font-heading">Profile Completeness</h3>
              <div className="mt-4 flex items-center justify-center">
                <div className="relative h-32 w-32">
                  <svg viewBox="0 0 36 36" className="h-full w-full transform -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke={pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'} strokeWidth="3" strokeDasharray={`${pct * 0.974} ${97.4 - pct * 0.974}`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-extrabold text-slate-900 font-heading">{pct}%</span>
                  </div>
                </div>
              </div>
              {missing.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Missing Items:</p>
                  {missing.map((m, i) => (<p key={i} className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">• {m}</p>))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 font-heading">Preferences</h3>
                <button onClick={() => setActiveModal({ type: 'edit-preferences', data: person })} className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800"><Pencil className="h-3 w-3" /> Edit</button>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Willing to Relocate</span><span className="font-medium text-slate-800">{person.preferences?.relocate ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Travel</span><span className="font-medium text-slate-800">{person.preferences?.travel || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Preferred Domains</span><span className="font-medium text-slate-800">{person.preferences?.domains?.join(', ') || '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  RENDER: My Applications (Resource role)
  // ============================================================
  const renderMyApplications = () => (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">My Applications</h1><p className="text-xs text-slate-500">Track your marketplace job application statuses.</p></div>
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr><th className="px-5 py-3.5">Job Title</th><th className="px-5 py-3.5">Project</th><th className="px-5 py-3.5">Applied Date</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Notes</th><th className="px-5 py-3.5"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.map(a => {
                const job = jobs.find(j => j.id === a.jobId);
                const statusColors = { Applied: 'bg-blue-50 text-blue-700 border-blue-200', Shortlisted: 'bg-emerald-50 text-emerald-700 border-emerald-200', Rejected: 'bg-rose-50 text-rose-700 border-rose-200', Offered: 'bg-purple-50 text-purple-700 border-purple-200' };
                return (
                  <tr key={a.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-medium text-slate-800">{job?.title || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{job?.project || '—'} · {job?.customer || ''}</td>
                    <td className="px-5 py-3 text-slate-500">{a.date}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${statusColors[a.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{a.status}</span></td>
                    <td className="px-5 py-3 text-slate-500">{a.notes}</td>
                    <td className="px-5 py-3 text-right">
                      {a.status !== 'Withdrawn' && a.status !== 'Selected' && (
                        <button onClick={() => handlers.withdraw(a)} className="text-xs font-semibold text-slate-400 hover:text-rose-600">Withdraw</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {applications.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">You haven't applied to any positions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ============================================================
  //  RENDER: Who's Free / Supply Demand / Deployments / Reports / Settings / Upskilling
  // ============================================================
  const renderWhosFreeBenchFinder = () => {
    const benchPeople = scopedPeople.filter(p => p.status === 'Bench' || p.status === 'Allocated');
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Who's Free — Bench Capacity Finder</h1><p className="text-xs text-slate-500">Quickly find available resources by skill, seniority, and location for proposals and staffing.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search by skill, name, location..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full text-xs outline-none bg-transparent" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {benchPeople.filter(p => {
            const q = searchQuery.toLowerCase();
            return !q || p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q) || p.skills.some(s => s.name.toLowerCase().includes(q));
          }).map(p => (
            <div key={p.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs hover:shadow-md transition cursor-pointer" onClick={() => { setSelectedPersonForDrawer(p); setDrawerTab('overview'); }}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">{p.name.split(' ').map(s => s[0]).join('')}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.title} · {p.location}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${p.status === 'Bench' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{p.status === 'Bench' ? 'Available' : `From ${p.end || p.start}`}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">{p.skills.map(s => (<span key={s.name} className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800">{s.name} ({s.level})</span>))}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSupplyDemand = () => {
    const practices = [...new Set(scopedPeople.map(p => p.practice))];
    const heatmapData = practices.map(pr => {
      const inPractice = scopedPeople.filter(p => p.practice === pr);
      const bench = inPractice.filter(p => p.status === 'Bench').length;
      const deployed = inPractice.filter(p => p.status === 'Deployed').length;
      const openJobs = jobs.filter(j => j.practice === pr && j.status === 'Open').reduce((s, j) => s + j.positions, 0);
      return { practice: pr, total: inPractice.length, bench, deployed, openJobs, gap: openJobs - bench };
    });
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Supply vs Demand</h1><p className="text-xs text-slate-500">Resource availability against active project demand by practice.</p></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr><th className="px-5 py-3.5">Practice</th><th className="px-5 py-3.5">Total</th><th className="px-5 py-3.5">Deployed</th><th className="px-5 py-3.5">On Bench</th><th className="px-5 py-3.5">Open Positions</th><th className="px-5 py-3.5">Supply Gap</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {heatmapData.map(d => (
                  <tr key={d.practice} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-semibold text-slate-800">{d.practice}</td>
                    <td className="px-5 py-3">{d.total}</td>
                    <td className="px-5 py-3 text-emerald-700 font-medium">{d.deployed}</td>
                    <td className="px-5 py-3 text-amber-700 font-medium">{d.bench}</td>
                    <td className="px-5 py-3 text-indigo-700 font-medium">{d.openJobs}</td>
                    <td className="px-5 py-3"><span className={`font-bold ${d.gap > 0 ? 'text-rose-600' : d.gap < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{d.gap > 0 ? `+${d.gap} Deficit` : d.gap < 0 ? `${Math.abs(d.gap)} Surplus` : 'Balanced'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderDeployments = () => {
    const deployedPeople = scopedPeople.filter(p => p.status === 'Deployed');
    const projects = [...new Set(deployedPeople.map(p => p.project))].filter(Boolean);
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Active Projects & Deployments</h1><p className="text-xs text-slate-500">All currently active client engagements and resource assignments.</p></div>
        {projects.map(proj => {
          const ppl = deployedPeople.filter(p => p.project === proj);
          const customer = ppl[0]?.customer || '';
          return (
            <div key={proj} className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div><h3 className="text-sm font-bold text-slate-900">{proj} — {customer}</h3><p className="text-xs text-slate-400">{ppl.length} resource{ppl.length > 1 ? 's' : ''} assigned</p></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Allocation</th><th className="px-5 py-3">End Date</th><th className="px-5 py-3">Extension</th>{privileged && <th className="px-5 py-3 text-right">Actions</th>}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {ppl.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/80 cursor-pointer" onClick={() => { setSelectedPersonForDrawer(p); setDrawerTab('allocations'); }}>
                        <td className="px-5 py-3 font-medium text-slate-800">{p.name}</td>
                        <td className="px-5 py-3 text-slate-600">{p.title}</td>
                        <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${p.allocationPct === 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{p.allocationPct}%</span></td>
                        <td className="px-5 py-3 text-slate-500">{p.end}</td>
                        <td className="px-5 py-3"><span className={`text-[10px] font-semibold ${p.extensionLikelihood === 'Likely' ? 'text-emerald-600' : p.extensionLikelihood === 'Unlikely' ? 'text-rose-600' : 'text-slate-400'}`}>{p.extensionLikelihood}</span></td>
                        {privileged && (
                          <td className="px-5 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setActiveModal({ type: 'allocate', data: p })} className="rounded-md bg-teal-50 px-2 py-1 font-semibold text-teal-700 hover:bg-teal-100">Edit</button>
                            <button onClick={() => { if (window.confirm(`End assignment for ${p.name}? They will return to Bench.`)) handlers.endAllocation(p); }} className="ml-1 rounded-md bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100">End</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderReports = () => (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Analytics & Reports</h1><p className="text-xs text-slate-500">Exportable insights on workforce utilization, bench trends, and capacity planning.</p></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { title: 'Workforce Summary CSV', desc: 'Full resource directory with status, skills, and allocation data.', onClick: () => exportCSV('caliberate-workforce-summary.csv', scopedPeople) },
          { title: 'Bench Aging Report', desc: 'Bench resources sorted by aging tier with cost impact.', onClick: () => exportCSV('caliberate-bench-aging.csv', scopedPeople.filter(p => p.status === 'Bench').sort((a, b) => b.days - a.days)) },
          { title: 'Roll-off Forecast', desc: '90-day deployment ending forecast with extension likelihood.', onClick: () => exportCSV('caliberate-rolloff-forecast.csv', scopedPeople.filter(p => p.status === 'Deployed' && p.end && dateDiff(p.end) >= 0 && dateDiff(p.end) <= 90).sort((a, b) => dateDiff(a.end) - dateDiff(b.end))) }
        ].map(r => (
          <div key={r.title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">{r.title}</h3>
            <p className="mt-1 text-xs text-slate-500">{r.desc}</p>
            <button onClick={r.onClick} className="mt-4 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => {
    const cfg = draftSettings ?? settings;
    const g = cfg.global;
    const setGlobal = (key, val) => setDraftSettings({ ...cfg, global: { ...g, [key]: Number(val) } });
    const valid = Number.isInteger(g.amber) && g.amber > 0 && g.amber < g.red && g.red < g.critical;
    const dirty = draftSettings !== null;
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Settings &amp; Policies</h1><p className="text-xs text-slate-500">Configure bench aging thresholds, practice overrides, and review the audit trail.</p></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Global Bench Aging Thresholds</h3>
          <div className="grid grid-cols-3 gap-4">
            {[['amber', 'Amber Threshold (days)'], ['red', 'Red Flag Threshold (days)'], ['critical', 'Critical Threshold (days)']].map(([k, label]) => (
              <div key={k} className="rounded-xl border border-slate-200 p-4">
                <label className="text-xs font-semibold text-slate-500">{label}</label>
                <input type="number" min="1" max="365" value={g[k]} onChange={e => setGlobal(k, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-bold outline-none focus:border-teal-500" />
              </div>
            ))}
          </div>
          {!valid && <p className="mt-3 text-xs font-semibold text-rose-600">Thresholds must be positive and satisfy amber &lt; red &lt; critical.</p>}
          <div className="mt-4 flex gap-2">
            <button disabled={!valid || !dirty} onClick={async () => { if (await handlers.saveSettings(cfg)) setDraftSettings(null); }} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed">Save Global Policy</button>
            {dirty && <button onClick={() => setDraftSettings(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Discard</button>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Practice / Skill Overrides</h3>
            <button onClick={() => setActiveModal({ type: 'edit-override', data: null })} className="text-xs font-bold text-teal-700 hover:underline">+ Add Override</button>
          </div>
          {(settings.overrides || []).length === 0 && <p className="text-xs text-slate-400">No overrides configured.</p>}
          <div className="space-y-2">
            {(settings.overrides || []).map(o => (
              <div key={o.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div><span className="font-bold text-slate-800">{o.scopeName}</span><span className="block text-[10px] text-slate-400">{o.scope} override</span></div>
                <div className="flex items-center gap-3 font-semibold">
                  <span className="text-amber-700">Amber {o.amber}d</span><span className="text-rose-700">Red {o.red}d</span><span className="text-rose-900">Critical {o.critical}d</span>
                  <button onClick={() => setActiveModal({ type: 'edit-override', data: o })} className="text-slate-400 hover:text-teal-700" title="Edit override"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handlers.saveSettings({ ...settings, overrides: settings.overrides.filter(x => x.id !== o.id) })} className="text-slate-400 hover:text-rose-600" title="Remove override"><X className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">System Audit Log</h3>
            <div className="flex gap-3">
              <button onClick={loadAuditLog} className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline"><RefreshCw className="h-3 w-3" /> Refresh</button>
              {isAdmin && demoMode && <button onClick={() => { if (window.confirm('Reset ALL demo data back to the seeded dataset? This cannot be undone.')) handlers.resetDemo(); }} className="text-xs font-bold text-rose-600 hover:underline">Reset Demo Data</button>}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
            {auditLog.length === 0 && <p className="py-6 text-center text-slate-400">No audit entries.</p>}
            {auditLog.map(l => (
              <div key={l.id} className="py-2.5 flex items-center justify-between gap-4">
                <div><p className="font-semibold text-slate-800">{l.action}: <span className="text-teal-700">{l.entity}</span></p><p className="text-[11px] text-slate-400">{l.detail}</p></div>
                <div className="text-right text-[11px] text-slate-400 shrink-0"><span>{l.actor}</span><span className="block font-mono">{l.time}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderUpskilling = () => (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Upskill</h1><p className="text-xs text-slate-500">Personalized upskilling paths based on your profile and current internal demand.</p></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(learningRecommendations.length ? learningRecommendations : [
          { skill: 'Deepen your strongest skill', reason: 'No skill gaps were found against current open roles. Consider pursuing an advanced certification in your primary area.', time: '4–8 weeks' }
        ]).map(r => (
          <div key={r.skill} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal-600" /><h3 className="text-sm font-bold text-slate-900">{r.skill}</h3></div>
            <p className="mt-2 text-xs text-slate-600">{r.reason}</p>
            <p className="mt-1 text-xs text-slate-400">Estimated time: {r.time}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ============================================================
  //  RENDER: External Hires
  // ============================================================
  const externalStatusStyle = (status) => ({
    Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Pending: 'bg-amber-50 text-amber-700 border-amber-200',
    Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    Cancelled: 'bg-slate-100 text-slate-500 border-slate-200'
  }[status] || 'bg-slate-100 text-slate-500 border-slate-200');

  const renderExternalHires = () => {
    const canRaise = role === 'Manager';
    const canReview = role === 'Admin' || role === 'Operations';
    const candidateEditable = role === 'Admin' || role === 'Operations' || role === 'TA';
    const scheduler = ['TA', 'Admin', 'Operations', 'Manager'].includes(role);
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">External Hires</h1>
            <p className="text-xs text-slate-500">Raise external hire requests when no internal resource matches the requirement. Requests are approved by Admin/Operations.</p>
          </div>
          {canRaise && (
            <button onClick={() => setActiveModal({ type: 'external-request', data: null })} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-800">
              <Plus className="h-4 w-4" /> Raise External Request
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4">
          {externalRequests.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400">No external hire requests.</p>}
          {externalRequests.map(r => (
            <div key={r.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{r.jobTitle}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${externalStatusStyle(r.status)}`}>{r.status}</span>
                    {r.candidateStatus && r.candidateName && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">{r.candidateStatus}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{r.customer} · {r.project} · {r.practice} · {r.location || 'Remote'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(r.skills || []).map(s => <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{s}</span>)}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500 shrink-0">
                  <p>Raised by {r.manager}</p>
                  <p>{r.requestDate}</p>
                  {r.budgetRate ? <p className="font-semibold text-slate-700">${r.budgetRate}/h</p> : null}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-600">{r.reason}</p>
              {r.rejectionReason && <p className="mt-2 text-[11px] text-rose-600">Rejected: {r.rejectionReason}</p>}
              {r.candidateName && (
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                  <p className="font-semibold text-slate-800">{r.candidateName} <span className="text-slate-400">· {r.candidateEmail}</span></p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(r.candidateSkills || []).map(s => <span key={s} className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">{s}</span>)}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canReview && r.status === 'Pending' && (
                  <>
                    <button onClick={() => handlers.reviewExternal(r.id, 'Approved')} className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Approve</button>
                    <button onClick={() => { const reason = window.prompt('Enter rejection reason:'); if (reason !== null) handlers.reviewExternal(r.id, 'Rejected', reason.trim()); }} className="rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100">Reject</button>
                  </>
                )}
                {(candidateEditable || (role === 'Manager' && r.manager === currentUser?.name)) && r.status === 'Approved' && (
                  <button onClick={() => setActiveModal({ type: 'external-candidate', data: r })} className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">Update Candidate</button>
                )}
                {scheduler && r.status === 'Approved' && r.candidateName && (
                  <button onClick={() => setActiveModal({ type: 'schedule-interview', data: r })} className="rounded-md bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100">Schedule Interview</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============================================================
  //  RENDER: Interview Panels
  // ============================================================
  const renderPanels = () => {
    const canManage = role === 'Admin';
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Interview Panels</h1>
            <p className="text-xs text-slate-500">Available interviewers, their interview skills, and weekly availability slots.</p>
          </div>
          {canManage && (
            <button onClick={() => setActiveModal({ type: 'panel-form', data: null })} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-800">
              <Plus className="h-4 w-4" /> Add Panel Member
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {panels.length === 0 && <p className="col-span-full rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400">No panels configured yet.</p>}
          {panels.map(panel => (
            <div key={panel.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sm font-bold text-sky-700">{panel.name.split(' ').map(s => s[0]).join('').slice(0, 2)}</div>
                  <div><p className="font-bold text-slate-900">{panel.name}</p><p className="text-[11px] text-slate-400">Interview Panel Member</p></div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => setActiveModal({ type: 'panel-form', data: panel })} className="rounded-md bg-teal-50 p-1 text-teal-700 hover:bg-teal-100" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => { if (window.confirm(`Deactivate panel member ${panel.name}?`)) handlers.deactivatePanel(panel); }} className="rounded-md bg-rose-50 p-1 text-rose-600 hover:bg-rose-100" title="Deactivate"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interview Skills</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(panel.skills || []).map(s => <span key={s} className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-100">{s}</span>)}
                  {(panel.skills || []).length === 0 && <span className="text-[11px] text-slate-400">No skills configured</span>}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Domains</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(panel.domains || []).map(d => <span key={d} className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-100">{d}</span>)}
                  {(panel.domains || []).length === 0 && <span className="text-[11px] text-slate-400">No domains selected</span>}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Availability Slots (1h)</p>
                <div className="mt-1 space-y-1">
                  {(panel.timeSlots || []).slice(0, 8).map((slot, i) => (
                    <p key={i} className="text-[11px] text-slate-600"><span className="font-semibold">{slot.date}</span> · {slot.time}</p>
                  ))}
                  {(panel.timeSlots || []).length > 8 && <span className="text-[10px] text-slate-400">+{(panel.timeSlots || []).length - 8} more</span>}
                  {(panel.timeSlots || []).length === 0 && <span className="text-[11px] text-slate-400">No slots configured</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============================================================
  //  RENDER: Interview Roster
  // ============================================================
  const rosterStatusStyle = (status) => ({
    Scheduled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Rescheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    Completed: 'bg-slate-100 text-slate-500 border-slate-200',
    Cancelled: 'bg-rose-50 text-rose-700 border-rose-200'
  }[status] || 'bg-slate-100 text-slate-500 border-slate-200');

  const renderInterviewRoster = () => {
    const isTA = role === 'TA';
    const schedulableRequests = externalRequests.filter(r => r.status === 'Approved' && r.candidateName);

    const nowDate = new Date();
    const todayDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7));
    monday.setDate(monday.getDate() + rosterWeekOffset * 7);
    const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = [];
    for (let i = 0; days.length < 5; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const weekday = d.getDay();
      if (weekday === 0 || weekday === 6) continue;
      days.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        label: weekdayLabels[weekday],
        day: d.getDate()
      });
    }
    const hourLabels = Array.from({ length: 10 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);
    const weekItems = roster
      .filter(r => r.status !== 'Cancelled')
      .map(r => {
        const start = new Date(String(r.scheduledAt).replace(' ', 'T'));
        const top = (((start.getHours() - 8) * 60 + start.getMinutes()) / 60) * 48;
        const height = ((r.durationMinutes || 60) / 60) * 48;
        return { ...r, date: r.scheduledAt.slice(0, 10), top, height };
      })
      .filter(r => !Number.isNaN(r.top) && r.top >= 0 && days.some(d => d.date === r.date));
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Interview Roster</h1>
            <p className="text-xs text-slate-500">Interview schedule that blocks panel member time. Panel skills must match the job requirements.</p>
          </div>
          {isTA && (
            <button onClick={() => setActiveModal({ type: 'schedule-interview', data: schedulableRequests[0] || null })} disabled={schedulableRequests.length === 0} className="flex items-center gap-1.5 rounded-lg bg-purple-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed">
              <CalendarDays className="h-4 w-4" /> Schedule Interview
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Scheduled', value: roster.filter(r => r.status === 'Scheduled').length, tone: 'text-emerald-700' },
            { label: 'Rescheduled', value: roster.filter(r => r.status === 'Rescheduled').length, tone: 'text-blue-700' },
            { label: 'Completed', value: roster.filter(r => r.status === 'Completed').length, tone: 'text-slate-600' },
            { label: 'Cancelled', value: roster.filter(r => r.status === 'Cancelled').length, tone: 'text-rose-700' }
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
              <p className={`mt-1 text-2xl font-extrabold font-heading ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRosterWeekOffset(0)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${rosterWeekOffset === 0 ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>Current Week</button>
          <button onClick={() => setRosterWeekOffset(1)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${rosterWeekOffset === 1 ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>Next Week</button>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs overflow-x-auto">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[3rem_repeat(5,1fr)] gap-1">
              <div />
              {days.map(d => <div key={d.date} className="text-center text-[10px] font-bold text-slate-600">{d.label} <span className="text-slate-400">{d.day}</span></div>)}
            </div>
            <div className="grid grid-cols-[3rem_repeat(5,1fr)] gap-1 mt-1">
              <div className="text-right text-[10px] text-slate-400">
                {hourLabels.map(t => <div key={t} style={{ height: 48 }} className="flex items-start justify-end pt-0.5 border-t border-slate-100">{t}</div>)}
              </div>
              {days.map(d => (
                <div key={d.date} className="relative rounded-lg bg-slate-50/50" style={{ height: 10 * 48 }}>
                  {hourLabels.map(t => <div key={t} style={{ height: 48 }} className="border-t border-slate-100" />)}
                  {weekItems.filter(item => item.date === d.date).map(item => (
                    <div
                      key={item.id}
                      className="absolute left-1 right-1 z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-xs cursor-pointer"
                      style={{ top: item.top, height: item.height, background: item.status === 'Completed' ? '#64748b' : item.status === 'Rescheduled' ? '#3b82f6' : '#7c3aed' }}
                      title={`${item.candidateName} · R${item.roundNumber} · ${item.panelName}`}
                    >
                      <p className="truncate">{item.candidateName}</p>
                      <p className="truncate opacity-90">R{item.roundNumber} {item.interviewType} · {item.scheduledAt.slice(11, 16)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3.5">Candidate / Role</th>
                  <th className="px-5 py-3.5">Panel</th>
                  <th className="px-5 py-3.5">Round</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Scheduled</th>
                  <th className="px-5 py-3.5">Duration</th>
                  <th className="px-5 py-3.5">Status</th>
                  {isTA && <th className="px-5 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">No interviews scheduled.</td></tr>}
                {roster.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3"><p className="font-semibold text-slate-800">{item.candidateName}</p><p className="text-[11px] text-slate-400">{item.jobTitle}</p></td>
                    <td className="px-5 py-3 text-slate-700">{item.panelName}</td>
                    <td className="px-5 py-3"><span className="font-semibold text-slate-700">R{item.roundNumber}</span>{item.level ? <span className="text-slate-400"> · {item.level}</span> : null}</td>
                    <td className="px-5 py-3 text-slate-600">{item.interviewType}</td>
                    <td className="px-5 py-3 text-slate-600">{item.scheduledAt}</td>
                    <td className="px-5 py-3 text-slate-600">{item.durationMinutes}m</td>
                    <td className="px-5 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${rosterStatusStyle(item.status)}`}>{item.status}</span></td>
                    {isTA && (
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {item.status !== 'Completed' && item.status !== 'Cancelled' && (
                          <>
                            <button onClick={() => handlers.updateInterview(item.id, { status: 'Completed' })} className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-100">Complete</button>
                            <button onClick={() => setActiveModal({ type: 'reschedule-interview', data: item })} className="ml-1 rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100">Reschedule</button>
                            <button onClick={() => { if (window.confirm('Cancel this interview?')) handlers.updateInterview(item.id, { status: 'Cancelled' }); }} className="ml-1 rounded-md bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100">Cancel</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  RENDER: Panel Interview Profile (Panel role)
  // ============================================================
  const renderInterviewProfile = () => {
    if (!myPanel) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400">
          No interview panel profile is linked to your account. Contact your administrator.
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Interview Profile</h1>
            <p className="text-xs text-slate-500">Maintain the skills you can interview and your available time slots.</p>
          </div>
          <button onClick={() => setActiveModal({ type: 'panel-profile', data: myPanel })} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800">
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </button>
        </div>
        {(() => {
          const upcoming = roster.filter(r => r.panelName === myPanel.name && (r.status === 'Scheduled' || r.status === 'Rescheduled')).length;
          const stats = [
            { label: 'Open slots', value: (myPanel.timeSlots || []).length, tone: 'text-teal-700' },
            { label: 'Upcoming interviews', value: upcoming, tone: 'text-purple-700' },
            { label: 'Skills', value: (myPanel.skills || []).length, tone: 'text-sky-700' }
          ];
          return (
            <div className="grid grid-cols-3 gap-3">
              {stats.map(s => (
                <div key={s.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                  <p className={`mt-1 text-2xl font-extrabold font-heading ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>
          );
        })()}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">Skills I can interview</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(myPanel.skills || []).map(s => <span key={s} className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-100">{s}</span>)}
              {(myPanel.skills || []).length === 0 && <span className="text-xs text-slate-400">No skills configured.</span>}
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Domains</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(myPanel.domains || []).map(d => <span key={d} className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-100">{d}</span>)}
              {(myPanel.domains || []).length === 0 && <span className="text-xs text-slate-400">No domains selected.</span>}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Available time slots (1h)</h3>{(myPanel.recurringSlots || []).length > 0 && <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">Repeats weekly</span>}</div>
            <div className="mt-3 space-y-2.5">
              {(() => {
                const byDate = {};
                (myPanel.timeSlots || []).forEach(slot => { (byDate[slot.date] = byDate[slot.date] || []).push(slot.time); });
                const dates = Object.keys(byDate).sort();
                if (dates.length === 0) return <span className="text-xs text-slate-400">No slots configured. Use Edit Profile to add your availability.</span>;
                const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                return dates.map(date => (
                  <div key={date} className="flex items-start gap-3">
                    <div className="w-16 shrink-0 text-[11px] font-bold text-slate-700">{wd[new Date(`${date}T00:00:00`).getDay()]} <span className="font-medium text-slate-400">{date.slice(5)}</span></div>
                    <div className="flex flex-wrap gap-1">{byDate[date].sort().map(time => <span key={time} className="rounded-md border border-teal-100 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">{time}</span>)}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  RENDER: Panel My Schedule (Panel role)
  // ============================================================
  const renderMySchedule = () => {
    const own = roster.filter(item => item.panelName === myPanel?.name).sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
    const upcomingCount = own.filter(i => i.status === 'Scheduled' || i.status === 'Rescheduled').length;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">My Schedule</h1>
          <p className="text-xs text-slate-500">Interviews where your time is blocked as a panel member. <span className="font-semibold text-purple-700">{upcomingCount} upcoming</span> · {own.length} total.</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr><th className="px-5 py-3.5">Candidate</th><th className="px-5 py-3.5">Role</th><th className="px-5 py-3.5">Round</th><th className="px-5 py-3.5">Type</th><th className="px-5 py-3.5">Scheduled</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {own.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">No interviews scheduled for you.</td></tr>}
                {own.map(item => (
                  <tr key={item.id}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{item.candidateName}</td>
                    <td className="px-5 py-3 text-slate-600">{item.jobTitle}</td>
                    <td className="px-5 py-3 text-slate-700">R{item.roundNumber}{item.level ? ` · ${item.level}` : ''}</td>
                    <td className="px-5 py-3 text-slate-600">{item.interviewType}</td>
                    <td className="px-5 py-3 text-slate-600">{item.scheduledAt}</td>
                    <td className="px-5 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${rosterStatusStyle(item.status)}`}>{item.status}</span></td>
                    <td className="px-5 py-3 text-right">
                      {item.status !== 'Cancelled' && item.status !== 'Completed' && (
                        <button onClick={() => { if (window.confirm(`Cancel your interview with ${item.candidateName} on ${item.scheduledAt}?`)) handlers.updateInterview(item.id, { status: 'Cancelled' }); }} className="rounded-md bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  RENDER: Users & Access (Admin only)
  // ============================================================
  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">Users &amp; Access</h1>
          <p className="text-xs text-slate-500">Provision accounts, assign roles, and revoke access. Passwords must be at least 12 characters with mixed case, a number, and a symbol.</p>
        </div>
        <button onClick={() => setActiveModal({ type: 'user-form', data: null })} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-800">
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">User</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Department</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Last Sign-In</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/80">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{user.name.split(' ').map(s => s[0]).join('').slice(0, 2)}</div>
                      <div><p className="font-semibold text-slate-800">{user.name}{user.id === currentUser?.id ? ' (you)' : ''}</p><p className="text-[11px] text-slate-400">{user.email}</p></div>
                    </div>
                  </td>
                  <td className="px-5 py-3"><span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200">{user.role}</span></td>
                  <td className="px-5 py-3 text-slate-600">{user.department || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${user.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{user.active ? 'Active' : 'Inactive'}</span>
                    {user.mustChangePassword && <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">Password reset pending</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{user.lastLoginAt || 'Never'}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setActiveModal({ type: 'user-form', data: user })} className="rounded-md bg-teal-50 px-2 py-1 font-semibold text-teal-700 hover:bg-teal-100">Edit</button>
                    {user.active && user.id !== currentUser?.id && (
                      <button onClick={() => { if (window.confirm(`Deactivate ${user.name}? Their active sessions will be revoked.`)) handlers.deactivateUser(user); }} className="ml-1 rounded-md bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100">Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">No user accounts loaded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ============================================================
  //  RENDER: Resource Drawer (slide-over panel)
  // ============================================================
  const renderDrawer = () => {
    if (!selectedPersonForDrawer) return null;
    const person = selectedPersonForDrawer;
    const { pct } = calculateCompleteness(person);
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedPersonForDrawer(null)} />
        <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-700 to-emerald-600 text-sm font-bold text-white">{person.name.split(' ').map(s => s[0]).join('')}</div>
              <div><p className="text-sm font-bold text-slate-900">{person.name}</p><p className="text-xs text-slate-500">{person.title} · {person.code}</p></div>
            </div>
            <button onClick={() => setSelectedPersonForDrawer(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"><X className="h-5 w-5" /></button>
          </div>

          <div className="flex border-b border-slate-200">
            {['overview', 'allocations', 'skills', 'notes'].map(tab => (
              <button key={tab} onClick={() => setDrawerTab(tab)} className={`flex-1 py-3 text-xs font-semibold text-center capitalize transition ${drawerTab === tab ? 'text-teal-700 border-b-2 border-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>{tab}</button>
            ))}
          </div>

          <div className="p-6 space-y-4">
            {drawerTab === 'overview' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Status', value: person.status + (person.status === 'Bench' ? ` · ${person.days}d` : person.status === 'Deployed' ? ` · ${person.allocationPct}%` : '') },
                    { label: 'Practice', value: person.practice },
                    { label: 'Location', value: person.location },
                    { label: 'Manager', value: person.manager },
                    { label: 'Type', value: person.type },
                    { label: 'Profile', value: `${pct}% complete` }
                  ].map(f => (
                    <div key={f.label} className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-400 uppercase">{f.label}</p><p className="text-xs font-semibold text-slate-800 mt-0.5">{f.value}</p></div>
                  ))}
                </div>
                {person.experience && <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Experience</p><p className="text-xs text-slate-700">{person.experience}</p></div>}
              </>
            )}
            {drawerTab === 'allocations' && (
              <>
                {person.project ? (
                  <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                    <p className="text-sm font-bold text-slate-800">{person.project} — {person.customer}</p>
                    <div className="text-xs text-slate-500"><span>{person.start} → {person.end}</span> · <span className="font-semibold text-teal-700">{person.allocationPct}%</span></div>
                    {person.end && <p className="text-xs"><span className={`font-bold ${dateDiff(person.end) <= 30 ? 'text-amber-600' : 'text-slate-600'}`}>{dateDiff(person.end)} days until roll-off</span> · Extension: <span className={person.extensionLikelihood === 'Likely' ? 'text-emerald-600 font-semibold' : person.extensionLikelihood === 'Unlikely' ? 'text-rose-600 font-semibold' : 'text-slate-400'}>{person.extensionLikelihood}</span></p>}
                  </div>
                ) : person.status === 'Allocated' && person.end ? (
                  <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                    <p className="text-sm font-bold text-slate-800">Allocated · available from {person.end}</p>
                    <div className="text-xs text-slate-500"><span>{person.start} → {person.end}</span> · <span className="font-semibold text-teal-700">{person.allocationPct}%</span></div>
                  </div>
                ) : (
                  <p className="text-center text-xs text-slate-400 py-8">No active allocation.</p>
                )}
                {privileged && (
                  <button onClick={() => { setActiveModal({ type: 'allocate', data: person }); setSelectedPersonForDrawer(null); }} className="w-full rounded-xl bg-teal-700 py-2.5 text-xs font-bold text-white hover:bg-teal-800">
                    {person.project ? 'Modify / Extend Allocation' : 'Deploy on Project'}
                  </button>
                )}
              </>
            )}
            {drawerTab === 'skills' && (
              <div className="space-y-3">
                {person.skills.map(s => (
                  <div key={s.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800">{s.name}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${s.level === 'Expert' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s.level === 'Advanced' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{s.level}</span></div>
                    <span className="text-xs text-slate-500">{s.years}y</span>
                  </div>
                ))}
                {person.certs.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-slate-500 uppercase mt-4">Certifications</p>
                    {person.certs.map(c => (
                      <div key={c.name} className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-xs font-semibold text-slate-800">{c.name}</p><p className="text-[11px] text-slate-500">{c.issuer} · Exp: {c.expiry}</p></div>
                    ))}
                  </>
                )}
              </div>
            )}
            {drawerTab === 'notes' && (
              <div className="space-y-3">
                {role !== 'Resource' && role !== 'Sales' && (
                  <form className="flex gap-2" onSubmit={async (e) => {
                    e.preventDefault();
                    const input = e.target.note;
                    const text = input.value.trim();
                    if (!text) return;
                    if (await handlers.addNote(person, text)) input.value = '';
                  }}>
                    <input name="note" placeholder="Add a bench update note..." className="flex-1 rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-teal-500" />
                    <button type="submit" className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800">Add Note</button>
                  </form>
                )}
                {person.notes?.length > 0 ? person.notes.map((n, i) => (
                  <div key={i} className="rounded-xl bg-slate-50 px-4 py-3"><div className="flex items-center justify-between text-[11px] text-slate-400"><span className="font-medium">{n.author}</span><span>{n.date}</span></div><p className="text-xs text-slate-700 mt-1">{n.text}</p></div>
                )) : <p className="text-center text-xs text-slate-400 py-8">No notes recorded.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  //  MAIN LAYOUT
  // ============================================================
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Mobile navigation overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`${mobileNavOpen ? 'fixed inset-y-0 left-0 z-50 flex' : 'hidden'} w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:static md:flex`}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-700 to-emerald-600 text-white shadow-md shadow-teal-700/20"><Layers className="h-5 w-5" /></div>
          <div><span className="text-xl font-extrabold tracking-tight text-slate-900 font-heading">Caliber<span className="text-teal-600">ate</span></span><span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Resource Intelligence</span></div>
          <button onClick={() => setMobileNavOpen(false)} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"><X className="h-4 w-4" /></button>
        </div>
        <div className="mx-3 mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Logged In As</span><span className="rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">{currentUser?.role}</span></div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{currentUser?.avatar}</div>
            <div className="truncate text-xs flex-1"><p className="font-semibold text-slate-800 truncate">{currentUser?.name}</p><p className="text-[10px] text-slate-400 truncate">{currentUser?.email}</p></div>
          </div>
        </div>
        <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Workspace</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {navigationItems.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button key={item.id} onClick={() => { setPage(item.id); setSearchQuery(''); setMobileNavOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${isActive ? 'bg-teal-50 text-teal-800 font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                <div className="flex items-center gap-3"><Icon className={`h-4 w-4 ${isActive ? 'text-teal-700' : 'text-slate-400'}`} /><span>{item.label}</span></div>
                {item.badge !== undefined && item.badge > 0 && (<span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[11px] font-bold text-rose-700">{item.badge}</span>)}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-3 space-y-2">
          <button onClick={() => setPasswordModalOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
            <KeyRound className="h-3.5 w-3.5" /><span>Change Password</span>
          </button>
          <button onClick={logout} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/60 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition">
            <LogOut className="h-3.5 w-3.5" /><span>Sign Out ({currentUser?.name?.split(' ')[0]})</span>
          </button>
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1"><span>Ref Date: {TODAY}</span><span className="flex items-center gap-1"><Shield className="h-3 w-3 text-teal-600" /> PRD v1.0</span></div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* HEADER — NO "View As" DROPDOWN */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 lg:px-8">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <button onClick={() => setMobileNavOpen(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" title="Open navigation"><Menu className="h-5 w-5" /></button>
            <span className="font-semibold text-slate-900 font-heading">Caliberate</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{navigationItems.find(i => i.id === activePage)?.label || activePage}</span>
            {role === 'Manager' && (<span className="ml-2 hidden text-xs text-teal-700 sm:inline-flex items-center gap-1 bg-teal-50 px-2 py-0.5 rounded-md font-medium"><Building className="h-3 w-3" /> Digital Practice (Rachel Shah)</span>)}
          </div>
          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <div className="relative">
              <button onClick={() => setNotificationPanelOpen(!notificationPanelOpen)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition" title="Alerts and Notifications">
                <Bell className="h-5 w-5" />
                {(notifications.some(n => !n.read) || (!restrictedRole && (metrics.redFlagsCount > 0 || metrics.rolloffs30d.length > 0 || metrics.expiringCerts.length > 0))) && (<span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />)}
              </button>
              {notificationPanelOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 font-semibold text-sm"><Bell className="h-4 w-4 text-teal-600" /><span>Notifications</span>{notifications.some(n => !n.read) ? <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700">{notifications.filter(n => !n.read).length}</span> : null}</div>
                    <div className="flex items-center gap-1">
                      {notifications.some(n => !n.read) && <button onClick={handlers.markAllNotificationsRead} className="text-[10px] font-bold text-teal-700 hover:underline">Mark all read</button>}
                      <button onClick={() => setNotificationPanelOpen(false)} className="rounded-md p-1 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs py-2">
                    {notifications.length === 0 && <p className="py-4 text-center text-slate-400">No notifications yet.</p>}
                    {notifications.map(n => (
                      <div key={n.id} className={`py-2.5 flex items-start gap-2.5 ${n.read ? 'opacity-60' : ''}`}>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-100 text-teal-700"><Calendar className="h-3.5 w-3.5" /></span>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-800">{n.title}</p>
                          <p className="text-[11px] text-slate-500">{n.body}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">{n.createdAt}</p>
                        </div>
                        {!n.read && <button onClick={() => handlers.markNotificationRead(n.id)} className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200">Read</button>}
                      </div>
                    ))}
                    {!restrictedRole && metrics.redFlagsCount > 0 && (
                      <div className="py-2.5 flex items-start gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700"><Flag className="h-3.5 w-3.5" /></span><div><p className="font-semibold text-slate-800">{metrics.redFlagsCount} Resources Over Red Flag Threshold</p><button onClick={() => { setPage('Bench Watch'); setNotificationPanelOpen(false); }} className="mt-1 text-teal-700 font-semibold hover:underline">View Bench Watch →</button></div></div>
                    )}
                    {!restrictedRole && metrics.rolloffs30d.length > 0 && (
                      <div className="py-2.5 flex items-start gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700"><Calendar className="h-3.5 w-3.5" /></span><div><p className="font-semibold text-slate-800">{metrics.rolloffs30d.length} Deployments Ending in 30 Days</p><button onClick={() => { setPage('Roll-offs'); setNotificationPanelOpen(false); }} className="mt-1 text-teal-700 font-semibold hover:underline">View Roll-off Pipeline →</button></div></div>
                    )}
                    {!restrictedRole && metrics.expiringCerts.length > 0 && (
                      <div className="py-2.5 flex items-start gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700"><Award className="h-3.5 w-3.5" /></span><div><p className="font-semibold text-slate-800">{metrics.expiringCerts.length} Certifications Expiring Soon</p></div></div>
                    )}
                    {!restrictedRole && requests.filter(r => r.status?.includes('Pending')).length > 0 && (
                      <div className="py-2.5 flex items-start gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-100 text-purple-700"><Inbox className="h-3.5 w-3.5" /></span><div><p className="font-semibold text-slate-800">Staffing Requests Awaiting Approval</p><button onClick={() => { setPage('Requests'); setNotificationPanelOpen(false); }} className="mt-1 text-purple-700 font-semibold hover:underline">Review Queue →</button></div></div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Profile pill & Sign Out */}
            <div className="flex items-center gap-2">
              <button onClick={() => setPasswordModalOpen(true)} className="hidden sm:flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="Change password">
                <KeyRound className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-1.5 pr-3 py-1 cursor-pointer hover:bg-slate-50 transition">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">{currentUser?.avatar}</span>
                <span className="text-xs font-semibold text-slate-700">{currentUser?.name}</span>
              </div>
              <button onClick={logout} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition" title="Sign Out to Login Page">
                <LogOut className="h-3.5 w-3.5" /><span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* PAGE BODY */}
        <main className="flex-1 overflow-y-auto bg-slate-50/60 p-5 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {activePage === 'Dashboard' && renderDashboard()}
            {activePage === 'Employees' && renderEmployees()}
            {activePage === 'Bench Watch' && renderBenchWatch()}
            {activePage === 'Roll-offs' && renderRolloffs()}
            {activePage === 'Openings' && renderOpenings()}
            {activePage === 'Requests' && renderRequests()}
            {activePage === 'Deployments' && renderDeployments()}
            {activePage === 'Supply Demand' && renderSupplyDemand()}
            {activePage === 'Reports' && renderReports()}
            {activePage === 'Settings' && renderSettings()}
            {activePage === 'Users' && isAdmin && renderUsers()}
            {activePage === 'External Hires' && renderExternalHires()}
            {activePage === 'Panels' && renderPanels()}
            {activePage === 'Interview Roster' && renderInterviewRoster()}
            {activePage === 'Interview Profile' && role === 'Panel' && renderInterviewProfile()}
            {activePage === 'My Schedule' && role === 'Panel' && renderMySchedule()}
            {activePage === 'My Profile' && renderMyProfile()}
            {activePage === 'My Applications' && renderMyApplications()}
            {activePage === "Who's Free" && renderWhosFreeBenchFinder()}
            {activePage === 'Upskilling' && renderUpskilling()}
          </div>
        </main>
      </div>

      {/* Drawer */}
      {renderDrawer()}

      {/* Action modals */}
      <Modals
        key={`${passwordModalOpen ? 'change-password' : activeModal?.type || 'none'}-${activeModal?.data?.id ?? 'new'}`}
        modal={passwordModalOpen ? { type: 'change-password' } : activeModal}
        onClose={() => { if (passwordModalOpen) setPasswordModalOpen(false); else setActiveModal(null); }}
        today={TODAY}
        handlers={handlers}
        notify={showToast}
        externalRequests={externalRequests}
        panels={panels}
        roster={roster}
        onChangePassword={async (currentPassword, newPassword) => {
          await changePassword(currentPassword, newPassword);
          setPasswordModalOpen(false);
          await loadData();
          showToast('Password updated.');
        }}
        forcedPasswordChange={Boolean(currentUser?.mustChangePassword)}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-semibold shadow-lg ${toast.type === 'success' ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
