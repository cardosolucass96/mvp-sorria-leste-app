/**
 * Utilitários de formatação — fonte única de verdade.
 * Substitui as 11+ cópias espalhadas pelas páginas.
 */

import { getFaceDisplay, type FaceNome } from '@/lib/utils/denteFaces';

/** Formata número como moeda brasileira (R$ 1.234,56) */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SQLITE_NAIVE_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
const DATETIME_LOCAL_PREFIX_REGEX = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?)?/;
const CLINIC_TIME_ZONE = 'America/Fortaleza';

/**
 * Converte timestamps gerados pelo sistema para Date.
 *
 * Regras:
 * - `YYYY-MM-DD` continua sendo tratado como data local.
 * - `YYYY-MM-DD HH:MM:SS` vindo do banco é tratado como UTC sem offset explícito.
 *
 * Isso corrige o caso do D1/Cloudflare gravar timestamps "naive" em UTC, que antes eram
 * reinterpretados como horário local na UI e apareciam ~3 horas adiantados no Brasil.
 */
function parseSqliteDate(data: string | null | undefined): Date | null {
  if (!data) return null;
  const texto = data.trim();
  if (!texto) return null;

  if (DATE_ONLY_REGEX.test(texto)) {
    return new Date(`${texto}T00:00:00`);
  }

  if (SQLITE_NAIVE_DATETIME_REGEX.test(texto)) {
    const utcLike = `${texto.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1')}Z`;
    const parsedUtc = new Date(utcLike);
    if (!Number.isNaN(parsedUtc.getTime())) {
      return parsedUtc;
    }
  }

  const candidatos = new Set<string>();
  const adicionar = (valor?: string | null): void => {
    if (!valor) return;
    const limpo = valor.trim();
    if (limpo) candidatos.add(limpo);
  };

  const normalizarOffset = (valor: string): string => {
    // Corrige offset sem dois-pontos: +0000 => +00:00
    return valor.replace(/([+-]\d{2})(\d{2})(?!:)/g, '$1:$2');
  };

  const normalizarMicros = (valor: string): string => {
    // Mantém apenas milissegundos (3 casas) para evitar parser estrito quebrar
    return valor.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2}|$))/, '$1');
  };

  const variantes = [
    texto,
    texto.replace(' ', 'T'),
    normalizarOffset(texto),
    normalizarOffset(texto.replace(' ', 'T')),
    normalizarMicros(texto),
    normalizarMicros(texto.replace(' ', 'T')),
    normalizarMicros(normalizarOffset(texto)),
    normalizarMicros(normalizarOffset(texto.replace(' ', 'T'))),
  ];

  for (const base of variantes) {
    adicionar(base);
    // Aceita offsets com espaço entre horário e UTC: "14:00:00 +0000"
    adicionar(base.replace(/\s(?=[+-]\d{2}:?\d{2}$)/, ''));
    // Versão sem timezone, útil para casos com formato não padrão
    adicionar(base.replace(/[Zz]$/, ''));
    adicionar(base.replace(/[Zz]$/, '').replace(/\s(?=[+-]\d{2}:?\d{2}$)/, ''));
  }

  for (const candidato of candidatos) {
    const d = new Date(candidato);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  return null;
}

/**
 * Converte strings locais digitadas pelo usuário para Date sem aplicar compensação de UTC.
 * Use para `data_agendada`, `vencimento_em` e outros campos de agenda/follow-up.
 */
export function parseLocalDateTimeValue(data: string | null | undefined): Date | null {
  if (!data) return null;
  const texto = data.trim();
  if (!texto) return null;

  if (DATE_ONLY_REGEX.test(texto)) {
    return new Date(`${texto}T00:00:00`);
  }

  const normalizado = texto.includes(' ') ? texto.replace(' ', 'T') : texto;
  const semMicros = normalizado.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2}|$))/, '$1');
  const candidatos = [
    semMicros,
    normalizado,
    normalizado.replace(/[Zz]$/, ''),
    texto,
  ];

  for (const candidato of candidatos) {
    const d = new Date(candidato);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  return null;
}

