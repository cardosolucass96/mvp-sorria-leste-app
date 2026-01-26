import { getDb, executeMany, query, queryOne } from './db';
import fs from 'fs';
import path from 'path';

// =====================================================
// SEED COMPLETO - SORRIA LESTE MVP
// =====================================================

// Tipos auxiliares
interface Usuario { id: number; nome: string; email: string; role: string; }
interface Cliente { id: number; nome: string; }
interface Procedimento { id: number; nome: string; valor: number; comissao_venda: number; comissao_execucao: number; }
interface Atendimento { id: number; cliente_id: number; status: string; }
interface ItemAtendimento { id: number; atendimento_id: number; valor: number; valor_pago: number; executor_id: number; criado_por_id: number; procedimento_id: number; }

// Helpers
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').split('.')[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Executa o schema SQL
function runSchema() {
  const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  executeMany(schema);
  console.log('✅ Schema criado com sucesso!');
}

// =====================================================
// SEED DE USUÁRIOS (12 usuários)
// =====================================================
function seedUsuarios(): Usuario[] {
  const db = getDb();
  
  const usuarios = [
    // Admins
    { nome: 'Admin Sistema', email: 'admin@sorrialeste.com', role: 'admin' },
    { nome: 'Gerente Geral', email: 'gerente@sorrialeste.com', role: 'admin' },
    // Atendentes
    { nome: 'Maria Recepção', email: 'maria@sorrialeste.com', role: 'atendente' },
    { nome: 'João Recepção', email: 'joao@sorrialeste.com', role: 'atendente' },
    { nome: 'Paula Atendimento', email: 'paula@sorrialeste.com', role: 'atendente' },
    // Avaliadores
    { nome: 'Dr. Carlos Avaliador', email: 'dr.carlos@sorrialeste.com', role: 'avaliador' },
    { nome: 'Dra. Ana Avaliadora', email: 'dra.ana@sorrialeste.com', role: 'avaliador' },
    { nome: 'Dr. Fernando Avaliador', email: 'dr.fernando@sorrialeste.com', role: 'avaliador' },
    // Executores
    { nome: 'Dr. Pedro Executor', email: 'dr.pedro@sorrialeste.com', role: 'executor' },
    { nome: 'Dra. Lucia Executora', email: 'dra.lucia@sorrialeste.com', role: 'executor' },
    { nome: 'Dr. Ricardo Executor', email: 'dr.ricardo@sorrialeste.com', role: 'executor' },
    { nome: 'Dra. Beatriz Executora', email: 'dra.beatriz@sorrialeste.com', role: 'executor' },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO usuarios (nome, email, role) VALUES (?, ?, ?)
  `);

  for (const u of usuarios) {
    stmt.run(u.nome, u.email, u.role);
  }
  
  const result = query<Usuario>('SELECT * FROM usuarios');
  console.log(`✅ ${result.length} Usuários inseridos!`);
  return result;
}

// =====================================================
// SEED DE PROCEDIMENTOS (20 procedimentos)
// =====================================================
function seedProcedimentos(): Procedimento[] {
  const db = getDb();
  
  const procedimentos = [
    // Avaliação e diagnóstico
    { nome: 'Consulta de Avaliação', valor: 0, comissao_venda: 0, comissao_execucao: 0, descricao: 'Avaliação inicial gratuita' },
    { nome: 'Raio-X Panorâmico', valor: 120, comissao_venda: 5, comissao_execucao: 20, descricao: 'Radiografia panorâmica' },
    { nome: 'Raio-X Periapical', valor: 40, comissao_venda: 5, comissao_execucao: 20, descricao: 'Radiografia periapical unitária' },
    // Prevenção
    { nome: 'Limpeza/Profilaxia', valor: 150, comissao_venda: 10, comissao_execucao: 30, descricao: 'Limpeza dental completa' },
    { nome: 'Aplicação de Flúor', valor: 80, comissao_venda: 10, comissao_execucao: 30, descricao: 'Aplicação tópica de flúor' },
    { nome: 'Selante', valor: 100, comissao_venda: 10, comissao_execucao: 30, descricao: 'Selante por dente' },
    // Restaurações
    { nome: 'Restauração Simples', valor: 200, comissao_venda: 10, comissao_execucao: 35, descricao: 'Restauração em resina 1 face' },
    { nome: 'Restauração Composta', valor: 350, comissao_venda: 10, comissao_execucao: 35, descricao: 'Restauração em resina múltiplas faces' },
    { nome: 'Restauração em Amálgama', valor: 180, comissao_venda: 10, comissao_execucao: 35, descricao: 'Restauração em amálgama' },
    // Cirurgias
    { nome: 'Extração Simples', valor: 250, comissao_venda: 10, comissao_execucao: 40, descricao: 'Extração dentária simples' },
    { nome: 'Extração de Siso', valor: 600, comissao_venda: 10, comissao_execucao: 40, descricao: 'Extração de dente do siso' },
    { nome: 'Extração de Siso Incluso', valor: 900, comissao_venda: 12, comissao_execucao: 45, descricao: 'Extração de siso incluso' },
    // Endodontia
    { nome: 'Tratamento de Canal - Anterior', valor: 600, comissao_venda: 10, comissao_execucao: 40, descricao: 'Canal em dente anterior' },
    { nome: 'Tratamento de Canal - Pré-molar', valor: 800, comissao_venda: 10, comissao_execucao: 40, descricao: 'Canal em pré-molar' },
    { nome: 'Tratamento de Canal - Molar', valor: 1000, comissao_venda: 10, comissao_execucao: 40, descricao: 'Canal em molar' },
    // Estética
    { nome: 'Clareamento Dental', valor: 1200, comissao_venda: 15, comissao_execucao: 30, descricao: 'Clareamento dental completo' },
    { nome: 'Faceta de Porcelana', valor: 2000, comissao_venda: 15, comissao_execucao: 35, descricao: 'Faceta de porcelana unitária' },
    // Próteses
    { nome: 'Prótese Parcial Removível', valor: 1500, comissao_venda: 12, comissao_execucao: 35, descricao: 'PPR' },
    { nome: 'Prótese Total', valor: 2500, comissao_venda: 12, comissao_execucao: 35, descricao: 'Dentadura completa' },
    { nome: 'Coroa de Porcelana', valor: 1800, comissao_venda: 12, comissao_execucao: 35, descricao: 'Coroa unitária' },
    // Implantes
    { nome: 'Implante Unitário', valor: 3500, comissao_venda: 15, comissao_execucao: 40, descricao: 'Implante osseointegrado' },
    { nome: 'Prótese sobre Implante', valor: 2200, comissao_venda: 12, comissao_execucao: 35, descricao: 'Coroa sobre implante' },
    // Ortodontia
    { nome: 'Ortodontia - Instalação', valor: 1800, comissao_venda: 10, comissao_execucao: 35, descricao: 'Instalação do aparelho' },
    { nome: 'Ortodontia - Manutenção', valor: 250, comissao_venda: 5, comissao_execucao: 40, descricao: 'Manutenção mensal' },
    // Periodontia
    { nome: 'Raspagem Periodontal', valor: 400, comissao_venda: 10, comissao_execucao: 35, descricao: 'Raspagem por quadrante' },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO procedimentos (nome, valor, comissao_venda, comissao_execucao, descricao) 
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const p of procedimentos) {
    stmt.run(p.nome, p.valor, p.comissao_venda, p.comissao_execucao, p.descricao);
  }
  
  const result = query<Procedimento>('SELECT * FROM procedimentos WHERE ativo = 1');
  console.log(`✅ ${result.length} Procedimentos inseridos!`);
  return result;
}

// =====================================================
// SEED DE CLIENTES (30 clientes)
// =====================================================
function seedClientes(): Cliente[] {
  const db = getDb();
  
  const nomes = [
    'José da Silva', 'Maria Santos', 'Pedro Oliveira', 'Ana Costa', 'Carlos Ferreira',
    'Juliana Almeida', 'Roberto Souza', 'Fernanda Lima', 'Marcos Ribeiro', 'Patricia Gomes',
    'Ricardo Martins', 'Camila Nascimento', 'Bruno Cardoso', 'Amanda Rocha', 'Daniel Barbosa',
    'Larissa Mendes', 'Felipe Araújo', 'Vanessa Pereira', 'Gustavo Nunes', 'Carolina Teixeira',
    'Rodrigo Castro', 'Leticia Carvalho', 'Lucas Monteiro', 'Natalia Correia', 'Thiago Dias',
    'Isabela Vieira', 'Rafael Moura', 'Beatriz Freitas', 'Gabriel Pinto', 'Julia Campos',
  ];

  const origens: Array<'fachada' | 'trafego_meta' | 'trafego_google' | 'organico' | 'indicacao'> = 
    ['fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao'];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO clientes (nome, cpf, telefone, email, data_nascimento, origem, endereco) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < nomes.length; i++) {
    const nome = nomes[i];
    const cpfNum = String(100000000 + i * 11111111).padStart(11, '0');
    const cpf = `${cpfNum.slice(0,3)}.${cpfNum.slice(3,6)}.${cpfNum.slice(6,9)}-${cpfNum.slice(9,11)}`;
    const telefone = `(11) 9${randomInt(1000, 9999)}-${randomInt(1000, 9999)}`;
    const email = nome.toLowerCase().replace(/ /g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '@email.com';
    const ano = randomInt(1960, 2005);
    const mes = String(randomInt(1, 12)).padStart(2, '0');
    const dia = String(randomInt(1, 28)).padStart(2, '0');
    const dataNascimento = `${ano}-${mes}-${dia}`;
    const origem = randomItem(origens);
    const endereco = `Rua ${randomItem(['das Flores', 'Brasil', 'São Paulo', 'Principal', 'Central'])}, ${randomInt(1, 999)} - ${randomItem(['Centro', 'Jardim', 'Vila Nova', 'Bela Vista'])}`;

    stmt.run(nome, cpf, telefone, email, dataNascimento, origem, endereco);
  }
  
  const result = query<Cliente>('SELECT id, nome FROM clientes');
  console.log(`✅ ${result.length} Clientes inseridos!`);
  return result;
}

// =====================================================
// SEED DE ATENDIMENTOS COMPLETOS
// =====================================================
function seedAtendimentos(
  usuarios: Usuario[],
  clientes: Cliente[],
  procedimentos: Procedimento[]
) {
  const db = getDb();
  
  // Filtrar usuários por role
  const atendentes = usuarios.filter(u => u.role === 'atendente');
  const avaliadores = usuarios.filter(u => u.role === 'avaliador');
  const executores = usuarios.filter(u => u.role === 'executor');
  
  // Procedimentos que não são avaliação
  const procsComValor = procedimentos.filter(p => p.valor > 0);
  
  const hoje = new Date();
  
  // Counters
  let totalAtendimentos = 0;
  let totalItens = 0;
  let totalPagamentos = 0;
  let totalComissoes = 0;
  
  // =====================================================
  // 1. ATENDIMENTOS FINALIZADOS (últimos 60 dias) - 25 atendimentos
  // =====================================================
  console.log('\n📋 Criando atendimentos FINALIZADOS...');
  
  for (let i = 0; i < 25; i++) {
    const cliente = randomItem(clientes);
    const avaliador = randomItem(avaliadores);
    const atendente = randomItem(atendentes);
    const diasAtras = randomInt(5, 60);
    const dataInicio = addDays(hoje, -diasAtras);
    const dataFinalizado = addDays(dataInicio, randomInt(3, 15));
    
    // Criar atendimento finalizado
    const atendResult = db.prepare(`
      INSERT INTO atendimentos (cliente_id, avaliador_id, status, created_at, finalizado_at)
      VALUES (?, ?, 'finalizado', ?, ?)
    `).run(cliente.id, avaliador.id, formatDateTime(dataInicio), formatDateTime(dataFinalizado));
    
    const atendimentoId = atendResult.lastInsertRowid as number;
    totalAtendimentos++;
    
    // Adicionar 1-4 procedimentos
    const numProcs = randomInt(1, 4);
    const procsUsados = new Set<number>();
    
    for (let j = 0; j < numProcs; j++) {
      let proc: Procedimento;
      do {
        proc = randomItem(procsComValor);
      } while (procsUsados.has(proc.id));
      procsUsados.add(proc.id);
      
      const executor = randomItem(executores);
      
      // Criar item (totalmente pago e concluído)
      const itemResult = db.prepare(`
        INSERT INTO itens_atendimento 
        (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, concluido_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'concluido', ?, ?)
      `).run(
        atendimentoId, proc.id, executor.id, avaliador.id, 
        proc.valor, proc.valor, formatDateTime(dataFinalizado), formatDateTime(dataInicio)
      );
      
      const itemId = itemResult.lastInsertRowid as number;
      totalItens++;
      
      // Criar pagamento
      const metodos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];
      const dataPagamento = addDays(dataInicio, randomInt(1, 5));
      
      const pagResult = db.prepare(`
        INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(atendimentoId, atendente.id, proc.valor, randomItem(metodos), formatDateTime(dataPagamento));
      
      const pagamentoId = pagResult.lastInsertRowid as number;
      totalPagamentos++;
      
      // Vincular pagamento ao item
      db.prepare(`
        INSERT INTO pagamentos_itens (pagamento_id, item_atendimento_id, valor_aplicado, created_at)
        VALUES (?, ?, ?, ?)
      `).run(pagamentoId, itemId, proc.valor, formatDateTime(dataPagamento));
      
      // Criar comissões
      // Comissão de venda (para quem criou o item - avaliador)
      if (proc.comissao_venda > 0) {
        const valorComissaoVenda = (proc.valor * proc.comissao_venda) / 100;
        db.prepare(`
          INSERT INTO comissoes (atendimento_id, item_atendimento_id, usuario_id, tipo, percentual, valor_base, valor_comissao, created_at)
          VALUES (?, ?, ?, 'venda', ?, ?, ?, ?)
        `).run(atendimentoId, itemId, avaliador.id, proc.comissao_venda, proc.valor, valorComissaoVenda, formatDateTime(dataFinalizado));
        totalComissoes++;
      }
      
      // Comissão de execução (para o executor)
      if (proc.comissao_execucao > 0) {
        const valorComissaoExec = (proc.valor * proc.comissao_execucao) / 100;
        db.prepare(`
          INSERT INTO comissoes (atendimento_id, item_atendimento_id, usuario_id, tipo, percentual, valor_base, valor_comissao, created_at)
          VALUES (?, ?, ?, 'execucao', ?, ?, ?, ?)
        `).run(atendimentoId, itemId, executor.id, proc.comissao_execucao, proc.valor, valorComissaoExec, formatDateTime(dataFinalizado));
        totalComissoes++;
      }
    }
  }
  console.log(`   ✅ 25 atendimentos finalizados criados`);
  
  // =====================================================
  // 2. ATENDIMENTOS EM EXECUÇÃO - 10 atendimentos
  // (todos itens pagos, alguns concluídos, alguns executando)
  // =====================================================
  console.log('📋 Criando atendimentos EM EXECUÇÃO...');
  
  for (let i = 0; i < 10; i++) {
    const cliente = randomItem(clientes);
    const avaliador = randomItem(avaliadores);
    const atendente = randomItem(atendentes);
    const diasAtras = randomInt(1, 10);
    const dataInicio = addDays(hoje, -diasAtras);
    
    const atendResult = db.prepare(`
      INSERT INTO atendimentos (cliente_id, avaliador_id, status, created_at)
      VALUES (?, ?, 'em_execucao', ?)
    `).run(cliente.id, avaliador.id, formatDateTime(dataInicio));
    
    const atendimentoId = atendResult.lastInsertRowid as number;
    totalAtendimentos++;
    
    // 2-4 procedimentos (pelo menos 1 pago)
    const numProcs = randomInt(2, 4);
    const procsUsados = new Set<number>();
    
    for (let j = 0; j < numProcs; j++) {
      let proc: Procedimento;
      do {
        proc = randomItem(procsComValor);
      } while (procsUsados.has(proc.id));
      procsUsados.add(proc.id);
      
      const executor = randomItem(executores);
      // Alguns já concluídos, outros executando
      const status = j === 0 ? 'concluido' : (Math.random() > 0.5 ? 'concluido' : 'executando');
      const concluidoAt = status === 'concluido' ? formatDateTime(addDays(dataInicio, randomInt(1, diasAtras))) : null;
      
      const itemResult = db.prepare(`
        INSERT INTO itens_atendimento 
        (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, concluido_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        atendimentoId, proc.id, executor.id, avaliador.id, 
        proc.valor, proc.valor, status, concluidoAt, formatDateTime(dataInicio)
      );
      
      const itemId = itemResult.lastInsertRowid as number;
      totalItens++;
      
      // Criar pagamento (todos pagos para estar em execução)
      const metodos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];
      const dataPagamento = addDays(dataInicio, 1);
      
      const pagResult = db.prepare(`
        INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(atendimentoId, atendente.id, proc.valor, randomItem(metodos), formatDateTime(dataPagamento));
      
      const pagamentoId = pagResult.lastInsertRowid as number;
      totalPagamentos++;
      
      db.prepare(`
        INSERT INTO pagamentos_itens (pagamento_id, item_atendimento_id, valor_aplicado, created_at)
        VALUES (?, ?, ?, ?)
      `).run(pagamentoId, itemId, proc.valor, formatDateTime(dataPagamento));
    }
  }
  console.log(`   ✅ 10 atendimentos em execução criados`);
  
  // =====================================================
  // 3. ATENDIMENTOS AGUARDANDO PAGAMENTO - 12 atendimentos
  // (alguns com parcelas vencidas)
  // =====================================================
  console.log('📋 Criando atendimentos AGUARDANDO PAGAMENTO...');
  
  for (let i = 0; i < 12; i++) {
    const cliente = randomItem(clientes);
    const avaliador = randomItem(avaliadores);
    const atendente = randomItem(atendentes);
    const diasAtras = randomInt(3, 20);
    const dataInicio = addDays(hoje, -diasAtras);
    
    const atendResult = db.prepare(`
      INSERT INTO atendimentos (cliente_id, avaliador_id, status, created_at)
      VALUES (?, ?, 'aguardando_pagamento', ?)
    `).run(cliente.id, avaliador.id, formatDateTime(dataInicio));
    
    const atendimentoId = atendResult.lastInsertRowid as number;
    totalAtendimentos++;
    
    // 1-3 procedimentos
    const numProcs = randomInt(1, 3);
    const procsUsados = new Set<number>();
    let totalAtendimento = 0;
    const itensInfo: Array<{id: number, valor: number}> = [];
    
    for (let j = 0; j < numProcs; j++) {
      let proc: Procedimento;
      do {
        proc = randomItem(procsComValor);
      } while (procsUsados.has(proc.id));
      procsUsados.add(proc.id);
      
      const executor = Math.random() > 0.3 ? randomItem(executores) : null;
      
      // Alguns itens parcialmente pagos, outros pendentes
      const valorPago = j === 0 && Math.random() > 0.5 ? proc.valor * 0.5 : 0;
      const status = valorPago >= proc.valor ? 'pago' : 'pendente';
      
      const itemResult = db.prepare(`
        INSERT INTO itens_atendimento 
        (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        atendimentoId, proc.id, executor?.id || null, avaliador.id, 
        proc.valor, valorPago, status, formatDateTime(dataInicio)
      );
      
      const itemId = itemResult.lastInsertRowid as number;
      totalItens++;
      totalAtendimento += proc.valor;
      itensInfo.push({ id: itemId, valor: proc.valor });
      
      // Se teve pagamento parcial, registrar
      if (valorPago > 0) {
        const metodos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];
        const dataPagamento = addDays(dataInicio, 1);
        
        const pagResult = db.prepare(`
          INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(atendimentoId, atendente.id, valorPago, randomItem(metodos), formatDateTime(dataPagamento));
        
        const pagamentoId = pagResult.lastInsertRowid as number;
        totalPagamentos++;
        
        db.prepare(`
          INSERT INTO pagamentos_itens (pagamento_id, item_atendimento_id, valor_aplicado, created_at)
          VALUES (?, ?, ?, ?)
        `).run(pagamentoId, itemId, valorPago, formatDateTime(dataPagamento));
      }
    }
    
    // Criar parcelas para alguns atendimentos (simular parcelamento)
    if (i < 6 && totalAtendimento > 500) {
      const numParcelas = randomInt(2, 4);
      const valorParcela = totalAtendimento / numParcelas;
      
      for (let p = 0; p < numParcelas; p++) {
        const dataVencimento = addDays(dataInicio, (p + 1) * 30);
        // Primeira parcela pode estar vencida
        const pago = p === 0 && Math.random() > 0.7 ? 1 : 0;
        
        db.prepare(`
          INSERT INTO parcelas (atendimento_id, numero, valor, data_vencimento, pago, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(atendimentoId, p + 1, valorParcela, formatDate(dataVencimento), pago, formatDateTime(dataInicio));
      }
    }
  }
  console.log(`   ✅ 12 atendimentos aguardando pagamento criados`);
  
  // =====================================================
  // 4. ATENDIMENTOS EM AVALIAÇÃO - 8 atendimentos
  // =====================================================
  console.log('📋 Criando atendimentos EM AVALIAÇÃO...');
  
  for (let i = 0; i < 8; i++) {
    const cliente = randomItem(clientes);
    // Metade com avaliador atribuído, metade sem
    const avaliador = i < 4 ? randomItem(avaliadores) : null;
    const diasAtras = randomInt(0, 5);
    const dataInicio = addDays(hoje, -diasAtras);
    
    const atendResult = db.prepare(`
      INSERT INTO atendimentos (cliente_id, avaliador_id, status, created_at)
      VALUES (?, ?, 'avaliacao', ?)
    `).run(cliente.id, avaliador?.id || null, formatDateTime(dataInicio));
    
    const atendimentoId = atendResult.lastInsertRowid as number;
    totalAtendimentos++;
    
    // Alguns já tem procedimentos adicionados (avaliação em andamento)
    if (avaliador && Math.random() > 0.5) {
      const numProcs = randomInt(1, 2);
      const procsUsados = new Set<number>();
      
      for (let j = 0; j < numProcs; j++) {
        let proc: Procedimento;
        do {
          proc = randomItem(procsComValor);
        } while (procsUsados.has(proc.id));
        procsUsados.add(proc.id);
        
        db.prepare(`
          INSERT INTO itens_atendimento 
          (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_pago, status, created_at)
          VALUES (?, ?, ?, ?, ?, 0, 'pendente', ?)
        `).run(atendimentoId, proc.id, null, avaliador.id, proc.valor, formatDateTime(dataInicio));
        
        totalItens++;
      }
    }
  }
  console.log(`   ✅ 8 atendimentos em avaliação criados`);
  
  // =====================================================
  // 5. ATENDIMENTOS EM TRIAGEM - 5 atendimentos (novos)
  // =====================================================
  console.log('📋 Criando atendimentos em TRIAGEM...');
  
  for (let i = 0; i < 5; i++) {
    const cliente = randomItem(clientes);
    const diasAtras = randomInt(0, 2);
    const dataInicio = addDays(hoje, -diasAtras);
    
    db.prepare(`
      INSERT INTO atendimentos (cliente_id, status, created_at)
      VALUES (?, 'triagem', ?)
    `).run(cliente.id, formatDateTime(dataInicio));
    
    totalAtendimentos++;
  }
  console.log(`   ✅ 5 atendimentos em triagem criados`);
  
  // =====================================================
  // 6. PARCELAS VENCIDAS ADICIONAIS
  // =====================================================
  console.log('📋 Criando parcelas vencidas...');
  
  // Buscar atendimentos aguardando pagamento sem parcelas
  const atendsSemParcelas = query<{id: number}>(`
    SELECT a.id FROM atendimentos a
    LEFT JOIN parcelas p ON p.atendimento_id = a.id
    WHERE a.status = 'aguardando_pagamento' AND p.id IS NULL
    LIMIT 5
  `);
  
  let parcelasVencidas = 0;
  for (const atend of atendsSemParcelas) {
    const totalAtend = queryOne<{total: number}>(`
      SELECT SUM(valor) as total FROM itens_atendimento WHERE atendimento_id = ?
    `, [atend.id]);
    
    if (totalAtend && totalAtend.total > 0) {
      // Criar 3 parcelas, algumas vencidas
      for (let p = 0; p < 3; p++) {
        const dataVencimento = addDays(hoje, -30 + (p * 15)); // Algumas vencidas
        db.prepare(`
          INSERT INTO parcelas (atendimento_id, numero, valor, data_vencimento, pago)
          VALUES (?, ?, ?, ?, 0)
        `).run(atend.id, p + 1, totalAtend.total / 3, formatDate(dataVencimento));
        
        if (dataVencimento < hoje) parcelasVencidas++;
      }
    }
  }
  console.log(`   ✅ ${parcelasVencidas} parcelas vencidas criadas`);
  
  console.log(`\n📊 Resumo de atendimentos:`);
  console.log(`   - Total atendimentos: ${totalAtendimentos}`);
  console.log(`   - Total itens/procedimentos: ${totalItens}`);
  console.log(`   - Total pagamentos: ${totalPagamentos}`);
  console.log(`   - Total comissões: ${totalComissoes}`);
}

// =====================================================
// FUNÇÃO PRINCIPAL DE SEED
// =====================================================
export function runSeed() {
  console.log('🌱 Iniciando seed COMPLETO do banco de dados...\n');
  console.log('='.repeat(50));
  
  runSchema();
  
  const usuarios = seedUsuarios();
  const procedimentos = seedProcedimentos();
  const clientes = seedClientes();
  
  seedAtendimentos(usuarios, clientes, procedimentos);
  
  // Mostra resumo final
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMO FINAL DO BANCO:');
  console.log('='.repeat(50));
  
  const stats = {
    usuarios: queryOne<{count: number}>('SELECT COUNT(*) as count FROM usuarios')?.count || 0,
    clientes: queryOne<{count: number}>('SELECT COUNT(*) as count FROM clientes')?.count || 0,
    procedimentos: queryOne<{count: number}>('SELECT COUNT(*) as count FROM procedimentos')?.count || 0,
    atendimentos: queryOne<{count: number}>('SELECT COUNT(*) as count FROM atendimentos')?.count || 0,
    itens: queryOne<{count: number}>('SELECT COUNT(*) as count FROM itens_atendimento')?.count || 0,
    pagamentos: queryOne<{count: number}>('SELECT COUNT(*) as count FROM pagamentos')?.count || 0,
    parcelas: queryOne<{count: number}>('SELECT COUNT(*) as count FROM parcelas')?.count || 0,
    parcelasVencidas: queryOne<{count: number}>("SELECT COUNT(*) as count FROM parcelas WHERE pago = 0 AND date(data_vencimento) < date('now')")?.count || 0,
    comissoes: queryOne<{count: number}>('SELECT COUNT(*) as count FROM comissoes')?.count || 0,
    totalComissoes: queryOne<{total: number}>('SELECT COALESCE(SUM(valor_comissao), 0) as total FROM comissoes')?.total || 0,
  };
  
  const statusCounts = query<{status: string, count: number}>(`
    SELECT status, COUNT(*) as count FROM atendimentos GROUP BY status ORDER BY status
  `);
  
  console.log(`\n👥 Usuários: ${stats.usuarios}`);
  console.log(`👤 Clientes: ${stats.clientes}`);
  console.log(`🦷 Procedimentos: ${stats.procedimentos}`);
  console.log(`\n📋 Atendimentos: ${stats.atendimentos}`);
  statusCounts.forEach(s => {
    const emoji = {
      'triagem': '📥',
      'avaliacao': '🔍',
      'aguardando_pagamento': '💰',
      'em_execucao': '🦷',
      'finalizado': '✅'
    }[s.status] || '•';
    console.log(`   ${emoji} ${s.status}: ${s.count}`);
  });
  
  console.log(`\n🦷 Itens de atendimento: ${stats.itens}`);
  console.log(`💳 Pagamentos: ${stats.pagamentos}`);
  console.log(`📅 Parcelas: ${stats.parcelas} (${stats.parcelasVencidas} vencidas)`);
  console.log(`💵 Comissões: ${stats.comissoes} (Total: R$ ${stats.totalComissoes.toFixed(2)})`);
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ Seed COMPLETO concluído com sucesso!');
  console.log('='.repeat(50));
}

// Executar se chamado diretamente
if (require.main === module) {
  runSeed();
}
