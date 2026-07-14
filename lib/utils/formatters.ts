/**
 * Utilitários de formatação — fonte única de verdade.
 * Substitui as 11+ cópias espalhadas pelas páginas.
 */

import { getFaceDisplay, type FaceNome } from '@/lib/utils/denteFaces';
import {
  CLINIC_TIME_ZONE,
  getClinicDateTimeLocalValue,
  getClinicTimeLabel,
  isClinicDateTimeInputInPast,
  isDateOnlyString,
  parseClinicLocalDateTime,
  parseStoredUtcInstant,
  toClinicDateTimeLocalInput,
} from '@/lib/time';

/** Formata número como moeda brasileira (R$ 1.234,56) */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const DATETIME_LOCAL_PREFIX_REGEX = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?)?/;

export function formatarDateNaClinica(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CLINIC_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatarInstanteUtcNaClinica(
  data: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = '-',
): string {
  const parsed = parseStoredUtcInstant(data);
  if (!parsed || Number.isNaN(parsed.getTime())) return fallback;
  return formatarDateNaClinica(parsed, options);
}

export function formatarHoraDaClinica(date: Date = new Date()): string {
  return formatarDateNaClinica(date, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatarAgoraDaClinica(date: Date = new Date()): string {
  return formatarDateNaClinica(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatClinicDateOnly(date: Date): string {
  return formatarDateNaClinica(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatUtcInstantInClinic(
  data: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return formatarInstanteUtcNaClinica(data, options);
}

/**
 * Converte strings locais digitadas pelo usuário para Date sem aplicar compensação de UTC.
 * Use para `data_agendada`, `vencimento_em` e outros campos de agenda/follow-up.
 */
export function parseLocalDateTimeValue(data: string | null | undefined): Date | null {
  return parseClinicLocalDateTime(data);
}

/** Formata data como dd/mm/aaaa */
export function formatarData(data: string | null | undefined): string {
  if (typeof data === 'string' && isDateOnlyString(data.trim())) {
    const parsed = parseClinicLocalDateTime(data);
    return parsed ? formatClinicDateOnly(parsed) : '-';
  }

  return formatUtcInstantInClinic(data, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
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

  if (isDateOnlyString(s)) {
    const parsedDate = parseClinicLocalDateTime(s);
    return parsedDate ? formatClinicDateOnly(parsedDate) : '-';
  }

  const d = parseStoredUtcInstant(data);
  if (!d || Number.isNaN(d.getTime())) return '-';

  if (temHora) {
    return d.toLocaleDateString('pt-BR', {
      timeZone: CLINIC_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('pt-BR', {
    timeZone: CLINIC_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Converte valor de data/datetime armazenado para o formato do input datetime-local (YYYY-MM-DDTHH:mm).
 */
export function toDateTimeLocal(data: string | null | undefined): string {
  return toClinicDateTimeLocalInput(data);
}

/**
 * Retorna a string `YYYY-MM-DDTHH:mm` no fuso operacional da clinica.
 * Use para `min` de inputs `datetime-local` e para comparacoes no backend.
 */
export function getCurrentDateTimeLocalValue(date: Date = new Date(), timeZone: string = CLINIC_TIME_ZONE): string {
  if (timeZone === CLINIC_TIME_ZONE) {
    return getClinicDateTimeLocalValue(date);
  }

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

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

/**
 * Normaliza valores de `datetime-local` para `YYYY-MM-DDTHH:mm`.
 * A comparacao fica no mesmo nivel de precisao que o input do navegador: minuto.
 */
export function normalizeDateTimeLocalValue(data: string | null | undefined): string | null {
  if (!data) return null;

  const texto = data.trim();
  if (!texto) return null;

  if (isDateOnlyString(texto)) {
    return `${texto}T00:00`;
  }

  const match = DATETIME_LOCAL_PREFIX_REGEX.exec(texto);
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
  void timeZone;
  return isClinicDateTimeInputInPast(data, now);
}

/** Formata data como dd/mm/aaaa HH:mm */
export function formatarDataHora(data: string | null | undefined): string {
  return formatUtcInstantInClinic(data, {
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
  if (!d || Number.isNaN(d.getTime())) return '-';
  return `${formatClinicDateOnly(d)} ${getClinicTimeLabel(d)}`;
}

/** Formata data completa com segundos (para logs/prontuário) */
export function formatarDataCompleta(data: string | null | undefined): string {
  const d = parseStoredUtcInstant(data);
  if (!d || Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', { timeZone: CLINIC_TIME_ZONE });
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
  const d = parseStoredUtcInstant(inicio);
  if (!d || Number.isNaN(d.getTime())) return '-';
  const fimDate = fim ? (parseStoredUtcInstant(fim) ?? new Date()) : new Date();
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
