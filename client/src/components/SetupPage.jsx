import React, { useState } from 'react';
import { Layers, Shield, ArrowRight, Lock, Mail, User, Eye, EyeOff, AlertTriangle, Sparkles, ShieldCheck, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const passwordChecks = (pw) => [
  ['At least 12 characters', pw.length >= 12],
  ['Upper and lower case letters', /[A-Z]/.test(pw) && /[a-z]/.test(pw)],
  ['A number', /[0-9]/.test(pw)],
  ['A symbol', /[^A-Za-z0-9]/.test(pw)]
];

export default function SetupPage() {
  const { completeSetup, finishSetup } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('choose'); // choose | admin | done
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const res = await completeSetup(payload);
      setResult(res);
      setStep('done');
    } catch (err) {
      setError(err.message || 'Setup failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const choose = (selected) => {
    setMode(selected);
    setError('');
    if (selected === 'demo') submit({ mode: 'demo' });
    else setStep('admin');
  };

  const submitAdmin = (e) => {
    e.preventDefault();
    if (!passwordChecks(password).every(([, ok]) => ok)) return setError('Choose a stronger password that meets every requirement below.');
    if (password !== confirm) return setError('The passwords do not match.');
    submit({ mode: 'clean', adminName: name.trim() || undefined, adminEmail: email.trim(), adminPassword: password });
  };

  return (
    <div className="login-page">
      <header className="login-header">
        <span className="brand-lockup">
          <span className="brand-mark"><Layers size={23} /></span>
          <span>Caliberate<span className="brand-caption">RESOURCE INTELLIGENCE</span></span>
        </span>
        <span className="login-header-note"><Shield size={15} aria-hidden="true" /> First-time setup</span>
      </header>
      <main className="setup-main">
        <section className="login-card setup-card" aria-labelledby="setup-heading">
          {step === 'choose' && (
            <>
              <span className="eyebrow">WELCOME</span>
              <h2 id="setup-heading">Set up Caliberate</h2>
              <p className="login-card-intro">How would you like to start? You can reset the application back to a clean state later from the admin menu.</p>
              {error && <div role="alert" className="login-error"><AlertTriangle size={17} /><span>{error}</span></div>}
              <div className="setup-options">
                <button type="button" className="setup-option" disabled={busy} onClick={() => choose('demo')}>
                  <span className="setup-option-icon"><Sparkles size={20} /></span>
                  <span><strong>With demo</strong><small>Load sample employees, jobs, interview panels and one demo account for every role. Best for exploring and evaluating.</small></span>
                  <ArrowRight size={16} />
                </button>
                <button type="button" className="setup-option" disabled={busy} onClick={() => choose('clean')}>
                  <span className="setup-option-icon"><ShieldCheck size={20} /></span>
                  <span><strong>Without demo</strong><small>Start empty and create your own administrator. Best for a real deployment.</small></span>
                  <ArrowRight size={16} />
                </button>
              </div>
              {busy && <p role="status" className="login-access-note">Preparing your demo environment...</p>}
            </>
          )}

          {step === 'admin' && (
            <>
              <span className="eyebrow">ADMINISTRATOR</span>
              <h2 id="setup-heading">Create the admin account</h2>
              <p className="login-card-intro">This is the default administrator you will use to sign in and add everyone else.</p>
              {error && <div role="alert" className="login-error"><AlertTriangle size={17} /><span>{error}</span></div>}
              <form onSubmit={submitAdmin} className="login-form">
                <div>
                  <label htmlFor="setup-name">Full name</label>
                  <div className="login-input-wrap"><User size={17} />
                    <input id="setup-name" autoComplete="name" placeholder="Platform Administrator" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label htmlFor="setup-email">Admin username (email)</label>
                  <div className="login-input-wrap"><Mail size={17} />
                    <input id="setup-email" type="email" required autoComplete="username" placeholder="admin@company.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
                  </div>
                </div>
                <div>
                  <label htmlFor="setup-password">Password</label>
                  <div className="login-input-wrap"><Lock size={17} />
                    <input id="setup-password" type={showPassword ? 'text' : 'password'} required autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
                    <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </div>
                  <ul className="setup-checks" aria-label="Password requirements">
                    {passwordChecks(password).map(([label, ok]) => <li key={label} className={ok ? 'ok' : ''}><CheckCircle2 size={13} /> {label}</li>)}
                  </ul>
                </div>
                <div>
                  <label htmlFor="setup-confirm">Confirm password</label>
                  <div className="login-input-wrap"><Lock size={17} />
                    <input id="setup-confirm" type={showPassword ? 'text' : 'password'} required autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); }} />
                  </div>
                </div>
                <button type="submit" className="login-submit" disabled={busy}>{busy ? 'Creating...' : 'Create admin & finish'}<ArrowRight size={18} /></button>
                <button type="button" className="setup-back" onClick={() => { setStep('choose'); setError(''); }}><ArrowLeft size={14} /> Back</button>
              </form>
            </>
          )}

          {step === 'done' && (
            <>
              <span className="eyebrow">ALL SET</span>
              <h2 id="setup-heading">{mode === 'demo' ? 'Demo is ready' : 'Setup complete'}</h2>
              {mode === 'demo' ? (
                <p className="login-card-intro">Sample data has been loaded. Sign in with <strong>{result?.demoAdminEmail || 'admin@caliberate.io'}</strong> and the password <strong>caliberate123</strong> (other roles: ops@, rachel.shah@, aarav.kumar@, sales@, priya.nair@, ta@ caliberate.io).</p>
              ) : (
                <p className="login-card-intro">Your administrator account is ready. Sign in with <strong>{email}</strong> and the password you just chose.</p>
              )}
              <button type="button" className="login-submit" style={{ marginTop: 22 }} onClick={() => { finishSetup(); navigate('/login', { replace: true }); }}>Continue to sign in<ArrowRight size={18} /></button>
            </>
          )}
        </section>
      </main>
      <footer className="login-footer"><span>Caliberate &middot; Resource Intelligence</span><span>A clearer view. A stronger team.</span></footer>
    </div>
  );
}
