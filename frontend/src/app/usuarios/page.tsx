'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { IconeEngrenagem, IconeLixeira, IconeUsuarios } from '@/components/icons';
import { api, getUsuario } from '@/lib/api';

const ROLES = ['ADMINISTRADOR', 'COLABORADOR', 'CONTADOR'];
const LABEL_ROLE: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  COLABORADOR: 'Colaborador',
  CONTADOR: 'Contador',
};

const FORM_VAZIO = { nome: '', email: '', telefone: '', creci: '', role: 'COLABORADOR', senha: '' };

export default function UsuariosPage() {
  const usuarioLogado = typeof window !== 'undefined' ? getUsuario() : null;

  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [form, setForm] = useState<any>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [novaSenhaEdicao, setNovaSenhaEdicao] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);

  const [modulos, setModulos] = useState<{ chave: string; label: string }[]>([]);
  const [permissoesPorRole, setPermissoesPorRole] = useState<Record<string, any>>({});
  const [salvandoPermissao, setSalvandoPermissao] = useState<string>('');

  function carregar() {
    setCarregando(true);
    Promise.all([api.get('/api/usuarios'), api.get('/api/permissoes')])
      .then(([listaUsuarios, dadosPermissoes]) => {
        setUsuarios(listaUsuarios);
        setModulos(dadosPermissoes.modulos);
        setPermissoesPorRole(dadosPermissoes.permissoesPorRole);
      })
      .catch((err) => {
        if (String(err.message || '').includes('Apenas administradores')) {
          setSemAcesso(true);
        } else {
          setErro(err.message);
        }
      })
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  function alternarFormulario() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setNovaSenhaEdicao('');
    setMostrarForm((v) => !v);
  }

  function abrirEdicao(u: any) {
    setEditandoId(u.id);
    setForm({
      nome: u.nome, email: u.email, telefone: u.telefone || '', creci: u.creci || '', role: u.role, ativo: u.ativo,
    });
    setNovaSenhaEdicao('');
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setMensagem('');
    try {
      if (editandoId) {
        const payload: any = {
          nome: form.nome, email: form.email, telefone: form.telefone || null, creci: form.creci || null, role: form.role,
        };
        if (novaSenhaEdicao) payload.novaSenha = novaSenhaEdicao;
        await api.put(`/api/usuarios/${editandoId}`, payload);
        setMensagem('Usuário atualizado.');
      } else {
        await api.post('/api/usuarios', form);
        setMensagem('Usuário criado com sucesso.');
      }
      setForm(FORM_VAZIO);
      setEditandoId(null);
      setNovaSenhaEdicao('');
      setMostrarForm(false);
      carregar();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function alternarAtivo(u: any) {
    setErro('');
    try {
      await api.put(`/api/usuarios/${u.id}`, { ativo: !u.ativo });
      carregar();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function excluir(id: number) {
    if (!confirm('Excluir este usuário? Ele perderá o acesso ao sistema imediatamente.')) return;
    setErro('');
    try {
      await api.delete(`/api/usuarios/${id}`);
      carregar();
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function alterarPermissao(role: string, modulo: string, campo: 'ver' | 'editar', valor: boolean) {
    const atual = permissoesPorRole[role]?.[modulo] || { ver: false, editar: false };
    const nova = { ...atual, [campo]: valor };
    if (campo === 'ver' && !valor) nova.editar = false; // não dá pra editar sem ver
    if (campo === 'editar' && valor) nova.ver = true; // editar já implica poder ver

    // Otimista: atualiza a tela na hora, sem esperar a resposta
    setPermissoesPorRole((prev) => ({ ...prev, [role]: { ...prev[role], [modulo]: nova } }));
    setSalvandoPermissao(`${role}-${modulo}`);
    try {
      await api.put('/api/permissoes', { role, modulo, ver: nova.ver, editar: nova.editar });
    } catch (err: any) {
      setErro(err.message);
      carregar(); // desfaz a mudança otimista em caso de erro
    } finally {
      setSalvandoPermissao('');
    }
  }

  if (semAcesso) {
    return (
      <AppShell>
        <div className="card max-w-lg">
          <h1 className="font-display font-semibold text-xl text-savanna-green-700 mb-2">Acesso restrito</h1>
          <p className="text-savanna-muted text-sm">Esta área é exclusiva para administradores.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-semibold text-2xl text-savanna-green-700">Usuários</h1>
          <p className="text-savanna-muted text-sm">Controle de acesso da equipe ao CRM Savannah</p>
        </div>
        <button className="btn-primary" onClick={alternarFormulario}>
          {mostrarForm ? 'Cancelar' : '+ Novo usuário'}
        </button>
      </div>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}
      {mensagem && <p className="text-savanna-green-700 text-sm mb-4">{mensagem}</p>}

      {mostrarForm && (
        <form onSubmit={salvar} className="card mb-6 grid md:grid-cols-3 gap-4">
          <div>
            <label className="label">Nome completo</label>
            <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label">Perfil de acesso</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{LABEL_ROLE[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Telefone</label>
            <input className="input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <label className="label">Creci</label>
            <input className="input" value={form.creci} onChange={(e) => setForm({ ...form, creci: e.target.value })} placeholder="Ex: 60060F" />
          </div>
          <div>
            <label className="label">{editandoId ? 'Nova senha (opcional)' : 'Senha'}</label>
            <input
              className="input"
              type="password"
              value={editandoId ? novaSenhaEdicao : form.senha}
              onChange={(e) => (editandoId ? setNovaSenhaEdicao(e.target.value) : setForm({ ...form, senha: e.target.value }))}
              placeholder="mín. 6 caracteres"
              required={!editandoId}
            />
          </div>
          <div className="md:col-span-3">
            <button type="submit" className="btn-primary">{editandoId ? 'Salvar alterações' : 'Criar usuário'}</button>
          </div>
        </form>
      )}

      {carregando ? (
        <p className="text-savanna-muted">Carregando...</p>
      ) : (
        <>
          <div className="card mb-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-savanna-muted border-b border-savanna-border">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Perfil</th>
                  <th className="py-2 pr-4">Creci</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-savanna-border last:border-0">
                    <td className="py-2.5 pr-4 font-medium">
                      {u.nome}
                      {u.id === usuarioLogado?.id && <span className="text-xs text-savanna-muted ml-2">(você)</span>}
                    </td>
                    <td className="py-2.5 pr-4">{u.email}</td>
                    <td className="py-2.5 pr-4">
                      <span className="badge bg-savanna-green-50 text-savanna-green-700">{LABEL_ROLE[u.role] || u.role}</span>
                    </td>
                    <td className="py-2.5 pr-4">{u.creci || '-'}</td>
                    <td className="py-2.5 pr-4">
                      <button
                        onClick={() => alternarAtivo(u)}
                        disabled={u.id === usuarioLogado?.id}
                        className={`badge ${u.ativo ? 'bg-savanna-green-50 text-savanna-green-700' : 'bg-savanna-rust/15 text-savanna-rust'} ${u.id === usuarioLogado?.id ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={u.id === usuarioLogado?.id ? 'Você não pode desativar seu próprio usuário' : 'Clique para ativar/desativar'}
                      >
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEdicao(u)} title="Editar" className="p-1.5 rounded-sm text-savanna-muted hover:bg-savanna-green-50">
                          <IconeEngrenagem />
                        </button>
                        <button
                          onClick={() => excluir(u.id)}
                          title={u.id === usuarioLogado?.id ? 'Você não pode excluir seu próprio usuário' : 'Excluir'}
                          disabled={u.id === usuarioLogado?.id}
                          className="p-1.5 rounded-sm text-savanna-rust hover:bg-savanna-rust/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <IconeLixeira />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-savanna-muted">Nenhum usuário cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <IconeUsuarios className="w-5 h-5 text-savanna-green-700" />
              <h2 className="font-display font-semibold text-lg text-savanna-green-700">Permissões por perfil</h2>
            </div>
            <p className="text-savanna-muted text-sm mb-4">
              Administrador sempre tem acesso completo. Marque &quot;Ver&quot; para o perfil enxergar o módulo no menu, e
              &quot;Editar&quot; para poder criar/alterar/excluir registros nele (editar já libera ver automaticamente).
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-savanna-muted border-b border-savanna-border">
                    <th className="py-2 pr-4">Módulo</th>
                    <th className="py-2 px-3 text-center">Administrador</th>
                    <th className="py-2 px-3 text-center">Colaborador</th>
                    <th className="py-2 px-3 text-center">Contador</th>
                  </tr>
                </thead>
                <tbody>
                  {modulos.map((m) => (
                    <tr key={m.chave} className="border-b border-savanna-border last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{m.label}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-3 text-savanna-muted text-xs">
                          <span title="Administrador sempre pode ver e editar tudo">Ver + Editar</span>
                        </div>
                      </td>
                      {['COLABORADOR', 'CONTADOR'].map((role) => {
                        const p = permissoesPorRole[role]?.[m.chave] || { ver: false, editar: false };
                        const chave = `${role}-${m.chave}`;
                        return (
                          <td key={role} className="py-2.5 px-3">
                            <div className="flex items-center justify-center gap-4">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={p.ver}
                                  disabled={salvandoPermissao === chave}
                                  onChange={(e) => alterarPermissao(role, m.chave, 'ver', e.target.checked)}
                                />
                                Ver
                              </label>
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={p.editar}
                                  disabled={salvandoPermissao === chave}
                                  onChange={(e) => alterarPermissao(role, m.chave, 'editar', e.target.checked)}
                                />
                                Editar
                              </label>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
