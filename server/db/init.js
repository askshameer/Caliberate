import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

const DB_PATH = config.dbPath;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Admin','Operations','Manager','Resource','Sales','Panel','TA')),
  role_title TEXT,
  department TEXT,
  avatar TEXT,
  badge_color TEXT,
  description TEXT,
  default_page TEXT DEFAULT 'Dashboard',
  person_id INTEGER,
  must_change_password INTEGER DEFAULT 0,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  token_version INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  title TEXT,
  practice TEXT,
  manager TEXT,
  location TEXT,
  join_date TEXT,
  type TEXT DEFAULT 'FTE',
  cost_center TEXT,
  daily_cost REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  status TEXT DEFAULT 'Bench' CHECK(status IN ('Deployed','Allocated','Bench','On Leave')),
  bench_start TEXT,
  days INTEGER DEFAULT 0,
  allocation_pct INTEGER DEFAULT 0,
  project TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  extension_likelihood TEXT DEFAULT 'Unknown',
  skills TEXT DEFAULT '[]',
  certs TEXT DEFAULT '[]',
  experience TEXT DEFAULT '',
  resume_url TEXT DEFAULT '',
  resume_file TEXT,
  preferences TEXT DEFAULT '{}',
  notes TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  project TEXT,
  customer TEXT,
  practice TEXT,
  must_have TEXT DEFAULT '[]',
  nice_to_have TEXT DEFAULT '[]',
  min_exp INTEGER DEFAULT 0,
  location TEXT,
  start_date TEXT,
  end_date TEXT,
  duration_months INTEGER DEFAULT 0,
  positions INTEGER DEFAULT 1,
  status TEXT DEFAULT 'Open',
  posted_by TEXT,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  status TEXT DEFAULT 'Applied',
  date TEXT DEFAULT (date('now')),
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (person_id) REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS staffing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager TEXT NOT NULL,
  person_id INTEGER,
  person_name TEXT,
  job_id INTEGER,
  project TEXT,
  customer TEXT,
  action TEXT DEFAULT 'Deploy',
  start_date TEXT,
  end_date TEXT,
  pct INTEGER DEFAULT 100,
  rate REAL DEFAULT 0,
  status TEXT DEFAULT 'Pending Ops Review',
  request_date TEXT DEFAULT (date('now')),
  reason TEXT DEFAULT '',
  rejection_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (person_id) REFERENCES people(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT,
  detail TEXT,
  before TEXT,
  after TEXT,
  ip TEXT,
  user_agent TEXT,
  time TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS external_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager TEXT NOT NULL,
  job_title TEXT NOT NULL,
  project TEXT,
  customer TEXT,
  practice TEXT,
  skills TEXT DEFAULT '[]',
  experience_years INTEGER DEFAULT 0,
  location TEXT,
  budget_rate REAL DEFAULT 0,
  reason TEXT DEFAULT '',
  request_date TEXT DEFAULT (date('now')),
  status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected','Cancelled')),
  rejection_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  candidate_name TEXT,
  candidate_email TEXT,
  candidate_skills TEXT DEFAULT '[]',
  candidate_status TEXT DEFAULT 'Sourcing',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  role_title TEXT,
  practice TEXT,
  skills TEXT DEFAULT '[]',
  domains TEXT DEFAULT '[]',
  time_slots TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS interview_roster (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER,
  job_title TEXT,
  candidate_name TEXT,
  panel_id INTEGER,
  panel_name TEXT,
  round_number INTEGER DEFAULT 1,
  level TEXT,
  interview_type TEXT,
  scheduled_at TEXT,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Completed','Cancelled','Rescheduled')),
  notes TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES external_requests(id),
  FOREIGN KEY (panel_id) REFERENCES panels(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_role TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT DEFAULT 'info',
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`;

// Seed data
const DEMO_USERS = [
  { id: 'usr-admin', name: 'Rachel Admin', email: 'admin@caliberate.io', role: 'Admin', roleTitle: 'Global IT & Platform Administrator', department: 'IT Governance & Platform Operations', avatar: 'RA', badgeColor: 'bg-rose-100 text-rose-800 border-rose-200', description: 'Full control: Configure tiered bench policies, manage users, audit logs, and integrations.', defaultPage: 'Dashboard', personId: null },
  { id: 'usr-ops', name: 'Marcus Vance', email: 'ops@caliberate.io', role: 'Operations', roleTitle: 'Head of Resource Management & PMO', department: 'Global Staffing & Operations', avatar: 'MV', badgeColor: 'bg-teal-100 text-teal-800 border-teal-200', description: 'Manage global workforce allocations, bench watch & cost, approvals queue, and marketplace.', defaultPage: 'Dashboard', personId: null },
  { id: 'usr-manager', name: 'Rachel Shah', email: 'rachel.shah@caliberate.io', role: 'Manager', roleTitle: 'Delivery & Practice Director', department: 'Digital Experience Practice', avatar: 'RS', badgeColor: 'bg-purple-100 text-purple-800 border-purple-200', description: 'Practice oversight: Team utilization vs 85% target, 30-day roll-off radar, and staffing requests.', defaultPage: 'Dashboard', personId: 3 },
  { id: 'usr-resource', name: 'Aarav Kumar', email: 'aarav.kumar@caliberate.io', role: 'Resource', roleTitle: 'Senior Backend & Cloud Engineer', department: 'Digital Practice (Currently on Bench)', avatar: 'AK', badgeColor: 'bg-amber-100 text-amber-800 border-amber-200', description: 'Employee workspace: Profile completeness, resume AI skill parser, marketplace, and applications.', defaultPage: 'My Profile', personId: 1 },
  { id: 'usr-sales', name: 'Elena Rostova', email: 'sales@caliberate.io', role: 'Sales', roleTitle: 'Client Solutions & Proposals Director', department: 'Business Development & Client Staffing', avatar: 'ER', badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200', description: 'Confidential "Who\'s Free" capacity matrix and skills supply heatmap for proposal staffing.', defaultPage: "Who's Free", personId: null },
  { id: 'usr-panel', name: 'Priya Nair', email: 'priya.nair@caliberate.io', role: 'Panel', roleTitle: 'Senior Engineering Interviewer', department: 'Digital Practice', avatar: 'PN', badgeColor: 'bg-sky-100 text-sky-800 border-sky-200', description: 'Interview panel member: technical interviews for Java, Spring Boot, React, and cloud roles.', defaultPage: 'Interview Profile', personId: null },
  { id: 'usr-ta', name: 'Divya Menon', email: 'ta@caliberate.io', role: 'TA', roleTitle: 'Talent Acquisition Lead', department: 'People & Talent Acquisition', avatar: 'DM', badgeColor: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200', description: 'Schedule interview panels, block interviewer time, and manage external hire pipelines.', defaultPage: 'Interview Roster', personId: null }
];

const INITIAL_PANELS = [
  { id: 1, userId: 'usr-panel', name: 'Priya Nair', email: 'priya.nair@caliberate.io', roleTitle: 'Senior Engineering Interviewer', practice: 'Digital', skills: ['Java', 'Spring Boot', 'Kubernetes', 'React', 'TypeScript', 'AWS'], domains: ['Digital', 'FinTech', 'Retail'], timeSlots: [] },
  { id: 2, userId: null, name: 'Vikram Sethi', email: 'vikram.sethi@caliberate.io', roleTitle: 'Cloud Architecture Interviewer', practice: 'Cloud', skills: ['AWS', 'Terraform', 'Kubernetes', 'Go', 'Docker'], domains: ['Cloud', 'HealthTech', 'Manufacturing'], timeSlots: [] },
  { id: 3, userId: null, name: 'Meera Joshi', email: 'meera.joshi@caliberate.io', roleTitle: 'Data Engineering Interviewer', practice: 'Data', skills: ['Python', 'Spark', 'SQL', 'dbt', 'PyTorch'], domains: ['Data', 'Analytics', 'Telecom'], timeSlots: [] }
];

const INITIAL_EXTERNAL_REQUESTS = [
  { id: 301, manager: 'Rachel Shah', jobTitle: 'Senior Java & Cloud Engineer', project: 'Atlas', customer: 'Globex', practice: 'Digital', skills: ['Java', 'Spring Boot', 'Kubernetes', 'Kafka'], experienceYears: 5, location: 'Bengaluru · Hybrid', budgetRate: 120, reason: 'Internal bench candidates do not cover the Kafka streaming requirement; no internal match found.', requestDate: '2026-09-14', status: 'Approved', rejectionReason: null, reviewedBy: 'Marcus Vance', reviewedAt: '2026-09-15 10:20', candidateName: 'Arjun Mehta', candidateEmail: 'arjun.mehta@candidate.io', candidateSkills: ['Java', 'Spring Boot', 'Kafka', 'Kubernetes'], candidateStatus: 'Interviewing' },
  { id: 302, manager: 'Sam Rivera', jobTitle: 'Cloud Infrastructure Architect', project: 'Horizon Secure Cloud', customer: 'Vertex Health', practice: 'Cloud', skills: ['AWS', 'Terraform', 'Kubernetes'], experienceYears: 6, location: 'New York · Hybrid', budgetRate: 150, reason: 'No internal architect free before the Q4 delivery start; urgent external search.', requestDate: '2026-09-16', status: 'Pending', rejectionReason: null, reviewedBy: null, reviewedAt: null, candidateName: null, candidateEmail: null, candidateSkills: [], candidateStatus: 'Sourcing' }
];

const INITIAL_ROSTER = [
  { id: 401, requestId: 301, jobTitle: 'Senior Java & Cloud Engineer', candidateName: 'Arjun Mehta', panelId: 1, panelName: 'Priya Nair', roundNumber: 1, level: 'L2', interviewType: 'Technical', scheduledAt: '2026-09-18 10:00', durationMinutes: 60, status: 'Scheduled', notes: 'Round 1 technical: core Java, Spring Boot, and Kafka design.', createdBy: 'Divya Menon' },
  { id: 402, requestId: 301, jobTitle: 'Senior Java & Cloud Engineer', candidateName: 'Arjun Mehta', panelId: 2, panelName: 'Vikram Sethi', roundNumber: 2, level: 'L3', interviewType: 'Technical', scheduledAt: '2026-09-22 11:00', durationMinutes: 45, status: 'Scheduled', notes: 'Round 2 cloud & Kubernetes hands-on.', createdBy: 'Divya Menon' }
];

const INITIAL_PEOPLE = [
  { id: 1, code: 'EMP-1042', name: 'Aarav Kumar', title: 'Senior Backend Engineer', practice: 'Digital', manager: 'Rachel Shah', location: 'Bengaluru', joinDate: '2022-03-15', type: 'FTE', costCenter: 'CC-DIG-01', dailyCost: 480, rate: 95, status: 'Bench', benchStart: '2026-08-12', days: 32, allocationPct: 0, project: '', customer: '', start: '', end: '', extensionLikelihood: 'Unknown', skills: [{ name: 'Java', level: 'Expert', years: 8, lastUsed: '2026-08' }, { name: 'Spring Boot', level: 'Expert', years: 6, lastUsed: '2026-08' }, { name: 'Kubernetes', level: 'Advanced', years: 4, lastUsed: '2026-05' }], certs: [{ name: 'CKA (Certified Kubernetes Admin)', issuer: 'CNCF', expiry: '2027-03-15', verified: true, url: 'https://cncf.io/cert/123' }, { name: 'AWS Developer Associate', issuer: 'AWS', expiry: '2026-12-10', verified: true, url: 'https://aws.cert/456' }], experience: '8 years developing high-throughput financial switching engines and cloud-native microservices.', resumeUrl: 'Kumar_Aarav_Resume_v3.pdf', preferences: { relocate: true, travel: 'Up to 25%', domains: ['BFSI', 'FinTech', 'E-Commerce'] }, notes: [{ date: '2026-09-10', author: 'Sam Staffing', text: 'Interviewed with Globex team for Project Atlas; awaiting client interview slot.' }, { date: '2026-08-20', author: 'Rachel Shah', text: 'Completed internal POC on Spring Boot 3 migration while on bench.' }] },
  { id: 2, code: 'EMP-1055', name: 'Sofia Patel', title: 'Senior Frontend Engineer', practice: 'Digital', manager: 'Rachel Shah', location: 'London', joinDate: '2023-01-10', type: 'FTE', costCenter: 'CC-DIG-02', dailyCost: 520, rate: 85, status: 'Bench', benchStart: '2026-08-25', days: 19, allocationPct: 0, project: '', customer: '', start: '', end: '', extensionLikelihood: 'Unknown', skills: [{ name: 'React', level: 'Expert', years: 6, lastUsed: '2026-08' }, { name: 'TypeScript', level: 'Expert', years: 5, lastUsed: '2026-08' }, { name: 'Figma', level: 'Advanced', years: 3, lastUsed: '2026-07' }], certs: [{ name: 'AWS Cloud Practitioner', issuer: 'AWS', expiry: '2026-11-30', verified: true }], experience: '6 years crafting responsive web apps and reusable design system component libraries.', resumeUrl: 'Sofia_Patel_CV.pdf', preferences: { relocate: false, travel: 'Up to 10%', domains: ['Retail', 'Media'] }, notes: [{ date: '2026-09-08', author: 'Rachel Shah', text: 'Exploring roll-on for Phoenix Project Phase 2 front-end revamp.' }] },
  { id: 3, code: 'EMP-0981', name: 'James Wilson', title: 'Technical Lead', practice: 'Digital', manager: 'Rachel Shah', location: 'London', joinDate: '2020-06-01', type: 'FTE', costCenter: 'CC-DIG-01', dailyCost: 750, rate: 130, status: 'Deployed', benchStart: null, days: 0, allocationPct: 100, project: 'Phoenix', customer: 'Acme Corp', start: '2026-06-01', end: '2026-09-30', extensionLikelihood: 'Unlikely', skills: [{ name: 'React', level: 'Expert', years: 8, lastUsed: '2026-09' }, { name: 'Node.js', level: 'Expert', years: 8, lastUsed: '2026-09' }, { name: 'AWS', level: 'Advanced', years: 5, lastUsed: '2026-09' }], certs: [{ name: 'AWS Solutions Architect Pro', issuer: 'AWS', expiry: '2027-06-18', verified: true }], experience: '10+ years engineering scalable multi-tenant SaaS products and modern API architectures.', resumeUrl: 'James_Wilson_2026.pdf', preferences: { relocate: false, travel: 'Up to 30%', domains: ['SaaS', 'Enterprise'] }, notes: [{ date: '2026-09-02', author: 'Rachel Shah', text: 'Client winding down Q3 scope; flagged roll-off for end of September. Reallocate ASAP.' }] },
  { id: 4, code: 'EMP-1104', name: 'Priya Rao', title: 'Backend Engineer', practice: 'Digital', manager: 'Rachel Shah', location: 'Bengaluru', joinDate: '2023-08-01', type: 'FTE', costCenter: 'CC-DIG-01', dailyCost: 450, rate: 90, status: 'Allocated', benchStart: '2026-09-06', days: 7, allocationPct: 100, project: 'Atlas', customer: 'Globex', start: '2026-10-01', end: '2027-03-31', extensionLikelihood: 'Likely', skills: [{ name: 'Java', level: 'Advanced', years: 5, lastUsed: '2026-08' }, { name: 'Spring Boot', level: 'Advanced', years: 4, lastUsed: '2026-08' }, { name: 'AWS', level: 'Intermediate', years: 3, lastUsed: '2026-07' }], certs: [{ name: 'AWS Developer Associate', issuer: 'AWS', expiry: '2027-01-20', verified: true }], experience: '5 years building microservices for core retail banking and payment workflows.', resumeUrl: 'Priya_Rao_Backend.pdf', preferences: { relocate: true, travel: 'Up to 50%', domains: ['BFSI'] }, notes: [] },
  { id: 5, code: 'EMP-1022', name: 'Mei Chen', title: 'Staff Data Engineer', practice: 'Data', manager: 'Leo Park', location: 'Singapore', joinDate: '2021-11-15', type: 'FTE', costCenter: 'CC-DAT-01', dailyCost: 620, rate: 110, status: 'Bench', benchStart: '2026-08-03', days: 41, allocationPct: 0, project: '', customer: '', start: '', end: '', extensionLikelihood: 'Unknown', skills: [{ name: 'Python', level: 'Expert', years: 7, lastUsed: '2026-08' }, { name: 'Spark', level: 'Expert', years: 6, lastUsed: '2026-07' }, { name: 'SQL', level: 'Expert', years: 8, lastUsed: '2026-08' }, { name: 'dbt', level: 'Advanced', years: 3, lastUsed: '2026-06' }], certs: [{ name: 'Databricks Data Engineer Master', issuer: 'Databricks', expiry: '2027-02-14', verified: true }], experience: '7 years architecting petabyte-scale lakehouses, real-time streaming, and ETL workflows.', resumeUrl: 'Mei_Chen_Resume.pdf', preferences: { relocate: false, travel: 'Up to 20%', domains: ['Data', 'E-Commerce', 'Logistics'] }, notes: [{ date: '2026-09-01', author: 'Leo Park', text: 'Critically over bench threshold; propose for Project Insight expansion or Nova.' }] },
  { id: 6, code: 'EMP-1077', name: 'Daniel Kim', title: 'ML Engineer', practice: 'Data', manager: 'Leo Park', location: 'Singapore', joinDate: '2022-09-01', type: 'FTE', costCenter: 'CC-DAT-01', dailyCost: 590, rate: 115, status: 'Deployed', benchStart: null, days: 0, allocationPct: 100, project: 'Insight', customer: 'Northstar', start: '2026-07-01', end: '2026-10-10', extensionLikelihood: 'Likely', skills: [{ name: 'Python', level: 'Expert', years: 6, lastUsed: '2026-09' }, { name: 'PyTorch', level: 'Advanced', years: 4, lastUsed: '2026-09' }, { name: 'SQL', level: 'Advanced', years: 5, lastUsed: '2026-09' }], certs: [{ name: 'Google Professional ML Engineer', issuer: 'Google', expiry: '2027-05-10', verified: true }], experience: '6 years building NLP classifiers, predictive maintenance, and LLM fine-tuning pipelines.', resumeUrl: 'Daniel_Kim_ML.pdf', preferences: { relocate: false, travel: 'Up to 15%', domains: ['AI', 'Healthcare'] }, notes: [] },
  { id: 7, code: 'EMP-1089', name: 'Olivia Brooks', title: 'Senior Cloud Engineer', practice: 'Cloud', manager: 'Sam Rivera', location: 'New York', joinDate: '2022-05-20', type: 'FTE', costCenter: 'CC-CLD-01', dailyCost: 650, rate: 125, status: 'Deployed', benchStart: null, days: 0, allocationPct: 100, project: 'Horizon', customer: 'Vertex', start: '2026-08-01', end: '2027-01-31', extensionLikelihood: 'Likely', skills: [{ name: 'AWS', level: 'Expert', years: 5, lastUsed: '2026-09' }, { name: 'Terraform', level: 'Expert', years: 4, lastUsed: '2026-09' }, { name: 'Kubernetes', level: 'Advanced', years: 4, lastUsed: '2026-08' }], certs: [{ name: 'AWS Solutions Architect Associate', issuer: 'AWS', expiry: '2027-04-12', verified: true }], experience: 'Multi-cloud infrastructure automation, GitOps pipelines, and SOC2 compliance automation.', resumeUrl: 'Olivia_Brooks_Cloud.pdf', preferences: { relocate: true, travel: 'Up to 25%', domains: ['FinTech', 'HealthTech'] }, notes: [] },
  { id: 8, code: 'EMP-1120', name: 'Liam Wong', title: 'Platform Engineer', practice: 'Cloud', manager: 'Sam Rivera', location: 'Singapore', joinDate: '2023-03-10', type: 'FTE', costCenter: 'CC-CLD-01', dailyCost: 510, rate: 95, status: 'On Leave', benchStart: null, days: 0, allocationPct: 0, project: '', customer: '', start: '', end: '', extensionLikelihood: 'Unknown', skills: [{ name: 'Go', level: 'Advanced', years: 5, lastUsed: '2026-07' }, { name: 'Docker', level: 'Expert', years: 5, lastUsed: '2026-07' }, { name: 'Kubernetes', level: 'Advanced', years: 4, lastUsed: '2026-07' }], certs: [{ name: 'CKA', issuer: 'CNCF', expiry: '2027-08-20', verified: true }], experience: 'Platform reliability engineering, observability stack with Prometheus/Grafana, and service meshes.', resumeUrl: 'Liam_Wong_DevOps.pdf', preferences: { relocate: false, travel: '0%', domains: ['Cloud Infra'] }, notes: [{ date: '2026-08-10', author: 'Sam Rivera', text: 'On approved paternity leave until Oct 15, 2026. Bench clock paused.' }] },
  { id: 9, code: 'EMP-1064', name: 'Emma Garcia', title: 'Product Engineer', practice: 'Digital', manager: 'Rachel Shah', location: 'London', joinDate: '2022-10-01', type: 'FTE', costCenter: 'CC-DIG-02', dailyCost: 490, rate: 90, status: 'Deployed', benchStart: null, days: 0, allocationPct: 100, project: 'Phoenix', customer: 'Acme Corp', start: '2026-06-01', end: '2026-09-30', extensionLikelihood: 'Unknown', skills: [{ name: 'React', level: 'Advanced', years: 4, lastUsed: '2026-09' }, { name: 'TypeScript', level: 'Advanced', years: 4, lastUsed: '2026-09' }, { name: 'Node.js', level: 'Intermediate', years: 3, lastUsed: '2026-08' }], certs: [], experience: 'Customer-facing web applications, performant frontend architecture, and accessibility.', resumeUrl: 'Emma_Garcia_Frontend.pdf', preferences: { relocate: false, travel: 'Up to 10%', domains: ['E-Commerce'] }, notes: [] },
  { id: 10, code: 'EMP-1145', name: 'Noah Singh', title: 'Analytics Engineer', practice: 'Data', manager: 'Leo Park', location: 'Bengaluru', joinDate: '2024-02-15', type: 'FTE', costCenter: 'CC-DAT-02', dailyCost: 380, rate: 70, status: 'Bench', benchStart: '2026-09-09', days: 4, allocationPct: 0, project: '', customer: '', start: '', end: '', extensionLikelihood: 'Unknown', skills: [{ name: 'SQL', level: 'Expert', years: 4, lastUsed: '2026-09' }, { name: 'Python', level: 'Intermediate', years: 3, lastUsed: '2026-08' }, { name: 'dbt', level: 'Advanced', years: 2, lastUsed: '2026-09' }], certs: [{ name: 'dbt Analytics Engineering', issuer: 'dbt Labs', expiry: '2027-11-10', verified: true }], experience: 'Building semantic data models, metrics layer pipelines, and BI executive dashboards.', resumeUrl: 'Noah_Singh_CV.pdf', preferences: { relocate: true, travel: 'Up to 25%', domains: ['Analytics', 'Marketing'] }, notes: [] },
  { id: 11, code: 'EMP-1011', name: 'Kavita Iyer', title: 'Lead Cloud Architect', practice: 'Cloud', manager: 'Sam Rivera', location: 'Bengaluru', joinDate: '2021-04-10', type: 'FTE', costCenter: 'CC-CLD-01', dailyCost: 720, rate: 135, status: 'Deployed', benchStart: null, days: 0, allocationPct: 100, project: 'Apex', customer: 'Initech Systems', start: '2026-05-01', end: '2026-11-30', extensionLikelihood: 'Likely', skills: [{ name: 'AWS', level: 'Expert', years: 9, lastUsed: '2026-09' }, { name: 'Terraform', level: 'Expert', years: 6, lastUsed: '2026-09' }, { name: 'Kubernetes', level: 'Expert', years: 5, lastUsed: '2026-08' }], certs: [{ name: 'AWS Solutions Architect Professional', issuer: 'AWS', expiry: '2026-10-15', verified: true, url: 'https://aws.cert/kavita' }], experience: 'Enterprise cloud landing zones, zero-trust security postures, and cost optimization architectures.', resumeUrl: 'Kavita_Iyer_Architect.pdf', preferences: { relocate: false, travel: 'Up to 30%', domains: ['Enterprise Cloud'] }, notes: [] },
  { id: 12, code: 'EMP-1033', name: 'Carlos Mendez', title: 'Principal SAP Consultant', practice: 'Enterprise / SAP', manager: 'Hans Richter', location: 'New York', joinDate: '2021-08-01', type: 'Contractor', costCenter: 'CC-ERP-01', dailyCost: 850, rate: 160, status: 'Bench', benchStart: '2026-08-20', days: 24, allocationPct: 0, project: '', customer: '', start: '', end: '', extensionLikelihood: 'Unknown', skills: [{ name: 'SAP S/4HANA', level: 'Expert', years: 11, lastUsed: '2026-08' }, { name: 'SQL', level: 'Advanced', years: 8, lastUsed: '2026-07' }], certs: [{ name: 'SAP Certified Application Associate', issuer: 'SAP', expiry: '2027-09-01', verified: true }], experience: '11 years implementing SAP S/4HANA migration programs for Fortune 500 manufacturers.', resumeUrl: 'Carlos_Mendez_SAP.pdf', preferences: { relocate: true, travel: 'Up to 75%', domains: ['Manufacturing', 'Supply Chain'] }, notes: [{ date: '2026-09-05', author: 'Hans Richter', text: 'Contractor on bench — review contract extension if unallocated within 7 days.' }] },
  { id: 13, code: 'EMP-1160', name: 'Aisha Al-Mansoor', title: 'Backend Engineer (50% Shared)', practice: 'Digital', manager: 'Rachel Shah', location: 'London', joinDate: '2023-11-01', type: 'FTE', costCenter: 'CC-DIG-01', dailyCost: 460, rate: 85, status: 'Deployed', benchStart: null, days: 0, allocationPct: 50, project: 'Phoenix', customer: 'Acme Corp', start: '2026-07-01', end: '2026-12-15', extensionLikelihood: 'Likely', skills: [{ name: 'Node.js', level: 'Advanced', years: 5, lastUsed: '2026-09' }, { name: 'TypeScript', level: 'Advanced', years: 4, lastUsed: '2026-09' }, { name: 'GraphQL', level: 'Intermediate', years: 3, lastUsed: '2026-09' }], certs: [{ name: 'Node.js Services Developer', issuer: 'OpenJS', expiry: '2027-04-10', verified: true }], experience: 'High performance microservices, federated GraphQL gateways, and serverless compute.', resumeUrl: 'Aisha_Backend.pdf', preferences: { relocate: false, travel: 'Up to 20%', domains: ['FinTech'] }, notes: [{ date: '2026-09-01', author: 'Rachel Shah', text: 'Currently 50% on Phoenix. 50% available capacity for part-time project or shadowing.' }] }
];

const INITIAL_JOBS = [
  { id: 1, title: 'Senior Java & Cloud Engineer', project: 'Atlas', customer: 'Globex', practice: 'Digital', mustHave: ['Java', 'Spring Boot', 'Kubernetes'], niceToHave: ['Kafka', 'AWS'], minExp: 5, location: 'Bengaluru · Hybrid', start: '2026-10-01', end: '2027-03-31', durationMonths: 6, positions: 2, status: 'Open', postedBy: 'Rachel Shah', description: 'Scale high-volume core transaction processing systems with modern microservices architecture and zero-downtime deployment strategies.' },
  { id: 2, title: 'Lead Frontend React Engineer', project: 'Phoenix Modernization', customer: 'Acme Corp', practice: 'Digital', mustHave: ['React', 'TypeScript'], niceToHave: ['Node.js', 'Figma'], minExp: 4, location: 'London · Hybrid', start: '2026-09-21', end: '2027-02-28', durationMonths: 5, positions: 1, status: 'Open', postedBy: 'Rachel Shah', description: 'Lead user interface revamps for customer-facing portals with a new atomic design system and high Web Vitals performance benchmarks.' },
  { id: 3, title: 'Data Platform & Streaming Engineer', project: 'Insight Lakehouse', customer: 'Northstar', practice: 'Data', mustHave: ['Python', 'Spark', 'SQL'], niceToHave: ['dbt', 'Kubernetes'], minExp: 4, location: 'Singapore · Remote', start: '2026-09-28', end: '2027-04-30', durationMonths: 7, positions: 2, status: 'Open', postedBy: 'Leo Park', description: 'Design streaming ingestion pipelines handling over 40M daily events with Apache Spark on Kubernetes and Databricks.' },
  { id: 4, title: 'Cloud Infrastructure Architect', project: 'Horizon Secure Cloud', customer: 'Vertex Health', practice: 'Cloud', mustHave: ['AWS', 'Terraform', 'Kubernetes'], niceToHave: ['Go', 'Docker'], minExp: 6, location: 'New York · Hybrid', start: '2026-10-15', end: '2027-06-30', durationMonths: 8, positions: 1, status: 'Open', postedBy: 'Sam Rivera', description: 'Lead HIPAA-compliant cloud automation with multi-region failover and Terraform Enterprise IaC frameworks.' },
  { id: 5, title: 'SAP S/4HANA Migration Consultant', project: 'Global ERP Modernization', customer: 'Apex Industrial', practice: 'Enterprise / SAP', mustHave: ['SAP S/4HANA', 'SQL'], niceToHave: ['Python'], minExp: 7, location: 'New York · Travel 50%', start: '2026-10-01', end: '2027-09-30', durationMonths: 12, positions: 1, status: 'Open', postedBy: 'Hans Richter', description: 'Lead supply chain module migration to S/4HANA cloud edition for manufacturing enterprise.' }
];

const INITIAL_APPLICATIONS = [
  { id: 101, jobId: 1, personId: 1, status: 'Applied', date: '2026-09-10', notes: 'Self-applied from internal portal' },
  { id: 102, jobId: 2, personId: 2, status: 'Shortlisted', date: '2026-09-05', notes: 'Ops suggested candidate; interview pending client schedule' }
];

const INITIAL_REQUESTS = [
  { id: 201, manager: 'Rachel Shah', personId: 1, personName: 'Aarav Kumar', jobId: 1, project: 'Atlas', customer: 'Globex', action: 'Deploy', start: '2026-10-01', end: '2027-03-31', pct: 100, rate: 95, status: 'Pending Ops Review', requestDate: '2026-09-12', reason: 'Matches Atlas microservices requirements 100%; candidate already met with Globex PM.' }
];

const INITIAL_SETTINGS = {
  global: { amber: 10, red: 15, critical: 30 },
  overrides: [
    { id: 'ovr-sap', scope: 'Practice', scopeName: 'Enterprise / SAP', amber: 20, red: 30, critical: 45 },
    { id: 'ovr-mf', scope: 'Skill', scopeName: 'Mainframe/COBOL', amber: 20, red: 30, critical: 60 }
  ],
  notifications: { emailManager: true, emailOps: true, slackStaffing: true, teamsStaffing: false }
};

const INITIAL_AUDIT = [
  { actor: 'Rachel Admin', action: 'Policy Updated', entity: 'Bench Threshold', detail: 'Global red flag changed from 20d to 15d', time: '2026-09-03 14:22' },
  { actor: 'Sam Staffing', action: 'Allocation Created', entity: 'Olivia Brooks', detail: 'Assigned to Horizon (Vertex) until 2027-01-31', time: '2026-08-01 10:15' },
  { actor: 'Rachel Admin', action: 'Override Added', entity: 'SAP Practice', detail: 'Set amber=20, red=30, critical=45', time: '2026-07-28 09:30' }
];

let _db = null;

const REFERENCE_DATE = '2026-09-13';

function shiftDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(String(value))) return value;
  const [datePart, ...timeParts] = String(value).split(' ');
  const source = new Date(`${datePart}T00:00:00Z`);
  const reference = new Date(`${REFERENCE_DATE}T00:00:00Z`);
  if (Number.isNaN(source.getTime())) return value;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const offset = Math.round((source.getTime() - reference.getTime()) / 86400000);
  const shifted = new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  return timeParts.length ? `${shifted} ${timeParts.join(' ')}` : shifted;
}

function shiftMonth(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(String(value))) return value;
  const source = new Date(`${value}-01T00:00:00Z`);
  const reference = new Date(`${REFERENCE_DATE.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(source.getTime())) return value;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const months = (source.getUTCFullYear() - reference.getUTCFullYear()) * 12 + (source.getUTCMonth() - reference.getUTCMonth());
  const shifted = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + months, 1));
  return shifted.toISOString().slice(0, 7);
}

