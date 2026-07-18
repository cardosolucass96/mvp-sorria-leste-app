import { createHmac, timingSafeEqual } from 'node:crypto';
import { getOptionalRuntimeEnv, getRequiredRuntimeEnv } from '@/lib/env';

const AUTENTIQUE_GRAPHQL_URL = 'https://api.autentique.com.br/v2/graphql';

interface AutentiqueGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface CreateDocumentResponse {
  createDocument: {
    id: string;
    name: string;
    signatures: Array<{
      public_id: string;
      action?: {
        name?: string | null;
      } | null;
      link?: {
        short_link?: string | null;
      } | null;
    }>;
  };
}

interface CreateSignatureLinkResponse {
  createLinkToSignature: {
    short_link: string;
  };
}

export interface AutentiqueSignerPayload {
  name: string;
  cpf?: string | null;
}

export interface AutentiqueCreateDocumentPayload {
  title: string;
  html: string;
  signer: AutentiqueSignerPayload;
  folderId?: string | null;
}

export interface AutentiqueCreatedDocument {
  documentId: string;
  signaturePublicId: string;
  shortLink: string;
}

function buildAuthorizationHeader() {
  return {
    Authorization: `Bearer ${getRequiredRuntimeEnv('AUTENTIQUE_API_TOKEN')}`,
  };
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'termo';
}

function normalizeCpf(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || undefined;
}

async function parseAutentiqueResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as AutentiqueGraphqlResponse<T>;
  if (!response.ok) {
    const message = data.errors?.map((error) => error.message).filter(Boolean).join(' | ')
      || `Autentique retornou HTTP ${response.status}`;
    throw new Error(message);
  }

  if (data.errors?.length) {
    throw new Error(data.errors.map((error) => error.message).filter(Boolean).join(' | ') || 'Erro GraphQL no Autentique.');
  }

  if (!data.data) {
    throw new Error('Resposta do Autentique sem payload de dados.');
  }

  return data.data;
}

async function executeAutentiqueGraphql<T>(query: string, variables: Record<string, unknown>) {
  const response = await fetch(AUTENTIQUE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthorizationHeader(),
    },
    body: JSON.stringify({ query, variables }),
  });

  return parseAutentiqueResponse<T>(response);
}

function normalizeUnitName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getAutentiqueFolderIdForUnit(unitName: string | null | undefined) {
  const normalized = normalizeUnitName(unitName);
  if (!normalized) return null;

  if (normalized === 'vila uniao') {
    return getOptionalRuntimeEnv('AUTENTIQUE_FOLDER_ID_VILA_UNIAO');
  }

  if (normalized === 'barra do ceara') {
    return getOptionalRuntimeEnv('AUTENTIQUE_FOLDER_ID_BARRA_DO_CEARA');
  }

  if (normalized === 'pirambu') {
    return getOptionalRuntimeEnv('AUTENTIQUE_FOLDER_ID_PIRAMBU');
  }

  return null;
}

async function createDocument(title: string, html: string, signer: AutentiqueSignerPayload, folderId?: string | null) {
  const hasFolderId = Boolean(folderId);
  const folderVariableDefinition = hasFolderId ? ',\n      $folder_id: UUID' : '';
  const folderArgument = hasFolderId ? '\n        folder_id: $folder_id' : '';
  const mutation = `
    mutation CreateDocumentMutation(
      $document: DocumentInput!,
      $signers: [SignerInput!]!,
      $file: Upload!${folderVariableDefinition}
    ) {
      createDocument(
        document: $document,
        signers: $signers,
        file: $file${folderArgument}
      ) {
        id
        name
        signatures {
          public_id
          action {
            name
          }
          link {
            short_link
          }
        }
      }
    }
  `;

  const formData = new FormData();
  formData.set('operations', JSON.stringify({
    query: mutation,
    variables: {
      document: { name: title },
      ...(hasFolderId ? { folder_id: folderId } : {}),
      signers: [
        {
          name: signer.name,
          delivery_method: 'DELIVERY_METHOD_LINK',
          action: 'SIGN',
          ...(normalizeCpf(signer.cpf) ? { configs: { cpf: normalizeCpf(signer.cpf) } } : {}),
        },
      ],
      file: null,
    },
  }));
  formData.set('map', JSON.stringify({ '0': ['variables.file'] }));
  formData.set(
    '0',
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `${sanitizeFileName(title)}.html`
  );

  const response = await fetch(AUTENTIQUE_GRAPHQL_URL, {
    method: 'POST',
    headers: buildAuthorizationHeader(),
    body: formData,
  });

  return parseAutentiqueResponse<CreateDocumentResponse>(response);
}

export async function createAutentiqueSignatureLink(publicId: string) {
  const data = await executeAutentiqueGraphql<CreateSignatureLinkResponse>(
    `
      mutation CreateSignatureLinkMutation($public_id: UUID!) {
        createLinkToSignature(public_id: $public_id) {
          short_link
        }
      }
    `,
    { public_id: publicId }
  );

  const shortLink = data.createLinkToSignature?.short_link;
  if (!shortLink) {
    throw new Error('Autentique não retornou o link curto de assinatura.');
  }

  return shortLink;
}

export async function createAutentiqueDocumentFromHtml(payload: AutentiqueCreateDocumentPayload): Promise<AutentiqueCreatedDocument> {
  const created = await createDocument(payload.title, payload.html, payload.signer, payload.folderId);
  const documentId = created.createDocument?.id;
  const signature = created.createDocument?.signatures?.find((item) => item.action?.name)
    ?? created.createDocument?.signatures?.find((item) => item.link?.short_link)
    ?? created.createDocument?.signatures?.[0];
  const signaturePublicId = signature?.public_id;

  if (!documentId || !signaturePublicId) {
    throw new Error('Autentique não retornou o documento ou o signatário criado.');
  }

  const shortLink = signature?.link?.short_link || await createAutentiqueSignatureLink(signaturePublicId);

  return {
    documentId,
    signaturePublicId,
    shortLink,
  };
}

export function verifyAutentiqueWebhookSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;

  const calculatedSignature = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(calculatedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    return false;
  }
}
