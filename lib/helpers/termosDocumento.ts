import { formatarDateNaClinica } from '@/lib/utils/formatters';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasUppercaseLettersOnly(value: string) {
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return Boolean(letters) && letters === letters.toUpperCase();
}

function isUppercaseTitle(text: string) {
  return !text.endsWith(':') && text.length <= 110 && hasUppercaseLettersOnly(text);
}

function isStandaloneSectionTitle(text: string) {
  if (!text || text.length > 100 || !text.endsWith(':')) return false;
  const withoutColon = text.slice(0, -1).trim();
  return hasUppercaseLettersOnly(withoutColon) || /^dados bancarios/i.test(withoutColon.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

function isDateLine(text: string) {
  return /_{3,}/.test(text) && /20_{2,}/.test(text);
}

function isSignatureCaption(text: string) {
  return text.startsWith('(') && text.endsWith(')') && /assinatura|carimbo|cpf/i.test(text);
}

function isDataLine(text: string) {
  return /^(Nome do Favorecido|CPF|Conta|Implantes \(dentes\)|Coroas sobre implantes|Protocolo sobre implante|Escolha do paciente|Observações)/i.test(text);
}

function shouldHighlightClause(text: string) {
  const match = text.match(/^([^:]{3,90}:)\s+.+$/);
  if (!match) return false;
  return hasUppercaseLettersOnly(match[1]);
}

function isElementNode(node: unknown): node is Element {
  return Boolean(node) && typeof node === 'object' && 'nodeType' in (node as Record<string, unknown>) && (node as { nodeType: number }).nodeType === 1;
}

function replaceElementTag<T extends Element>(element: T, tagName: string) {
  const replacement = element.ownerDocument.createElement(tagName);
  replacement.innerHTML = element.innerHTML;
  replacement.className = element.className;
  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name === 'class') return;
    replacement.setAttribute(attribute.name, attribute.value);
  });
  element.replaceWith(replacement);
  return replacement;
}

function decorateClause(paragraph: HTMLParagraphElement) {
  const html = paragraph.innerHTML;
  const colonIndex = html.indexOf(':');
  if (colonIndex <= 0) return;

  const label = html.slice(0, colonIndex + 1).trim();
  const remainder = html.slice(colonIndex + 1).trim();
  if (!remainder) return;

  paragraph.innerHTML = `<span class="termo-clause-label">${label}</span> ${remainder}`;
  paragraph.classList.add('termo-clause');
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'");
}

function stripHtmlTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '));
}

function decorateClauseHtml(innerHtml: string) {
  const colonIndex = innerHtml.indexOf(':');
  if (colonIndex <= 0) return innerHtml;

  const label = innerHtml.slice(0, colonIndex + 1).trim();
  const remainder = innerHtml.slice(colonIndex + 1).trim();
  if (!remainder) return innerHtml;

  return `<span class="termo-clause-label">${label}</span> ${remainder}`;
}

