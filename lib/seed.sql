-- =====================================================
-- SEED DE DADOS - SORRIA LESTE MVP (D1)
-- Execute: wrangler d1 execute sorria-leste-db --file=lib/seed.sql
-- =====================================================

-- Usuários (12 usuários)
INSERT OR IGNORE INTO usuarios (nome, email, role, senha) VALUES 
  ('Admin Sistema', 'admin@sorrialeste.com', 'admin', 'Sorria@123'),
  ('Gerente Geral', 'gerente@sorrialeste.com', 'admin', 'Sorria@123'),
  ('Maria Recepção', 'maria@sorrialeste.com', 'atendente', 'Sorria@123'),
  ('João Recepção', 'joao@sorrialeste.com', 'atendente', 'Sorria@123'),
  ('Paula Atendimento', 'paula@sorrialeste.com', 'atendente', 'Sorria@123'),
  ('Dr. Carlos Avaliador', 'dr.carlos@sorrialeste.com', 'avaliador', 'Sorria@123'),
  ('Dra. Ana Avaliadora', 'dra.ana@sorrialeste.com', 'avaliador', 'Sorria@123'),
  ('Dr. Fernando Avaliador', 'dr.fernando@sorrialeste.com', 'avaliador', 'Sorria@123'),
  ('Dr. Pedro Executor', 'dr.pedro@sorrialeste.com', 'executor', 'Sorria@123'),
  ('Dra. Lucia Executora', 'dra.lucia@sorrialeste.com', 'executor', 'Sorria@123'),
  ('Dr. Ricardo Executor', 'dr.ricardo@sorrialeste.com', 'executor', 'Sorria@123'),
  ('Dra. Beatriz Executora', 'dra.beatriz@sorrialeste.com', 'executor', 'Sorria@123');

-- Procedimentos (25 procedimentos) - por_dente: 0=não, 1=sim
INSERT OR IGNORE INTO procedimentos (nome, valor, comissao_venda, comissao_execucao, por_dente, descricao) VALUES 
  ('Consulta de Avaliação', 0, 0, 0, 0, 'Avaliação inicial gratuita'),
  ('Raio-X Panorâmico', 120, 5, 20, 0, 'Radiografia panorâmica'),
  ('Raio-X Periapical', 40, 5, 20, 1, 'Radiografia periapical unitária'),
  ('Limpeza/Profilaxia', 150, 10, 30, 0, 'Limpeza dental completa'),
  ('Aplicação de Flúor', 80, 10, 30, 0, 'Aplicação tópica de flúor'),
  ('Selante', 100, 10, 30, 1, 'Selante por dente'),
  ('Restauração Simples', 200, 10, 35, 1, 'Restauração em resina 1 face'),
  ('Restauração Composta', 350, 10, 35, 1, 'Restauração em resina múltiplas faces'),
  ('Restauração em Amálgama', 180, 10, 35, 1, 'Restauração em amálgama'),
  ('Extração Simples', 250, 10, 40, 1, 'Extração dentária simples'),
  ('Extração de Siso', 600, 10, 40, 1, 'Extração de dente do siso'),
  ('Extração de Siso Incluso', 900, 12, 45, 1, 'Extração de siso incluso'),
  ('Tratamento de Canal - Anterior', 600, 10, 40, 1, 'Canal em dente anterior'),
  ('Tratamento de Canal - Pré-molar', 800, 10, 40, 1, 'Canal em pré-molar'),
  ('Tratamento de Canal - Molar', 1000, 10, 40, 1, 'Canal em molar'),
  ('Clareamento Dental', 1200, 15, 30, 0, 'Clareamento dental completo'),
  ('Faceta de Porcelana', 2000, 15, 35, 1, 'Faceta de porcelana unitária'),
  ('Prótese Parcial Removível', 1500, 12, 35, 0, 'PPR'),
  ('Prótese Total', 2500, 12, 35, 0, 'Dentadura completa'),
  ('Coroa de Porcelana', 1800, 12, 35, 1, 'Coroa unitária'),
  ('Implante Unitário', 3500, 15, 40, 1, 'Implante osseointegrado'),
  ('Prótese sobre Implante', 2200, 12, 35, 1, 'Coroa sobre implante'),
  ('Ortodontia - Instalação', 1800, 10, 35, 0, 'Instalação do aparelho'),
  ('Ortodontia - Manutenção', 250, 5, 40, 0, 'Manutenção mensal'),
  ('Raspagem Periodontal', 400, 10, 35, 0, 'Raspagem por quadrante');

-- Clientes de exemplo (10 clientes)
INSERT OR IGNORE INTO clientes (nome, cpf, telefone, email, data_nascimento, origem, endereco) VALUES 
  ('José da Silva', '111.111.111-11', '(11) 91234-5678', 'jose.silva@email.com', '1985-03-15', 'fachada', 'Rua das Flores, 123 - Centro'),
  ('Maria Santos', '222.222.222-22', '(11) 92345-6789', 'maria.santos@email.com', '1990-07-22', 'trafego_meta', 'Av. Brasil, 456 - Jardim'),
  ('Pedro Oliveira', '333.333.333-33', '(11) 93456-7890', 'pedro.oliveira@email.com', '1978-11-08', 'indicacao', 'Rua São Paulo, 789 - Vila Nova'),
  ('Ana Costa', '444.444.444-44', '(11) 94567-8901', 'ana.costa@email.com', '1995-02-28', 'organico', 'Rua Principal, 321 - Centro'),
  ('Carlos Ferreira', '555.555.555-55', '(11) 95678-9012', 'carlos.ferreira@email.com', '1982-09-14', 'trafego_google', 'Av. Central, 654 - Bela Vista'),
  ('Juliana Almeida', '666.666.666-66', '(11) 96789-0123', 'juliana.almeida@email.com', '1988-05-30', 'fachada', 'Rua das Palmeiras, 111 - Jardim'),
  ('Roberto Souza', '777.777.777-77', '(11) 97890-1234', 'roberto.souza@email.com', '1975-12-25', 'indicacao', 'Av. Paulista, 222 - Centro'),
  ('Fernanda Lima', '888.888.888-88', '(11) 98901-2345', 'fernanda.lima@email.com', '1992-08-17', 'trafego_meta', 'Rua Augusta, 333 - Vila Nova'),
  ('Marcos Ribeiro', '999.999.999-99', '(11) 99012-3456', 'marcos.ribeiro@email.com', '1980-04-05', 'organico', 'Av. Ipiranga, 444 - Centro'),
  ('Patricia Gomes', '101.010.101-01', '(11) 90123-4567', 'patricia.gomes@email.com', '1998-01-10', 'fachada', 'Rua Consolação, 555 - Jardim');
