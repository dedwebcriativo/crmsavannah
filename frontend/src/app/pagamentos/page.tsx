'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Paginacao from '@/components/Paginacao';
import MenuAcao from '@/components/MenuAcao';
import { IconeFatura, IconeLixeira, IconeEngrenagem, IconeWhatsapp, IconeNotaFiscal } from '@/components/icons';
import { api, API_URL, baixarArquivo } from '@/lib/api';
import { enviarEAbrirWhatsapp } from '@/lib/whatsapp';
import { mascararMoeda, moedaParaNumero } from '@/lib/mascaras';

const FORM_VAZIO = {
  inquilinoId: '',
  contratoId: '',
  tipo: 'ALUGUEL',
  valor: '',
  referenteMes: '',
  metodo: 'PIX',
  dataVencimento: '',
  dataPagamento: '',
  percentualImobiliaria: '',
  valorIptu: '',
  valorCondominio: '',
  percentualIntermediacao: '',
};

const STATUS_ESTILO: Record<string, string> = {
  PAGO: 'bg-savanna-green-100 text-savanna-green-700',
  PENDENTE: 'bg-savanna-gold-400/20 text-savanna-gold-500',
  ATRASADO: 'bg-savanna-rust/15 text-savanna-rust',
  CANCELADO: 'bg-savanna-green-50 text-savanna-muted',
};

const LABEL_TIPO: Record<string, string> = { ALUGUEL: 'Aluguel', CAUCAO: 'Caução', TAXA: 'Taxa' };

function formatarMoeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PagamentosPage() {
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [inquilinos, setInquilinos] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [form, setForm] = useState<any>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [linkWhatsapp, setLinkWhatsapp] = useState('');
  const [linhaDestacadaId, setLinhaDestacadaId] = useState<number | null>(null);

  const [filtro, setFiltro] = useState<'todos' | 'pago' | 'pendente' | 'atrasado' | 'inadimplente' | 'cancelado'>('todos');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    setSelecionados([]);
  }, [filtro, pagina]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [mostrarRelatorio, setMostrarRelatorio] = useState(false);
  const [relatorio, setRelatorio] = useState<any[]>([]);

  const [itensExtras, setItensExtras] = useState<{ descricao: string; valor: string }[]>([]);
  const [itensExistentes, setItensExistentes] = useState<{ id: number; descricao: string; valor: number }[]>([]);

  function adicionarItemExtra() {
    setItensExtras((itens) => [...itens, { descricao: '', valor: '' }]);
  }

  function atualizarItemExtra(indice: number, campo: 'descricao' | 'valor', valor: string) {
    setItensExtras((itens) => itens.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));
  }

  function removerItemExtra(indice: number) {
    setItensExtras((itens) => itens.filter((_, i) => i !== indice));
  }

  async function removerItemExistente(itemId: number) {
    if (!editandoId) return;
    try {
      await api.delete(`/api/pagamentos/${editandoId}/itens/${itemId}`);
      setItensExistentes((itens) => itens.filter((it) => it.id !== itemId));
    } catch (err: any) {
      setErro(err.message);
    }
  }

  // Destaca a linha por alguns segundos após uma ação (gerar PDF, enviar WhatsApp, etc.)
  // pra facilitar achar qual pagamento acabou de ser mexido, já que a página não muda mais.
  function destacarLinha(id: number) {
    setLinhaDestacadaId(id);
    setTimeout(() => setLinhaDestacadaId((atual) => (atual === id ? null : atual)), 2500);
  }

  function carregar(filtroAtual = filtro, buscaAtual = busca, paginaAtual = pagina) {
    const params = new URLSearchParams();
    if (filtroAtual !== 'todos') params.set('filtro', filtroAtual);
    if (buscaAtual) params.set('busca', buscaAtual);
    params.set('pagina', String(paginaAtual));

    api.get(`/api/pagamentos?${params.toString()}`)
      .then((resposta) => {
        // Se a página pedida ficou vazia (ex: excluiu o único registro da última
        // página), busca a última página que realmente tem conteúdo, em vez de
        // deixar a tela em branco.
        if (resposta.dados.length === 0 && resposta.pagina > 1 && resposta.pagina > resposta.totalPaginas) {
          carregar(filtroAtual, buscaAtual, resposta.totalPaginas);
          return;
        }
        setPagamentos(resposta.dados);
        setTotalRegistros(resposta.total);
        setTotalPaginas(resposta.totalPaginas);
        setPagina(resposta.pagina);
      })
      .catch((e) => setErro(e.message));
    api.get('/api/inquilinos').then(setInquilinos);
    api.get('/api/contratos').then(setContratos);
  }

  function irParaPagina(p: number) {
    carregar(filtro, busca, p);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar(filtro, busca, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  useEffect(() => {
    const timer = setTimeout(() => carregar(filtro, busca, 1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function alternarFormulario() {
    setForm(FORM_VAZIO);
    setItensExtras([]);
    setItensExistentes([]);
    setEditandoId(null);
    setMostrarForm((v) => !v);
  }

  function paraCampoData(valor: any) {
    if (!valor) return '';
    return new Date(valor).toISOString().slice(0, 10);
  }

  function abrirEdicao(p: any) {
    setEditandoId(p.id);
    setItensExtras([]);
    setItensExistentes(p.itens || []);
    setForm({
      inquilinoId: String(p.inquilinoId),
      contratoId: p.contratoId ? String(p.contratoId) : '',
      tipo: p.tipo,
      valor: mascararMoeda(String(Math.round(Number(p.valor) * 100))),
      referenteMes: p.referenteMes,
      metodo: p.metodo,
      dataVencimento: paraCampoData(p.dataVencimento),
      dataPagamento: paraCampoData(p.dataPagamento),
      percentualImobiliaria: p.percentualImobiliaria ?? '',
      valorIptu: p.valorIptu ? mascararMoeda(String(Math.round(Number(p.valorIptu) * 100))) : '',
      // Registros antigos só tinham "deducoes" (lump-sum); se não há quebra ainda, carrega o valor
      // no campo Condomínio/Taxas pra não se perder ao salvar de novo (o admin pode reclassificar).
      valorCondominio: p.valorCondominio
        ? mascararMoeda(String(Math.round(Number(p.valorCondominio) * 100)))
        : (p.valorIptu ? '' : (p.deducoes ? mascararMoeda(String(Math.round(Number(p.deducoes) * 100))) : '')),
      percentualIntermediacao: p.percentualIntermediacao ?? '',
    });
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selecionarInquilino(inquilinoId: string) {
    setForm((f: any) => ({ ...f, inquilinoId, contratoId: '' }));
  }

  function selecionarContrato(contratoId: string) {
    const contrato = contratos.find((c) => String(c.id) === contratoId);
    setForm((f: any) => ({
      ...f,
      contratoId,
      valor: contrato
        ? mascararMoeda(String(Math.round(Number(f.tipo === 'CAUCAO' ? (contrato.caucao || 0) : contrato.valorAluguel) * 100)))
        : f.valor,
      percentualImobiliaria: contrato?.percentualComissao ? String(contrato.percentualComissao) : f.percentualImobiliaria,
      valorIptu: contrato?.imovel?.valorIptu
        ? mascararMoeda(String(Math.round(Number(contrato.imovel.valorIptu) * 100)))
        : f.valorIptu,
    }));
  }

  function selecionarTipo(tipo: string) {
    const contrato = contratos.find((c) => String(c.id) === form.contratoId);
    setForm((f: any) => ({
      ...f,
      tipo,
      valor: contrato
        ? mascararMoeda(String(Math.round(Number(tipo === 'CAUCAO' ? (contrato.caucao || 0) : contrato.valorAluguel) * 100)))
        : f.valor,
    }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setMensagem('');
    try {
      if (editandoId) {
        const payload: any = {
          tipo: form.tipo,
          valor: moedaParaNumero(form.valor),
          referenteMes: form.referenteMes,
          metodo: form.metodo,
          dataVencimento: form.dataVencimento,
          dataPagamento: form.dataPagamento || null,
          percentualImobiliaria: form.percentualImobiliaria === '' ? null : Number(form.percentualImobiliaria),
          valorIptu: form.valorIptu === '' ? null : moedaParaNumero(form.valorIptu),
          valorCondominio: form.valorCondominio === '' ? null : moedaParaNumero(form.valorCondominio),
          percentualIntermediacao: form.percentualIntermediacao === '' ? null : Number(form.percentualIntermediacao),
        };
        await api.put(`/api/pagamentos/${editandoId}`, payload);

        // Encargos adicionais novos (os já existentes são removidos na hora, pelo botão "Remover")
        const itensValidos = itensExtras.filter((it) => it.descricao && it.valor);
        for (const item of itensValidos) {
          await api.post(`/api/pagamentos/${editandoId}/itens`, { descricao: item.descricao, valor: moedaParaNumero(item.valor) });
        }

        setMensagem('Pagamento atualizado.');
        destacarLinha(editandoId);
      } else {
        const itensValidos = itensExtras
          .filter((it) => it.descricao && it.valor)
          .map((it) => ({ descricao: it.descricao, valor: moedaParaNumero(it.valor) }));
        await api.post('/api/pagamentos', {
          ...form,
          valor: moedaParaNumero(form.valor),
          valorIptu: form.valorIptu === '' ? null : moedaParaNumero(form.valorIptu),
          valorCondominio: form.valorCondominio === '' ? null : moedaParaNumero(form.valorCondominio),
          percentualIntermediacao: form.percentualIntermediacao === '' ? null : Number(form.percentualIntermediacao),
          itens: itensValidos,
        });
      }
      setForm(FORM_VAZIO);
      setItensExtras([]);
      setItensExistentes([]);
      setEditandoId(null);
      setMostrarForm(false);
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [dandoBaixaEmLote, setDandoBaixaEmLote] = useState(false);

  function alternarSelecao(id: number) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function alternarSelecaoTodos() {
    const idsElegiveis = pagamentos.filter((p: any) => p.status !== 'PAGO' && p.status !== 'CANCELADO').map((p: any) => p.id);
    const todosJaSelecionados = idsElegiveis.length > 0 && idsElegiveis.every((id: number) => selecionados.includes(id));
    setSelecionados(todosJaSelecionados ? [] : idsElegiveis);
  }

  async function darBaixaEmLote() {
    if (!selecionados.length) return;
    if (!confirm(`Marcar ${selecionados.length} pagamento(s) selecionado(s) como pago?`)) return;
    setDandoBaixaEmLote(true);
    setErro('');
    setMensagem('');
    try {
      const resultado = await api.put('/api/pagamentos/marcar-pago-em-lote', { ids: selecionados });
      setMensagem(`${resultado.atualizados} pagamento(s) marcado(s) como pago.`);
      setSelecionados([]);
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setDandoBaixaEmLote(false);
    }
  }

  async function marcarPago(id: number) {
    await api.put(`/api/pagamentos/${id}/marcar-pago`);
    destacarLinha(id);
    carregar(filtro, busca, pagina);
  }

  async function marcarRepassado(id: number) {
    await api.put(`/api/pagamentos/${id}/marcar-repassado`);
    destacarLinha(id);
    carregar(filtro, busca, pagina);
  }

  async function gerarRepasse(id: number) {
    setMensagem('');
    try {
      await api.post(`/api/pagamentos/${id}/repasse`);
      setMensagem('Recibo de repasse gerado com sucesso.');
      destacarLinha(id);
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function enviarRepasseWhatsapp(id: number) {
    setMensagem('');
    setLinkWhatsapp('');
    destacarLinha(id);
    try {
      const { resultado, linkAberto } = await enviarEAbrirWhatsapp(() => api.post(`/api/pagamentos/${id}/repasse/enviar-whatsapp`));
      if (resultado?.resultado?.simulado) {
        if (linkAberto) {
          setMensagem('WhatsApp aberto em uma nova aba.');
        } else {
          setMensagem('Não foi possível abrir o WhatsApp automaticamente (popup bloqueado). Use o link abaixo.');
          setLinkWhatsapp(resultado?.resultado?.linkWhatsapp || '');
        }
      } else {
        setMensagem('Recibo de repasse enviado ao proprietário via WhatsApp.');
      }
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function cancelarPagamento(id: number) {
    if (!confirm('Cancelar este pagamento? Ele deixa de contar como pendente/atrasado, mas o registro é mantido no histórico.')) return;
    setErro('');
    setMensagem('');
    try {
      await api.put(`/api/pagamentos/${id}/cancelar`);
      setMensagem('Pagamento cancelado.');
      destacarLinha(id);
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function excluirPagamento(id: number) {
    if (!confirm('Excluir este pagamento definitivamente? Esta ação não pode ser desfeita.')) return;
    setErro('');
    setMensagem('');
    try {
      await api.delete(`/api/pagamentos/${id}`);
      setMensagem('Pagamento excluído.');
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function gerarRecibo(id: number) {
    setMensagem('');
    try {
      await api.post(`/api/pagamentos/${id}/recibo`);
      setMensagem('Recibo gerado com sucesso.');
      destacarLinha(id);
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function gerarDadosNotaFiscal(id: number) {
    setMensagem('');
    try {
      await api.post(`/api/pagamentos/${id}/dados-nota-fiscal`);
      setMensagem('Dados da nota fiscal gerados com sucesso.');
      destacarLinha(id);
      carregar(filtro, busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function enviarDadosNotaFiscalWhatsapp(id: number) {
    setMensagem('');
    setLinkWhatsapp('');
    destacarLinha(id);
    try {
      const { resultado, linkAberto } = await enviarEAbrirWhatsapp(() => api.post(`/api/pagamentos/${id}/dados-nota-fiscal/enviar-whatsapp`));
      if (resultado?.resultado?.simulado) {
        if (linkAberto) {
          setMensagem('WhatsApp aberto em uma nova aba.');
        } else {
          setMensagem('Não foi possível abrir o WhatsApp automaticamente (popup bloqueado). Use o link abaixo.');
          setLinkWhatsapp(resultado?.resultado?.linkWhatsapp || '');
        }
      } else {
        setMensagem('Dados da nota fiscal enviados ao proprietário via WhatsApp.');
      }
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function enviarWhatsapp(id: number) {
    setMensagem('');
    setLinkWhatsapp('');
    destacarLinha(id);
    try {
      const { resultado, linkAberto } = await enviarEAbrirWhatsapp(() => api.post(`/api/pagamentos/${id}/enviar-whatsapp`));
      if (resultado?.resultado?.simulado) {
        if (linkAberto) {
          setMensagem('WhatsApp aberto em uma nova aba.');
        } else {
          setMensagem('Não foi possível abrir o WhatsApp automaticamente (popup bloqueado). Use o link abaixo.');
          setLinkWhatsapp(resultado?.resultado?.linkWhatsapp || '');
        }
      } else {
        setMensagem('Recibo enviado via WhatsApp.');
      }
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function abrirRelatorio() {
    setErro('');
    try {
      const dados = await api.get('/api/pagamentos/relatorio');
      setRelatorio(dados);
      setMostrarRelatorio(true);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const contratosDoInquilino = contratos.filter((c) => String(c.inquilinoId) === form.inquilinoId);

  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [mesRelatorioIss, setMesRelatorioIss] = useState(new Date().toISOString().slice(0, 7));

  async function baixarRelatorioLista() {
    setErro('');
    setGerandoRelatorio(true);
    try {
      const params = new URLSearchParams();
      if (filtro !== 'todos') params.set('filtro', filtro);
      if (busca) params.set('busca', busca);
      const query = params.toString() ? `?${params.toString()}` : '';
      await baixarArquivo(`/api/pagamentos/relatorio-lista/exportar${query}`, `pagamentos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setGerandoRelatorio(false);
    }
  }

  async function baixarRelatorioIss() {
    setErro('');
    setGerandoRelatorio(true);
    try {
      await baixarArquivo(`/api/pagamentos/relatorio-iss/exportar?mes=${mesRelatorioIss}`, `relatorio-iss-${mesRelatorioIss}.xlsx`);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setGerandoRelatorio(false);
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-semibold text-2xl text-savanna-green-700">Pagamentos</h1>
          <p className="text-savanna-muted text-sm">Controle financeiro e recibos</p>
        </div>
        <div className="flex gap-3">
          <Link href="/proprietarios" className="btn-secondary flex items-center">Proprietários</Link>
          <button className="btn-secondary" onClick={abrirRelatorio}>
            Relatório financeiro
          </button>
          <button className="btn-secondary" onClick={baixarRelatorioLista} disabled={gerandoRelatorio}>
            {gerandoRelatorio ? 'Gerando...' : 'Gerar relatório (planilha)'}
          </button>
          <div className="flex items-center gap-1">
            <input type="month" className="input" style={{ width: 150 }} value={mesRelatorioIss}
              onChange={(e) => setMesRelatorioIss(e.target.value)} />
            <button className="btn-secondary" onClick={baixarRelatorioIss} disabled={gerandoRelatorio} title="Relatório mensal isolando a comissão (base de ISS) pro contador">
              Relatório ISS
            </button>
          </div>
          <button className="btn-primary" onClick={alternarFormulario}>
            {mostrarForm ? 'Cancelar' : '+ Novo pagamento'}
          </button>
        </div>
      </div>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}
      {mensagem && <p className="text-savanna-green-700 text-sm mb-1">{mensagem}</p>}
      {linkWhatsapp && (
        <a href={linkWhatsapp} target="_blank" rel="noreferrer" className="text-sm text-savanna-gold-500 underline mb-4 inline-block">
          Abrir no WhatsApp para enviar
        </a>
      )}

      {mostrarRelatorio && (
        <div className="card mb-6 p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-savanna-border">
            <h3 className="font-medium text-savanna-green-700">Relatório financeiro por inquilino</h3>
            <div className="flex items-center gap-4">
              <button
                onClick={async () => {
                  setErro('');
                  try {
                    await baixarArquivo('/api/pagamentos/relatorio/exportar', `relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.xlsx`);
                  } catch (err: any) {
                    setErro(err.message);
                  }
                }}
                className="text-sm text-savanna-green-700 underline"
              >
                Baixar planilha
              </button>
              <button onClick={() => setMostrarRelatorio(false)} className="text-sm text-savanna-muted underline">
                Fechar
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-savanna-green-50 text-left text-savanna-muted">
                <th className="px-4 py-3">Inquilino</th>
                <th className="px-4 py-3">Proprietário</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Pendente</th>
                <th className="px-4 py-3">Atrasado</th>
                <th className="px-4 py-3">Repassado ao propr.</th>
                <th className="px-4 py-3">Retido imobiliária</th>
                <th className="px-4 py-3">Caução</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {relatorio.map((r) => (
                <tr key={r.inquilinoId} className="border-t border-savanna-border">
                  <td className="px-4 py-3">{r.nome}</td>
                  <td className="px-4 py-3">{r.proprietario?.nome || '-'}</td>
                  <td className="px-4 py-3 text-savanna-green-700">{formatarMoeda(r.totalPago)}</td>
                  <td className="px-4 py-3 text-savanna-gold-500">{formatarMoeda(r.totalPendente)}</td>
                  <td className="px-4 py-3 text-savanna-rust">{formatarMoeda(r.totalAtrasado)}</td>
                  <td className="px-4 py-3">{formatarMoeda(r.totalRepassado)}</td>
                  <td className="px-4 py-3">{formatarMoeda(r.totalRetidoImobiliaria)}</td>
                  <td className="px-4 py-3">
                    {r.caucao ? (
                      <>
                        {formatarMoeda(r.caucao.valor)}
                        {r.caucao.dataPagamento && (
                          <span className="block text-xs text-savanna-muted">
                            {new Date(r.caucao.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                          </span>
                        )}
                      </>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {r.inadimplente ? (
                      <span className="badge bg-savanna-rust/15 text-savanna-rust">Inadimplente</span>
                    ) : (
                      <span className="badge bg-savanna-green-100 text-savanna-green-700">Regular</span>
                    )}
                  </td>
                </tr>
              ))}
              {relatorio.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-savanna-muted">Nenhum dado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="card mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Buscar por inquilino</label>
          <input className="input" placeholder="Ex: Maria..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { valor: 'todos', label: 'Todos' },
            { valor: 'pago', label: 'Pago' },
            { valor: 'pendente', label: 'Pendente' },
            { valor: 'atrasado', label: 'Atrasado' },
            { valor: 'cancelado', label: 'Cancelados' },
            { valor: 'inadimplente', label: 'Inadimplentes' },
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
        <form onSubmit={salvar} className="card mb-6 grid md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <h3 className="font-medium text-savanna-green-700">
              {editandoId ? 'Editar pagamento' : 'Novo pagamento'}
            </h3>
          </div>
          <div>
            <label className="label">Inquilino</label>
            <select className="input" required value={form.inquilinoId} disabled={!!editandoId}
              onChange={(e) => selecionarInquilino(e.target.value)}>
              <option value="">Selecione</option>
              {inquilinos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Contrato (opcional)</label>
            <select className="input" value={form.contratoId} disabled={!!editandoId || !form.inquilinoId}
              onChange={(e) => selecionarContrato(e.target.value)}>
              <option value="">Nenhum</option>
              {contratosDoInquilino.map((c) => (
                <option key={c.id} value={c.id}>{c.imovel.nome || c.imovel.endereco}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.tipo} onChange={(e) => selecionarTipo(e.target.value)}>
              <option value="ALUGUEL">Aluguel</option>
              <option value="CAUCAO">Caução</option>
              <option value="TAXA">Taxa</option>
            </select>
          </div>
          <div>
            <label className="label">Valor</label>
            <div className="flex items-center gap-2">
              <span className="text-savanna-muted">R$</span>
              <input className="input" required value={form.valor}
                onChange={(e) => setForm({ ...form, valor: mascararMoeda(e.target.value) })} placeholder="0,00" />
            </div>
          </div>
          <div>
            <label className="label">Referente ao mês</label>
            <input className="input" type="month" required value={form.referenteMes}
              onChange={(e) => setForm({ ...form, referenteMes: e.target.value })} />
          </div>
          <div>
            <label className="label">Método</label>
            <select className="input" value={form.metodo}
              onChange={(e) => setForm({ ...form, metodo: e.target.value })}>
              <option value="PIX">Pix</option>
              <option value="BOLETO">Boleto</option>
              <option value="DINHEIRO">Dinheiro</option>
            </select>
          </div>
          <div>
            <label className="label">Vencimento</label>
            <input className="input" type="date" required value={form.dataVencimento}
              onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })} />
          </div>
          {editandoId && (
            <div>
              <label className="label">Data do pagamento</label>
              <input className="input" type="date" value={form.dataPagamento}
                onChange={(e) => setForm({ ...form, dataPagamento: e.target.value })} />
              <p className="text-xs text-savanna-muted mt-1">Deixe em branco se ainda não foi pago.</p>
            </div>
          )}
          <div>
            <label className="label">% comissão da imobiliária</label>
            <input className="input" type="number" step="0.01" min="0" max="100" value={form.percentualImobiliaria}
              onChange={(e) => setForm({ ...form, percentualImobiliaria: e.target.value })} placeholder="Ex: 10" />
          </div>
          <div>
            <label className="label">IPTU</label>
            <div className="flex items-center gap-2">
              <span className="text-savanna-muted">R$</span>
              <input className="input" value={form.valorIptu}
                onChange={(e) => setForm({ ...form, valorIptu: mascararMoeda(e.target.value) })} placeholder="0,00" />
            </div>
            <p className="text-xs text-savanna-muted mt-1">Somado ao repasse (o proprietário é quem recebe).</p>
          </div>
          <div>
            <label className="label">Condomínio/Taxas</label>
            <div className="flex items-center gap-2">
              <span className="text-savanna-muted">R$</span>
              <input className="input" value={form.valorCondominio}
                onChange={(e) => setForm({ ...form, valorCondominio: mascararMoeda(e.target.value) })} placeholder="0,00" />
            </div>
            <p className="text-xs text-savanna-muted mt-1">Somado ao repasse (o proprietário é quem recebe).</p>
          </div>
          <div>
            <label className="label">% taxa de intermediação</label>
            <input className="input" type="number" step="0.01" min="0" max="100" value={form.percentualIntermediacao}
              onChange={(e) => setForm({ ...form, percentualIntermediacao: e.target.value })} placeholder="Ex: 50" />
            <p className="text-xs text-savanna-muted mt-1">Descontada do repasse - normalmente só no 1º aluguel do contrato.</p>
          </div>
          {(form.percentualImobiliaria || form.valorIptu || form.valorCondominio || form.percentualIntermediacao) && form.valor && (
            <div className="flex items-end">
              <p className="text-sm text-savanna-muted">
                Repasse ao proprietário: <span className="font-medium text-savanna-ink">
                  {formatarMoeda(
                    moedaParaNumero(form.valor)
                    - moedaParaNumero(form.valor) * (Number(form.percentualImobiliaria || 0) / 100)
                    - moedaParaNumero(form.valor) * (Number(form.percentualIntermediacao || 0) / 100)
                    + moedaParaNumero(form.valorIptu || '0')
                    + moedaParaNumero(form.valorCondominio || '0')
                  )}
                </span>
              </p>
            </div>
          )}

          <div className="md:col-span-3 border-t border-savanna-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-savanna-green-700">Encargos adicionais (opcional)</h3>
              <button type="button" onClick={adicionarItemExtra} className="text-sm text-savanna-green-600 underline">
                + Adicionar item
              </button>
            </div>
            <p className="text-xs text-savanna-muted mb-3">
              Ex: taxa de mudança, consumo de gás. Aparecem detalhados no recibo, somados ao valor acima.
            </p>

            {itensExistentes.length > 0 && (
              <div className="mb-3">
                {itensExistentes.map((item) => (
                  <div key={item.id} className="flex gap-3 mb-2 items-center">
                    <input className="input" value={item.descricao} disabled />
                    <input className="input md:w-40" value={formatarMoeda(item.valor)} disabled />
                    <button type="button" onClick={() => removerItemExistente(item.id)} className="text-savanna-rust text-xs underline whitespace-nowrap">
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            {itensExtras.map((item, indice) => (
              <div key={indice} className="flex gap-3 mb-2 items-center">
                <input className="input" placeholder="Descrição (ex: Taxa de Mudança Junho 2026)"
                  value={item.descricao} onChange={(e) => atualizarItemExtra(indice, 'descricao', e.target.value)} />
                <div className="input md:w-40 flex items-center gap-1.5">
                  <span className="text-savanna-muted text-sm">R$</span>
                  <input className="flex-1 outline-none bg-transparent" placeholder="0,00"
                    value={item.valor} onChange={(e) => atualizarItemExtra(indice, 'valor', mascararMoeda(e.target.value))} />
                </div>
                <button type="button" onClick={() => removerItemExtra(indice)} className="text-savanna-rust text-xs underline whitespace-nowrap">
                  Remover
                </button>
              </div>
            ))}
            {itensExtras.length > 0 && form.valor && (
              <p className="text-sm text-savanna-muted mt-2">
                Total do recibo (valor + encargos): <span className="font-medium text-savanna-ink">
                  {formatarMoeda(moedaParaNumero(form.valor) + itensExtras.reduce((s, it) => s + moedaParaNumero(it.valor), 0))}
                </span>
              </p>
            )}
          </div>

          <div className="md:col-span-3">
            <button className="btn-primary" type="submit">
              {editandoId ? 'Salvar alterações' : 'Registrar pagamento'}
            </button>
          </div>
        </form>
      )}

      {selecionados.length > 0 && (
        <div className="card mb-4 bg-savanna-green-50 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-savanna-ink font-medium">{selecionados.length} pagamento(s) selecionado(s)</p>
          <div className="flex items-center gap-3">
            <button type="button" className="text-xs text-savanna-muted underline" onClick={() => setSelecionados([])}>
              Limpar seleção
            </button>
            <button type="button" className="btn-primary" onClick={darBaixaEmLote} disabled={dandoBaixaEmLote}>
              {dandoBaixaEmLote ? 'Processando...' : `Marcar ${selecionados.length} como pago`}
            </button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} posicao="topo" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-savanna-green-50 text-left text-savanna-muted">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={pagamentos.some((p: any) => p.status !== 'PAGO' && p.status !== 'CANCELADO') && pagamentos.filter((p: any) => p.status !== 'PAGO' && p.status !== 'CANCELADO').every((p: any) => selecionados.includes(p.id))}
                  onChange={alternarSelecaoTodos}
                />
              </th>
              <th className="px-4 py-3">Inquilino</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Mês</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Repasse</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pagamentos.map((p) => (
              <tr
                key={p.id}
                className={`border-t border-savanna-border align-top transition-colors duration-700 ${
                  linhaDestacadaId === p.id ? 'bg-savanna-gold-400/20' : ''
                }`}
              >
                <td className="px-4 py-3">
                  {p.status !== 'PAGO' && p.status !== 'CANCELADO' && (
                    <input type="checkbox" checked={selecionados.includes(p.id)} onChange={() => alternarSelecao(p.id)} />
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.inquilino.nome}
                  {p.inquilinoInadimplente && (
                    <span className="badge block mt-1 w-fit bg-savanna-rust/15 text-savanna-rust">Inadimplente</span>
                  )}
                </td>
                <td className="px-4 py-3">{LABEL_TIPO[p.tipo] || 'Aluguel'}</td>
                <td className="px-4 py-3">{p.referenteMes}</td>
                <td className="px-4 py-3">{formatarMoeda(p.valor)}</td>
                <td className="px-4 py-3">{new Date(p.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${STATUS_ESTILO[p.status]}`}>{p.status}</span>
                </td>
                <td className="px-4 py-3">
                  {p.valorRepasse ? (
                    <>
                      {formatarMoeda(p.valorRepasse)}
                      {p.repassado ? (
                        <span className="block text-xs text-savanna-green-700">
                          Repassado {p.dataRepasse ? `em ${new Date(p.dataRepasse).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : ''}
                        </span>
                      ) : (
                        <>
                          {p.status === 'PAGO' && (
                            <button onClick={() => marcarRepassado(p.id)} className="block text-xs text-savanna-green-600 underline mt-0.5">
                              Marcar repassado
                            </button>
                          )}
                          {p.status === 'PAGO' && p.prazoRepasseEm && (() => {
                            const prazo = new Date(p.prazoRepasseEm);
                            const hoje = new Date();
                            hoje.setHours(0, 0, 0, 0);
                            const prazoDia = new Date(prazo);
                            prazoDia.setHours(0, 0, 0, 0);
                            const atrasado = prazoDia < hoje;
                            const venceHoje = prazoDia.getTime() === hoje.getTime();
                            return (
                              <span className={`block text-xs mt-0.5 ${atrasado ? 'text-savanna-rust font-medium' : venceHoje ? 'text-savanna-gold-600 font-medium' : 'text-savanna-muted'}`}>
                                {atrasado ? 'Repasse atrasado - prazo era ' : venceHoje ? 'Repasse vence hoje' : 'Prazo do repasse: '}
                                {!venceHoje && prazo.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                              </span>
                            );
                          })()}
                        </>
                      )}
                      {p.reciboRepassePdf ? (
                        <div className="flex items-center gap-2 mt-1">
                          <a
                            href={`${API_URL}/api/pagamentos/${p.id}/repasse/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-savanna-green-600 underline"
                          >
                            Ver recibo
                          </a>
                          <button
                            onClick={() => enviarRepasseWhatsapp(p.id)}
                            title="Enviar recibo de repasse ao proprietário"
                            className="text-savanna-gold-500 hover:text-savanna-gold-600"
                          >
                            <IconeWhatsapp className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => gerarRepasse(p.id)} className="block text-xs text-savanna-muted underline mt-0.5">
                          Gerar recibo de repasse
                        </button>
                      )}
                    </>
                  ) : '-'}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <MenuAcao
                      icone={<IconeFatura />}
                      titulo="Recibo / marcar pago"
                      corIcone="text-savanna-green-600"
                      itens={[
                        { label: 'Marcar pago', onClick: () => marcarPago(p.id), desabilitado: p.status === 'PAGO' || p.status === 'CANCELADO' },
                        p.reciboPdf
                          ? { label: 'Ver recibo', onClick: () => {}, href: `${API_URL}/api/pagamentos/${p.id}/recibo` }
                          : { label: 'Gerar recibo', onClick: () => gerarRecibo(p.id) },
                      ]}
                    />
                    <MenuAcao
                      icone={<IconeEngrenagem />}
                      titulo="Editar / cancelar"
                      corIcone="text-savanna-muted"
                      itens={[
                        { label: 'Editar', onClick: () => abrirEdicao(p) },
                        { label: 'Cancelar (suspender)', onClick: () => cancelarPagamento(p.id), cor: 'destaque', desabilitado: p.status === 'CANCELADO' },
                      ]}
                    />
                    <MenuAcao
                      icone={<IconeNotaFiscal />}
                      titulo="Dados para nota fiscal"
                      corIcone="text-savanna-muted"
                      itens={[
                        p.dadosNotaFiscalPdf
                          ? { label: 'Ver dados da nota fiscal', onClick: () => {}, href: `${API_URL}/api/pagamentos/${p.id}/dados-nota-fiscal/pdf` }
                          : { label: 'Gerar dados da nota fiscal', onClick: () => gerarDadosNotaFiscal(p.id) },
                        { label: 'Enviar ao proprietário (WhatsApp)', onClick: () => enviarDadosNotaFiscalWhatsapp(p.id), desabilitado: !p.dadosNotaFiscalPdf },
                        p.dadosNotaFiscalPdf
                          ? { label: 'Atualizar dados', onClick: () => gerarDadosNotaFiscal(p.id) }
                          : null,
                      ].filter(Boolean) as any}
                    />
                    <button onClick={() => enviarWhatsapp(p.id)} title="Enviar WhatsApp"
                      className="p-1.5 rounded-sm text-savanna-gold-500 hover:bg-savanna-green-50">
                      <IconeWhatsapp />
                    </button>
                    <button onClick={() => excluirPagamento(p.id)} title="Excluir"
                      className="p-1.5 rounded-sm text-savanna-rust hover:bg-savanna-rust/10">
                      <IconeLixeira />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pagamentos.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-savanna-muted">Nenhum pagamento encontrado.</td></tr>
            )}
          </tbody>
        </table>
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} />
      </div>
    </AppShell>
  );
}
