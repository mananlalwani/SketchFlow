import { spawnSync } from 'node:child_process';

const image = process.argv[2];

if (!image) {
  console.error('Usage: node scripts/audit-docker-image.mjs <image-tag>');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} ${args.join(' ')} failed`);
  }

  return result.stdout;
}

const imageEnvironment = JSON.parse(
  run('docker', ['image', 'inspect', '--format={{json .Config.Env}}', image]),
);
const forbiddenEnvironment = imageEnvironment.filter((entry) =>
  /^(?:SENTRY_AUTH_TOKEN|VITE_(?:HONEYCOMB|OTEL_|SENTRY_AUTH_TOKEN))=/.test(entry),
);

const filesystemAudit = String.raw`
  const fs = require('node:fs');
  const path = require('node:path');
  const root = '/app';
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };

  walk(root);
  const artifactPaths = files.filter((file) =>
    /(?:^|\/)\.env(?:\..+)?$|\.map$/.test(file),
  );
  const browserFiles = files.filter((file) =>
    file.startsWith('/app/client/dist/') && /\.(?:js|css)$/.test(file),
  );
  const forbiddenBrowserMarkers = [
    'SENTRY_AUTH_TOKEN',
    'VITE_SENTRY_AUTH_TOKEN',
    'VITE_HONEYCOMB_API_KEY',
    'VITE_OTEL_EXPORTER_OTLP_HEADERS',
  ];
  const browserMarkerPaths = browserFiles.flatMap((file) => {
    const content = fs.readFileSync(file, 'utf8');
    return forbiddenBrowserMarkers
      .filter((marker) => content.includes(marker))
      .map((marker) => ({ file, marker }));
  });

  process.stdout.write(JSON.stringify({ artifactPaths, browserMarkerPaths }));
`;
const { artifactPaths, browserMarkerPaths } = JSON.parse(
  run('docker', ['run', '--rm', '--entrypoint', 'node', image, '-e', filesystemAudit]),
);

const violations = [
  ...forbiddenEnvironment.map(
    (entry) => `forbidden image environment key: ${entry.split('=', 1)[0]}`,
  ),
  ...artifactPaths.map((file) => `forbidden final-image artifact: ${file}`),
  ...browserMarkerPaths.map(({ file, marker }) => `forbidden browser marker ${marker} in ${file}`),
];

if (violations.length > 0) {
  const maxReportedViolations = 20;
  console.error(`Docker image audit failed (${violations.length} violation(s)): `);
  violations
    .slice(0, maxReportedViolations)
    .forEach((violation) => console.error(`- ${violation}`));
  if (violations.length > maxReportedViolations) {
    console.error(`- ${violations.length - maxReportedViolations} additional violation(s) omitted`);
  }
  process.exit(1);
}

console.log(
  'Docker image audit passed: final image contains no env files, source maps, or private browser telemetry markers.',
);
