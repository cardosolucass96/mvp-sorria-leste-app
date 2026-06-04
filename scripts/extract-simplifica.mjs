#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'https://gestao.simplificagestao.com.br';
const LOGIN_URL = `${BASE_URL}/ords/r/gestao/app/login`;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'tmp/migration/output');
const CLIENTS_PAGE_CS =
  '1IUSvl7_KQmQsSB5C34lu7xyvEX4_JRSJATnMybJkDi59Y8h86AFzfBN2btMIuJWcJRpIyTAY_VUlIL1nrEYiTA';

const FALLBACK_CLIENT_REPORT = {
  ajaxIdentifier:
    'UkVHSU9OIFRZUEV-fjEzMzQzNzcxMzY4MTkzMjM0MA/tp1BeV75Qz4v2XNPvoahO8z0KIxgPxkbOPTs0uZCSANtAFyzfAXhRKNWpraT77QRh94gn-HTBQsbCP2VhQhEZg',
  internalRegionId: '133437713681932340',
  regionStaticId: 'rgionPessoas',
};

const TRACKER_PATTERNS = [
  /connect\.facebook\.net/i,
  /facebook\.com\/tr/i,
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /tawk\.to/i,
];

const PRONTUARIO_REGION_LABELS = {
  rgEvolucao: 'Evolucao',
  rgAnamnese: 'Anamnese',
  rgPrescricao: 'Prescricao',
  rgAtestado: 'Atestado',
  rgLaudo: 'Laudo',
  rgPedidoExames: 'PedidoExames',
  rgOrientacao: 'Orientacao',
  rgOdontograma: 'Odontograma',
  rgAnexos: 'Anexos',
  rgConsultas: 'Consultas',
  rgOportunidades: 'Oportunidades',
  rgFinanceiro: 'Financeiro',
  rgContrato: 'Contrato',
};

function parseArgs(argv) {
  const args = {
    headless: true,
    resume: true,
    downloadFiles: true,
    saveHtml: false,
    limitClients: null,
    limitPages: null,
    outputDir: DEFAULT_OUTPUT_DIR,
    slowMo: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.trim();
    const value = inlineValue !== undefined ? inlineValue : argv[i + 1];
    const consumesNext = inlineValue === undefined && value !== undefined && !value.startsWith('--');

    switch (key) {
      case 'user':
        args.user = value;
        break;
      case 'password':
        args.password = value;
        break;
      case 'output-dir':
        args.outputDir = path.resolve(value);
        break;
      case 'headless':
        args.headless = parseBoolean(value);
        break;
      case 'resume':
        args.resume = parseBoolean(value);
        break;
      case 'download-files':
        args.downloadFiles = parseBoolean(value);
        break;
      case 'save-html':
        args.saveHtml = parseBoolean(value);
        break;
      case 'limit-clients':
        args.limitClients = parseOptionalInt(value);
        break;
      case 'limit-pages':
        args.limitPages = parseOptionalInt(value);
        break;
      case 'slow-mo':
        args.slowMo = parseOptionalInt(value) || 0;
        break;
      default:
        throw new Error(`Argumento desconhecido: --${key}`);
    }

    if (consumesNext) {
      i += 1;
    }
  }

  args.user = args.user || process.env.SIMPLIFICA_USER;
  args.password = args.password || process.env.SIMPLIFICA_PASSWORD;

  if (!args.user || !args.password) {
    throw new Error(
      'Informe as credenciais com --user/--password ou SIMPLIFICA_USER/SIMPLIFICA_PASSWORD.'
    );
  }

  return args;
}

