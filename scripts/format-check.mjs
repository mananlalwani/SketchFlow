#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Baseline formatting guard until full-repo Prettier/Biome cleanup lands.
// It intentionally checks tracked JSON validity only, because existing source
// files still contain formatting debt that would make a broad whitespace gate fail.
const files = execFileSync('git', ['ls-files', '*.json'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((file) => !file.includes('node_modules/'));

let failed = false;
for (const file of files) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`${file}: invalid JSON: ${error.message}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`Checked JSON validity for ${files.length} tracked files.`);
