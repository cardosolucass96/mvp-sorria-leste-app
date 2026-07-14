export const CLINIC_TIME_ZONE = 'America/Fortaleza';
export const CLINIC_UTC_OFFSET_MINUTES = -3 * 60;
export const SQLITE_UTC_NOW_EXPRESSION = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UTC_NAIVE_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
const LOCAL_DATETIME_INPUT_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?)?$/;

type TimeParts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

function normalizeOffset(value: string): string {
  return value.replace(/([+-]\d{2})(\d{2})(?!:)/g, '$1:$2');
}

function normalizeMicros(value: string): string {
  return value.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2}|$))/, '$1');
}

export function getSqlUtcInstantExpression(column: string): string {
  const trimmed = `TRIM(${column})`;
  return `CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN ${trimmed} = '' THEN NULL
    WHEN instr(${trimmed}, 'T') > 0 THEN ${trimmed}
    WHEN instr(${trimmed}, ' ') > 0 THEN replace(${trimmed}, ' ', 'T') || 'Z'
    ELSE ${trimmed}
  END`;
}

function createUtcDateFromClinicParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const localUtcMillis = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  return new Date(localUtcMillis - CLINIC_UTC_OFFSET_MINUTES * 60_000);
}

function parseDateOnlyParts(value: string): { year: number; month: number; day: number } | null {
  const trimmed = value.trim();
  if (!DATE_ONLY_REGEX.test(trimmed)) return null;

  const [year, month, day] = trimmed.split('-').map(Number);
  return { year, month, day };
}

function buildDateFromCandidates(candidates: Iterable<string>): Date | null {
  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

export function isDateOnlyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && DATE_ONLY_REGEX.test(value.trim());
}

export function getDatePartsInTimeZone(
  date: Date,
  timeZone: string = CLINIC_TIME_ZONE,
): TimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values: TimeParts = {
    year: '0000',
    month: '00',
    day: '00',
    hour: '00',
    minute: '00',
    second: '00',
  };

  for (const part of parts) {
    if (part.type in values) {
      values[part.type as keyof TimeParts] = part.value;
    }
  }

  return values;
}

export function getClinicDateKey(date: Date = new Date()): string {
  const { year, month, day } = getDatePartsInTimeZone(date);
  return `${year}-${month}-${day}`;
}

export function getClinicMonthKey(date: Date = new Date()): string {
  const { year, month } = getDatePartsInTimeZone(date);
  return `${year}-${month}`;
}

export function getClinicDateTimeLocalValue(date: Date = new Date()): string {
  const { year, month, day, hour, minute } = getDatePartsInTimeZone(date);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function getClinicTimeLabel(date: Date): string {
  const { hour, minute } = getDatePartsInTimeZone(date);
  return `${hour}:${minute}`;
}

export function nowUtcIso(date: Date = new Date()): string {
  return date.toISOString();
}

export function parseStoredUtcInstant(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_ONLY_REGEX.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00`);
  }

  if (UTC_NAIVE_DATETIME_REGEX.test(trimmed)) {
    const asUtc = new Date(`${trimmed.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1')}Z`);
    if (!Number.isNaN(asUtc.getTime())) {
      return asUtc;
    }
  }

  const candidates = new Set<string>();
  const add = (candidate?: string | null) => {
    if (!candidate) return;
    const normalized = candidate.trim();
    if (normalized) candidates.add(normalized);
  };

  const variants = [
    trimmed,
    trimmed.replace(' ', 'T'),
    normalizeOffset(trimmed),
    normalizeOffset(trimmed.replace(' ', 'T')),
    normalizeMicros(trimmed),
    normalizeMicros(trimmed.replace(' ', 'T')),
    normalizeMicros(normalizeOffset(trimmed)),
    normalizeMicros(normalizeOffset(trimmed.replace(' ', 'T'))),
  ];

  for (const variant of variants) {
    add(variant);
    add(variant.replace(/\s(?=[+-]\d{2}:?\d{2}$)/, ''));
    add(variant.replace(/[Zz]$/, ''));
    add(variant.replace(/[Zz]$/, '').replace(/\s(?=[+-]\d{2}:?\d{2}$)/, ''));
  }

  return buildDateFromCandidates(candidates);
}

export function getStoredUtcInstantMillis(value: string | null | undefined): number | null {
  const parsed = parseStoredUtcInstant(value);
  if (!parsed) return null;

  const millis = parsed.getTime();
  return Number.isNaN(millis) ? null : millis;
}

export function normalizeStoredUtcInstant(value: string | null | undefined): string | null {
  const parsed = parseStoredUtcInstant(value);
  return parsed ? parsed.toISOString() : null;
}

export function parseClinicLocalDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_ONLY_REGEX.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    return createUtcDateFromClinicParts(year, month, day);
  }

  const match = trimmed.match(LOCAL_DATETIME_INPUT_REGEX);
  if (!match) return null;

  const [
    ,
    year,
    month,
    day,
    hour = '00',
    minute = '00',
    second = '00',
    millis = '0',
  ] = match;

  return createUtcDateFromClinicParts(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millis.padEnd(3, '0').slice(0, 3)),
  );
}

