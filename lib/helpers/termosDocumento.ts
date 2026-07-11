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

export function formatTermoHtmlContent(rawHtml: string) {
  const html = rawHtml.trim();
  if (!html) {
    return '<p class="termo-paragraph termo-note">Conteudo do termo vazio.</p>';
  }

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html;
  }

  const parsed = new DOMParser().parseFromString(`<div id="termo-root">${html}</div>`, 'text/html');
  const root = parsed.getElementById('termo-root');
  if (!root) return html;

  let titleCount = 0;

  Array.from(root.children).forEach((node) => {
    if (!(node instanceof Element)) return;

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
    if (!(node instanceof Element)) return;
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

const TERMO_PRINT_STYLES = `
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

export function buildTermoPrintableDocument(title: string, rawHtml: string) {
  const safeTitle = escapeHtml(title || 'Termo');
  const bodyHtml = formatTermoHtmlContent(rawHtml);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>${TERMO_PRINT_STYLES}</style>
  </head>
  <body>
    <article class="termo-document">
      <div class="termo-body">${bodyHtml}</div>
    </article>
  </body>
</html>`;
}
