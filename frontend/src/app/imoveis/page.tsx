'use client';

import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import Paginacao from '@/components/Paginacao';
import { IconeEngrenagem, IconeLixeira } from '@/components/icons';
import { api, API_URL, baixarArquivo } from '@/lib/api';
import { mascararCep, mascararCpfCnpj, mascararTelefone, validarCpfCnpj, mascararMoeda, moedaParaNumero } from '@/lib/mascaras';

const FORM_VAZIO = {
  nome: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',
  tipo: 'apartamento',
  descricao: '',
  valorAluguel: '',
  valorIptu: '',
  status: 'DISPONIVEL',
  dataVistoria: '',
};

const INQUILINO_VAZIO = { nome: '', cpfCnpj: '', telefone: '', email: '' };
const PROPRIETARIO_VAZIO = { nome: '', cpfCnpj: '', telefone: '', email: '' };

export default function ImoveisPage() {
  const [imoveis, setImoveis] = useState<any[]>([]);
  const [inquilinos, setInquilinos] = useState<any[]>([]);
  const [proprietarios, setProprietarios] = useState<any[]>([]);
  const [form, setForm] = useState<any>(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [filtro, setFiltro] = useState<'todos' | 'disponivel' | 'alugado' | 'vagando'>('todos');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const [modoInquilino, setModoInquilino] = useState<'nenhum' | 'existente' | 'novo'>('nenhum');
  const [inquilinoSelecionadoId, setInquilinoSelecionadoId] = useState('');
  const [novoInquilino, setNovoInquilino] = useState<any>(INQUILINO_VAZIO);

  const [modoProprietario, setModoProprietario] = useState<'nenhum' | 'existente' | 'novo'>('nenhum');
  const [proprietarioSelecionadoId, setProprietarioSelecionadoId] = useState('');
  const [novoProprietario, setNovoProprietario] = useState<any>(PROPRIETARIO_VAZIO);

  const [linhaDestacadaId, setLinhaDestacadaId] = useState<number | null>(null);

  function destacarLinha(id: number) {
    setLinhaDestacadaId(id);
    setTimeout(() => setLinhaDestacadaId((atual) => (atual === id ? null : atual)), 2500);
  }

  function carregar(filtroAtual = filtro, buscaAtual = busca, paginaAtual = pagina) {
    const params = new URLSearchParams();
    if (filtroAtual !== 'todos') params.set('filtro', filtroAtual);
    if (buscaAtual) params.set('busca', buscaAtual);
    params.set('pagina', String(paginaAtual));

    api.get(`/api/imoveis?${params.toString()}`)
      .then((resposta) => {
        if (resposta.dados.length === 0 && resposta.pagina > 1 && resposta.pagina > resposta.totalPaginas) {
          carregar(filtroAtual, buscaAtual, resposta.totalPaginas);
          return;
        }
        setImoveis(resposta.dados);
        setTotalRegistros(resposta.total);
        setTotalPaginas(resposta.totalPaginas);
        setPagina(resposta.pagina);
      })
      .catch((e) => setErro(e.message));
    api.get('/api/inquilinos').then(setInquilinos).catch(() => {});
    api.get('/api/proprietarios').then(setProprietarios).catch(() => {});
  }

  function irParaPagina(p: number) {
    carregar(filtro, busca, p);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refaz a busca automaticamente ao trocar o filtro
  useEffect(() => {
    carregar(filtro, busca, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  // Busca por texto com debounce (evita disparar uma requisição a cada tecla)
  useEffect(() => {
    const timer = setTimeout(() => carregar(filtro, busca, 1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function resetarFormulario() {
    setForm(FORM_VAZIO);
    setFotoFile(null);
    setFotoPreview(null);
    setEditandoId(null);
    setModoInquilino('nenhum');
    setInquilinoSelecionadoId('');
    setNovoInquilino(INQUILINO_VAZIO);
    setModoProprietario('nenhum');
    setProprietarioSelecionadoId('');
    setNovoProprietario(PROPRIETARIO_VAZIO);
    if (inputFotoRef.current) inputFotoRef.current.value = '';
  }

  function abrirNovo() {
    resetarFormulario();
    setMostrarForm(true);
  }

  function abrirEdicao(imovel: any) {
    setForm({
      nome: imovel.nome || '',
      endereco: imovel.endereco || '',
      numero: imovel.numero || '',
      complemento: imovel.complemento || '',
      bairro: imovel.bairro || '',
      cidade: imovel.cidade || '',
      estado: imovel.estado || '',
      cep: imovel.cep || '',
      tipo: imovel.tipo || 'apartamento',
      descricao: imovel.descricao || '',
      valorAluguel: imovel.valorAluguel ? mascararMoeda(String(Math.round(Number(imovel.valorAluguel) * 100))) : '',
      valorIptu: imovel.valorIptu ? mascararMoeda(String(Math.round(Number(imovel.valorIptu) * 100))) : '',
      status: imovel.status || 'DISPONIVEL',
      dataVistoria: imovel.dataVistoria ? imovel.dataVistoria.substring(0, 10) : '',
    });
    setFotoFile(null);
    setFotoPreview(imovel.foto ? `${API_URL}/${imovel.foto}` : null);
    setEditandoId(imovel.id);

    if (imovel.inquilinoId) {
      setModoInquilino('existente');
      setInquilinoSelecionadoId(String(imovel.inquilinoId));
    } else {
      setModoInquilino('nenhum');
      setInquilinoSelecionadoId('');
    }
    setNovoInquilino(INQUILINO_VAZIO);

    if (imovel.proprietarioId) {
      setModoProprietario('existente');
      setProprietarioSelecionadoId(String(imovel.proprietarioId));
    } else {
      setModoProprietario('nenhum');
      setProprietarioSelecionadoId('');
    }
    setNovoProprietario(PROPRIETARIO_VAZIO);

    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function buscarCep() {
    const cepLimpo = (form.cep || '').replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    setErro('');
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await resposta.json();
      if (dados.erro) {
        setErro('CEP não encontrado.');
        return;
      }
      setForm((f: any) => ({
        ...f,
        endereco: dados.logradouro || f.endereco,
        bairro: dados.bairro || f.bairro,
        cidade: dados.localidade || f.cidade,
        estado: dados.uf || f.estado,
      }));
    } catch {
      setErro('Não foi possível buscar o CEP agora. Preencha o endereço manualmente.');
    } finally {
      setBuscandoCep(false);
    }
  }

  function selecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0] || null;
    setFotoFile(arquivo);
    setFotoPreview(arquivo ? URL.createObjectURL(arquivo) : null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    try {
      let inquilinoId: number | null = null;

      if (modoInquilino === 'existente' && inquilinoSelecionadoId) {
        inquilinoId = Number(inquilinoSelecionadoId);
      }

      if (modoInquilino === 'novo') {
        if (!novoInquilino.nome || !novoInquilino.cpfCnpj || !novoInquilino.telefone) {
          setErro('Preencha nome, CPF/CNPJ e telefone do novo inquilino.');
          return;
        }
        if (!validarCpfCnpj(novoInquilino.cpfCnpj)) {
          setErro('CPF/CNPJ do novo inquilino inválido. Confira os dígitos informados.');
          return;
        }
        const criado = await api.post('/api/inquilinos', novoInquilino);
        inquilinoId = criado.id;
      }

      let proprietarioId: number | null = null;

      if (modoProprietario === 'existente' && proprietarioSelecionadoId) {
        proprietarioId = Number(proprietarioSelecionadoId);
      }

      if (modoProprietario === 'novo') {
        if (!novoProprietario.nome) {
          setErro('Preencha ao menos o nome do novo proprietário.');
          return;
        }
        if (novoProprietario.cpfCnpj && !validarCpfCnpj(novoProprietario.cpfCnpj)) {
          setErro('CPF/CNPJ do novo proprietário inválido. Confira os dígitos informados.');
          return;
        }
        const criado = await api.post('/api/proprietarios', novoProprietario);
        proprietarioId = criado.id;
      }

      const dadosForm = new FormData();
      Object.entries(form).forEach(([chave, valor]) => {
        if (chave === 'valorAluguel' || chave === 'valorIptu') {
          dadosForm.append(chave, valor ? String(moedaParaNumero(valor as string)) : '');
          return;
        }
        dadosForm.append(chave, valor as string);
      });
      if (inquilinoId) dadosForm.append('inquilinoId', String(inquilinoId));
      if (proprietarioId) dadosForm.append('proprietarioId', String(proprietarioId));
      if (fotoFile) dadosForm.append('foto', fotoFile);

      if (editandoId) {
        await api.put(`/api/imoveis/${editandoId}`, dadosForm);
        destacarLinha(editandoId);
      } else {
        await api.post('/api/imoveis', dadosForm);
      }

      resetarFormulario();
      setMostrarForm(false);
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function excluir(id: number, forcar = false) {
    if (!forcar && !confirm('Excluir este imóvel?')) return;
    setErro('');
    try {
      const params = forcar ? '?forcar=true' : '';
      await api.delete(`/api/imoveis/${id}${params}`);
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      // Se o imóvel tiver contratos vinculados, o backend explica o motivo e
      // oferece a opção de excluir tudo em cascata (com confirmação extra).
      if (err.possuiVinculos) {
        const confirmarForcado = confirm(
          `${err.message}\n\nDeseja excluir o imóvel e todos os contratos/pagamentos vinculados a ele?`
        );
        if (confirmarForcado) {
          await excluir(id, true);
          return;
        }
        return;
      }
      setErro(err.message);
    }
  }

  function alternarFormulario() {
    if (mostrarForm) {
      resetarFormulario();
      setMostrarForm(false);
    } else {
      abrirNovo();
    }
  }

  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);

  async function gerarRelatorio() {
    setErro('');
    setGerandoRelatorio(true);
    try {
      const params = new URLSearchParams();
      if (filtro !== 'todos') params.set('filtro', filtro);
      if (busca) params.set('busca', busca);
      const query = params.toString() ? `?${params.toString()}` : '';
      await baixarArquivo(`/api/imoveis/relatorio${query}`, `imoveis-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setGerandoRelatorio(false);
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-semibold text-2xl text-savanna-green-700">Imóveis</h1>
          <p className="text-savanna-muted text-sm">Gerencie os imóveis da carteira</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={gerarRelatorio} disabled={gerandoRelatorio}>
            {gerandoRelatorio ? 'Gerando...' : 'Gerar relatório'}
          </button>
          <button className="btn-primary" onClick={alternarFormulario}>
            {mostrarForm ? 'Cancelar' : '+ Novo imóvel'}
          </button>
        </div>
      </div>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}

      <div className="card mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Buscar por nome, endereço ou cidade</label>
          <input className="input" placeholder="Ex: Centro, Maria, apto 302..."
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { valor: 'todos', label: 'Todos' },
            { valor: 'disponivel', label: 'Disponíveis' },
            { valor: 'alugado', label: 'Alugados' },
            { valor: 'vagando', label: 'Prestes a vagar' },
          ].map((op) => (
            <button
              key={op.valor}
              type="button"
              onClick={() => setFiltro(op.valor as any)}
              className={`px-3 py-2 rounded-sm text-sm font-medium border transition-colors ${
                filtro === op.valor
                  ? 'bg-savanna-green-600 text-white border-savanna-green-600'
                  : 'bg-white text-savanna-ink border-savanna-border hover:border-savanna-green-400'
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {mostrarForm && (
        <form onSubmit={salvar} className="card mb-6 space-y-6">
          <div>
            <h3 className="font-medium text-savanna-green-700 mb-3">
              {editandoId ? 'Editar imóvel' : 'Dados do imóvel'}
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="label">Nome do imóvel</label>
                <input className="input" placeholder="Ex: Apto Centro - Bloco A"
                  value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  <option value="apartamento">Apartamento</option>
                  <option value="casa">Casa</option>
                  <option value="kitnet">Kitnet</option>
                  <option value="comercial">Comercial</option>
                </select>
              </div>

              <div>
                <label className="label">CEP</label>
                <input className="input" required value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: mascararCep(e.target.value) })}
                  onBlur={buscarCep} placeholder="89460-000" />
                {buscandoCep && <p className="text-xs text-savanna-muted mt-1">Buscando endereço...</p>}
              </div>
              <div className="md:col-span-2">
                <label className="label">Endereço</label>
                <input className="input" required value={form.endereco}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
              </div>
              <div>
                <label className="label">Número</label>
                <input className="input" value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })} />
              </div>
              <div>
                <label className="label">Bairro</label>
                <input className="input" value={form.bairro}
                  onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
              </div>
              <div>
                <label className="label">Complemento</label>
                <input className="input" value={form.complemento}
                  onChange={(e) => setForm({ ...form, complemento: e.target.value })} placeholder="Ex: Bloco A, fundos, casa 2" />
              </div>

              <div>
                <label className="label">Cidade</label>
                <input className="input" required value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
              </div>
              <div>
                <label className="label">Estado (UF)</label>
                <input className="input" required maxLength={2} value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="label">Valor do aluguel</label>
                <div className="flex items-center gap-2">
                  <span className="text-savanna-muted">R$</span>
                  <input className="input" required value={form.valorAluguel}
                    onChange={(e) => setForm({ ...form, valorAluguel: mascararMoeda(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="label">Valor do IPTU</label>
                <div className="flex items-center gap-2">
                  <span className="text-savanna-muted">R$</span>
                  <input className="input" value={form.valorIptu}
                    onChange={(e) => setForm({ ...form, valorIptu: mascararMoeda(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="label">Data da última vistoria</label>
                <input className="input" type="date" value={form.dataVistoria}
                  onChange={(e) => setForm({ ...form, dataVistoria: e.target.value })} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="DISPONIVEL">Disponível</option>
                  <option value="ALUGADO">Alugado</option>
                  <option value="PRESTES_A_VAGAR">Prestes a vagar</option>
                </select>
              </div>

              <div className="md:col-span-3 grid md:grid-cols-3 gap-4">
                <div>
                  <label className="label">Foto do imóvel</label>
                  <input ref={inputFotoRef} type="file" accept="image/png,image/jpeg,image/webp"
                    onChange={selecionarFoto} className="text-sm" />
                  {fotoPreview && (
                    <img src={fotoPreview} alt="Prévia" className="mt-3 h-32 w-48 object-cover rounded-sm border border-savanna-border" />
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="label">Descrição do imóvel</label>
                  <textarea className="input" rows={5} value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    placeholder="Ex: Casa com 150m², possuindo 1 sala, 1 copa, cozinha com móveis planejados, 1 suíte com ar condicionado..." />
                  <p className="text-xs text-savanna-muted mt-1">Usado nos termos de vistoria e rescisão. Diferente do estado de conservação (que é avaliado item a item na vistoria).</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-savanna-border pt-5">
            <h3 className="font-medium text-savanna-green-700 mb-3">Proprietário</h3>
            <div className="flex gap-4 mb-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoProprietario === 'nenhum'}
                  onChange={() => setModoProprietario('nenhum')} /> Nenhum
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoProprietario === 'existente'}
                  onChange={() => setModoProprietario('existente')} /> Selecionar existente
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoProprietario === 'novo'}
                  onChange={() => setModoProprietario('novo')} /> Cadastrar novo
              </label>
            </div>

            {modoProprietario === 'existente' && (
              <select className="input md:w-1/2" value={proprietarioSelecionadoId}
                onChange={(e) => setProprietarioSelecionadoId(e.target.value)}>
                <option value="">Selecione um proprietário</option>
                {proprietarios.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            )}

            {modoProprietario === 'novo' && (
              <div className="grid md:grid-cols-2 gap-4">
                <input className="input" placeholder="Nome completo" value={novoProprietario.nome}
                  onChange={(e) => setNovoProprietario({ ...novoProprietario, nome: e.target.value })} />
                <input className="input" placeholder="CPF/CNPJ" value={novoProprietario.cpfCnpj}
                  onChange={(e) => setNovoProprietario({ ...novoProprietario, cpfCnpj: mascararCpfCnpj(e.target.value) })} />
                <input className="input" placeholder="Telefone" value={novoProprietario.telefone}
                  onChange={(e) => setNovoProprietario({ ...novoProprietario, telefone: mascararTelefone(e.target.value) })} />
                <input className="input" placeholder="Email" value={novoProprietario.email}
                  onChange={(e) => setNovoProprietario({ ...novoProprietario, email: e.target.value })} />
              </div>
            )}
            <p className="text-xs text-savanna-muted mt-2">
              Dados bancários e PIX do proprietário ficam em Proprietários.
            </p>
          </div>

          <div className="border-t border-savanna-border pt-5">
            <h3 className="font-medium text-savanna-green-700 mb-3">Inquilino</h3>
            <div className="flex gap-4 mb-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoInquilino === 'nenhum'}
                  onChange={() => setModoInquilino('nenhum')} /> Nenhum
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoInquilino === 'existente'}
                  onChange={() => setModoInquilino('existente')} /> Selecionar existente
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoInquilino === 'novo'}
                  onChange={() => setModoInquilino('novo')} /> Cadastrar novo
              </label>
            </div>

            {modoInquilino === 'existente' && (
              <select className="input md:w-1/2" value={inquilinoSelecionadoId}
                onChange={(e) => setInquilinoSelecionadoId(e.target.value)}>
                <option value="">Selecione um inquilino</option>
                {inquilinos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            )}

            {modoInquilino === 'novo' && (
              <div className="grid md:grid-cols-2 gap-4">
                <input className="input" placeholder="Nome completo" value={novoInquilino.nome}
                  onChange={(e) => setNovoInquilino({ ...novoInquilino, nome: e.target.value })} />
                <input className="input" placeholder="CPF/CNPJ" value={novoInquilino.cpfCnpj}
                  onChange={(e) => setNovoInquilino({ ...novoInquilino, cpfCnpj: mascararCpfCnpj(e.target.value) })} />
                <input className="input" placeholder="Telefone (WhatsApp)" value={novoInquilino.telefone}
                  onChange={(e) => setNovoInquilino({ ...novoInquilino, telefone: mascararTelefone(e.target.value) })} />
                <input className="input" placeholder="Email" value={novoInquilino.email}
                  onChange={(e) => setNovoInquilino({ ...novoInquilino, email: e.target.value })} />
              </div>
            )}
          </div>

          <button className="btn-primary" type="submit">
            {editandoId ? 'Salvar alterações' : 'Salvar imóvel'}
          </button>
        </form>
      )}

      <div className="card p-0 overflow-hidden">
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} posicao="topo" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-savanna-green-50 text-left text-savanna-muted">
              <th className="px-4 py-3">Foto</th>
              <th className="px-4 py-3">Imóvel</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Inquilino</th>
              <th className="px-4 py-3">Proprietário</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {imoveis.map((im) => (
              <tr
                key={im.id}
                className={`border-t border-savanna-border align-top transition-colors duration-700 ${
                  linhaDestacadaId === im.id ? 'bg-savanna-gold-400/20' : ''
                }`}
              >
                <td className="px-4 py-3">
                  {im.foto ? (
                    <img src={`${API_URL}/${im.foto}`} alt={im.nome || im.endereco}
                      className="h-14 w-20 object-cover rounded-sm border border-savanna-border" />
                  ) : (
                    <div className="h-14 w-20 rounded-sm bg-savanna-green-50 flex items-center justify-center text-savanna-muted text-xs">
                      Sem foto
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {im.nome && <p className="font-medium">{im.nome}</p>}
                  <p className={im.nome ? 'text-xs text-savanna-muted' : ''}>
                    {im.endereco} - {im.cidade}/{im.estado}
                  </p>
                </td>
                <td className="px-4 py-3 capitalize">{im.tipo}</td>
                <td className="px-4 py-3">
                  {Number(im.valorAluguel).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${
                    im.status === 'ALUGADO'
                      ? 'bg-savanna-green-100 text-savanna-green-700'
                      : im.status === 'PRESTES_A_VAGAR'
                      ? 'bg-savanna-gold-400/20 text-savanna-gold-500'
                      : 'bg-savanna-green-50 text-savanna-muted'
                  }`}>
                    {im.status === 'ALUGADO' ? 'Alugado' : im.status === 'PRESTES_A_VAGAR' ? 'Prestes a vagar' : 'Disponível'}
                  </span>
                  {im.status === 'ALUGADO' && im.diasParaVencer !== null && im.diasParaVencer <= 30 && (
                    <span className={`badge block mt-1 ${im.diasParaVencer < 0 ? 'bg-savanna-rust/15 text-savanna-rust' : 'bg-savanna-gold-400/20 text-savanna-gold-500'}`}>
                      {im.diasParaVencer < 0
                        ? `Contrato vencido há ${Math.abs(im.diasParaVencer)}d`
                        : `Vence em ${im.diasParaVencer}d`}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{im.inquilino?.nome || '-'}</td>
                <td className="px-4 py-3">{im.proprietario?.nome || '-'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => abrirEdicao(im)} title="Editar"
                      className="p-1.5 rounded-sm text-savanna-muted hover:bg-savanna-green-50">
                      <IconeEngrenagem />
                    </button>
                    <button onClick={() => excluir(im.id)} title="Excluir"
                      className="p-1.5 rounded-sm text-savanna-rust hover:bg-savanna-rust/10">
                      <IconeLixeira />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {imoveis.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-savanna-muted">Nenhum imóvel cadastrado.</td></tr>
            )}
          </tbody>
        </table>
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} />
      </div>
    </AppShell>
  );
}
