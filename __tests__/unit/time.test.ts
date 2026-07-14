import {
  calculateAgeFromDateOnly,
  clinicDateTimeInputToUtcIso,
  getClinicCalendarDayDifferenceFromStoredUtcInstant,
  getClinicDateKey,
  getClinicDayUtcRange,
  getClinicMonthUtcRange,
  getClinicTrailingDaysUtcRange,
  normalizeStoredUtcInstant,
  parseStoredUtcInstant,
  toClinicDateTimeLocalInput,
} from '@/lib/time';

describe('lib/time', () => {
  test('interpreta timestamp naive legado como UTC', () => {
    expect(normalizeStoredUtcInstant('2026-07-13 14:30:00')).toBe('2026-07-13T14:30:00.000Z');
  });

  test('converte datetime-local da clínica para UTC ISO', () => {
    expect(clinicDateTimeInputToUtcIso('2026-07-13T23:15')).toBe('2026-07-14T02:15:00.000Z');
  });

  test('converte UTC para data/hora local da clínica', () => {
    expect(toClinicDateTimeLocalInput('2026-07-14T02:15:00.000Z')).toBe('2026-07-13T23:15');
  });

  test('mantém a data da clínica correta perto da virada UTC', () => {
    const parsed = parseStoredUtcInstant('2026-07-14T02:30:00.000Z');
    expect(parsed).not.toBeNull();
    expect(getClinicDateKey(parsed!)).toBe('2026-07-13');
  });

  test('calcula idade de date-only usando a virada do dia da clínica', () => {
    expect(calculateAgeFromDateOnly('2000-07-14', new Date('2026-07-14T02:30:00.000Z'))).toBe(25);
    expect(calculateAgeFromDateOnly('2000-07-14', new Date('2026-07-14T03:05:00.000Z'))).toBe(26);
  });

  test('calcula diferença de dias pelo calendário da clínica, não por 24 horas corridas', () => {
    expect(
      getClinicCalendarDayDifferenceFromStoredUtcInstant(
        '2026-07-14T02:50:00.000Z',
        new Date('2026-07-14T12:00:00.000Z'),
      ),
    ).toBe(1);
  });

  test('calcula o range UTC de hoje na clínica', () => {
    expect(getClinicDayUtcRange('2026-07-13')).toEqual({
      start: '2026-07-13T03:00:00.000Z',
      endExclusive: '2026-07-14T03:00:00.000Z',
      endInclusive: '2026-07-14T02:59:59.999Z',
    });
  });

  test('calcula o range UTC dos últimos 7 e 30 dias na clínica', () => {
    const now = new Date('2026-07-13T15:00:00.000Z');

    expect(getClinicTrailingDaysUtcRange(7, now)).toEqual({
      start: '2026-07-07T03:00:00.000Z',
      endExclusive: '2026-07-14T03:00:00.000Z',
      endInclusive: '2026-07-14T02:59:59.999Z',
    });

    expect(getClinicTrailingDaysUtcRange(30, now)).toEqual({
      start: '2026-06-14T03:00:00.000Z',
      endExclusive: '2026-07-14T03:00:00.000Z',
      endInclusive: '2026-07-14T02:59:59.999Z',
    });
  });

  test('calcula o range UTC do mês atual da clínica', () => {
    expect(getClinicMonthUtcRange('2026-07')).toEqual({
      start: '2026-07-01T03:00:00.000Z',
      endExclusive: '2026-08-01T03:00:00.000Z',
      endInclusive: '2026-08-01T02:59:59.999Z',
    });
  });
});
