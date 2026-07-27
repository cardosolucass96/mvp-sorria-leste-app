import fs from 'fs';
import path from 'path';

describe('Migração de evoluções clínicas', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'lib/migrations/add_prontuario_evolucoes.sql'),
    'utf8'
  );

  it('cria vínculo único de item para impedir duplicidade entre evoluções', () => {
    expect(migration).toContain('item_atendimento_id INTEGER NOT NULL UNIQUE');
  });

  it('faz backfill dos prontuários legados como evoluções individuais', () => {
    expect(migration).toContain('legacy-prontuario-');
    expect(migration).toContain('FROM prontuarios pr');
    expect(migration).toContain('INNER JOIN prontuario_evolucoes pe ON pe.legacy_prontuario_id = pr.id');
  });
});