function formatTermoHtmlContentWithoutDom(html: string) {
  const blocks = html.match(/<(p|h[1-6]|ul|ol|table)[^>]*>[\s\S]*?<\/\1>/gi);
  if (!blocks?.length) {
    return html;
  }

  let titleCount = 0;
  let foundBodyStart = false;
  let previousTag = '';
  const result: string[] = [];

  for (const block of blocks) {
    const match = block.match(/^<([a-z0-9]+)([^>]*)>([\s\S]*?)<\/\1>$/i);
    if (!match) {
      result.push(block);
      previousTag = '';
      continue;
    }

    const [, tagNameRaw, attrsRaw, innerHtmlRaw] = match;
    const tagName = tagNameRaw.toLowerCase();
    const innerHtml = innerHtmlRaw.trim();
    const text = normalizeText(stripHtmlTags(innerHtml));
    const classes: string[] = [];
    let outputTag = tagName;
    let outputInnerHtml = innerHtml;

    if (tagName === 'p') {
      if (!text) {
        continue;
      }

      classes.push('termo-paragraph');

      if (isUppercaseTitle(text) && titleCount < 3) {
        classes.length = 0;
        classes.push(titleCount === 0 ? 'termo-eyebrow' : titleCount === 1 ? 'termo-title' : 'termo-subtitle');
        titleCount += 1;
      } else if (isStandaloneSectionTitle(text)) {
        outputTag = 'h2';
        classes.length = 0;
        classes.push('termo-section-title');
      } else {
        if (isDateLine(text)) {
          classes.push('termo-date-line', 'termo-no-indent');
        }

        if (isSignatureCaption(text)) {
          classes.push('termo-signature-caption', 'termo-no-indent');
        }

        if (isDataLine(text)) {
          classes.push('termo-data-line', 'termo-no-indent');
        }

        if (shouldHighlightClause(text)) {
          outputInnerHtml = decorateClauseHtml(innerHtml);
          classes.push('termo-clause');
        }

        if (!foundBodyStart || previousTag === 'h2') {
          classes.push('termo-no-indent');
          foundBodyStart = true;
        }
      }
    } else if (/^h[1-6]$/.test(tagName)) {
      outputTag = 'h2';
      classes.push('termo-section-title');
    } else if (tagName === 'ul' || tagName === 'ol') {
      classes.push('termo-list');
    }

    const existingClassMatch = attrsRaw.match(/\sclass=(['"])(.*?)\1/i);
    const existingClasses = existingClassMatch?.[2]?.trim() ? existingClassMatch[2].trim().split(/\s+/) : [];
    const mergedClasses = Array.from(new Set([...existingClasses, ...classes])).filter(Boolean);
    const attrsWithoutClass = attrsRaw.replace(/\sclass=(['"])(.*?)\1/i, '');
    const classAttr = mergedClasses.length ? ` class="${mergedClasses.join(' ')}"` : '';
    result.push(`<${outputTag}${attrsWithoutClass}${classAttr}>${outputInnerHtml}</${outputTag}>`);
    previousTag = outputTag;
  }

  return result.join('\n');
}

export function formatTermoHtmlContent(rawHtml: string) {
  const html = rawHtml.trim();
  if (!html) {
    return '<p class="termo-paragraph termo-note">Conteudo do termo vazio.</p>';
  }

  if (typeof DOMParser === 'undefined') {
    return formatTermoHtmlContentWithoutDom(html);
  }

  const parsed = new DOMParser().parseFromString(`<div id="termo-root">${html}</div>`, 'text/html');
  const root = parsed.getElementById('termo-root');
  if (!root) return formatTermoHtmlContentWithoutDom(html);

  let titleCount = 0;

  Array.from(root.children).forEach((node) => {
    if (!isElementNode(node)) return;

    if (node.tagName === 'P') {
      const paragraph = node as HTMLParagraphElement;
      const text = normalizeText(paragraph.textContent);

      if (!text) {
        paragraph.remove();
        return;
      }

      paragraph.classList.add('termo-paragraph');

      if (isUppercaseTitle(text) && titleCount < 3) {
        paragraph.classList.remove('termo-paragraph');
        paragraph.classList.add(
          titleCount === 0 ? 'termo-eyebrow' : titleCount === 1 ? 'termo-title' : 'termo-subtitle'
        );
        titleCount += 1;
        return;
      }

      if (isStandaloneSectionTitle(text)) {
        paragraph.classList.remove('termo-paragraph');
        const heading = replaceElementTag(paragraph, 'h2');
        heading.classList.add('termo-section-title');
        return;
      }

      if (isDateLine(text)) {
        paragraph.classList.add('termo-date-line', 'termo-no-indent');
        return;
      }

      if (isSignatureCaption(text)) {
        paragraph.classList.add('termo-signature-caption', 'termo-no-indent');
        return;
      }

      if (isDataLine(text)) {
        paragraph.classList.add('termo-data-line', 'termo-no-indent');
      }

      if (shouldHighlightClause(text)) {
        decorateClause(paragraph);
      }
      return;
    }

    if (/^H[1-6]$/.test(node.tagName)) {
      node.classList.add('termo-section-title');
      return;
    }

    if (node.tagName === 'UL' || node.tagName === 'OL') {
      node.classList.add('termo-list');
    }
  });

  let foundBodyStart = false;
  Array.from(root.children).forEach((node) => {
    if (!isElementNode(node)) return;
    if (!node.classList.contains('termo-paragraph')) return;

    const previous = node.previousElementSibling as HTMLElement | null;
    if (!foundBodyStart) {
      node.classList.add('termo-no-indent');
      foundBodyStart = true;
      return;
    }

    if (previous?.classList.contains('termo-section-title')) {
      node.classList.add('termo-no-indent');
    }
  });

  return root.innerHTML;
}

type TermoDocumentVariant = 'preview' | 'autentique';

function normalizeForMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildAutentiqueIssuedAtLabel(date: Date = new Date()) {
  const data = formatarDateNaClinica(date, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const hora = formatarDateNaClinica(date, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `Documento preparado para assinatura eletrônica em ${data}, ${hora}.`;
}

function transformAutentiqueRawHtml(rawHtml: string, date: Date = new Date()) {
  const issuedAtLabel = escapeHtml(buildAutentiqueIssuedAtLabel(date));
  let replacedDateLine = false;

  return rawHtml
    .replace(/<p>\s*_{3,}[\s\S]*?20_{2,}\.?\s*<\/p>/gi, () => {
      if (replacedDateLine) {
        return '';
      }
      replacedDateLine = true;
      return `<p>${issuedAtLabel}</p>`;
    })
    .replace(/<p>\s*\(([^<]*(assinatura|carimbo|cpf)[^<]*)\)\s*<\/p>/gi, (_match, content: string) => {
      const normalized = normalizeForMatch(content);
      const isClinicInternal = /socio|administrador|profissional|cirurgiao|dentista|carimbo/.test(normalized)
        && !/paciente|responsavel/.test(normalized);

      if (isClinicInternal) {
        return '<p>Assinatura interna da clínica registrada fora deste fluxo digital.</p>';
      }

      return '<p>Assinatura eletrônica do(a) paciente/responsável via Autentique.</p>';
    });
}

function buildTermoDocumentStyles(variant: TermoDocumentVariant) {
  const variantStyles = variant === 'preview'
    ? `
  @media screen {
    body {
      padding: 20px;
      background: #f8fafc;
    }

    .termo-document {
      max-width: 210mm;
      margin: 0 auto;
      padding: 15mm 16mm 18mm;
      background: #ffffff;
      border-radius: 18px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
    }
  }

  @media print {
    body {
      padding: 0;
      background: #ffffff;
    }

    .termo-document {
      max-width: none;
      margin: 0;
      padding: 0;
      border-radius: 0;
      box-shadow: none;
    }
  }
`
    : `
  body {
    padding: 0;
    background: #ffffff;
  }

  .termo-document {
    max-width: 210mm;
    margin: 0 auto;
    padding: 16mm 17mm 19mm;
    background: #ffffff;
  }
`;

  return `
  :root {
    color-scheme: light;
  }

  @page {
    size: A4;
    margin: 14mm 13mm 17mm;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #0f172a;
  }

  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 10.5pt;
    line-height: 1.42;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .termo-document {
    width: 100%;
  }

${variantStyles}

  .termo-body > :first-child {
    margin-top: 0;
  }

  .termo-body > :last-child {
    margin-bottom: 0;
  }

  p,
  li {
    margin: 0 0 2.4mm;
  }

  img {
    max-width: 100%;
    height: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  p {
    text-align: justify;
    text-wrap: pretty;
    orphans: 3;
    widows: 3;
    word-break: break-word;
  }

  .termo-eyebrow,
  .termo-subtitle {
    margin: 0 0 1.4mm;
    text-align: center;
    text-indent: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8.8pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .termo-title {
    margin: 0 0 4.5mm;
    text-align: center;
    text-indent: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.22;
    text-transform: uppercase;
  }

  .termo-paragraph {
    text-indent: 5mm;
  }

  .termo-no-indent,
  .termo-date-line,
  .termo-signature-caption,
  .termo-data-line {
    text-indent: 0;
  }

  .termo-section-title {
    margin: 5mm 0 2mm;
    padding-top: 1.2mm;
    border-top: 1px solid #cbd5e1;
    text-align: left;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.8pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .termo-clause {
    margin-top: 3.2mm;
  }

  .termo-clause-label {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.7pt;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .termo-date-line {
    margin: 8mm 0 7mm;
    text-align: center;
  }

  .termo-signature-caption {
    margin: 9mm 0 0;
    text-align: center;
    font-size: 9.6pt;
    page-break-inside: avoid;
  }

  .termo-signature-caption::before {
    content: "";
    display: block;
    width: 64mm;
    max-width: 100%;
    margin: 0 auto 2mm;
    border-top: 1px solid #334155;
  }

  .termo-data-line {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.8pt;
  }

  .termo-fill-line {
    display: inline-block;
    min-height: 1.1em;
    vertical-align: baseline;
    border-bottom: 1px solid #475569;
  }

  .termo-fill-line--medium {
    min-width: 58mm;
  }

  .termo-fill-line--long {
    min-width: 95mm;
  }

  .termo-fill-line--short {
    min-width: 28mm;
  }

  .termo-list {
    margin: 0 0 3mm 5mm;
    padding-left: 4mm;
  }

  .termo-note {
    color: #475569;
    font-style: italic;
  }

  strong {
    font-weight: 700;
  }

  .termo-variable {
    font-weight: 700;
    color: #020617;
  }
`;
}

function buildTermoDocument(title: string, rawHtml: string, variant: TermoDocumentVariant) {
  const safeTitle = escapeHtml(title || 'Termo');
  const sourceHtml = variant === 'autentique'
    ? transformAutentiqueRawHtml(rawHtml)
    : rawHtml;
  const bodyHtml = formatTermoHtmlContent(sourceHtml);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>${buildTermoDocumentStyles(variant)}</style>
  </head>
  <body>
    <article class="termo-document">
      <div class="termo-body">${bodyHtml}</div>
    </article>
  </body>
</html>`;
}

export function buildTermoPrintableDocument(title: string, rawHtml: string) {
  return buildTermoDocument(title, rawHtml, 'preview');
}

export function buildTermoAutentiqueDocument(title: string, rawHtml: string) {
  return buildTermoDocument(title, rawHtml, 'autentique');
}
