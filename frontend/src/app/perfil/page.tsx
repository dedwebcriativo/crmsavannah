'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api, setUsuario } from '@/lib/api';

const LABEL_ROLE: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  ADMIN: 'Administrador',
  COLABORADOR: 'Colaborador',
  CONTADOR: 'Contador',
};

export default function PerfilPage() {
  const [form, setForm] = useState({ nome: '', email: '', telefone: '', creci: '' });
  const [role, setRole] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    api.get('/api/usuarios/perfil')
      .then((dados) => {
        setForm({
          nome: dados.nome || '',
          email: dados.email || '',
          telefone: dados.telefone || '',
          creci: dados.creci || '',
        });
        setRole(dados.role || '');
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setMensagem('');

    if (novaSenha && novaSenha !== confirmarSenha) {
      setErro('A confirmação da nova senha não confere.');
      return;
    }

    setSalvando(true);
    try {
      const payload: any = { ...form };
      if (novaSenha) {
        payload.senhaAtual = senhaAtual;
        payload.novaSenha = novaSenha;
      }
      const atualizado = await api.put('/api/usuarios/perfil', payload);
      setUsuario({ id: atualizado.id, nome: atualizado.nome, email: atualizado.email, role: atualizado.role, creci: atualizado.creci });
      setMensagem('Perfil atualizado com sucesso.');
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
      setMostrarSenha(false);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <AppShell>
        <p className="text-savanna-muted">Carregando...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display font-semibold text-2xl text-savanna-green-700">Meu perfil</h1>
        <p className="text-savanna-muted text-sm">Seus dados de acesso ao CRM Savannah</p>
      </div>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}
      {mensagem && <p className="text-savanna-green-700 text-sm mb-4">{mensagem}</p>}

      <form onSubmit={salvar} className="card max-w-2xl grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2 flex items-center gap-3 pb-2 mb-2 border-b border-savanna-border">
          <div className="h-14 w-14 rounded-full bg-savanna-green-700 text-white flex items-center justify-center text-xl font-semibold">
            {form.nome ? form.nome.trim().charAt(0).toUpperCase() : '?'}
          </div>
          <div>
            <p className="font-medium text-savanna-ink">{form.nome || '-'}</p>
            <span className="badge bg-savanna-green-50 text-savanna-green-700">{LABEL_ROLE[role] || role}</span>
          </div>
        </div>

        <div>
          <label className="label">Nome completo</label>
          <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div>
          <label className="label">Telefone</label>
          <input className="input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
        </div>
        <div>
          <label className="label">Creci</label>
          <input className="input" value={form.creci} onChange={(e) => setForm({ ...form, creci: e.target.value })} placeholder="Ex: 60060F" />
        </div>

        <div className="md:col-span-2 pt-2 mt-2 border-t border-savanna-border">
          {!mostrarSenha ? (
            <button type="button" className="text-sm text-savanna-green-700 underline" onClick={() => setMostrarSenha(true)}>
              Alterar senha
            </button>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Senha atual</label>
                <input className="input" type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
              </div>
              <div>
                <label className="label">Nova senha</label>
                <input className="input" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="mín. 6 caracteres" />
              </div>
              <div>
                <label className="label">Confirmar nova senha</label>
                <input className="input" type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
              </div>
              <button
                type="button"
                className="text-sm text-savanna-muted underline w-fit"
                onClick={() => { setMostrarSenha(false); setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha(''); }}
              >
                Cancelar troca de senha
              </button>
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
