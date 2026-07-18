import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { getRequiredRuntimeEnv } from '@/lib/env';
import { garantirTermosDigitaisSchema } from '@/lib/helpers/garantirTermosDigitaisSchema';
import { verifyAutentiqueWebhookSignature } from '@/lib/integrations/autentique/client';
import { TermoDigital, TermoDigitalStatus } from '@/lib/types';

interface AutentiqueWebhookPayload {
  event?: {
    id?: string;
    type?: string;
    created_at?: string;
    data?: {
      object?: Record<string, unknown>;
    };
  };
}

const STATUS_PRIORITY: Record<TermoDigitalStatus, number> = {
  criado: 0,
  visualizado: 1,
  assinado: 2,
  recusado: 2,
  concluido: 3,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function inferDocumentId(eventType: string, eventObject: Record<string, unknown>) {
  if (eventType.startsWith('document.')) {
    return getString(eventObject.id);
  }

  const document = asRecord(eventObject.document);
  return getString(document.id) || getString(eventObject.document_id);
}

function inferSignaturePublicId(eventType: string, eventObject: Record<string, unknown>) {
  if (!eventType.startsWith('signature.')) return null;
  return getString(eventObject.public_id) || getString(eventObject.id);
}

function getCandidateStatus(eventType: string): TermoDigitalStatus | null {
  switch (eventType) {
    case 'signature.created':
      return 'criado';
    case 'signature.viewed':
      return 'visualizado';
    case 'signature.accepted':
      return 'assinado';
    case 'signature.rejected':
      return 'recusado';
    case 'document.finished':
      return 'concluido';
    default:
      return null;
  }
}

function resolveNextStatus(currentStatus: TermoDigitalStatus, eventType: string) {
  const candidate = getCandidateStatus(eventType);
  if (!candidate) return currentStatus;
  if (STATUS_PRIORITY[candidate] < STATUS_PRIORITY[currentStatus]) {
    return currentStatus;
  }
  if (STATUS_PRIORITY[candidate] === STATUS_PRIORITY[currentStatus] && candidate !== currentStatus) {
    return currentStatus;
  }
  return candidate;
}

async function findTermoDigitalForEvent(eventType: string, eventObject: Record<string, unknown>) {
  const signaturePublicId = inferSignaturePublicId(eventType, eventObject);
  if (signaturePublicId) {
    const termoPorAssinatura = await queryOne<TermoDigital>(
      `SELECT * FROM termos_digitais WHERE autentique_signature_public_id = ?`,
      [signaturePublicId]
    );
    if (termoPorAssinatura) return termoPorAssinatura;
  }

  const documentId = inferDocumentId(eventType, eventObject);
  if (!documentId) return null;

  return queryOne<TermoDigital>(
    `SELECT * FROM termos_digitais WHERE autentique_document_id = ?`,
    [documentId]
  );
}

function buildUpdatedTermoDigitalState(
  termo: TermoDigital,
  eventType: string,
  eventObject: Record<string, unknown>,
  eventCreatedAt: string | null
) {
  const nextStatus = resolveNextStatus(termo.status, eventType);
  const files = asRecord(eventObject.files);

  return {
    status: nextStatus,
    viewed_at: termo.viewed_at || (eventType === 'signature.viewed' ? getString(eventObject.viewed) || eventCreatedAt : null),
    signed_at: termo.signed_at || (eventType === 'signature.accepted' ? getString(eventObject.signed) || eventCreatedAt : null),
    rejected_at: termo.rejected_at || (eventType === 'signature.rejected' ? getString(eventObject.rejected) || eventCreatedAt : null),
    finished_at: termo.finished_at || (eventType === 'document.finished' ? getString(eventObject.updated_at) || eventCreatedAt : null),
    pdf_assinado_url: termo.pdf_assinado_url || (eventType === 'document.finished' ? getString(files.signed) : null),
  };
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const secret = getRequiredRuntimeEnv('AUTENTIQUE_WEBHOOK_SECRET');
    const signature = request.headers.get('x-autentique-signature');

    if (!verifyAutentiqueWebhookSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Assinatura do webhook inválida.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as AutentiqueWebhookPayload;
    const event = payload.event;
    const eventId = getString(event?.id);
    const eventType = getString(event?.type);
    const eventCreatedAt = getString(event?.created_at);
    const eventObject = asRecord(event?.data?.object);

    if (!eventId || !eventType) {
      return NextResponse.json({ error: 'Payload do webhook inválido.' }, { status: 400 });
    }

    await garantirTermosDigitaisSchema();

    const existingEvent = await queryOne<{ id: number }>(
      'SELECT id FROM autentique_webhook_events WHERE event_id = ?',
      [eventId]
    );

    if (existingEvent) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const termoDigital = await findTermoDigitalForEvent(eventType, eventObject);
    const objectId = inferSignaturePublicId(eventType, eventObject) || inferDocumentId(eventType, eventObject);

    await execute(
      `INSERT INTO autentique_webhook_events (event_id, event_type, object_id, termo_digital_id, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
      [eventId, eventType, objectId, termoDigital?.id ?? null, rawBody]
    );

    if (termoDigital) {
      const updatedState = buildUpdatedTermoDigitalState(termoDigital, eventType, eventObject, eventCreatedAt);
      await execute(
        `UPDATE termos_digitais
            SET status = ?,
                pdf_assinado_url = ?,
                viewed_at = ?,
                signed_at = ?,
                rejected_at = ?,
                finished_at = ?,
                updated_at = COALESCE(?, updated_at)
          WHERE id = ?`,
        [
          updatedState.status,
          updatedState.pdf_assinado_url,
          updatedState.viewed_at,
          updatedState.signed_at,
          updatedState.rejected_at,
          updatedState.finished_at,
          eventCreatedAt,
          termoDigital.id,
        ]
      );
    }

    await execute(
      `UPDATE autentique_webhook_events
          SET processed_at = COALESCE(?, processed_at),
              termo_digital_id = COALESCE(?, termo_digital_id)
        WHERE event_id = ?`,
      [eventCreatedAt, termoDigital?.id ?? null, eventId]
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Erro ao processar webhook do Autentique:', error);
    return NextResponse.json({ error: 'Erro ao processar webhook do Autentique.' }, { status: 500 });
  }
}
