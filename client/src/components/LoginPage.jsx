import React, { useState, useEffect } from 'react';
import {
  Layers, Sparkles, Shield, ArrowRight, Key, Lock, Mail, Eye, EyeOff, AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiGet } from '../hooks/useApi';

// Dark-theme badge colours so the role label stays readable on the landing cards.
const ROLE_BADGE = {
  Admin: 'bg-rose-500/15 text-rose-200 border-rose-400/40',
  Operations: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
  Manager: 'bg-teal-500/15 text-teal-200 border-teal-400/40',
  Resource: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40',
  Sales: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/40',
  TA: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/40',
  Panel: 'bg-sky-500/15 text-sky-200 border-sky-400/40'
};

export default function LoginPage() {
  const { login, demoMode, configLoaded, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoUsers, setDemoUsers] = useState([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState('usr-ops');

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  // Load demo personas only when the server explicitly enables demo mode.
  useEffect(() => {
    if (!demoMode) {
      // eslint-disable-next-line react/set-state-in-effect
      setDemoUsers([]);
      return;
    }
    if (!passwordInput) {
      // eslint-disable-next-line react/set-state-in-effect
      setPasswordInput('caliberate123');
    }
    apiGet('/auth/demo-users')
      .then(users => setDemoUsers(Array.isArray(users) ? users : []))
      .catch(() => {});
  }, [demoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) {
      setErrorMsg('Please enter your corporate email address.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      await login(trimmed, passwordInput);
      navigate('/');
    } catch (err) {
      setErrorMsg(err.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handlePersonaClick = async (persona) => {
    setSelectedPersonaId(persona.id);
    setLoading(true);
    setErrorMsg('');
    try {
      await login(persona.email, 'caliberate123');
      navigate('/');
    } catch (err) {
      setErrorMsg(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-10 font-sans">
      {/* Top Brand Header */}
      <div className="mx-auto w-full max-w-6xl flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/30">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <span className="text-2xl font-extrabold tracking-tight text-white font-heading">
              Caliber<span className="text-teal-400">ate</span>
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-teal-400/80">
              Resource Utilization & Deployment Tracker
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
          <span>Enterprise Identity Service · v1.1.0</span>
        </div>
      </div>

      {/* Center Main Stage */}
      <div className="mx-auto my-auto w-full max-w-6xl py-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300 mb-4 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-teal-400" />
            <span>Single Source of Truth for Deployment, Bench & Skills</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight font-heading">
            Sign in to your <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">Caliberate</span> Workspace
          </h1>
          <p className="mt-3 text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            Connect idle capacity to project demand with real-time bench tracking, roll-off forecasting, and role-scoped intelligence.
          </p>
        </div>

        <div className={`grid grid-cols-1 gap-8 items-start ${demoMode ? 'lg:grid-cols-12' : 'lg:grid-cols-2 max-w-4xl mx-auto'}`}>
          {/* Left Column: Persona Selection (demo) or Enterprise Access Info */}
          {demoMode ? (
            <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-5">
                <div>
                  <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
                    <Shield className="h-4 w-4 text-teal-400" />
                    <span>Select Role Persona (1-Click Instant Login)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Choose an organizational persona to explore its tailored dashboard & permissions.</p>
                </div>
                <span className="text-[11px] font-mono text-teal-400 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/60">{demoUsers.length} Demo Roles</span>
              </div>
              <div className="space-y-3">
                {demoUsers.map(persona => {
                  const isSelected = selectedPersonaId === persona.id;
                  return (
                    <div
                      key={persona.id}
                      onClick={() => handlePersonaClick(persona)}
                      className={`group relative flex items-start gap-3.5 rounded-2xl border p-4 transition-all duration-200 cursor-pointer ${
                        isSelected ? 'border-teal-500/80 bg-teal-950/40 shadow-lg shadow-teal-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-xs font-bold text-white group-hover:bg-teal-600 transition">{persona.avatar}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-white group-hover:text-teal-300 transition">{persona.name}</span>
                          <span className={`shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${ROLE_BADGE[persona.role] || 'bg-slate-500/15 text-slate-200 border-slate-400/30'}`}>{persona.role}</span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{persona.roleTitle}</p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{persona.description}</p>
                      </div>
                      <div className="shrink-0 self-center pl-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/60 text-slate-400 group-hover:bg-teal-600 group-hover:text-white transition shadow-xs">
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  );
                })}
                {demoUsers.length === 0 && (
                  <p className="py-8 text-center text-xs text-slate-500">{configLoaded ? 'No demo personas are available.' : 'Loading demo personas…'}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-2xl">
              <div className="border-b border-slate-800/80 pb-4 mb-5">
                <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
                  <Shield className="h-4 w-4 text-teal-400" />
                  <span>Enterprise Access</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Sign in with the corporate account provisioned by your platform administrator.</p>
              </div>
              <div className="space-y-4 text-xs text-slate-400">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="font-semibold text-slate-200">Role-based access</p>
                  <p className="mt-1 leading-relaxed">Every view is scoped to your role. Managers see their teams, resources see their own profile, and Sales sees anonymized capacity only.</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="font-semibold text-slate-200">Auditable by design</p>
                  <p className="mt-1 leading-relaxed">All workforce, allocation, approval, and policy changes are written to an immutable audit trail.</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="font-semibold text-slate-200">Need access?</p>
                  <p className="mt-1 leading-relaxed">Contact your Caliberate administrator to have an account created and your role assigned.</p>
                </div>
              </div>
            </div>
          )}

          {/* Right Column: Standard Sign-In */}
          <div className={`bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-2xl flex flex-col justify-between ${demoMode ? 'lg:col-span-5' : ''}`}>
            <div>
              <div className="border-b border-slate-800/80 pb-4 mb-5">
                <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
                  <Key className="h-4 w-4 text-emerald-400" />
                  <span>Corporate Email Sign-In</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Log in using your organization credentials or SSO.</p>
              </div>

              {errorMsg && (
                <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Corporate Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="email"
                      placeholder="e.g. rachel.shah@caliberate.io"
                      value={emailInput}
                      onChange={e => { setEmailInput(e.target.value); setErrorMsg(''); }}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <span className="block text-[10px] text-slate-500 mt-1">
                    Try: <code>admin@...</code>, <code>ops@...</code>, <code>rachel@...</code>, <code>aarav@...</code>, <code>sales@...</code>
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-400 font-semibold">Password</label>
                    <span className="text-[10px] text-slate-500">Contact IT to reset</span>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-500 hover:text-slate-300">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-teal-500/20 hover:from-teal-400 hover:to-emerald-400 transition disabled:opacity-50"
                >
                  {loading ? 'Signing in...' : 'Sign In to Caliberate →'}
                </button>
              </form>
            </div>

            <div className="border-t border-slate-800/80 pt-4 mt-6 text-center text-[11px] text-slate-500">
              <span>HttpOnly session cookie · Role-based access control · Immutable audit trail</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Metrics */}
      <div className="mx-auto w-full max-w-6xl border-t border-slate-800/60 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-3"><span className="text-xl font-extrabold text-teal-400 font-heading">30%</span><p className="text-[11px] text-slate-400 mt-0.5 font-medium">Avg. Bench Duration Reduction</p></div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-3"><span className="text-xl font-extrabold text-emerald-400 font-heading">90 Days</span><p className="text-[11px] text-slate-400 mt-0.5 font-medium">Roll-off Forecast Visibility</p></div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-3"><span className="text-xl font-extrabold text-amber-400 font-heading">Tiered Alerts</span><p className="text-[11px] text-slate-400 mt-0.5 font-medium">Amber · Red · Critical Policies</p></div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-3"><span className="text-xl font-extrabold text-indigo-400 font-heading">100% Match</span><p className="text-[11px] text-slate-400 mt-0.5 font-medium">Algorithmic Talent Marketplace</p></div>
        </div>
      </div>
    </div>
  );
}
