import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const mode = process.argv[2];
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const diff = execFileSync('git', ['diff', 'HEAD', '--'], { encoding: 'utf8' });
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter(file => file && !file.startsWith('outputs/'));
const schema = createHash('sha256').update(readFileSync('lib/schema.sql')).digest('hex');
const command = ['node_modules/@opennextjs/cloudflare/dist/cli/index.js'];
const env = { ...process.env, NEXT_DEV_WRANGLER_ENV: 'refactor' };
if (mode === 'build') {
  execFileSync(process.execPath, [...command, 'build', '--env', 'refactor'], { stdio: 'inherit', env });
  writeFileSync('.open-next/refactor-release.json', JSON.stringify({ revision, diff_hash: createHash('sha256').update(diff).digest('hex'), schema }));
} else if (mode === 'deploy') {
  const built = JSON.parse(readFileSync('.open-next/refactor-release.json', 'utf8'));
  if (diff || untracked.length || built.revision !== revision || built.schema !== schema || built.diff_hash !== createHash('sha256').update(diff).digest('hex')) {
    throw new Error('Publique somente uma revisão commitada e reconstruída com build:refactor.');
  }
  execFileSync(process.execPath, [...command, 'deploy', '--env', 'refactor', '--var', `CODE_REVISION:${revision}`, '--var', `SCHEMA_REVISION:${schema}`], { stdio: 'inherit', env });
} else throw new Error('Use build ou deploy. Este script opera exclusivamente no ambiente refactor.');
