import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format.');
const optionalDate = z.union([dateString, z.literal(''), z.null()]).optional();
const shortText = z.string().trim().max(160);
const longText = z.string().trim().max(5000);
const email = z.string().trim().email().max(254);

const skillSchema = z.object({
  name: z.string().trim().min(1).max(80),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
  years: z.coerce.number().min(0).max(60),
  lastUsed: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

const certSchema = z.object({
  name: z.string().trim().min(1).max(160),
  issuer: z.string().trim().min(1).max(120),
  expiry: dateString,
  verified: z.boolean().optional(),
  url: z.string().trim().max(500).optional()
});

const noteSchema = z.object({
  date: dateString.optional(),
  author: z.string().trim().max(120).optional(),
  text: z.string().trim().min(1).max(2000)
});

const preferencesSchema = z.record(z.string(), z.any()).optional();

const personFields = {
  code: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(120),
  email: email.optional().nullable().or(z.literal('')),
  title: z.string().trim().min(2).max(120),
  practice: z.string().trim().min(1).max(120),
  manager: z.string().trim().min(2).max(120),
  location: z.string().trim().min(1).max(120),
  joinDate: dateString,
  type: z.enum(['FTE', 'Contractor']).optional(),
  costCenter: z.string().trim().max(60).optional(),
  dailyCost: z.coerce.number().min(0).max(1000000).optional(),
  rate: z.coerce.number().min(0).max(100000).optional(),
  status: z.enum(['Deployed', 'Allocated', 'Bench', 'On Leave']).optional(),
  benchStart: optionalDate,
  days: z.coerce.number().int().min(0).max(10000).optional(),
  allocationPct: z.coerce.number().int().min(0).max(100).optional(),
  project: z.string().trim().max(160).optional(),
  customer: z.string().trim().max(160).optional(),
  start: optionalDate,
  end: optionalDate,
  extensionLikelihood: z.enum(['Likely', 'Unlikely', 'Unknown']).optional(),
  skills: z.array(skillSchema).max(100).optional(),
  certs: z.array(certSchema).max(100).optional(),
  experience: z.string().trim().max(10000).optional(),
  resumeUrl: z.string().trim().max(255).optional(),
  preferences: preferencesSchema,
  notes: z.array(noteSchema).max(500).optional()
};

export const loginSchema = z.object({
  email: email,
  password: z.string().min(1).max(128)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12, 'Password must be at least 12 characters.').max(128)
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: email,
  password: z.string().min(12, 'Password must be at least 12 characters.').max(128),
  role: z.enum(['Admin', 'Operations', 'Manager', 'Resource', 'Sales']),
  roleTitle: z.string().trim().max(160).optional(),
  department: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  defaultPage: z.string().trim().max(80).optional(),
  personId: z.coerce.number().int().positive().optional().nullable(),
  mustChangePassword: z.boolean().optional(),
  active: z.boolean().optional()
});

export const userUpdateSchema = userCreateSchema.partial().omit({ password: true }).extend({
  password: z.string().min(12).max(128).optional()
});

export const personCreateSchema = z.object(personFields);
export const personUpdateSchema = z.object(personFields).partial();

export const jobCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  project: z.string().trim().min(1).max(160),
  customer: z.string().trim().min(1).max(160),
  practice: z.string().trim().min(1).max(120),
  mustHave: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  niceToHave: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  minExp: z.coerce.number().int().min(0).max(60).optional(),
  location: z.string().trim().max(160).optional(),
  start: optionalDate,
  end: optionalDate,
  durationMonths: z.coerce.number().int().min(0).max(120).optional(),
  positions: z.coerce.number().int().min(1).max(1000).optional(),
  status: z.enum(['Open', 'Closed', 'On Hold']).optional(),
  description: longText.optional()
});
export const jobUpdateSchema = jobCreateSchema.partial();

export const applicationCreateSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  personId: z.coerce.number().int().positive().optional(),
  status: z.enum(['Applied', 'Shortlisted', 'Rejected', 'Offered', 'Selected', 'Withdrawn']).optional(),
  date: optionalDate,
  notes: z.string().trim().max(2000).optional()
});

export const applicationUpdateSchema = z.object({
  status: z.enum(['Applied', 'Shortlisted', 'Rejected', 'Offered', 'Selected', 'Withdrawn']),
  notes: z.string().trim().max(2000).optional()
});

export const requestCreateSchema = z.object({
  manager: z.string().trim().max(120).optional(),
  personId: z.coerce.number().int().positive(),
  personName: z.string().trim().max(120).optional(),
  jobId: z.coerce.number().int().positive().optional().nullable(),
  project: z.string().trim().max(160).optional(),
  customer: z.string().trim().max(160).optional(),
  action: z.enum(['Deploy', 'Release']).optional(),
  start: optionalDate,
  end: optionalDate,
  pct: z.coerce.number().int().min(1).max(100).optional(),
  rate: z.coerce.number().min(0).max(100000).optional(),
  reason: z.string().trim().min(5, 'A justification is required.').max(2000)
});

export const requestUpdateSchema = z.object({
  status: z.enum(['Approved', 'Rejected', 'Pending Ops Review']),
  rejectionReason: z.string().trim().max(1000).optional()
});

export const settingsUpdateSchema = z.object({
  global: z.object({
    amber: z.coerce.number().int().min(1).max(365),
    red: z.coerce.number().int().min(2).max(365),
    critical: z.coerce.number().int().min(3).max(730)
  }).refine((value) => value.amber < value.red && value.red < value.critical, {
    message: 'Thresholds must satisfy amber < red < critical.'
  }),
  overrides: z.array(z.object({
    id: z.string().trim().max(80),
    scope: z.enum(['Practice', 'Skill']),
    scopeName: z.string().trim().min(1).max(120),
    amber: z.coerce.number().int().min(1).max(365),
    red: z.coerce.number().int().min(2).max(365),
    critical: z.coerce.number().int().min(3).max(730)
  }).refine((value) => value.amber < value.red && value.red < value.critical, {
    message: 'Override thresholds must satisfy amber < red < critical.'
  })).max(100).optional(),
  notifications: z.record(z.string(), z.any()).optional()
});

export const auditCreateSchema = z.object({
  action: z.string().trim().min(1).max(120),
  entity: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(2000).optional().default('')
});

export const exportAuditSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  count: z.coerce.number().int().min(0).max(1000000)
});

export const importSchema = z.object({
  csv: z.string().min(1).max(2 * 1024 * 1024)
});

export const passwordPolicy = (password) => {
  const checks = [
    password.length >= 12,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  return checks.every(Boolean);
};
