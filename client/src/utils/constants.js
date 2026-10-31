// Application reference date. Caliberate runs against the real current date so
// bench aging, roll-off forecasts, and certification alerts stay accurate.
export const TODAY = new Date().toISOString().slice(0, 10);

// Controlled Skill Taxonomy
export const SKILL_TAXONOMY = [
  { id: 'java', name: 'Java', category: 'Backend' },
  { id: 'spring', name: 'Spring Boot', category: 'Backend' },
  { id: 'node', name: 'Node.js', category: 'Backend' },
  { id: 'python', name: 'Python', category: 'Backend/Data' },
  { id: 'go', name: 'Go', category: 'Backend/Systems' },
  { id: 'react', name: 'React', category: 'Frontend' },
  { id: 'typescript', name: 'TypeScript', category: 'Frontend' },
  { id: 'figma', name: 'Figma', category: 'Design' },
  { id: 'sql', name: 'SQL', category: 'Data' },
  { id: 'spark', name: 'Spark', category: 'Data' },
  { id: 'pytorch', name: 'PyTorch', category: 'Data/AI' },
  { id: 'dbt', name: 'dbt', category: 'Data' },
  { id: 'aws', name: 'AWS', category: 'Cloud' },
  { id: 'kubernetes', name: 'Kubernetes', category: 'Cloud/DevOps' },
  { id: 'terraform', name: 'Terraform', category: 'Cloud/DevOps' },
  { id: 'docker', name: 'Docker', category: 'Cloud/DevOps' },
  { id: 'kafka', name: 'Kafka', category: 'Architecture' },
  { id: 'sap', name: 'SAP S/4HANA', category: 'ERP' },
  { id: 'graphql', name: 'GraphQL', category: 'Backend' }
];