/** Formata data como dd/mm/aaaa */
export function formatarData(data: string | null | undefined): string {
  const d = parseSqliteDate(data);
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formata data de agendamento: mostra hora apenas quando presente e não for 00:00.
 * Ex: "2025-06-10" → "10/06/2025"
 *     "2025-06-10T14:30" → "10/06/2025 14:30"
 */
export function formatarDataAgendada(data: string | null | undefined): string {
  if (!data) return '-';
  const s = data.trim();
  const temHora = (s.includes('T') || s.includes(' ')) &&
    !/T00:00(:\d{2})?$/.test(s) && !/ 00:00(:\d{2})?$/.test(s);
  const d = parseLocalDateTimeValue(data);
  if (!d || isNaN(d.getTime())) return '-';
  if (temHora) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Converte valor de data/datetime armazenado para o formato do input datetime-local (YYYY-MM-DDTHH:mm).
 */
export function toDateTimeLocal(data: string | null | undefined): string {
  if (!data) return '';
  const s = data.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return s.replace(' ', 'T').substring(0, 16);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.substring(0, 16);
  return s;
}

function getDatePartsInTimeZone(
  date: Date,
  timeZone: string
): Record<'year' | 'month' | 'day' | 'hour' | 'minute', string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = {
    year: '0000',
    month: '00',
    day: '00',
    hour: '00',
    minute: '00',
  };

  for (const part of parts) {
    if (part.type in values) {
      values[part.type as keyof typeof values] = part.value;
    }
  }

  return values;
}

/**
 * Retorna a string `YYYY-MM-DDTHH:mm` no fuso operacional da clinica.
 * Use para `min` de inputs `datetime-local` e para comparacoes no backend.
 */
export function getCurrentDateTimeLocalValue(date: Date = new Date(), timeZone: string = CLINIC_TIME_ZONE): string {
  const { year, month, day, hour, minute } = getDatePartsInTimeZone(date, timeZone);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Normaliza valores de `datetime-local` para `YYYY-MM-DDTHH:mm`.
 * A comparacao fica no mesmo nivel de precisao que o input do navegador: minuto.
 */
export function normalizeDateTimeLocalValue(data: string | null | undefined): string | null {
  if (!data) return null;

  const texto = data.trim();
  if (!texto) return null;

  if (DATE_ONLY_REGEX.test(texto)) {
    return `${texto}T00:00`;
  }

  const match = texto.match(DATETIME_LOCAL_PREFIX_REGEX);
  if (!match) return null;

  const [, date, hour = '00', minute = '00'] = match;
  return `${date}T${hour}:${minute}`;
}

/**
 * Valida se um valor vindo de `datetime-local` esta no passado, usando:
 * - fuso da clinica (`America/Fortaleza`);
 * - precisao de minuto, igual ao campo do navegador.
 */
export function isDateTimeLocalValueInPast(
  data: string | null | undefined,
  now: Date = new Date(),
  timeZone: string = CLINIC_TIME_ZONE
): boolean {
  const normalized = normalizeDateTimeLocalValue(data);
  if (!normalized) return false;
  return normalized < getCurrentDateTimeLocalValue(now, timeZone);
}

/** Formata data como dd/mm/aaaa HH:mm */
export function formatarDataHora(data: string | null | undefined): string {
  const d = parseSqliteDate(data);
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formata data/hora local digitada pelo usuário sem converter de UTC */
export function formatarDataHoraLocal(data: string | null | undefined): string {
  const d = parseLocalDateTimeValue(data);
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formata data completa com segundos (para logs/prontuário) */
export function formatarDataCompleta(data: string | null | undefined): string {
  const d = parseSqliteDate(data);
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

/** Formata CPF: 123.456.789-00 */
export function formatarCPF(cpf: string | null): string {
  if (!cpf) return '-';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/** Formata CNPJ: 12.345.678/0001-90 */
export function formatarCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return '-';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

interface DenteFaceLike {
  dente?: string | number | null;
  faces?: Array<string | { nome?: string | null } | null> | null;
}

const ORDEM_FACES: FaceNome[] = ['V', 'L', 'M', 'D', 'O'];

function normalizarFace(face: string | { nome?: string | null } | null): FaceNome | null {
  if (!face) return null;
  const valor = typeof face === 'string' ? face : face.nome;
  if (!valor) return null;
  const upper = valor.toUpperCase() as FaceNome;
  return ORDEM_FACES.includes(upper) ? upper : null;
}

function ordenarFaces(faces: FaceNome[]): FaceNome[] {
  return [...faces].sort((a, b) => ORDEM_FACES.indexOf(a) - ORDEM_FACES.indexOf(b));
}

function formatarEntradaDente(item: string | number | DenteFaceLike | null): string | null {
  if (item == null) return null;
  if (typeof item === 'string' || typeof item === 'number') {
    const dente = String(item).trim();
    return dente || null;
  }

  const dente = item.dente != null ? String(item.dente).trim() : '';
  if (!dente) return null;

  const faces = ordenarFaces(
    (item.faces ?? [])
      .map(normalizarFace)
      .filter((face): face is FaceNome => face !== null)
  );
  const facesDisplay = faces.map((face) => getFaceDisplay(face, dente).sigla);

  if (facesDisplay.length === 0) return dente;
  if (facesDisplay.length === 1) return `${dente}${facesDisplay[0]}`;
  return `${dente}(${facesDisplay.join(',')})`;
}

export function parseDentesLabels(raw: string | null | undefined): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => formatarEntradaDente(item as string | number | DenteFaceLike | null))
      .filter((item): item is string => Boolean(item));
  } catch {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export function formatarDentes(raw: string | null | undefined): string | null {
  const dentes = parseDentesLabels(raw);
  return dentes.length > 0 ? dentes.join(', ') : null;
}

export function formatarDenteUnicoComFaces(item: {
  dente_unico?: string | null;
  dentes?: string | null;
}): string | null {
  const dentes = parseDentesLabels(item.dentes);
  if (dentes.length > 0) return dentes[0];
  return item.dente_unico?.trim() || null;
}

/**
 * Retorna o nome completo do item de atendimento incluindo etapa quando aplicável.
 * Ex: "Canal • Dente 18" ou "Restauração • 11(V,D) — Etapa 1"
 */
export function nomeProcedimentoItem(item: {
  procedimento_nome: string;
  etapa_label?: string | null;
  dente_unico?: string | null;
  dentes?: string | null;
}): string {
  let nome = item.procedimento_nome;
  const denteLabel = formatarDenteUnicoComFaces(item);
  if (denteLabel) {
    const prefixo = item.dentes ? '' : 'Dente ';
    nome += ` • ${prefixo}${denteLabel}`;
  }
  if (item.etapa_label) nome += ` — ${item.etapa_label}`;
  return nome;
}

/** Formata telefone: (11) 91234-5678 ou (11) 1234-5678 */
export function formatarTelefone(telefone: string | null): string {
  if (!telefone) return '-';
  const digits = telefone.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return telefone;
}

/** Formata porcentagem: 15% */
export function formatarPorcentagem(valor: number): string {
  return `${valor}%`;
}

/**
 * Retorna tempo decorrido desde uma data até agora (ou até outra data).
 * Ex: "há 5 min", "há 2h 30min", "há 3 dias"
 */
export function tempoDecorrido(inicio: string | null | undefined, fim?: string | null): string {
  const d = parseSqliteDate(inicio);
  if (!d || isNaN(d.getTime())) return '-';
  const fimDate = fim ? (parseSqliteDate(fim) ?? new Date()) : new Date();
  const diffMs = fimDate.getTime() - d.getTime();
  if (diffMs < 0) return '-';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min`;
  const horas = Math.floor(mins / 60);
  const minRest = mins % 60;
  if (horas < 24) return minRest > 0 ? `${horas}h ${minRest}min` : `${horas}h`;
  const dias = Math.floor(horas / 24);
  const horaRest = horas % 24;
  if (dias < 7) return horaRest > 0 ? `${dias}d ${horaRest}h` : `${dias}d`;
  return `${dias} dias`;
}

/** Retorna iniciais do nome (para avatar): "Lucas Cardoso" → "LC" */
export function obterIniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
