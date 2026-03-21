/**
 * ProntuarioEditor — editor de prontuário com textarea, botão salvar e histórico.
 * Usa Textarea, Button, Alert (Sprint 1).
 */

'use client';

import { useState } from 'react';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { formatarDataCompleta } from '@/lib/utils/formatters';

export interface ProntuarioEntry {
  id: number;
  texto: string;
  autor_nome: string;
  created_at: string;
}

export interface ProntuarioEditorProps {
  entries: ProntuarioEntry[];
  onSave: (texto: string) => Promise<void>;
  loading?: boolean;
  error?: string;
  minLength?: number;
  placeholder?: string;
  className?: string;
}

export default function ProntuarioEditor({
  entries,
  onSave,
  loading = false,
  error,
  minLength = 10,
  placeholder = 'Descreva observações clínicas, procedimentos realizados, etc.',
  className = '',
}: ProntuarioEditorProps) {
  const [texto, setTexto] = useState('');

  const handleSave = async () => {
    if (texto.length < minLength) return;
    await onSave(texto);
    setTexto('');
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {error && <Alert type="error">{error}</Alert>}

      <Textarea
        label="Nova entrada"
        name="prontuario"
        value={texto}
        onChange={setTexto}
        rows={4}
        minLength={minLength}
        placeholder={placeholder}
        disabled={loading}
      />

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          loading={loading}
          disabled={texto.length < minLength}
        >
          Salvar Entrada
        </Button>
      </div>

      {/* Histórico */}
      {entries.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold text-neutral-700">Histórico</h3>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="p-3 bg-surface-secondary rounded-lg border border-border"
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-medium text-foreground">
                  {entry.autor_nome}
                </span>
                <span className="text-xs text-muted">
                  {formatarDataCompleta(entry.created_at)}
                </span>
              </div>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                {entry.texto}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
