export type FaceNome = 'V' | 'L' | 'M' | 'D' | 'O';

function normalizarDente(dente: string | number | null | undefined): string {
  return dente == null ? '' : String(dente).trim();
}

function obterQuadrante(dente: string | number | null | undefined): number | null {
  const valor = normalizarDente(dente);
  if (!/^\d{2}$/.test(valor)) return null;
  const quadrante = Number(valor[0]);
  return Number.isNaN(quadrante) ? null : quadrante;
}

function obterPosicao(dente: string | number | null | undefined): number | null {
  const valor = normalizarDente(dente);
  if (!/^\d{2}$/.test(valor)) return null;
  const posicao = Number(valor[1]);
  return Number.isNaN(posicao) ? null : posicao;
}

export function isDenteSuperior(dente: string | number | null | undefined): boolean {
  const quadrante = obterQuadrante(dente);
  return quadrante === 1 || quadrante === 2 || quadrante === 5 || quadrante === 6;
}

export function isDenteAnterior(dente: string | number | null | undefined): boolean {
  const posicao = obterPosicao(dente);
  return posicao !== null && posicao >= 1 && posicao <= 3;
}

export function getFaceDisplay(
  face: string | FaceNome | null | undefined,
  dente?: string | number | null
): { sigla: string; label: string } {
  const faceNormalizada = face?.toString().trim().toUpperCase();

  switch (faceNormalizada) {
    case 'V':
      return { sigla: 'V', label: 'Vestibular' };
    case 'L':
      return isDenteSuperior(dente)
        ? { sigla: 'P', label: 'Palatina' }
        : { sigla: 'L', label: 'Lingual' };
    case 'M':
      return { sigla: 'M', label: 'Mesial' };
    case 'D':
      return { sigla: 'D', label: 'Distal' };
    case 'O':
      return isDenteAnterior(dente)
        ? { sigla: 'I', label: 'Incisal' }
        : { sigla: 'O', label: 'Oclusal' };
    default: {
      const fallback = faceNormalizada || '-';
      return { sigla: fallback, label: fallback };
    }
  }
}
