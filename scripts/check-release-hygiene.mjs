import { execFileSync } from 'node:child_process';

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const prohibited = [
  { label: 'environment file', test: /(^|\/)\.env(?:\..+)?$/ },
  { label: 'source map', test: /\.map$/ },
  { label: 'generated distribution', test: /(^|\/)dist\// },
  { label: 'coverage output', test: /(^|\/)coverage\// },
  { label: 'Playwright report', test: /(^|\/)playwright-report\// },
  { label: 'Playwright test result', test: /(^|\/)test-results\// },
  { label: 'TypeScript build metadata', test: /\.tsbuildinfo$/ },
];

const violations = trackedFiles.flatMap((file) =>
  prohibited
    .filter(({ test }) => test.test(file))
    .filter(({ label }) => !(label === 'environment file' && file.endsWith('.env.example')))
    .map(({ label }) => `${label}: ${file}`),
);

if (violations.length > 0) {
  console.error('Release hygiene check found prohibited tracked files:');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log(
  'Release hygiene check passed: no generated output, source maps, reports, or env files are tracked.',
);