function shiftSkills(skills) {
  return (skills || []).map((skill) => ({ ...skill, lastUsed: shiftMonth(skill.lastUsed) }));
}

function shiftCerts(certs) {
  return (certs || []).map((cert) => ({ ...cert, expiry: shiftDate(cert.expiry) }));
}

function shiftNotes(notes) {
  return (notes || []).map((note) => ({ ...note, date: shiftDate(note.date) }));
}

// Shift a demo date/time, then roll it forward to the next weekday if it lands
// on a Saturday or Sunday, so demo interview schedules stay Mon–Fri.
function shiftDateToWeekday(value) {
  const shifted = shiftDate(value);
  const [datePart, ...timeParts] = String(shifted).split(' ');
  const date = new Date(`${datePart}T00:00:00`);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  const shiftedDate = toLocalDate(date);
  return timeParts.length ? `${shiftedDate} ${timeParts.join(' ')}` : shiftedDate;
}

function toLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Demo availability: one-hour slots (08:00–18:00 start times) on working days
// (Monday–Friday) across the next two weeks. Slots are start times only
// ({ date, time }) and always land in the current or next calendar week so they
// follow the panel-slot policy.
function generatePanelSlots() {
  const slots = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const times = ['08:00', '10:00', '13:00', '15:00', '17:00'];
  for (let offset = 1; offset <= 14; offset += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const time of times) {
      slots.push({ date: toLocalDate(day), time });
    }
  }
  return slots;
}

