'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import ClienteForm from '@/components/domain/ClienteForm';
import type { ClienteFormData } from '@/components/domain/ClienteForm';
import usePageTitle from '@/lib/utils/usePageTitle';

export default function NovoClientePage() {
  usePageTitle('Novo Cliente');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (formData: ClienteFormData) => {
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao cadastrar cliente');
        setIsLoading(false);
        return;
      }

      router.push(`/clientes/${data.id}`);
    } catch {
      setError('Erro ao cadastrar cliente');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Novo Cliente"
        icon="➕"
        description="Cadastrar novo cliente na clínica"
        breadcrumb={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Novo Cliente' },
        ]}
      />

      <Card>
        <ClienteForm
          onSubmit={handleSubmit}
          onCancel={() => router.push('/clientes')}
          loading={isLoading}
          error={error}
          submitLabel="Cadastrar Cliente"
        />
      </Card>
    </div>
  );
}
