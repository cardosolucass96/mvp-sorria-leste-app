import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const baseline = JSON.parse(readFileSync('test-baselines/pre-modularizacao.json', 'utf8'));
mkdirSync('tmp', { recursive: true });
const outputFile = 'tmp/test-baseline-current.json';
rmSync(outputFile, { force: true });
const run = spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', '--runInBand', '--json', `--outputFile=${outputFile}`], { stdio: 'inherit' });
if (run.error || run.signal || ![0, 1].includes(run.status)) throw new Error('Jest não concluiu a verificação.');
const result = JSON.parse(readFileSync(outputFile, 'utf8'));
const key = row => `${row.file}::${row.test}`;
const allowed = new Set(baseline.known_failures.map(key));
const failures = [];
let known = 0;
for (const suite of result.testResults) {
  const file = path.relative(process.cwd(), suite.name).replaceAll(path.sep, '/');
  if (suite.status === 'failed' && !suite.assertionResults.some(test => test.status === 'failed')) failures.push(`${file}: falha ao carregar/executar a suíte`);
  for (const test of suite.assertionResults.filter(test => test.status === 'failed')) {
    const id = key({ file, test: test.fullName });
    if (allowed.has(id)) known++;
    else failures.push(id);
  }
}
if (result.numTotalTests < baseline.minimum_tests) failures.push('A quantidade de testes caiu abaixo da base registrada.');
if (result.numPendingTests > baseline.maximum_skipped) failures.push('Foram acrescentados testes ignorados.');
console.log(`Base anterior: ${baseline.known_failures.length} falhas. Atuais conhecidas: ${known}. Novas: ${failures.length}.`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
