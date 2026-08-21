'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api, API_URL } from '@/lib/api';
import { enviarEAbrirWhatsapp } from '@/lib/whatsapp';
import { mascararTelefone } from '@/lib/mascaras';

const ANO_ATUAL = new Date().getFullYear();
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function formatarMoeda(valor: number | null) {
  if (valor === null || valor === undefined) return '-';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DemonstrativosPage() {
  const [tipo, setTipo] = useState<'proprietario' | 'inquilino' | 'contador'>('proprietario');
  const [inquilinos, setInquilinos] = useState<any[]>([]);
  const [proprietarios, setProprietarios] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);

  const [pessoaId, setPessoaId] = useState('');
  const [contratoId, setContratoId] = useState('');
  const [ano, setAno] = useState(String(ANO_ATUAL));
  const [observacao, setObservacao] = useState('');
  const [mesContador, setMesContador] = useState(new Date().toISOString().slice(0, 7));

  const [dados, setDados] = useState<any>(null);
  const [pdfGerado, setPdfGerado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [linkWhatsapp, setLinkWhatsapp] = useState('');

  const [contadores, setContadores] = useState<any[]>([]);
  const [contadorId, setContadorId] = useState('');
  const [mostrarNovoContador, setMostrarNovoContador] = useState(false);
  const [novoContador, setNovoContador] = useState({ nome: '', telefone: '', email: '' });
  const [salvandoContador, setSalvandoContador] = useState(false);
  const [editandoContadorId, setEditandoContadorId] = useState<string | null>(null);

  async function carregarContadores() {
    try {
      const lista = await api.get('/api/contadores');
      setContadores(lista);
      if (lista.length && !contadorId) setContadorId(String(lista[0].id));
    } catch {
      // Se falhar, o seletor de contador só fica vazio - não trava o resto da tela
    }
  }

  async function salvarNovoContador() {
    if (!novoContador.nome || !novoContador.telefone) {
      setErro('Preencha nome e telefone do contador.');
      return;
    }
    setErro('');
    setSalvandoContador(true);
    try {
      if (editandoContadorId) {
        await api.put(`/api/contadores/${editandoContadorId}`, novoContador);
        await carregarContadores();
        setContadorId(editandoContadorId);
        setMensagem('Contador atualizado.');
      } else {
        const criado = await api.post('/api/contadores', novoContador);
        await carregarContadores();
        setContadorId(String(criado.id));
        setMensagem('Contador cadastrado.');
      }
      setNovoContador({ nome: '', telefone: '', email: '' });
      setEditandoContadorId(null);
      setMostrarNovoContador(false);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvandoContador(false);
    }
  }

  function editarContadorSelecionado() {
    const c = contadores.find((x) => String(x.id) === contadorId);
    if (!c) return;
    setNovoContador({ nome: c.nome || '', telefone: c.telefone || '', email: c.email || '' });
    setEditandoContadorId(String(c.id));
    setMostrarNovoContador(true);
  }

  function cancelarEdicaoContador() {
    setNovoContador({ nome: '', telefone: '', email: '' });
    setEditandoContadorId(null);
    setMostrarNovoContador(false);
  }

  async function excluirContadorSelecionado() {
    if (!contadorId) return;
    const c = contadores.find((x) => String(x.id) === contadorId);
    if (!confirm(`Excluir o contador "${c?.nome}"? Essa ação não pode ser desfeita.`)) return;
    setErro('');
    try {
      await api.delete(`/api/contadores/${contadorId}`);
      setContadorId('');
      await carregarContadores();
      setMensagem('Contador excluído.');
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function enviarWhatsappContador() {
    if (!contadorId) {
      setErro('Selecione ou cadastre um contador.');
      return;
    }
    setErro('');
    setMensagem('');
    setLinkWhatsapp('');
    try {
      const { resultado, linkAberto } = await enviarEAbrirWhatsapp(() =>
        api.post('/api/demonstrativos/enviar-whatsapp-contador', { contratoId, ano, tipo, contadorId })
      );
      if (resultado?.resultado?.simulado) {
        if (linkAberto) {
          setMensagem('WhatsApp aberto em uma nova aba.');
        } else {
          setMensagem('Não foi possível abrir o WhatsApp automaticamente (popup bloqueado). Use o link abaixo.');
          setLinkWhatsapp(resultado?.resultado?.linkWhatsapp || '');
        }
      } else {
        setMensagem('Demonstrativo enviado ao contador via WhatsApp.');
      }
    } catch (err: any) {
      setErro(err.message);
    }
  }

  useEffect(() => {
    api.get('/api/inquilinos').then(setInquilinos).catch(() => {});
    api.get('/api/proprietarios').then(setProprietarios).catch(() => {});
    api.get('/api/contratos').then(setContratos).catch(() => {});
    carregarContadores();
  }, []);

  useEffect(() => {
    setPessoaId('');
    setContratoId('');
    setDados(null);
    setPdfGerado(null);
  }, [tipo]);

  const pessoas = tipo === 'inquilino' ? inquilinos : proprietarios;

  const contratosDaPessoa = contratos.filter((c) =>
    tipo === 'inquilino'
      ? String(c.inquilinoId) === pessoaId
      : String(c.imovel?.proprietarioId) === pessoaId
  );

  function selecionarPessoa(id: string) {
    setPessoaId(id);
    setDados(null);
    setPdfGerado(null);
    const opcoes = contratos.filter((c) =>
      tipo === 'inquilino' ? String(c.inquilinoId) === id : String(c.imovel?.proprietarioId) === id
    );
    setContratoId(opcoes.length === 1 ? String(opcoes[0].id) : '');
  }

  async function gerarPreview() {
    if (tipo === 'contador') {
      if (!mesContador) { setErro('Selecione o mês.'); return; }
      setErro(''); setMensagem(''); setCarregando(true); setPdfGerado(null);
      try {
        const resultado = await api.get(`/api/demonstrativos/contador/preview?mes=${mesContador}`);
        setDados(resultado);
      } catch (err: any) {
        setErro(err.message);
      } finally {
        setCarregando(false);
      }
      return;
    }
    if (!contratoId || !ano) {
      setErro('Selecione o contrato e o ano.');
      return;
    }
    setErro('');
    setMensagem('');
    setCarregando(true);
    setPdfGerado(null);
    try {
      const resultado = await api.get(`/api/demonstrativos/preview?contratoId=${contratoId}&ano=${ano}&tipo=${tipo}`);
      setDados(resultado);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function gerarPdf() {
    setErro('');
    setMensagem('');
    setCarregando(true);
    try {
      if (tipo === 'contador') {
        const resultado = await api.post('/api/demonstrativos/contador/gerar-pdf', { mes: mesContador });
        setDados(resultado.dados);
        setPdfGerado(`${API_URL}/api/demonstrativos/contador/${mesContador}/pdf`);
        setMensagem('PDF gerado com sucesso.');
        return;
      }
      const resultado = await api.post('/api/demonstrativos/gerar-pdf', { contratoId, ano, tipo, observacao });
      setDados(resultado.dados);
      setPdfGerado(`${API_URL}/api/demonstrativos/${contratoId}/${ano}/${tipo}/pdf`);
      setMensagem('PDF gerado com sucesso.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function enviarWhatsapp() {
    setErro('');
    setMensagem('');
    setLinkWhatsapp('');
    try {
      const { resultado, linkAberto } = await enviarEAbrirWhatsapp(() =>
        tipo === 'contador'
          ? api.post('/api/demonstrativos/contador/enviar-whatsapp', { mes: mesContador, contadorId })
          : api.post('/api/demonstrativos/enviar-whatsapp', { contratoId, ano, tipo })
      );
      if (resultado?.resultado?.simulado) {
        if (linkAberto) {
          setMensagem('WhatsApp aberto em uma nova aba.');
        } else {
          setMensagem('Não foi possível abrir o WhatsApp automaticamente (popup bloqueado). Use o link abaixo.');
          setLinkWhatsapp(resultado?.resultado?.linkWhatsapp || '');
        }
      } else {
        setMensagem('Demonstrativo enviado via WhatsApp.');
      }
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const anos = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - i);

  return (
    <AppShell>
      <h1 className="font-display font-semibold text-2xl text-savanna-green-700 mb-1">Demonstrativos</h1>
      <p className="text-savanna-muted text-sm mb-6">Declaração anual de rendimentos de aluguéis, mês a mês</p>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}
      {mensagem && <p className="text-savanna-green-700 text-sm mb-1">{mensagem}</p>}
      {linkWhatsapp && (
        <a href={linkWhatsapp} target="_blank" rel="noreferrer" className="text-sm text-savanna-gold-500 underline mb-4 inline-block">
          Abrir no WhatsApp para enviar
        </a>
      )}

      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1.6fr_1.6fr_0.9fr] gap-4 items-start">
          <div>
            <label className="label">Gerar para</label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setTipo('proprietario')}
                className={`flex-1 px-3 py-2 rounded-sm text-sm font-medium border ${tipo === 'proprietario' ? 'bg-savanna-green-600 text-white border-savanna-green-600' : 'bg-white border-savanna-border'}`}>
                Proprietário
              </button>
              <button type="button"
                onClick={() => setTipo('inquilino')}
                className={`flex-1 px-3 py-2 rounded-sm text-sm font-medium border ${tipo === 'inquilino' ? 'bg-savanna-green-600 text-white border-savanna-green-600' : 'bg-white border-savanna-border'}`}>
                Inquilino
              </button>
              <button type="button"
                onClick={() => setTipo('contador')}
                className={`flex-1 px-3 py-2 rounded-sm text-sm font-medium border ${tipo === 'contador' ? 'bg-savanna-green-600 text-white border-savanna-green-600' : 'bg-white border-savanna-border'}`}>
                Contador
              </button>
            </div>
          </div>

          {tipo === 'contador' ? (
            <div>
              <label className="label">Mês de referência</label>
              <input type="month" className="input" value={mesContador} onChange={(e) => setMesContador(e.target.value)} />
              <p className="text-xs text-savanna-muted mt-1">Relatório de comissões (base ISS) de todos os contratos no mês.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="label">{tipo === 'inquilino' ? 'Inquilino' : 'Proprietário'}</label>
                <select className="input" value={pessoaId} onChange={(e) => selecionarPessoa(e.target.value)}>
                  <option value="">Selecione</option>
                  {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Contrato</label>
                <select className="input" value={contratoId} onChange={(e) => setContratoId(e.target.value)} disabled={!pessoaId}>
                  <option value="">Selecione</option>
                  {contratosDaPessoa.map((c) => (
                    <option key={c.id} value={c.id}>{c.imovel?.nome || c.imovel?.endereco}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Ano-calendário</label>
                <select className="input" value={ano} onChange={(e) => setAno(e.target.value)}>
                  {anos.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </>
          )}

          {tipo === 'proprietario' && (
            <div className="md:col-span-4">
              <label className="label">Observação (opcional, aparece destacada no documento)</label>
              <input className="input" value={observacao} onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Obs. Rescisão do Contrato em 30.06.2026" />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={gerarPreview} disabled={(tipo !== 'contador' && !contratoId) || carregando} className="btn-secondary">
            {carregando ? 'Carregando...' : 'Pré-visualizar'}
          </button>
          <button onClick={gerarPdf} disabled={(tipo !== 'contador' && !contratoId) || carregando} className="btn-primary">
            Gerar PDF
          </button>
          {pdfGerado && (
            <a href={pdfGerado} target="_blank" className="btn-secondary flex items-center">Ver/Baixar PDF</a>
          )}
          {pdfGerado && (
            <button onClick={enviarWhatsapp} className="btn-secondary text-savanna-gold-500">
              Enviar WhatsApp
            </button>
          )}
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="font-medium text-savanna-green-700 mb-1">Enviar para o contador</h3>
        <p className="text-sm text-savanna-muted mb-4">
          Este demonstrativo (e os repasses feitos) pode ser enviado direto pra contabilidade todo mês.
        </p>

        <div className="grid md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="label">Contador</label>
            <select className="input" value={contadorId} onChange={(e) => setContadorId(e.target.value)}>
              <option value="">Selecione</option>
              {contadores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="md:col-span-2 flex gap-3 flex-wrap">
            <button type="button" className="btn-secondary"
              onClick={() => (mostrarNovoContador ? cancelarEdicaoContador() : setMostrarNovoContador(true))}>
              {mostrarNovoContador ? 'Cancelar' : '+ Cadastrar novo contador'}
            </button>
            {contadorId && !mostrarNovoContador && (
              <>
                <button type="button" className="btn-secondary" onClick={editarContadorSelecionado}>
                  Editar
                </button>
                <button type="button" className="btn-secondary text-savanna-rust" onClick={excluirContadorSelecionado}>
                  Excluir
                </button>
              </>
            )}
            {pdfGerado && tipo !== 'contador' && (
              <button onClick={enviarWhatsappContador} disabled={!contadorId} className="btn-secondary text-savanna-gold-500">
                Enviar para o contador
              </button>
            )}
          </div>
        </div>

        {mostrarNovoContador && (
          <div className="grid md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-savanna-border items-end">
            <div>
              <label className="label">Nome</label>
              <input className="input" value={novoContador.nome}
                onChange={(e) => setNovoContador({ ...novoContador, nome: e.target.value })} />
            </div>
            <div>
              <label className="label">Telefone (WhatsApp)</label>
              <input className="input" value={novoContador.telefone}
                onChange={(e) => setNovoContador({ ...novoContador, telefone: mascararTelefone(e.target.value) })} placeholder="(47) 99999-8888" />
            </div>
            <div>
              <label className="label">Email (opcional)</label>
              <input className="input" type="email" value={novoContador.email}
                onChange={(e) => setNovoContador({ ...novoContador, email: e.target.value })} />
            </div>
            <button onClick={salvarNovoContador} disabled={salvandoContador} className="btn-primary">
              {salvandoContador ? 'Salvando...' : editandoContadorId ? 'Salvar alterações' : 'Salvar contador'}
            </button>
          </div>
        )}
      </div>

      {dados && tipo === 'contador' && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-savanna-border">
            <p className="font-medium">Relatório mensal de comissões (base ISS) - {mesContador}</p>
            <p className="text-sm text-savanna-muted">{dados.linhas.length} pagamento(s) recebido(s) no mês</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-savanna-green-50 text-left text-savanna-muted">
                <th className="px-4 py-3">Contrato</th>
                <th className="px-4 py-3">Data Pgto</th>
                <th className="px-4 py-3">Inquilino</th>
                <th className="px-4 py-3">Proprietário</th>
                <th className="px-4 py-3">Aluguel</th>
                <th className="px-4 py-3">% Com.</th>
                <th className="px-4 py-3">Comissão (ISS)</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((linha: any, i: number) => (
                <tr key={i} className="border-t border-savanna-border">
                  <td className="px-4 py-3">{linha.numeroContrato}</td>
                  <td className="px-4 py-3">{linha.dataPagamento}</td>
                  <td className="px-4 py-3">{linha.inquilino}</td>
                  <td className="px-4 py-3">{linha.proprietarioNome}</td>
                  <td className="px-4 py-3">{formatarMoeda(linha.valorAluguel)}</td>
                  <td className="px-4 py-3">{linha.percentual ? `${linha.percentual}%` : '-'}</td>
                  <td className="px-4 py-3">{formatarMoeda(linha.valorComissao)}</td>
                </tr>
              ))}
              <tr className="border-t border-savanna-border font-medium text-savanna-green-700">
                <td className="px-4 py-3" colSpan={6}>TOTAL DO MÊS</td>
                <td className="px-4 py-3">{formatarMoeda(dados.totalComissao)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {dados && tipo !== 'contador' && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-savanna-border">
            <p className="font-medium">Contrato {dados.numeroContrato}</p>
            {tipo === 'proprietario' ? (
              <p className="text-sm text-savanna-muted">
                {dados.nomeLocador} · {dados.imovelLocado} · Locatário: {dados.locatario}
              </p>
            ) : (
              <p className="text-sm text-savanna-muted">
                {dados.nomeLocatario} · {dados.imovelLocado} · Locador: {dados.locador}
              </p>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-savanna-green-50 text-left text-savanna-muted">
                <th className="px-4 py-3">Mês</th>
                {tipo === 'proprietario' ? (
                  <>
                    <th className="px-4 py-3">Valor Bruto</th>
                    <th className="px-4 py-3">Comissão</th>
                    <th className="px-4 py-3">IPTU/Cond./Taxas</th>
                    <th className="px-4 py-3">Valor Líquido</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3">Aluguel</th>
                    <th className="px-4 py-3">Condomínio/Taxas</th>
                    <th className="px-4 py-3">IPTU</th>
                    <th className="px-4 py-3">Total Pago no Mês</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((linha: any, i: number) => (
                <tr key={i} className="border-t border-savanna-border">
                  <td className="px-4 py-3">{linha.mes}</td>
                  {tipo === 'proprietario' ? (
                    <>
                      <td className="px-4 py-3">{formatarMoeda(linha.bruto)}</td>
                      <td className="px-4 py-3">{formatarMoeda(linha.comissao)}</td>
                      <td className="px-4 py-3">{formatarMoeda(linha.deducoes)}</td>
                      <td className="px-4 py-3">{formatarMoeda(linha.liquido)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">{formatarMoeda(linha.aluguel)}</td>
                      <td className="px-4 py-3">{formatarMoeda(linha.condominio)}</td>
                      <td className="px-4 py-3">{formatarMoeda(linha.iptu)}</td>
                      <td className="px-4 py-3">{formatarMoeda(linha.total)}</td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="border-t border-savanna-border font-medium text-savanna-green-700">
                <td className="px-4 py-3">TOTAL ANUAL</td>
                {tipo === 'proprietario' ? (
                  <>
                    <td className="px-4 py-3">{formatarMoeda(dados.totais.bruto)}</td>
                    <td className="px-4 py-3">{formatarMoeda(dados.totais.comissao)}</td>
                    <td className="px-4 py-3">{formatarMoeda(dados.totais.deducoes)}</td>
                    <td className="px-4 py-3">{formatarMoeda(dados.totais.liquido)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">{formatarMoeda(dados.totais.aluguel)}</td>
                    <td className="px-4 py-3">{formatarMoeda(dados.totais.condominio)}</td>
                    <td className="px-4 py-3">{formatarMoeda(dados.totais.iptu)}</td>
                    <td className="px-4 py-3">{formatarMoeda(dados.totais.total)}</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