function tableColumns(db, table) {
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (result.length === 0) return [];
  return result[0].values.map((row) => row[1]);
}

function ensureColumn(db, table, column, definition) {
  if (!tableColumns(db, table).includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// SQLite cannot ALTER a CHECK constraint, so the users table is rebuilt once
// when new roles are introduced. New tables that reference users are empty at
// this point, so dropping and renaming is safe.
function migrateUsersRoles(db) {
  const result = db.exec("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
  const currentSql = result[0]?.values[0]?.[0] || '';
  if (currentSql.includes("'Panel'") && currentSql.includes("'TA'")) return;

  db.run(`
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Admin','Operations','Manager','Resource','Sales','Panel','TA')),
      role_title TEXT,
      department TEXT,
      avatar TEXT,
      badge_color TEXT,
      description TEXT,
      default_page TEXT DEFAULT 'Dashboard',
      person_id INTEGER,
      must_change_password INTEGER DEFAULT 0,
      failed_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      token_version INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    INSERT INTO users_new (id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, person_id, must_change_password, failed_attempts, locked_until, token_version, active, last_login_at, created_at, updated_at)
    SELECT id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, person_id, must_change_password, failed_attempts, locked_until, token_version, active, last_login_at, created_at, updated_at FROM users
  `);
  db.run('DROP TABLE users');
  db.run('ALTER TABLE users_new RENAME TO users');
}

function migrate(db) {
  ensureColumn(db, 'users', 'must_change_password', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'users', 'failed_attempts', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'users', 'locked_until', 'TEXT');
  ensureColumn(db, 'users', 'token_version', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'users', 'active', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'users', 'last_login_at', 'TEXT');
  ensureColumn(db, 'users', 'updated_at', 'TEXT');

  ensureColumn(db, 'people', 'email', 'TEXT');
  ensureColumn(db, 'people', 'resume_file', 'TEXT');
  ensureColumn(db, 'people', 'created_at', 'TEXT');
  ensureColumn(db, 'people', 'updated_at', 'TEXT');

  ensureColumn(db, 'jobs', 'created_at', 'TEXT');
  ensureColumn(db, 'jobs', 'updated_at', 'TEXT');

  ensureColumn(db, 'applications', 'created_at', 'TEXT');
  ensureColumn(db, 'applications', 'updated_at', 'TEXT');

  ensureColumn(db, 'staffing_requests', 'rejection_reason', 'TEXT');
  ensureColumn(db, 'staffing_requests', 'reviewed_by', 'TEXT');
  ensureColumn(db, 'staffing_requests', 'reviewed_at', 'TEXT');
  ensureColumn(db, 'staffing_requests', 'created_at', 'TEXT');
  ensureColumn(db, 'staffing_requests', 'updated_at', 'TEXT');

  ensureColumn(db, 'settings', 'updated_at', 'TEXT');
  ensureColumn(db, 'panels', 'domains', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'panels', 'recurring_slots', "TEXT DEFAULT '[]'");

  ensureColumn(db, 'audit_log', 'before', 'TEXT');
  ensureColumn(db, 'audit_log', 'after', 'TEXT');
  ensureColumn(db, 'audit_log', 'ip', 'TEXT');
  ensureColumn(db, 'audit_log', 'user_agent', 'TEXT');

  migrateUsersRoles(db);

  db.run('CREATE INDEX IF NOT EXISTS idx_people_manager ON people(manager)');
  db.run('CREATE INDEX IF NOT EXISTS idx_people_status ON people(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_people_active ON people(active)');
  db.run('CREATE INDEX IF NOT EXISTS idx_applications_person ON applications(person_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_requests_manager ON staffing_requests(manager)');
  db.run('CREATE INDEX IF NOT EXISTS idx_requests_status ON staffing_requests(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(time)');
  db.run('CREATE INDEX IF NOT EXISTS idx_panels_active ON panels(active)');
  db.run('CREATE INDEX IF NOT EXISTS idx_roster_panel ON interview_roster(panel_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_roster_status ON interview_roster(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_extreq_manager ON external_requests(manager)');
  db.run('CREATE INDEX IF NOT EXISTS idx_extreq_status ON external_requests(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(recipient_role, read)');
  db.run("INSERT OR IGNORE INTO schema_migrations (id) VALUES ('2026-10-31-enterprise-baseline')");
  db.run("INSERT OR IGNORE INTO schema_migrations (id) VALUES ('2026-11-03-hiring-panels')");
  db.run("INSERT OR IGNORE INTO schema_migrations (id) VALUES ('2026-11-03-panel-slots-notifications')");
}

function seedHiringDemo(db) {
  const applied = one(db, "SELECT id FROM schema_migrations WHERE id = '2026-11-03-hiring-panels-seed'");
  if (applied) return;

  const hashedPassword = bcrypt.hashSync('caliberate123', config.bcryptRounds);

  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, person_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  );
  for (const u of DEMO_USERS.slice(-2)) {
    insertUser.run([u.id, u.name, u.email, hashedPassword, u.role, u.roleTitle, u.department, u.avatar, u.badgeColor, u.description, u.defaultPage, u.personId]);
  }
  insertUser.free();

  const insertPanel = db.prepare(
    `INSERT OR IGNORE INTO panels (id, user_id, name, email, role_title, practice, skills, domains, time_slots, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  );
  for (const p of INITIAL_PANELS) {
    insertPanel.run([p.id, p.userId, p.name, p.email, p.roleTitle, p.practice, JSON.stringify(p.skills), JSON.stringify(p.domains || []), JSON.stringify(generatePanelSlots())]);
  }
  insertPanel.free();

  const insertExternal = db.prepare(
    `INSERT OR IGNORE INTO external_requests (id, manager, job_title, project, customer, practice, skills, experience_years, location, budget_rate, reason, request_date, status, rejection_reason, reviewed_by, reviewed_at, candidate_name, candidate_email, candidate_skills, candidate_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const e of INITIAL_EXTERNAL_REQUESTS) {
    insertExternal.run([e.id, e.manager, e.jobTitle, e.project, e.customer, e.practice, JSON.stringify(e.skills), e.experienceYears, e.location, e.budgetRate, e.reason, shiftDate(e.requestDate), e.status, e.rejectionReason, e.reviewedBy, e.reviewedAt, e.candidateName, e.candidateEmail, JSON.stringify(e.candidateSkills), e.candidateStatus]);
  }
  insertExternal.free();

  const insertRoster = db.prepare(
    `INSERT OR IGNORE INTO interview_roster (id, request_id, job_title, candidate_name, panel_id, panel_name, round_number, level, interview_type, scheduled_at, duration_minutes, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of INITIAL_ROSTER) {
    insertRoster.run([r.id, r.requestId, r.jobTitle, r.candidateName, r.panelId, r.panelName, r.roundNumber, r.level, r.interviewType, shiftDateToWeekday(r.scheduledAt), r.durationMinutes, r.status, r.notes, r.createdBy]);
  }
  insertRoster.free();

  db.run("INSERT OR IGNORE INTO schema_migrations (id) VALUES ('2026-11-03-hiring-panels-seed')");
  saveDb();
}

export async function getDb() {
  if (_db) return _db;

  const SQL = await initSqlJs();

  let dbData = null;
  if (fs.existsSync(DB_PATH)) {
    dbData = fs.readFileSync(DB_PATH);
  }

  _db = dbData ? new SQL.Database(dbData) : new SQL.Database();

  // Sanitize undefined params for sql.js compatibility across all queries
  const originalRun = _db.run.bind(_db);
  _db.run = (sql, params) => {
    if (Array.isArray(params)) {
      params = params.map(v => (v === undefined ? null : v));
    }
    return originalRun(sql, params);
  };

  const originalExec = _db.exec.bind(_db);
  _db.exec = (sql, params) => {
    if (Array.isArray(params)) {
      params = params.map(v => (v === undefined ? null : v));
    }
    return originalExec(sql, params);
  };

  const originalPrepare = _db.prepare.bind(_db);
  _db.prepare = (sql, params) => {
    const stmt = originalPrepare(sql, params);
    const origStmtRun = stmt.run.bind(stmt);
    stmt.run = (p) => {
      if (Array.isArray(p)) {
        p = p.map(v => (v === undefined ? null : v));
      }
      return origStmtRun(p);
    };
    return stmt;
  };

  _db.run('PRAGMA foreign_keys = ON');
  _db.run(SCHEMA);
  migrate(_db);

  // Check if already seeded. Fresh databases get the full seed (which includes
  // hiring demo data); existing demo databases get the hiring dataset backfilled.
  const userCount = _db.exec("SELECT COUNT(*) FROM users");
  if (userCount[0].values[0][0] === 0) {
    await seedDatabase(_db);
  } else {
    if (config.seedDemoData) {
      // An existing database (e.g. one first created with only the bootstrap admin)
      // may be missing the demo accounts/dataset. Backfill them once; every insert
      // is INSERT OR IGNORE so existing records are never overwritten.
      const demoUser = _db.exec("SELECT COUNT(*) FROM users WHERE id = 'usr-ops'");
      const peopleCount = _db.exec('SELECT COUNT(*) FROM people');
      if (demoUser[0].values[0][0] === 0 || peopleCount[0].values[0][0] === 0) {
        await seedDatabase(_db);
      }
      seedHiringDemo(_db);
    }
    saveDb();
  }

  return _db;
}

export function saveDb() {
  if (!_db) return;
  const directory = path.dirname(DB_PATH);
  fs.mkdirSync(directory, { recursive: true });
  const data = Buffer.from(_db.export());
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, data);
  try {
    fs.renameSync(tempPath, DB_PATH);
  } catch {
    fs.copyFileSync(tempPath, DB_PATH);
    fs.unlinkSync(tempPath);
  }
}

export function closeDb() {
  if (!_db) return;
  saveDb();
  _db.close();
  _db = null;
}

export function all(db, sql, params = []) {
  const result = db.exec(sql, params);
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

export function one(db, sql, params = []) {
  return all(db, sql, params)[0] || null;
}

export function transaction(db, fn) {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    return result;
  } catch (error) {
    try { db.run('ROLLBACK'); } catch { /* ignore rollback failure */ }
    throw error;
  }
}

// Wipes all business data and re-inserts the demo dataset (users are preserved)
export async function reseedDatabase() {
  const db = await getDb();
  for (const table of ['people', 'jobs', 'applications', 'staffing_requests', 'interview_roster', 'external_requests', 'panels', 'notifications', 'audit_log', 'settings']) {
    db.run(`DELETE FROM ${table}`);
  }
  await seedDatabase(db);
}

async function seedDatabase(db) {
  const hashedPassword = bcrypt.hashSync('caliberate123', config.bcryptRounds);

  if (config.seedDemoData) {
    const insertUser = db.prepare(
      `INSERT OR IGNORE INTO users (id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, person_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    for (const u of DEMO_USERS) {
      insertUser.run([u.id, u.name, u.email, hashedPassword, u.role, u.roleTitle, u.department, u.avatar, u.badgeColor, u.description, u.defaultPage, u.personId]);
    }
    insertUser.free();
  } else {
    if (!config.bootstrapAdmin.email || !config.bootstrapAdmin.password) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to create the first administrator account.');
    }
    const email = config.bootstrapAdmin.email.toLowerCase().trim();
    const name = config.bootstrapAdmin.name;
    const avatar = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    db.run(
      `INSERT OR IGNORE INTO users (id, name, email, password, role, role_title, department, avatar, badge_color, description, default_page, person_id, active, must_change_password) VALUES (?, ?, ?, ?, 'Admin', 'Platform Administrator', 'IT Governance', ?, 'bg-rose-100 text-rose-800 border-rose-200', 'Bootstrapped administrator account.', 'Dashboard', NULL, 1, 0)`,
      [`usr-${Date.now()}`, name, email, bcrypt.hashSync(config.bootstrapAdmin.password, config.bcryptRounds), avatar]
    );
  }

  if (config.seedDemoData) {
    // Seed people
    const insertPerson = db.prepare(
      `INSERT OR IGNORE INTO people (id, code, name, email, title, practice, manager, location, join_date, type, cost_center, daily_cost, rate, status, bench_start, days, allocation_pct, project, customer, start_date, end_date, extension_likelihood, skills, certs, experience, resume_url, preferences, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    for (const p of INITIAL_PEOPLE) {
      insertPerson.run([
        p.id, p.code, p.name, p.email || `${p.code.toLowerCase()}@caliberate.io`, p.title, p.practice, p.manager,
        p.location, shiftDate(p.joinDate), p.type, p.costCenter, p.dailyCost, p.rate, p.status,
        shiftDate(p.benchStart), p.days, p.allocationPct, p.project, p.customer,
        shiftDate(p.start), shiftDate(p.end), p.extensionLikelihood,
        JSON.stringify(shiftSkills(p.skills)), JSON.stringify(shiftCerts(p.certs)), p.experience,
        p.resumeUrl, JSON.stringify(p.preferences), JSON.stringify(shiftNotes(p.notes))
      ]);
    }
    insertPerson.free();

    // Seed jobs
    const insertJob = db.prepare(
      `INSERT OR IGNORE INTO jobs (id, title, project, customer, practice, must_have, nice_to_have, min_exp, location, start_date, end_date, duration_months, positions, status, posted_by, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const j of INITIAL_JOBS) {
      insertJob.run([j.id, j.title, j.project, j.customer, j.practice, JSON.stringify(j.mustHave), JSON.stringify(j.niceToHave), j.minExp, j.location, shiftDate(j.start), shiftDate(j.end), j.durationMonths, j.positions, j.status, j.postedBy, j.description]);
    }
    insertJob.free();

    // Seed applications
    const insertApp = db.prepare(
      `INSERT OR IGNORE INTO applications (id, job_id, person_id, status, date, notes) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const a of INITIAL_APPLICATIONS) {
      insertApp.run([a.id, a.jobId, a.personId, a.status, shiftDate(a.date), a.notes]);
    }
    insertApp.free();

    // Seed staffing requests
    const insertReq = db.prepare(
      `INSERT OR IGNORE INTO staffing_requests (id, manager, person_id, person_name, job_id, project, customer, action, start_date, end_date, pct, rate, status, request_date, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of INITIAL_REQUESTS) {
      insertReq.run([r.id, r.manager, r.personId, r.personName, r.jobId, r.project, r.customer, r.action, shiftDate(r.start), shiftDate(r.end), r.pct, r.rate, r.status, shiftDate(r.requestDate), r.reason]);
    }
    insertReq.free();

    // Seed external hire requests
    const insertExternal = db.prepare(
      `INSERT OR IGNORE INTO external_requests (id, manager, job_title, project, customer, practice, skills, experience_years, location, budget_rate, reason, request_date, status, rejection_reason, reviewed_by, reviewed_at, candidate_name, candidate_email, candidate_skills, candidate_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const e of INITIAL_EXTERNAL_REQUESTS) {
      insertExternal.run([e.id, e.manager, e.jobTitle, e.project, e.customer, e.practice, JSON.stringify(e.skills), e.experienceYears, e.location, e.budgetRate, e.reason, shiftDate(e.requestDate), e.status, e.rejectionReason, e.reviewedBy, e.reviewedAt, e.candidateName, e.candidateEmail, JSON.stringify(e.candidateSkills), e.candidateStatus]);
    }
    insertExternal.free();

    // Seed interview panels
    const insertPanel = db.prepare(
      `INSERT OR IGNORE INTO panels (id, user_id, name, email, role_title, practice, skills, domains, time_slots, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    for (const p of INITIAL_PANELS) {
      insertPanel.run([p.id, p.userId, p.name, p.email, p.roleTitle, p.practice, JSON.stringify(p.skills), JSON.stringify(p.domains || []), JSON.stringify(generatePanelSlots())]);
    }
    insertPanel.free();

    // Seed interview roster
    const insertRoster = db.prepare(
      `INSERT OR IGNORE INTO interview_roster (id, request_id, job_title, candidate_name, panel_id, panel_name, round_number, level, interview_type, scheduled_at, duration_minutes, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of INITIAL_ROSTER) {
      insertRoster.run([r.id, r.requestId, r.jobTitle, r.candidateName, r.panelId, r.panelName, r.roundNumber, r.level, r.interviewType, shiftDateToWeekday(r.scheduledAt), r.durationMinutes, r.status, r.notes, r.createdBy]);
    }
    insertRoster.free();

    // Seed settings
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('thresholds', ?)`, [JSON.stringify(INITIAL_SETTINGS)]);

    // Seed audit log
    const insertAudit = db.prepare(
      `INSERT INTO audit_log (actor, action, entity, detail, time) VALUES (?, ?, ?, ?, ?)`
    );
    for (const a of INITIAL_AUDIT) {
      insertAudit.run([a.actor, a.action, a.entity, a.detail, shiftDate(a.time)]);
    }
    insertAudit.free();
  } else {
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('thresholds', ?)`, [JSON.stringify(INITIAL_SETTINGS)]);
  }

  saveDb();
  console.log(config.seedDemoData ? '✅ Database seeded with demo data.' : '✅ Database initialized with bootstrap administrator.');
}

// Allow running standalone: node db/init.js --force
if (process.argv[1] && process.argv[1].endsWith('init.js')) {
  const force = process.argv.includes('--force');
  if (force && fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('🗑️  Deleted existing database.');
  }
  getDb().then(() => {
    console.log('✅ Database initialized.');
    process.exit(0);
  });
}
