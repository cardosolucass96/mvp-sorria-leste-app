/**
 * AnexosGallery — galeria de anexos com upload, preview e delete.
 * Usa Button, Modal, EmptyState, ConfirmDialog (Sprint 1).
 */

'use client';

import { useState, useRef } from 'react';
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
}

export interface AnexosGalleryProps {
  anexos: AnexoData[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (anexo: AnexoData) => Promise<void>;
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');

    if (file.size > maxSizeMB * 1024 * 1024) {
      setUploadError(`Arquivo muito grande. Máximo: ${maxSizeMB}MB`);
      return;
    }

    await onUpload(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await onDelete(deleteTarget);
    setDeleteTarget(null);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload */}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          loading={uploading}
          disabled={loading}
        >
          📎 Adicionar Anexo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptTypes}
          onChange={handleFileSelect}
          className="hidden"
        />
        {uploadError && (
          <span className="text-sm text-red-600">{uploadError}</span>
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
              className="relative group rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setPreviewAnexo(anexo)}
            >
              {isImage(anexo.tipo) ? (
                <img
                  src={anexo.url}
                  alt={anexo.nome}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center bg-gray-50">
                  <span className="text-3xl">📄</span>
                </div>
              )}

              <div className="p-2">
                <p className="text-xs font-medium text-gray-700 truncate">{anexo.nome}</p>
                <p className="text-xs text-gray-500">{formatFileSize(anexo.tamanho)}</p>
              </div>

              {/* Delete button overlay */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(anexo);
                }}
                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
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
          title={previewAnexo.nome}
          size="lg"
        >
          {isImage(previewAnexo.tipo) ? (
            <img
              src={previewAnexo.url}
              alt={previewAnexo.nome}
              className="w-full rounded-lg"
            />
          ) : (
            <div className="text-center py-8">
              <span className="text-5xl mb-4 block">📄</span>
              <p className="text-gray-600">{previewAnexo.nome}</p>
              <p className="text-sm text-gray-500">{formatFileSize(previewAnexo.tamanho)}</p>
              <a
                href={previewAnexo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-blue-600 hover:text-blue-800 font-medium"
              >
                Abrir arquivo →
              </a>
            </div>
          )}
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
