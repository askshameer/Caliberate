import { TODAY } from './constants';

// Calculate days between two date strings
export function dateDiff(dateStr, baseStr = TODAY) {
  if (!dateStr) return 0;
  const d1 = new Date(dateStr + 'T00:00:00Z');
  const d2 = new Date(baseStr + 'T00:00:00Z');
  return Math.round((d1 - d2) / 86400000);
}

// Compute bench flag status based on settings thresholds
export function getBenchFlagStatus(person, settings) {
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

// Calculate match score between a person and a job
export function calculateMatch(person, job) {
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

// Profile Completeness Calculator
export function calculateCompleteness(person) {
  if (!person) return { pct: 0, missing: [] };
  let score = 30;
  const missing = [];

  if (person.skills && person.skills.length >= 3) score += 20;
  else missing.push('Add at least 3 skills to your profile (+20%)');

  if (person.certs && person.certs.length > 0) score += 20;
  else missing.push('Add verified certifications (+20%)');

  if (person.resumeUrl) score += 15;
  else missing.push('Upload your latest resume (+15%)');

  if (person.experience && person.experience.length > 30) score += 10;
  else missing.push('Add project experience summary (+10%)');

  if (person.preferences && person.preferences.domains && person.preferences.domains.length > 0) score += 5;
  else missing.push('Specify domain & travel preferences (+5%)');

  return { pct: Math.min(score, 100), missing };
}
