'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

export interface TrocarSenhaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TrocarSenhaModal({ isOpen, onClose }: TrocarSenhaModalProps) {
  const { user } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
    setErro('');
    setSucesso('');
  };

  const fechar = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem');
      return;
    }

    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/senha', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: user?.id,
          senha_atual: senhaAtual,
          nova_senha: novaSenha,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || 'Erro ao alterar senha');
      } else {
        setSucesso('Senha alterada com sucesso!');
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmarSenha('');
        setTimeout(() => {
          fechar();
        }, 2000);
      }
    } catch {
      setErro('Erro de conexão');
    }

    setLoading(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={fechar}
      title="Alterar Senha"
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Senha Atual"
          name="senhaAtual"
          type="password"
          value={senhaAtual}
          onChange={setSenhaAtual}
          required
          disabled={loading}
        />

        <Input
          label="Nova Senha"
          name="novaSenha"
          type="password"
          value={novaSenha}
          onChange={setNovaSenha}
          required
          disabled={loading}
          hint="Mínimo de 6 caracteres"
        />

        <Input
          label="Confirmar Nova Senha"
          name="confirmarSenha"
          type="password"
          value={confirmarSenha}
          onChange={setConfirmarSenha}
          required
          disabled={loading}
        />

        {erro && (
          <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm">
            {erro}
          </div>
        )}

        {sucesso && (
          <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-lg text-sm">
            {sucesso}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            variant="ghost"
            onClick={fechar}
            disabled={loading}
            fullWidth
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={loading}
            fullWidth
            icon={<KeyRound className="w-4 h-4" />}
          >
            Alterar Senha
          </Button>
        </div>
      </form>
    </Modal>
  );
}