export function clinicDateTimeInputToUtcIso(value: string | null | undefined): string | null {
  const parsed = parseClinicLocalDateTime(value);
  return parsed ? parsed.toISOString() : null;
}

export function normalizeClinicDateTimeInputValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_ONLY_REGEX.test(trimmed)) {
    return `${trimmed}T00:00`;
  }

  const match = trimmed.match(LOCAL_DATETIME_INPUT_REGEX);
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00'] = match;
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function clinicDateTimeInputToUtcIsoEndOfDay(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_ONLY_REGEX.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    return createUtcDateFromClinicParts(year, month, day, 23, 59, 59, 999).toISOString();
  }

  return clinicDateTimeInputToUtcIso(trimmed);
}

export function toClinicDateTimeLocalInput(value: string | null | undefined): string {
  if (!value) return '';

  const trimmed = value.trim();
  if (!trimmed) return '';
  if (DATE_ONLY_REGEX.test(trimmed)) return `${trimmed}T00:00`;

  const parsed = parseStoredUtcInstant(trimmed);
  if (!parsed) {
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(trimmed)) {
      return trimmed.replace(' ', 'T').slice(0, 16);
    }
    return trimmed;
  }

  const { year, month, day, hour, minute } = getDatePartsInTimeZone(parsed);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function isSameClinicDay(left: Date, right: Date): boolean {
  return getClinicDateKey(left) === getClinicDateKey(right);
}

export function addDaysToClinicDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

function clinicDateKeyToDayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, 12) / 86_400_000);
}

export function getClinicCalendarDayDifference(from: Date, to: Date = new Date()): number {
  return clinicDateKeyToDayNumber(getClinicDateKey(to)) - clinicDateKeyToDayNumber(getClinicDateKey(from));
}

export function getClinicCalendarDayDifferenceFromStoredUtcInstant(
  value: string | null | undefined,
  to: Date = new Date(),
): number | null {
  const parsed = parseStoredUtcInstant(value);
  return parsed ? getClinicCalendarDayDifference(parsed, to) : null;
}

export function calculateAgeFromDateOnly(
  value: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!value) return null;

  const parts = parseDateOnlyParts(value);
  if (!parts) return null;

  const hoje = getDatePartsInTimeZone(now);
  let idade = Number(hoje.year) - parts.year;
  const monthDiff = Number(hoje.month) - parts.month;
  const dayDiff = Number(hoje.day) - parts.day;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    idade -= 1;
  }

  return idade >= 0 ? idade : null;
}

export interface ClinicUtcRange {
  start: string;
  endExclusive: string;
  endInclusive: string;
}

export function getClinicDayUtcRange(dateKey: string = getClinicDateKey()): ClinicUtcRange {
  const start = clinicDateTimeInputToUtcIso(`${dateKey}T00:00:00`);
  const nextDayKey = addDaysToClinicDateKey(dateKey, 1);
  const endExclusive = clinicDateTimeInputToUtcIso(`${nextDayKey}T00:00:00`);
  const endInclusive = clinicDateTimeInputToUtcIsoEndOfDay(dateKey);

  if (!start || !endExclusive || !endInclusive) {
    throw new Error(`Não foi possível calcular o range UTC da data ${dateKey}`);
  }

  return { start, endExclusive, endInclusive };
}

export function getClinicTrailingDaysUtcRange(days: number, now: Date = new Date()): ClinicUtcRange {
  const todayKey = getClinicDateKey(now);
  const startKey = addDaysToClinicDateKey(todayKey, -(days - 1));
  const { start } = getClinicDayUtcRange(startKey);
  const todayRange = getClinicDayUtcRange(todayKey);
  return {
    start,
    endExclusive: todayRange.endExclusive,
    endInclusive: todayRange.endInclusive,
  };
}

export function getClinicMonthUtcRange(monthKey: string = getClinicMonthKey()): ClinicUtcRange {
  const [year, month] = monthKey.split('-').map(Number);
  const startKey = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
  const nextStartKey = `${nextMonth.year}-${pad(nextMonth.month)}-01`;

  const start = clinicDateTimeInputToUtcIso(`${startKey}T00:00:00`);
  const endExclusive = clinicDateTimeInputToUtcIso(`${nextStartKey}T00:00:00`);
  const lastDayInclusive = clinicDateTimeInputToUtcIsoEndOfDay(
    addDaysToClinicDateKey(nextStartKey, -1),
  );

  if (!start || !endExclusive || !lastDayInclusive) {
    throw new Error(`Não foi possível calcular o range UTC do mês ${monthKey}`);
  }

  return {
    start,
    endExclusive,
    endInclusive: lastDayInclusive,
  };
}

export function isClinicDateTimeInputInPast(
  value: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const normalized = normalizeClinicDateTimeInputValue(value);
  if (!normalized) return false;
  return normalized < getClinicDateTimeLocalValue(now);
}
