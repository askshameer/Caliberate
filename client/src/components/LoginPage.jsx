import React, { useState, useEffect } from 'react';
import {
  Layers, Shield, ArrowRight, Lock, Mail, Eye, EyeOff, AlertTriangle, Users, CalendarDays, ChartNoAxesCombined
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiGet } from '../hooks/useApi';

export default function LoginPage() {
  const { login, demoMode, configLoaded, configError, retryConfig, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoUsers, setDemoUsers] = useState([]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');
  const [demoAttempt, setDemoAttempt] = useState(0);
  const [selectedPersonaId, setSelectedPersonaId] = useState('usr-ops');

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  // Load demo personas only when the server explicitly enables demo mode.
  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    if (!demoMode) {
      // eslint-disable-next-line react/set-state-in-effect
      setDemoUsers([]);
      return;
    }
    setPasswordInput(previous => previous || 'caliberate123');
    setDemoLoading(true);
    setDemoError('');
    apiGet('/auth/demo-users')
      .then(users => {
        if (!Array.isArray(users)) throw new Error('Invalid demo account list.');
        if (!cancelled) setDemoUsers(users);
      })
      .catch(error => {
        if (cancelled) return;
        setDemoError(error.message || 'Could not load demo accounts.');
        if (error.status === 429) {
          retryTimer = setTimeout(() => setDemoAttempt(attempt => attempt + 1), error.retryAfterMs || 30000);
        }
      })
      .finally(() => { if (!cancelled) setDemoLoading(false); });
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [demoMode, demoAttempt]);

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
    <div className="login-page">
      <header className="login-header">
        <a href="/login" className="brand-lockup" aria-label="Caliberate sign in">
          <span className="brand-mark"><Layers size={23} /></span>
          <span>Caliberate<span className="brand-caption">RESOURCE INTELLIGENCE</span></span>
        </a>
        <span className="login-header-note"><Shield size={15} aria-hidden="true" /> Your workforce, connected.</span>
      </header>
      <main className="login-layout">
        <section className="login-story" aria-labelledby="landing-heading">
          <div className="landing-story-copy">
            <span className="eyebrow"><span className="status-dot" /> PEOPLE. SKILLS. POSSIBILITIES.</span>
            <h1 id="landing-heading">A clearer view of talent.<br /><span>A better way to plan.</span></h1>
            <p className="login-intro">Know who is available, understand what they bring, and connect them to the right opportunity.</p>
          </div>
          <div className="workforce-map" aria-label="Plan your workforce: understand your people, align their skills, and connect them to opportunities">
            <div className="workforce-map-heading"><span>CONNECTED WORKFORCE</span><Layers size={17} aria-hidden="true" /></div>
            <ol className="workforce-steps">
              {[
                [Users, '01', 'Know your people', 'Availability, capacity & experience', 'People'],
                [ChartNoAxesCombined, '02', 'Understand their strengths', 'Skills, certifications & interests', 'Skills'],
                [CalendarDays, '03', 'Plan the next move', 'Projects, openings & deployments', 'Opportunity'],
              ].map(([Icon, step, title, description, tag]) => (
                <li key={step}>
                  <span className="workforce-step-icon"><Icon size={20} aria-hidden="true" /></span>
                  <div><span className="workforce-step-number">{step} / {tag}</span><h2>{title}</h2><p>{description}</p></div>
                </li>
              ))}
            </ol>
            <div className="workforce-map-footer"><span className="status-dot" /> One connected view. More informed decisions.</div>
          </div>
          <div className="landing-story-note"><Shield size={17} aria-hidden="true" /><span>A workspace tailored to your role.</span></div>
        </section>
        <section className="login-card" aria-labelledby="sign-in-heading">
          <span className="eyebrow">SIGN IN TO CALIBERATE</span>
          <h2 id="sign-in-heading">Welcome back</h2>
          <p className="login-card-intro">Your next great team starts here.</p>
          {errorMsg && <div role="alert" className="login-error"><AlertTriangle size={17} /><span>{errorMsg}</span></div>}
          {!configLoaded && <p role="status" className="login-access-note">Loading sign-in options...</p>}
          {configError && <div role="alert" className="login-error"><span>Demo sign-in options could not load: {configError}</span><button type="button" onClick={retryConfig}>Retry sign-in options</button></div>}
          <form onSubmit={handleFormSubmit} className="login-form">
            <div>
              <label htmlFor="login-email">Work email</label>
              <div className="login-input-wrap"><Mail size={17} />
                <input id="login-email" name="email" type="email" autoComplete="username" placeholder="you@company.com" required value={emailInput} onChange={e => { setEmailInput(e.target.value); setErrorMsg(''); }} />
              </div>
            </div>
            <div>
              <div className="login-label-row"><label htmlFor="login-password">Password</label><span>Contact IT to reset</span></div>
              <div className="login-input-wrap"><Lock size={17} />
                <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={passwordInput} onChange={e => setPasswordInput(e.target.value)} />
                <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </div>
            <button type="submit" className="login-submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in to workspace'}<ArrowRight size={18} /></button>
          </form>
          {demoMode && <p className="login-method-divider">Or explore Caliberate</p>}
          {demoMode && <div className="demo-section" aria-labelledby="demo-login-heading">
            <div className="demo-heading"><h3 id="demo-login-heading">One-click demo sign-in</h3><span>{demoLoading ? 'Loading...' : demoUsers.length + ' roles'}</span></div>
            <p>Choose your role to open its workspace. No email or password needed.</p>
            <div className="demo-grid">
              {demoUsers.map(persona => <button type="button" key={persona.id} disabled={loading} onClick={() => handlePersonaClick(persona)} className="demo-persona" aria-label={'Sign in as ' + persona.role + ': ' + persona.name} title={persona.name + ' - ' + persona.description}>
                <span className="demo-avatar">{persona.avatar}</span><span><strong>{persona.role}</strong><small>{loading && selectedPersonaId === persona.id ? 'Signing in...' : persona.name}</small></span><ArrowRight size={14} />
              </button>)}
            </div>
            {demoError && <div role="alert" className="login-error"><span>{demoError}</span><button type="button" onClick={() => setDemoAttempt(attempt => attempt + 1)}>Retry demo accounts</button></div>}
            {!demoError && demoUsers.length === 0 && <p role="status">{demoLoading ? 'Loading demo accounts...' : 'No demo personas are available.'}</p>}
          </div>}

          {configLoaded && !configError && !demoMode && <p className="login-access-note">Need access? Contact your Caliberate administrator to set up your account.</p>}
          <div className="login-security"><Shield size={14} /> Secure sign-in &middot; Role-based access</div>
        </section>
      </main>
      <footer className="login-footer"><span>Caliberate &middot; Resource Intelligence</span><span>A clearer view. A stronger team.</span></footer>
    </div>
  );
}
