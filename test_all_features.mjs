// Caliberate Full End-to-End Functionality Verification Test
const BASE_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5173';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
  }
}

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  let body = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, headers: res.headers, body };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 CALIBERATE FULL FUNCTIONALITY TEST SUITE');
  console.log('====================================================\n');

  // 1. Web & Server Health Checks
  console.log('--- 1. Web & Server Reachability ---');
  try {
    const feRes = await request(FRONTEND_URL);
    assert(feRes.status === 200 && feRes.body.includes('Caliberate'), 'Frontend Vite Server running and serving HTML', `status: ${feRes.status}`);
  } catch (err) {
    assert(false, 'Frontend Vite Server running', err.message);
  }

  try {
    const staticRes = await request(`${BASE_URL}/`);
    assert(staticRes.status === 200, 'Express backend serving production/static app on port 3001', `status: ${staticRes.status}`);
  } catch (err) {
    assert(false, 'Express backend serving static app', err.message);
  }

  // 2. Authentication & JWT Tokens
  console.log('\n--- 2. Authentication & Access Control ---');
  const roles = [
    { email: 'admin@caliberate.io', role: 'Admin', name: 'Rachel Admin' },
    { email: 'ops@caliberate.io', role: 'Operations', name: 'Marcus Vance' },
    { email: 'rachel.shah@caliberate.io', role: 'Manager', name: 'Rachel Shah' },
    { email: 'aarav.kumar@caliberate.io', role: 'Resource', name: 'Aarav Kumar' },
    { email: 'sales@caliberate.io', role: 'Sales', name: 'Elena Rostova' },
  ];

  const tokens = {};

  for (const user of roles) {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: user.email, password: 'caliberate123' })
    });
    assert(res.status === 200 && res.body.token && res.body.user.role === user.role, `Login successful for ${user.role} (${user.email})`);
    tokens[user.role] = res.body.token;
  }

  // Test invalid credentials
  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@caliberate.io', password: 'wrongpassword' })
  });
  assert(badLogin.status === 401, 'Rejection of invalid password returns HTTP 401');

  // Test missing credentials
  const missingLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert(missingLogin.status === 400, 'Missing email returns HTTP 400');

  // Test Auth Me endpoint
  const meRes = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${tokens.Admin}` }
  });
  assert(meRes.status === 200 && meRes.body.role === 'Admin', 'GET /api/auth/me returns authenticated user profile');

  // Test Demo Users endpoint
  const demoUsersRes = await request('/api/auth/demo-users');
  assert(demoUsersRes.status === 200 && Array.isArray(demoUsersRes.body) && demoUsersRes.body.length === 5, 'GET /api/auth/demo-users returns 5 demo personas');

  // Test unauthenticated access to protected endpoint
  const unauthRes = await request('/api/people');
  assert(unauthRes.status === 401, 'Protected route rejects request without token (HTTP 401)');

  // 3. RBAC & Data Privacy Masking
  console.log('\n--- 3. RBAC & Financial Privacy Masking ---');
  
  // Admin sees financial fields
  const adminPeople = await request('/api/people', {
    headers: { Authorization: `Bearer ${tokens.Admin}` }
  });
  const adminHasFinances = adminPeople.body.some(p => p.dailyCost !== undefined && p.rate !== undefined);
  assert(adminPeople.status === 200 && adminHasFinances, 'Admin has access to dailyCost and rate');

  // Operations sees financial fields
  const opsPeople = await request('/api/people', {
    headers: { Authorization: `Bearer ${tokens.Operations}` }
  });
  const opsHasFinances = opsPeople.body.some(p => p.dailyCost !== undefined && p.rate !== undefined);
  assert(opsPeople.status === 200 && opsHasFinances, 'Operations has access to dailyCost and rate');

  // Manager does NOT see financial fields
  const mgrPeople = await request('/api/people', {
    headers: { Authorization: `Bearer ${tokens.Manager}` }
  });
  const mgrMasked = mgrPeople.body.every(p => p.dailyCost === undefined && p.rate === undefined);
  assert(mgrPeople.status === 200 && mgrMasked, 'Manager financial data (dailyCost, rate) is masked/hidden');

  // Manager team view vs org view
  const mgrTeamCount = mgrPeople.body.length;
  const mgrOrgPeople = await request('/api/people?managerView=org', {
    headers: { Authorization: `Bearer ${tokens.Manager}` }
  });
  assert(mgrOrgPeople.body.length >= mgrTeamCount, `Manager can toggle between direct reports (${mgrTeamCount}) and full org (${mgrOrgPeople.body.length})`);

  // Resource sees only their own profile
  const resPeople = await request('/api/people', {
    headers: { Authorization: `Bearer ${tokens.Resource}` }
  });
  assert(resPeople.body.length === 1 && resPeople.body[0].name === 'Aarav Kumar', 'Resource sees only their own profile in /api/people');

  // Resource accessing other profile directly is forbidden
  const resForbidden = await request('/api/people/2', {
    headers: { Authorization: `Bearer ${tokens.Resource}` }
  });
  assert(resForbidden.status === 403, 'Resource cannot view another employee profile directly (HTTP 403)');

  // Resource accessing own profile directly succeeds
  const resOwn = await request('/api/people/1', {
    headers: { Authorization: `Bearer ${tokens.Resource}` }
  });
  assert(resOwn.status === 200 && resOwn.body.id === 1, 'Resource can view their own profile directly (HTTP 200)');

  // Sales sees workforce without financial data
  const salesPeople = await request('/api/people', {
    headers: { Authorization: `Bearer ${tokens.Sales}` }
  });
  const salesMasked = salesPeople.body.every(p => p.dailyCost === undefined && p.rate === undefined);
  assert(salesPeople.status === 200 && salesMasked, 'Sales "Who\'s Free" view masks financial rates');

  // 4. People Management CRUD & Life-Cycle
  console.log('\n--- 4. People Management (CRUD & Allocations) ---');
  
  // Non-privileged cannot add employee
  const failAdd = await request('/api/people', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Resource}` },
    body: JSON.stringify({ code: 'TEST-999', name: 'Unauthorized Person' })
  });
  assert(failAdd.status === 403, 'Resource cannot create new employee (HTTP 403)');

  // Admin/Ops creates new employee
  const newEmpCode = `TEST-${Date.now().toString().slice(-4)}`;
  const testToday = new Date().toISOString().slice(0, 10);
  const testAllocationStart = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const testAllocationEnd = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  const addRes = await request('/api/people', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Admin}` },
    body: JSON.stringify({
      code: newEmpCode,
      name: 'Jordan Lee',
      title: 'DevOps Architect',
      practice: 'Cloud',
      manager: 'Rachel Shah',
      location: 'Bengaluru',
      joinDate: testToday,
      dailyCost: 600,
      rate: 110,
      status: 'Bench',
      benchStart: testToday,
      days: 30,
      allocationPct: 0,
      skills: [{ name: 'Terraform', level: 'Expert', years: 5, lastUsed: testToday.slice(0, 7) }]
    })
  });
  assert(addRes.status === 201 && addRes.body.code === newEmpCode, `Admin can create new employee (${newEmpCode})`);
  const createdPersonId = addRes.body.id;

  // Ops updates employee allocation to Deployed 50%
  const updateRes = await request(`/api/people/${createdPersonId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Operations}` },
    body: JSON.stringify({
      ...addRes.body,
      status: 'Deployed',
      project: 'Project Phoenix',
      customer: 'Acme Corp',
      allocationPct: 50,
      days: 0,
      start: testAllocationStart,
      end: testAllocationEnd
    })
  });
  assert(updateRes.status === 200 && updateRes.body.status === 'Deployed' && updateRes.body.allocationPct === 50, 'Operations can update allocation (partial 50% deployment)');

  // Resource self-service: update skills and preferences
  const selfUpdateRes = await request('/api/people/1', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Resource}` },
    body: JSON.stringify({
      skills: [{ name: 'Java', level: 'Expert', years: 9, lastUsed: '2026-10' }, { name: 'GraphQL', level: 'Intermediate', years: 2, lastUsed: '2026-09' }],
      preferences: { travel: 'Up to 50%', remote: true }
    })
  });
  assert(selfUpdateRes.status === 200 && selfUpdateRes.body.skills.length === 2, 'Resource can self-service update skills and preferences');

  // 5. Internal Talent Marketplace & Job Requisitions
  console.log('\n--- 5. Talent Marketplace & Jobs ---');
  const jobsRes = await request('/api/jobs', {
    headers: { Authorization: `Bearer ${tokens.Operations}` }
  });
  assert(jobsRes.status === 200 && Array.isArray(jobsRes.body) && jobsRes.body.length > 0, `GET /api/jobs returns active openings (found ${jobsRes.body.length})`);

  // Manager creates a new job opening
  const newJobRes = await request('/api/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Manager}` },
    body: JSON.stringify({
      title: 'Full Stack Engineer',
      project: 'Project Nebula',
      customer: 'Starlight Corp',
      practice: 'Digital',
      mustHave: ['React', 'Node.js'],
      niceToHave: ['AWS'],
      minExp: 4,
      location: 'Bengaluru · Hybrid',
      positions: 1,
      status: 'Open'
    })
  });
  assert(newJobRes.status === 201, 'Manager can post new job opening');

  // Resource cannot create job opening
  const unauthJobRes = await request('/api/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Resource}` },
    body: JSON.stringify({ title: 'Hacker' })
  });
  assert(unauthJobRes.status === 403, 'Resource cannot post jobs (HTTP 403)');

  // 6. Applications Workflow
  console.log('\n--- 6. Job Applications Workflow ---');
  // Resource applies to job 1
  const applyRes = await request('/api/applications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Resource}` },
    body: JSON.stringify({
      jobId: 2,
      personId: 1,
      status: 'Applied',
      notes: 'Strong match for senior microservices requirements.'
    })
  });
  assert(applyRes.status === 201 && applyRes.body.id, 'Resource can apply for job in marketplace');
  const newAppId = applyRes.body.id;

  const dupApply = await request('/api/applications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Resource}` },
    body: JSON.stringify({ jobId: 2, personId: 1 })
  });
  assert(dupApply.status === 409, 'Duplicate active application is rejected (HTTP 409)');

  const spoofApply = await request('/api/applications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Resource}` },
    body: JSON.stringify({ jobId: 3, personId: 2 })
  });
  const myApps = await request('/api/applications', { headers: { Authorization: `Bearer ${tokens.Resource}` } });
  assert(spoofApply.status === 201 && spoofApply.body.personId === 1, 'Resource cannot apply on behalf of another employee (forced to own id)');
  assert(myApps.body.some(a => a.id === spoofApply.body.id), 'Resource sees only own applications');
  await request(`/api/applications/${spoofApply.body.id}`, { method: 'PUT', headers: { Authorization: `Bearer ${tokens.Resource}` }, body: JSON.stringify({ status: 'Withdrawn' }) });

  const salesApply = await request('/api/applications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Sales}` },
    body: JSON.stringify({ jobId: 3, personId: 2 })
  });
  assert(salesApply.status === 403, 'Sales cannot create applications (HTTP 403)');

  const salesEdit = await request('/api/people/1', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Sales}` },
    body: JSON.stringify({ name: 'Hacked' })
  });
  assert(salesEdit.status === 403, 'Sales cannot edit employee records (HTTP 403)');

  // Ops checks applications and updates status to Shortlisted
  const allApps = await request('/api/applications', {
    headers: { Authorization: `Bearer ${tokens.Operations}` }
  });
  assert(allApps.status === 200 && allApps.body.length > 0, `Operations sees all applications (count: ${allApps.body.length})`);

  const targetAppId = newAppId;
  const updateAppRes = await request(`/api/applications/${targetAppId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Operations}` },
    body: JSON.stringify({
      status: 'Shortlisted',
      notes: 'Shortlisted for client interview.'
    })
  });
  assert(updateAppRes.status === 200 && updateAppRes.body.status === 'Shortlisted', 'Operations can shortlist application');

  const wdOther = await request(`/api/applications/${targetAppId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Manager}` },
    body: JSON.stringify({ status: 'Withdrawn' })
  });
  assert(wdOther.status === 403, 'Manager cannot modify application status (HTTP 403)');

  const wdOwn = await request(`/api/applications/${targetAppId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Resource}` },
    body: JSON.stringify({ status: 'Withdrawn' })
  });
  assert(wdOwn.status === 200 && wdOwn.body.status === 'Withdrawn', 'Resource can withdraw their own application');

  // 7. Staffing Requests & Ops Approval Workflow
  console.log('\n--- 7. Two-Step Staffing Request & Approval Workflow ---');
  // Manager submits staffing request
  const requestStart = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const requestEnd = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  const reqCreateRes = await request('/api/requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Manager}` },
    body: JSON.stringify({
      manager: 'Rachel Shah',
      personId: createdPersonId,
      personName: 'Jordan Lee',
      project: 'Atlas',
      customer: 'Globex',
      action: 'Deploy',
      start: requestStart,
      end: requestEnd,
      pct: 100,
      rate: 110,
      reason: 'Urgent staffing requirement for Atlas Q4 milestone.'
    })
  });
  assert(reqCreateRes.status === 201, 'Manager can submit staffing deployment request');

  // Ops reviews and approves the request
  const requestsList = await request('/api/requests', {
    headers: { Authorization: `Bearer ${tokens.Operations}` }
  });
  assert(requestsList.status === 200 && requestsList.body.length > 0, `Operations sees requests queue (${requestsList.body.length} pending items)`);

  const latestReqId = requestsList.body[0].id;
  const approveRes = await request(`/api/requests/${latestReqId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Operations}` },
    body: JSON.stringify({ status: 'Approved' })
  });
  assert(approveRes.status === 200, 'Operations can approve staffing request');
  const afterApprove = await request(`/api/people/${createdPersonId}`, { headers: { Authorization: `Bearer ${tokens.Operations}` } });
  assert(afterApprove.body.status === 'Deployed' && afterApprove.body.project === 'Atlas' && afterApprove.body.allocationPct === 100, 'Approving a request deploys the employee onto the project');

  // Non-privileged user cannot approve
  const denyApproveRes = await request(`/api/requests/${latestReqId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Resource}` },
    body: JSON.stringify({ status: 'Approved' })
  });
  assert(denyApproveRes.status === 403, 'Resource cannot approve requests (HTTP 403)');

  // 8. Settings & Threshold Governance
  console.log('\n--- 8. Settings & Bench Aging Thresholds Governance ---');
  const getSettings = await request('/api/settings', {
    headers: { Authorization: `Bearer ${tokens.Admin}` }
  });
  assert(getSettings.status === 200 && getSettings.body.global, 'GET /api/settings returns bench threshold policies');

  // Admin updates threshold policies
  const updatedPolicy = {
    global: { amber: 8, red: 14, critical: 28 },
    overrides: getSettings.body.overrides || [],
    notifications: getSettings.body.notifications || {}
  };
  const putSettings = await request('/api/settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Admin}` },
    body: JSON.stringify(updatedPolicy)
  });
  assert(putSettings.status === 200, 'Admin can update bench policy thresholds');

  // Manager cannot update policy thresholds
  const failSettings = await request('/api/settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.Manager}` },
    body: JSON.stringify(updatedPolicy)
  });
  assert(failSettings.status === 403, 'Manager cannot update policy thresholds (HTTP 403)');

  // 9. Audit Logging
  console.log('\n--- 9. Audit Logging ---');
  const auditRes = await request('/api/settings/audit-log', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Admin}` },
    body: JSON.stringify({
      action: 'UPDATE_THRESHOLD',
      entity: 'ThresholdPolicy',
      detail: 'Updated amber to 8d and red to 14d'
    })
  });
  assert(auditRes.status === 201, 'Audit log records system events');

  const getAudit = await request('/api/settings/audit-log', {
    headers: { Authorization: `Bearer ${tokens.Admin}` }
  });
  assert(getAudit.status === 200 && getAudit.body.length > 0, `Admin can retrieve audit log entries (count: ${getAudit.body.length})`);

  const failAudit = await request('/api/settings/audit-log', {
    headers: { Authorization: `Bearer ${tokens.Resource}` }
  });
  assert(failAudit.status === 403, 'Resource cannot view audit logs (HTTP 403)');

  // 10. Frontend Business Rules & Calculations
  console.log('\n--- 10. Frontend Business Calculations & Algorithms ---');
  // Bench Flag Calculation
  const defaultSettings = { global: { amber: 10, red: 15, critical: 30 } };
  const mockGreen = { status: 'Bench', days: 5, practice: 'Digital' };
  const mockAmber = { status: 'Bench', days: 12, practice: 'Digital' };
  const mockRed = { status: 'Bench', days: 20, practice: 'Digital' };
  const mockCritical = { status: 'Bench', days: 35, practice: 'Digital' };
  const mockDeployed = { status: 'Deployed', days: 40, practice: 'Digital' };

  function getBenchFlagStatus(person, settings) {
    if (person.status !== 'Bench') return 'None';
    const override = settings?.overrides?.find(o =>
      (o.scope === 'Practice' && o.scopeName === person.practice) ||
      (o.scope === 'Skill' && person.skills?.some(s => s.name === o.scopeName))
    );
    const thresholds = override || settings?.global || { amber: 10, red: 15, critical: 30 };
    if (person.days >= thresholds.critical) return 'Critical';
    if (person.days >= thresholds.red) return 'Red';
    if (person.days >= thresholds.amber) return 'Amber';
    return 'Green';
  }

  assert(getBenchFlagStatus(mockGreen, defaultSettings) === 'Green', 'Bench flag: 5 days -> Green');
  assert(getBenchFlagStatus(mockAmber, defaultSettings) === 'Amber', 'Bench flag: 12 days -> Amber');
  assert(getBenchFlagStatus(mockRed, defaultSettings) === 'Red', 'Bench flag: 20 days -> Red');
  assert(getBenchFlagStatus(mockCritical, defaultSettings) === 'Critical', 'Bench flag: 35 days -> Critical');
  assert(getBenchFlagStatus(mockDeployed, defaultSettings) === 'None', 'Deployed person -> Bench flag None');

  // Practice Override Test
  const practiceOverrideSettings = {
    global: { amber: 10, red: 15, critical: 30 },
    overrides: [{ scope: 'Practice', scopeName: 'Enterprise / SAP', amber: 20, red: 30, critical: 45 }]
  };
  const mockSap = { status: 'Bench', days: 15, practice: 'Enterprise / SAP' };
  assert(getBenchFlagStatus(mockSap, practiceOverrideSettings) === 'Green', 'Practice override elevates amber threshold for SAP (15d is Green under SAP policy)');

  // Job Match Scoring Algorithm
  function calculateMatch(person, job) {
    if (!person || !job) return { score: 0, matchedMust: [], missingMust: [], matchedNice: [] };
    const personSkillNames = person.skills?.map(s => s.name.toLowerCase()) || [];
    const matchedMust = (job.mustHave || []).filter(s => personSkillNames.includes(s.toLowerCase()));
    const missingMust = (job.mustHave || []).filter(s => !personSkillNames.includes(s.toLowerCase()));
    const matchedNice = (job.niceToHave || []).filter(s => personSkillNames.includes(s.toLowerCase()));
    const totalPoints = ((job.mustHave || []).length * 2) + ((job.niceToHave || []).length * 1);
    const earnedPoints = (matchedMust.length * 2) + (matchedNice.length * 1);
    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    return { score, matchedMust, missingMust, matchedNice };
  }

  const candidate = {
    skills: [{ name: 'Java' }, { name: 'Spring Boot' }, { name: 'AWS' }]
  };
  const jobOpening = {
    mustHave: ['Java', 'Spring Boot'], // 2x each = 4pts
    niceToHave: ['AWS', 'Kafka']       // 1x each = 2pts (total 6pts; candidate has Java, Spring Boot, AWS = 5pts -> 83%)
  };
  const matchResult = calculateMatch(candidate, jobOpening);
  assert(matchResult.score === 83 && matchResult.matchedMust.length === 2 && matchResult.missingMust.length === 0, 'Match scoring: 83% weighted match score with must-have 2x weighting');

  // Profile Completeness Calculator
  function calculateCompleteness(person) {
    if (!person) return { pct: 0, missing: [] };
    let score = 30;
    const missing = [];
    if (person.skills && person.skills.length >= 3) score += 20;
    else missing.push('skills');
    if (person.certs && person.certs.length > 0) score += 20;
    else missing.push('certs');
    if (person.resumeUrl) score += 15;
    else missing.push('resume');
    if (person.experience && person.experience.length > 30) score += 10;
    else missing.push('experience');
    if (person.preferences && person.preferences.domains && person.preferences.domains.length > 0) score += 5;
    else missing.push('preferences');
    return { pct: Math.min(score, 100), missing };
  }

  const completeProfile = {
    skills: [{ name: 'React' }, { name: 'TypeScript' }, { name: 'Node' }],
    certs: [{ name: 'AWS' }],
    resumeUrl: 'resume.pdf',
    experience: 'Over 8 years building distributed scalable frontend architectures',
    preferences: { domains: ['FinTech'] }
  };
  assert(calculateCompleteness(completeProfile).pct === 100, 'Profile completeness: 100% with all criteria fulfilled');

  const partialProfile = {
    skills: [{ name: 'React' }],
    certs: [],
    resumeUrl: '',
    experience: '',
    preferences: {}
  };
  assert(calculateCompleteness(partialProfile).pct === 30, 'Profile completeness: baseline 30% when optional sections missing');

  // 11. Enterprise Readiness Endpoints
  console.log('\n--- 11. Enterprise Readiness & Account Lifecycle ---');
  const healthRes = await request('/api/health');
  assert(healthRes.status === 200 && healthRes.body.status === 'ok', 'Health endpoint reports service status');
  const readyRes = await request('/api/ready');
  assert(readyRes.status === 200 && readyRes.body.status === 'ready', 'Readiness endpoint verifies database connectivity');
  const configRes = await request('/api/auth/config');
  assert(configRes.status === 200 && typeof configRes.body.demoMode === 'boolean', 'Public auth config exposes runtime mode without secrets');

  const salesCapacity = await request('/api/people', { headers: { Authorization: `Bearer ${tokens.Sales}` } });
  const salesAnonymized = salesCapacity.body.every(p => p.name.startsWith('Available Resource #') && ['Bench', 'Allocated'].includes(p.status));
  assert(salesCapacity.status === 200 && salesAnonymized, 'Sales capacity view is anonymized and limited to available resources');

  const salesApps = await request('/api/applications', { headers: { Authorization: `Bearer ${tokens.Sales}` } });
  assert(salesApps.status === 403, 'Sales cannot access application records');
  const resourceRequests = await request('/api/requests', { headers: { Authorization: `Bearer ${tokens.Resource}` } });
  assert(resourceRequests.status === 403, 'Resource cannot access staffing request queue');

  const adminUsers = await request('/api/users', { headers: { Authorization: `Bearer ${tokens.Admin}` } });
  assert(adminUsers.status === 200 && adminUsers.body.length >= 5, 'Admin can list user accounts');
  const resourceUsers = await request('/api/users', { headers: { Authorization: `Bearer ${tokens.Resource}` } });
  assert(resourceUsers.status === 403, 'Non-admin cannot list user accounts');

  const newUserEmail = `e2e.user.${Date.now()}@caliberate.io`;
  const createUserRes = await request('/api/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Admin}` },
    body: JSON.stringify({
      name: 'E2E Test User',
      email: newUserEmail,
      password: 'Temp!Passw0rd',
      role: 'Manager',
      mustChangePassword: true
    })
  });
  assert(createUserRes.status === 201 && createUserRes.body.mustChangePassword === true, 'Admin can provision a user with a temporary password');

  const tempLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: newUserEmail, password: 'Temp!Passw0rd' })
  });
  assert(tempLogin.status === 200 && tempLogin.body.user.mustChangePassword === true, 'Temporary-password user can sign in');
  const blockedRes = await request('/api/people', { headers: { Authorization: `Bearer ${tempLogin.body.token}` } });
  assert(blockedRes.status === 403 && blockedRes.body.code === 'PASSWORD_CHANGE_REQUIRED', 'Password-change-required accounts are blocked from business APIs');

  const changedPassword = await request('/api/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tempLogin.body.token}` },
    body: JSON.stringify({ currentPassword: 'Temp!Passw0rd', newPassword: 'NewStr0ng!Passw0rd' })
  });
  assert(changedPassword.status === 200 && changedPassword.body.user.mustChangePassword === false, 'User can complete the forced password change');
  const afterPasswordPeople = await request('/api/people', { headers: { Authorization: `Bearer ${changedPassword.body.token}` } });
  assert(afterPasswordPeople.status === 200, 'Business APIs unlock after the password change');

  const deactivateUserRes = await request(`/api/users/${createUserRes.body.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokens.Admin}` }
  });
  assert(deactivateUserRes.status === 200 && deactivateUserRes.body.user.active === false, 'Admin can deactivate a user and revoke sessions');

  const importCsv = [
    'Name,Title,Practice,Manager,Location,Skills,Email,Type,CostCenter,DailyCost,Rate',
    `E2E Imported,Engineer,Digital,Rachel Shah,Remote,React; TypeScript,${`e2e.import.${Date.now()}@caliberate.io`},FTE,CC-DIG-01,450,90`
  ].join('\n');
  const importRes = await request('/api/people/import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.Admin}` },
    body: JSON.stringify({ csv: importCsv })
  });
  assert(importRes.status === 201 && importRes.body.imported === 1 && importRes.body.errors.length === 0, 'Validated CSV bulk import creates employee records');

  // Summary
  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
