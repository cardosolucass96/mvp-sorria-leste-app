/**
 * AnexosGallery — galeria de anexos com upload, preview e delete.
 * Usa Button, Modal, EmptyState, ConfirmDialog (Sprint 1).
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export interface AnexoData {
  id: number;
  nome: string;
  url: string;
  tipo: string;
  tamanho: number;
  created_at: string;
  descricao?: string | null;
}

export interface AnexoUploadData {
  file: File;
  titulo?: string;
  descricao?: string;
}

export interface AnexosGalleryProps {
  anexos: AnexoData[];
  onUpload: (upload: AnexoUploadData) => Promise<void>;
  onDelete: (anexo: AnexoData) => Promise<void>;
  onUpdate?: (anexo: AnexoData, data: { titulo?: string; descricao?: string }) => Promise<void>;
  loading?: boolean;
  uploading?: boolean;
  maxSizeMB?: number;
  acceptTypes?: string;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(tipo: string): boolean {
  return tipo.startsWith('image/');
}

export default function AnexosGallery({
  anexos,
  onUpload,
  onDelete,
  onUpdate,
  loading = false,
  uploading = false,
  maxSizeMB = 5,
  acceptTypes = 'image/*,.pdf',
  className = '',
}: AnexosGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewAnexo, setPreviewAnexo] = useState<AnexoData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnexoData | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    setEditTitulo(previewAnexo?.nome ?? '');
    setEditDescricao(previewAnexo?.descricao ?? '');
  }, [previewAnexo]);

  const handleUploadFile = async (file?: File) => {
    if (!file) return;

    setUploadError('');

    if (file.size > maxSizeMB * 1024 * 1024) {
      setUploadError(`Arquivo muito grande. Máximo: ${maxSizeMB}MB`);
      return;
    }

    await onUpload({
      file,
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    await handleUploadFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    await handleUploadFile(file);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await onDelete(deleteTarget);
    setDeleteTarget(null);
  };

  const handleSaveEdit = async () => {
    if (!previewAnexo || !onUpdate) return;
    setIsSavingEdit(true);
    try {
      const titulo = editTitulo.trim();
      const descricao = editDescricao.trim();
      await onUpdate(previewAnexo, {
        titulo: titulo || undefined,
        descricao: descricao || undefined,
      });
      setPreviewAnexo({
        ...previewAnexo,
        nome: titulo || previewAnexo.nome,
        descricao: descricao || null,
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload */}
      <div className="space-y-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer",
            isDragOver
              ? "border-primary-500 bg-primary-500/10"
              : "border-border bg-muted/30 hover:bg-muted/50",
            (loading || uploading) && "pointer-events-none opacity-60"
          )}
        >
          <div className="space-y-2">
            <p className="text-base font-medium text-foreground">Solte um arquivo aqui</p>
            <p className="text-sm text-muted-foreground">
              Ou clique para selecionar uma foto, documento ou v&iacute;deo
            </p>
            {uploading && (
              <p className="text-sm font-medium text-primary-600">Enviando arquivo...</p>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptTypes}
          onChange={handleFileSelect}
          className="hidden"
        />
        {uploadError && (
          <span className="text-sm text-error-600">{uploadError}</span>
        )}
      </div>

      {/* Gallery */}
      {anexos.length === 0 ? (
        <EmptyState
          icon="📎"
          title="Nenhum anexo"
          description="Adicione fotos ou documentos clicando no botão acima"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {anexos.map((anexo) => (
            <div
              key={anexo.id}
              className="relative group rounded-lg border border-border overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setPreviewAnexo(anexo)}
            >
              {isImage(anexo.tipo) ? (
                <img
                  src={anexo.url}
                  alt={anexo.nome}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center bg-muted">
                  <span className="text-3xl">📄</span>
                </div>
              )}

              <div className="p-2">
                <p className="text-xs font-medium text-foreground truncate">{anexo.nome}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(anexo.tamanho)}</p>
                {anexo.descricao && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {anexo.descricao}
                  </p>
                )}
              </div>

              {/* Delete button overlay */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(anexo);
                }}
                className="absolute top-1 right-1 w-6 h-6 bg-error-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                aria-label={`Excluir ${anexo.nome}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewAnexo && (
        <Modal
          isOpen={!!previewAnexo}
          onClose={() => setPreviewAnexo(null)}
          title={editTitulo.trim() || previewAnexo.nome}
          size="lg"
        >
          <div className="space-y-4">
            {isImage(previewAnexo.tipo) ? (
              <img
                src={previewAnexo.url}
                alt={previewAnexo.nome}
                className="w-full rounded-lg"
              />
            ) : (
              <div className="text-center py-8">
                <span className="text-5xl mb-4 block">📄</span>
                <p className="text-muted-foreground">{previewAnexo.nome}</p>
                <p className="text-sm text-muted-foreground">{formatFileSize(previewAnexo.tamanho)}</p>
                <a
                  href={previewAnexo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block text-info-600 hover:text-info-600 dark:text-info-400 font-medium"
                >
                  Abrir arquivo →
                </a>
              </div>
            )}

            {onUpdate && (
              <div className="space-y-3 border-t border-border pt-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Titulo
                  </label>
                  <input
                    type="text"
                    value={editTitulo}
                    onChange={(e) => setEditTitulo(e.target.value)}
                    className="input w-full"
                    placeholder="Nome do anexo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Descricao
                  </label>
                  <textarea
                    value={editDescricao}
                    onChange={(e) => setEditDescricao(e.target.value)}
                    rows={3}
                    className="input w-full resize-none"
                    placeholder="Descreva este anexo"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveEdit}
                    loading={isSavingEdit}
                    disabled={isSavingEdit}
                  >
                    Salvar alteracoes
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Excluir Anexo"
        message={`Deseja excluir "${deleteTarget?.nome}"? Esta ação não pode ser desfeita.`}
        type="danger"
        confirmLabel="Excluir"
      />
    </div>
  );
}
