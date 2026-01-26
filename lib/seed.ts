import { getDb, executeMany, query } from './db';
import fs from 'fs';
import path from 'path';

// Tipos
interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: string;
}

// Executa o schema SQL
function runSchema() {
  const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  executeMany(schema);
  console.log('✅ Schema criado com sucesso!');
}

// Seed de usuários
function seedUsuarios() {
  const db = getDb();
  
  const usuarios = [
    { nome: 'Admin Sistema', email: 'admin@sorrialeste.com', role: 'admin' },
    { nome: 'Maria Recepção', email: 'maria@sorrialeste.com', role: 'atendente' },
    { nome: 'João Recepção', email: 'joao@sorrialeste.com', role: 'atendente' },
    { nome: 'Dr. Carlos Avaliador', email: 'dr.carlos@sorrialeste.com', role: 'avaliador' },
    { nome: 'Dra. Ana Avaliadora', email: 'dra.ana@sorrialeste.com', role: 'avaliador' },
    { nome: 'Dr. Pedro Executor', email: 'dr.pedro@sorrialeste.com', role: 'executor' },
    { nome: 'Dra. Lucia Executora', email: 'dra.lucia@sorrialeste.com', role: 'executor' },
    { nome: 'Dr. Ricardo Executor', email: 'dr.ricardo@sorrialeste.com', role: 'executor' },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO usuarios (nome, email, role) VALUES (?, ?, ?)
  `);

  for (const u of usuarios) {
    stmt.run(u.nome, u.email, u.role);
  }
  
  console.log('✅ Usuários inseridos!');
}

// Seed de procedimentos
function seedProcedimentos() {
  const db = getDb();
  
  const procedimentos = [
    { nome: 'Consulta de Avaliação', valor: 0, comissao_venda: 0, comissao_execucao: 0 },
    { nome: 'Limpeza/Profilaxia', valor: 150, comissao_venda: 10, comissao_execucao: 30 },
    { nome: 'Restauração Simples', valor: 200, comissao_venda: 10, comissao_execucao: 35 },
    { nome: 'Restauração Composta', valor: 350, comissao_venda: 10, comissao_execucao: 35 },
    { nome: 'Extração Simples', valor: 250, comissao_venda: 10, comissao_execucao: 40 },
    { nome: 'Extração de Siso', valor: 600, comissao_venda: 10, comissao_execucao: 40 },
    { nome: 'Tratamento de Canal', valor: 800, comissao_venda: 10, comissao_execucao: 40 },
    { nome: 'Clareamento Dental', valor: 1200, comissao_venda: 15, comissao_execucao: 30 },
    { nome: 'Prótese Parcial', valor: 1500, comissao_venda: 12, comissao_execucao: 35 },
    { nome: 'Prótese Total', valor: 2500, comissao_venda: 12, comissao_execucao: 35 },
    { nome: 'Implante Unitário', valor: 3500, comissao_venda: 15, comissao_execucao: 40 },
    { nome: 'Ortodontia - Instalação', valor: 1800, comissao_venda: 10, comissao_execucao: 35 },
    { nome: 'Ortodontia - Manutenção', valor: 250, comissao_venda: 5, comissao_execucao: 40 },
    { nome: 'Aplicação de Flúor', valor: 80, comissao_venda: 10, comissao_execucao: 30 },
    { nome: 'Raio-X Panorâmico', valor: 120, comissao_venda: 5, comissao_execucao: 20 },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO procedimentos (nome, valor, comissao_venda, comissao_execucao) 
    VALUES (?, ?, ?, ?)
  `);

  for (const p of procedimentos) {
    stmt.run(p.nome, p.valor, p.comissao_venda, p.comissao_execucao);
  }
  
  console.log('✅ Procedimentos inseridos!');
}

// Seed de clientes de exemplo
function seedClientes() {
  const db = getDb();
  
  const clientes = [
    { 
      nome: 'José da Silva', 
      cpf: '123.456.789-00', 
      telefone: '(11) 99999-1111', 
      email: 'jose.silva@email.com',
      data_nascimento: '1985-03-15'
    },
    { 
      nome: 'Maria Santos', 
      cpf: '234.567.890-11', 
      telefone: '(11) 99999-2222', 
      email: 'maria.santos@email.com',
      data_nascimento: '1990-07-22'
    },
    { 
      nome: 'Pedro Oliveira', 
      cpf: '345.678.901-22', 
      telefone: '(11) 99999-3333', 
      email: 'pedro.oliveira@email.com',
      data_nascimento: '1978-11-08'
    },
    { 
      nome: 'Ana Costa', 
      cpf: '456.789.012-33', 
      telefone: '(11) 99999-4444', 
      email: 'ana.costa@email.com',
      data_nascimento: '1995-01-30'
    },
    { 
      nome: 'Carlos Ferreira', 
      cpf: '567.890.123-44', 
      telefone: '(11) 99999-5555', 
      email: 'carlos.ferreira@email.com',
      data_nascimento: '1982-09-12'
    },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO clientes (nome, cpf, telefone, email, data_nascimento) 
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const c of clientes) {
    stmt.run(c.nome, c.cpf, c.telefone, c.email, c.data_nascimento);
  }
  
  console.log('✅ Clientes de exemplo inseridos!');
}

// Função principal de seed
export function runSeed() {
  console.log('🌱 Iniciando seed do banco de dados...\n');
  
  runSchema();
  seedUsuarios();
  seedProcedimentos();
  seedClientes();
  
  // Mostra resumo
  const usuarios = query<{ count: number }>('SELECT COUNT(*) as count FROM usuarios');
  const clientes = query<{ count: number }>('SELECT COUNT(*) as count FROM clientes');
  const procedimentos = query<{ count: number }>('SELECT COUNT(*) as count FROM procedimentos');
  
  console.log('\n📊 Resumo do banco:');
  console.log(`   - Usuários: ${usuarios[0].count}`);
  console.log(`   - Clientes: ${clientes[0].count}`);
  console.log(`   - Procedimentos: ${procedimentos[0].count}`);
  console.log('\n✨ Seed concluído com sucesso!');
}

// Executar se chamado diretamente
if (require.main === module) {
  runSeed();
}
