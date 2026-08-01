const DENTES_VALIDOS = new Set([
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
  '38', '37', '36', '35', '34', '33', '32', '31',
  '48', '47', '46', '45', '44', '43', '42', '41',
  '55', '54', '53', '52', '51',
  '61', '62', '63', '64', '65',
  '75', '74', '73', '72', '71',
  '85', '84', '83', '82', '81',
]);

const FACES_VALIDAS = new Set(['V', 'L', 'M', 'D', 'O']);

export interface DenteProcedimentoPayload {
  dente: string;
  faces: string[];
}

export type ValidacaoDentesProcedimento =
  | { ok: true; dentes: DenteProcedimentoPayload[] }
  | { ok: false; error: string };

function normalizarFace(face: unknown): string | null {
  const valor = typeof face === 'string'
    ? face
    : face && typeof face === 'object' && 'nome' in face
      ? String((face as { nome?: unknown }).nome ?? '')
      : '';
  const normalizada = valor.trim().toUpperCase();
  return FACES_VALIDAS.has(normalizada) ? normalizada : null;
}

export function validarDentesProcedimento(
  raw: unknown,
  options: { exigirFaces?: boolean } = {},
): ValidacaoDentesProcedimento {
  let parsed = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    if (!Array.isArray(parsed)) {
      // Compatibilidade com integrações antigas que enviavam "14,15,16".
      parsed = raw
        .split(',')
        .map((dente) => dente.trim())
        .filter(Boolean)
        .map((dente) => ({ dente, faces: [] }));
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: 'Selecione ao menos um dente' };
  }

  const dentes: DenteProcedimentoPayload[] = [];
  const dentesEncontrados = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Seleção de dentes inválida' };
    }

    const dente = String((item as { dente?: unknown }).dente ?? '').trim();
    if (!DENTES_VALIDOS.has(dente) || dentesEncontrados.has(dente)) {
      return { ok: false, error: 'Seleção de dentes inválida' };
    }

    const facesRaw = (item as { faces?: unknown }).faces;
    if (facesRaw != null && !Array.isArray(facesRaw)) {
      return { ok: false, error: 'Seleção de faces inválida' };
    }

    const faces = (Array.isArray(facesRaw) ? facesRaw : [])
      .map(normalizarFace)
      .filter((face): face is string => face !== null);

    if (options.exigirFaces && faces.length === 0) {
      return { ok: false, error: 'Selecione ao menos uma face para cada dente' };
    }

    dentesEncontrados.add(dente);
    dentes.push({ dente, faces: [...new Set(faces)] });
  }

  return { ok: true, dentes };
}
