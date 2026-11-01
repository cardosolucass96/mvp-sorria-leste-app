import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const failures = [];
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}
function imports(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.filter(node => ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    .filter(node => node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
    .map(node => ({ name: node.moduleSpecifier.text, typeOnly: node.isTypeOnly || node.importClause?.isTypeOnly }));
}
function resolve(from, name) {
  const base = name.startsWith('@/') ? path.join(root, name.slice(2))
    : name.startsWith('.') ? path.resolve(path.dirname(from), name) : null;
  if (!base) return null;
  return [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(file => fs.existsSync(file));
}
function checkPure(file, origin, seen = new Set()) {
  if (seen.has(file)) return;
  seen.add(file);
  for (const dependency of imports(file)) {
    if (dependency.typeOnly) continue;
    const target = resolve(file, dependency.name);
    if (/^(next(?:\/|$)|react(?:\/|$)|server-only|@opennextjs\/)/.test(dependency.name)
      || (target && /\/(server|app)\/|\/lib\/db\.ts$/.test(target))) {
      failures.push(`${path.relative(root, origin)} depende de servidor/UI por ${path.relative(root, file)} → ${dependency.name}`);
    } else if (target) checkPure(target, origin, seen);
  }
}
for (const file of files(path.join(root, 'modules'))) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const currentModule = relative.split('/')[1];
  if (/\/(domain|contracts)\/|\/public\.ts$/.test(relative)) checkPure(file, file);
  for (const dependency of imports(file)) {
    const target = resolve(file, dependency.name);
    if (!target) continue;
    const targetPath = path.relative(root, target).replaceAll(path.sep, '/');
    if (targetPath.startsWith('app/')) failures.push(`${relative} importa uma rota/página: ${dependency.name}`);
    const other = targetPath.match(/^modules\/([^/]+)\/(.*)$/);
    if (other && other[1] !== currentModule
      && !/^(public\.ts|contracts\/|server\/index\.ts$)/.test(other[2])) {
      failures.push(`${relative} acessa detalhe interno de outro módulo: ${dependency.name}`);
    }
  }
}
if (failures.length) {
  console.error([...new Set(failures)].join('\n'));
  process.exitCode = 1;
} else console.log('Limites dos módulos e dependências puras: OK.');