function parseBoolean(value) {
  if (value === undefined) {
    return true;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'sim', 's'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'nao', 'não'].includes(normalized)) {
    return false;
  }
  throw new Error(`Valor booleano invalido: ${value}`);
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Valor inteiro invalido: ${value}`);
  }
  return parsed;
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function sanitizeSegment(value, fallback = 'item') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return normalized || fallback;
}

function decodePaginationHref(href) {
  if (!href) {
    return null;
  }
  const cleaned = href.replace(/^#action\$paginate\?/, '');
  const params = new URLSearchParams(cleaned);
  const min = Number.parseInt(params.get('min') || '', 10);
  const max = Number.parseInt(params.get('max') || '', 10);
  const fetched = Number.parseInt(params.get('fetched') || '', 10);
  if ([min, max, fetched].some((value) => Number.isNaN(value))) {
    return null;
  }
  return { min, max, fetched };
}

function attachmentScopePath(scope, clientId, fileName) {
  return path.join(scope, String(clientId), sanitizeSegment(fileName, 'arquivo'));
}

async function fileExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(targetPath, data) {
  await ensureDir(path.dirname(targetPath));
  await fsp.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function appendJsonLine(targetPath, data) {
  await ensureDir(path.dirname(targetPath));
  await fsp.appendFile(targetPath, `${JSON.stringify(data)}\n`, 'utf8');
}

async function loadState(outputDir) {
  const statePath = path.join(outputDir, 'state.json');
  if (!(await fileExists(statePath))) {
    return {
    version: 1,
    startedAt: new Date().toISOString(),
    updatedAt: null,
    pageIndex: 1,
    currentCursor: null,
    processedClients: 0,
    downloadedFiles: 0,
    lastClientId: null,
    };
  }

  return JSON.parse(await fsp.readFile(statePath, 'utf8'));
}

async function saveState(outputDir, state) {
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(path.join(outputDir, 'state.json'), nextState);
}

async function loadProcessedClientIds(clientsDir) {
  const processed = new Set();
  if (!(await fileExists(clientsDir))) {
    return processed;
  }

  for (const entry of await fsp.readdir(clientsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
      const manifestPath = path.join(clientsDir, entry.name, 'client.json');
      if (await fileExists(manifestPath)) {
        processed.add(entry.name);
      }
    }
  }

  return processed;
}

async function configureContext(context) {
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (TRACKER_PATTERNS.some((pattern) => pattern.test(url))) {
      await route.abort();
      return;
    }
    await route.continue();
  });
}

async function login(page, user, password) {
  page.setDefaultTimeout(30_000);
  await page.goto(LOGIN_URL, { waitUntil: 'commit' });
  await page.waitForSelector('#P9999_USERNAME');
  await page.fill('#P9999_USERNAME', user);
  await page.fill('#P9999_PASSWORD', password);

  const hasApexSubmit = await page
    .waitForFunction(
      () => Boolean(window.apex && typeof window.apex.submit === 'function'),
      null,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);

  if (hasApexSubmit) {
    await page.evaluate(() => apex.submit({ request: 'LOGIN', validate: true }));
  } else {
    await page.locator('#btn_login').click({ force: true });
  }

  await page.waitForFunction(() => !window.location.pathname.includes('/app/login'), null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(1_500);

  if (page.url().includes('/login')) {
    const alertText = await page.locator('.t-Alert').innerText().catch(() => '');
    throw new Error(`Login nao saiu da tela inicial. ${alertText}`.trim());
  }

  const session = new URL(page.url()).searchParams.get('session');
  if (!session) {
    throw new Error(`Nao consegui identificar a sessao apos o login: ${page.url()}`);
  }

  return {
    url: page.url(),
    title: await page.title(),
    session,
  };
}

function buildClientsListUrl(session) {
  return `${BASE_URL}/ords/r/gestao/app/leads?p3_tipo_pessoa=C&p3_breadcrumb=Cliente&session=${session}&cs=${CLIENTS_PAGE_CS}`;
}

async function getClientsReportConfig(page) {
  const html = await page.content();
  const match = html.match(
    /apex\.widget\.report\.init\("rgionPessoas","([^"]+)",\{[^}]*"internalRegionId":"([^"]+)"/
  );

  if (!match) {
    return FALLBACK_CLIENT_REPORT;
  }

  return {
    ajaxIdentifier: match[1],
    internalRegionId: match[2],
    regionStaticId: 'rgionPessoas',
  };
}

async function openClientsList(page, clientsUrl) {
  await page.goto(clientsUrl, { waitUntil: 'commit' });
  await page.waitForFunction(
    () => document.querySelectorAll('#report_rgionPessoas tbody tr').length > 0,
    null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(1_000);
}

async function jumpToCursor(page, reportConfig, cursor) {
  if (!cursor) {
    return;
  }

  const firstClientId = await page.evaluate(() => {
    const link = document.querySelector('#report_rgionPessoas a[href*="p11_id="]');
    if (!link) {
      return null;
    }
    const url = new URL(link.href, window.location.origin);
    return url.searchParams.get('p11_id');
  });

  await page.evaluate(
    ({ report, nextCursor }) => {
      apex.widget.report.paginate(report.internalRegionId, report.ajaxIdentifier, {
        min: nextCursor.min,
        max: nextCursor.max,
        fetched: nextCursor.fetched,
      });
    },
    { report: reportConfig, nextCursor: cursor }
  );

  await page.waitForFunction(
    (previousId) => {
      const link = document.querySelector('#report_rgionPessoas a[href*="p11_id="]');
      if (!link) {
        return false;
      }
      const url = new URL(link.href, window.location.origin);
      return url.searchParams.get('p11_id') !== previousId;
    },
    firstClientId,
    { timeout: 30_000 }
  );

  await page.waitForTimeout(1_000);
}

async function extractListPage(page) {
  return page.evaluate(() => {
    const normalize = (value) =>
      (value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();

    const rows = Array.from(document.querySelectorAll('#report_rgionPessoas tbody tr')).map(
      (row) => {
        const link = row.querySelector('a[href*="detalhes-pessoa"]');
        if (!link) {
          return null;
        }

        const url = new URL(link.href, window.location.origin);
        const cell = (header) => row.querySelector(`td[headers="${header}"]`);

        return {
          id: url.searchParams.get('p11_id'),
          name: normalize(link.textContent),
          detailUrl: url.href,
          contato: normalize(cell('EMAIL')?.innerText),
          origem: normalize(cell('ORIGEM')?.innerText),
          consultor: normalize(cell('NOME_CONSULTOR')?.innerText),
          criadoEm: normalize(cell('CRIADO_EM')?.innerText),
        };
      }
    ).filter(Boolean);

    const nextHref =
      document.querySelector('.t-Report-paginationLink--next')?.getAttribute('href') || null;
    const paginationText =
      document.querySelector('.t-Report-paginationText')?.textContent?.trim() || null;

    return {
      rows,
      nextHref,
      paginationText,
    };
  });
}

async function goToNextClientsPage(page, reportConfig, nextCursor) {
  const previousFirstId = await page.evaluate(() => {
    const link = document.querySelector('#report_rgionPessoas a[href*="p11_id="]');
    if (!link) {
      return null;
    }
    const url = new URL(link.href, window.location.origin);
    return url.searchParams.get('p11_id');
  });

  await page.evaluate(
    ({ report, cursor }) => {
      apex.widget.report.paginate(report.internalRegionId, report.ajaxIdentifier, {
        min: cursor.min,
        max: cursor.max,
        fetched: cursor.fetched,
      });
    },
    { report: reportConfig, cursor: nextCursor }
  );

  await page.waitForFunction(
    (oldId) => {
      const link = document.querySelector('#report_rgionPessoas a[href*="p11_id="]');
      if (!link) {
        return false;
      }
      const url = new URL(link.href, window.location.origin);
      return url.searchParams.get('p11_id') !== oldId;
    },
    previousFirstId,
    { timeout: 30_000 }
  );

  await page.waitForTimeout(1_000);
}

async function extractDetailPage(page, detailUrl, saveHtml) {
  await page.goto(detailUrl, { waitUntil: 'commit' });
  await page.waitForFunction(() => Boolean(document.querySelector('#P11_ID')), null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(1_000);

  const data = await page.evaluate(() => {
    const normalize = (value) =>
      (value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();

    const collectInputs = (prefix) => {
      const values = {};
      for (const element of document.querySelectorAll(`[name^="${prefix}"]`)) {
        const name = element.getAttribute('name');
        if (!name || Object.prototype.hasOwnProperty.call(values, name)) {
          continue;
        }

        if (element.type === 'checkbox') {
          values[name] = element.checked
            ? element.value
            : element.getAttribute('data-unchecked-value') || '';
        } else {
          values[name] = element.value || '';
        }
      }
      return values;
    };

    const collectAttachments = () =>
      Array.from(document.querySelectorAll('#ANEXOS_REGION .gallery-card')).map((card) => {
        const thumb = card.querySelector('[data-url]');
        const view = card.querySelector('.gallery-view');
        const download = card.querySelector('.gallery-download');
        const name = normalize(card.querySelector('.gallery-name')?.textContent);
        return {
          id: thumb?.dataset.id || null,
          url: download?.href || view?.dataset.url || thumb?.dataset.url || null,
          name,
          mime: view?.dataset.mime || thumb?.dataset.mime || null,
        };
      });

    const collectRegions = () =>
      Array.from(document.querySelectorAll('.t-Region[role="region"]'))
        .map((region) => ({
          id: region.id || null,
          label:
            normalize(region.querySelector('.t-Region-title')?.textContent) ||
            normalize(region.getAttribute('aria-label')),
          text: normalize(region.innerText),
        }))
        .filter((region) => region.label && region.text);

    const prontuarioLink = Array.from(document.querySelectorAll('a[href*="p106_cliente_id="]'))
      .map((link) => link.href)
      .find(Boolean);

    const timelineText = normalize(document.querySelector('#my-lead-timeline')?.innerText);

    return {
      pageUrl: window.location.href,
      pageTitle: document.title,
      inputs: collectInputs('P11_'),
      attachments: collectAttachments(),
      regions: collectRegions(),
      breadcrumb: normalize(document.querySelector('.t-Breadcrumb-label')?.innerText),
      timelineText,
      prontuarioUrl: prontuarioLink || null,
    };
  });

  if (saveHtml) {
    data.html = await page.content();
  }

  return data;
}

async function extractProntuarioPage(page, prontuarioUrl, saveHtml) {
  await page.goto(prontuarioUrl, { waitUntil: 'commit' });
  await page.waitForFunction(() => Boolean(document.querySelector('#P106_CLIENTE_ID')), null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(1_000);

  const data = await page.evaluate((regionLabels) => {
    const normalize = (value) =>
      (value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();

    const collectInputs = (prefix) => {
      const values = {};
      for (const element of document.querySelectorAll(`[name^="${prefix}"]`)) {
        const name = element.getAttribute('name');
        if (!name || Object.prototype.hasOwnProperty.call(values, name)) {
          continue;
        }

        if (element.type === 'checkbox') {
          values[name] = element.checked
            ? element.value
            : element.getAttribute('data-unchecked-value') || '';
        } else {
          values[name] = element.value || '';
        }
      }
      return values;
    };

    const collectAttachments = () =>
      Array.from(document.querySelectorAll('#ANEXOS_REGION .gallery-card')).map((card) => {
        const thumb = card.querySelector('[data-url]');
        const view = card.querySelector('.gallery-view');
        const download = card.querySelector('.gallery-download');
        const name = normalize(card.querySelector('.gallery-name')?.textContent);
        return {
          id: thumb?.dataset.id || null,
          url: download?.href || view?.dataset.url || thumb?.dataset.url || null,
          name,
          mime: view?.dataset.mime || thumb?.dataset.mime || null,
        };
      });

    const regionTexts = Object.entries(regionLabels)
      .map(([id, label]) => {
        const region = document.getElementById(id);
        if (!region) {
          return null;
        }
        return {
          id,
          label,
          text: normalize(region.innerText),
        };
      })
      .filter(Boolean);

    return {
      pageUrl: window.location.href,
      pageTitle: document.title,
      inputs: collectInputs('P106_'),
      attachments: collectAttachments(),
      regions: regionTexts,
      documentTimelineText: normalize(document.querySelector('#my-doc-timeline')?.innerText),
    };
  }, PRONTUARIO_REGION_LABELS);

  if (saveHtml) {
    data.html = await page.content();
  }

  return data;
}

async function downloadFile(url, outputPath) {
  if (!url) {
    return {
      status: 'missing_url',
      outputPath,
    };
  }

  await ensureDir(path.dirname(outputPath));

  if (await fileExists(outputPath)) {
    return {
      status: 'skipped_existing',
      outputPath,
    };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(outputPath, buffer);

  return {
    status: 'downloaded',
    outputPath,
    bytes: buffer.length,
  };
}

async function processAttachments(attachments, baseDir, scope, clientId, downloadFiles) {
  const results = [];

  for (const attachment of attachments || []) {
    const fileName = attachment.name || `${attachment.id || 'arquivo'}`;
    const relativePath = attachmentScopePath(scope, clientId, fileName);
    const outputPath = path.join(baseDir, 'files', relativePath);
    let download = null;

    if (downloadFiles) {
      try {
        download = await downloadFile(attachment.url, outputPath);
      } catch (error) {
        download = {
          status: 'error',
          outputPath,
          error: error.message,
        };
      }
    }

    results.push({
      ...attachment,
      relativePath,
      download,
    });
  }

  return results;
}

async function processClient(detailPage, row, options) {
  const clientDir = path.join(options.outputDir, 'clients', String(row.id));
  await ensureDir(clientDir);

  const detail = await extractDetailPage(detailPage, row.detailUrl, options.saveHtml);
  const detailAttachments = await processAttachments(
    detail.attachments,
    options.outputDir,
    'pessoa',
    row.id,
    options.downloadFiles
  );

  let prontuario = null;
  let prontuarioAttachments = [];

  if (detail.prontuarioUrl) {
    prontuario = await extractProntuarioPage(detailPage, detail.prontuarioUrl, options.saveHtml);
    prontuarioAttachments = await processAttachments(
      prontuario.attachments,
      options.outputDir,
      'prontuario',
      row.id,
      options.downloadFiles
    );
  }

  const manifest = {
    extractedAt: new Date().toISOString(),
    client: row,
    detail: {
      ...detail,
      attachments: detailAttachments,
    },
    prontuario: prontuario
      ? {
          ...prontuario,
          attachments: prontuarioAttachments,
        }
      : null,
  };

  if (options.saveHtml) {
    if (detail.html) {
      await fsp.writeFile(path.join(clientDir, 'detalhes.html'), detail.html, 'utf8');
      delete manifest.detail.html;
    }
    if (prontuario?.html) {
      await fsp.writeFile(path.join(clientDir, 'prontuario.html'), prontuario.html, 'utf8');
      delete manifest.prontuario.html;
    }
  }

  await writeJson(path.join(clientDir, 'client.json'), manifest);

  return {
    manifest,
    downloadedFiles:
      detailAttachments.filter((item) => item.download?.status === 'downloaded').length +
      prontuarioAttachments.filter((item) => item.download?.status === 'downloaded').length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDirSync(options.outputDir);

  const state = await loadState(options.outputDir);
  const processedClientIds = await loadProcessedClientIds(path.join(options.outputDir, 'clients'));

  const browser = await chromium.launch({
    headless: options.headless,
    slowMo: options.slowMo || undefined,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });

  await configureContext(context);

  const authPage = await context.newPage();
  const loginResult = await login(authPage, options.user, options.password);
  const clientsUrl = buildClientsListUrl(loginResult.session);

  const reportConfig = FALLBACK_CLIENT_REPORT;
  const listPage = await context.newPage();
  const detailPage = await context.newPage();

  await openClientsList(listPage, clientsUrl);
  const liveReportConfig = await getClientsReportConfig(listPage);

  let pageIndex = options.resume ? state.pageIndex || 1 : 1;
  let currentPageCursor = options.resume ? state.currentCursor || state.nextCursor || null : null;

  if (currentPageCursor) {
    await jumpToCursor(listPage, liveReportConfig || reportConfig, currentPageCursor);
  }
  let processedThisRun = 0;
  let attemptedThisRun = 0;
  let stop = false;

  while (!stop) {
    state.pageIndex = pageIndex;
    state.currentCursor = currentPageCursor;
    await saveState(options.outputDir, state);

    const pageData = await extractListPage(listPage);
    const nextCursor = decodePaginationHref(pageData.nextHref);
    let stoppedMidPage = false;

    for (const row of pageData.rows) {
      if (!row.id) {
        continue;
      }

      if (options.resume && processedClientIds.has(String(row.id))) {
        continue;
      }

      attemptedThisRun += 1;

      try {
        const result = await processClient(detailPage, row, options);
        processedClientIds.add(String(row.id));
        processedThisRun += 1;
        state.processedClients += 1;
        state.downloadedFiles += result.downloadedFiles;
        state.lastClientId = row.id;

        await appendJsonLine(path.join(options.outputDir, 'clients.jsonl'), {
          id: row.id,
          name: row.name,
          detailUrl: row.detailUrl,
          extractedAt: new Date().toISOString(),
        });
      } catch (error) {
        await appendJsonLine(path.join(options.outputDir, 'errors.jsonl'), {
          id: row.id,
          name: row.name,
          detailUrl: row.detailUrl,
          error: error.message,
          stack: error.stack,
          at: new Date().toISOString(),
        });
      }

      if (options.limitClients && attemptedThisRun >= options.limitClients) {
        stop = true;
        stoppedMidPage = true;
        break;
      }
    }

    if (stop) {
      if (!stoppedMidPage && nextCursor) {
        state.currentCursor = nextCursor;
        state.pageIndex = pageIndex + 1;
      }
      await saveState(options.outputDir, state);
      break;
    }

    if (!nextCursor) {
      state.currentCursor = null;
      await saveState(options.outputDir, state);
      break;
    }

    if (options.limitPages && pageIndex >= options.limitPages) {
      state.currentCursor = nextCursor;
      state.pageIndex = pageIndex + 1;
      await saveState(options.outputDir, state);
      break;
    }

    await goToNextClientsPage(listPage, liveReportConfig || reportConfig, nextCursor);
    currentPageCursor = nextCursor;
    pageIndex += 1;
  }

  await browser.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputDir: options.outputDir,
        processedThisRun,
        totalProcessed: state.processedClients,
        downloadedFiles: state.downloadedFiles,
        currentCursor: state.currentCursor,
      },
      null,
      2
    )
  );
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
