import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = mkdtempSync(join(tmpdir(), 'sketchflow-server-deploy-'));

try {
  execFileSync('pnpm', ['--filter', '@sketchflow/server', '--prod', 'deploy', '--legacy', target], {
    stdio: 'inherit',
  });

  const packagePath = join(target, 'package.json');
  if (!existsSync(packagePath) || !existsSync(join(target, 'node_modules'))) {
    throw new Error('server deploy did not contain package.json and node_modules');
  }

  const packageManifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  const forbiddenPaths = [
    'src',
    'coverage',
    'eslint.config.js',
    'tsconfig.json',
    'vitest.config.ts',
    'vitest.integration.config.ts',
    'pnpm-workspace.yaml',
  ];
  const copiedWorkspaceFiles = forbiddenPaths.filter((path) => existsSync(join(target, path)));
  if (copiedWorkspaceFiles.length > 0) {
    throw new Error(
      `server deploy copied workspace or development files: ${copiedWorkspaceFiles.join(', ')}`,
    );
  }

  if (packageManifest.devDependencies && existsSync(join(target, 'node_modules', 'typescript'))) {
    throw new Error('server deploy installed a development dependency');
  }

  console.log(
    'Server deploy package check passed: production dependencies and runtime files only.',
  );
} finally {
  rmSync(target, { force: true, recursive: true });
}
