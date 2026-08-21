'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Paginacao from '@/components/Paginacao';
import { IconeFatura, IconeEngrenagem, IconeLixeira, IconeNotaFiscal, IconeDocumento, IconeLupa, IconeWhatsapp, IconePdf } from '@/components/icons';
import { api, API_URL, baixarArquivo } from '@/lib/api';
import { enviarEAbrirWhatsapp } from '@/lib/whatsapp';
import { mascararTelefone, mascararCpfCnpj, validarCpfCnpj, consultarCnpj, apenasDigitos, mascararRg, mascararInscricaoEstadual, ehCnpj, mascararCep, consultarCep, mascararAgencia, mascararConta, mascararChavePix, detectarTipoChavePix, TipoChavePix, mascararMoeda, moedaParaNumero } from '@/lib/mascaras';

const FORM_NOTA_VAZIO = {
  tipo: 'NFE',
  numero: '',
  serie: '',
  chaveAcesso: '',
  dataEmissao: '',
  valorTotal: '',
  emitenteNome: '',
  emitenteCnpj: '',
  discriminacao: '',
  observacoes: '',
};

function mascararChaveAcesso(valor: string) {
  return valor.replace(/\D/g, '').slice(0, 44);
}

// Portal público nacional de consulta de NF-e/NFA-e/CT-e. Não existe um jeito de
// pré-preencher a chave por URL (a Receita exige digitar + captcha manualmente,
// isso é proposital pra evitar consultas automatizadas) - então só copiamos a
// chave pra área de transferência e abrimos o portal, prontos pra colar.
const LINK_CONSULTA_NFE = 'https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g%3D';

function consultarChaveNaReceita(chave: string) {
  navigator.clipboard.writeText(chave).catch(() => {});
  window.open(LINK_CONSULTA_NFE, '_blank', 'noopener,noreferrer');
}

const ESTADOS_CIVIS = [
  { valor: 'solteiro', label: 'Solteiro(a)' },
  { valor: 'casado', label: 'Casado(a)' },
  { valor: 'uniao_estavel', label: 'União Estável' },
  { valor: 'viuvo', label: 'Viúvo(a)' },
  { valor: 'divorciado', label: 'Divorciado(a)' },
];
const ESTADOS_CIVIS_COM_PARCEIRO = ['casado', 'uniao_estavel', 'divorciado'];

function labelParceiro(estadoCivil: string) {
  if (estadoCivil === 'uniao_estavel') return 'Dados do(a) parceiro(a)';
  if (estadoCivil === 'divorciado') return 'Ex-cônjuge / parceiro(a) (opcional)';
  return 'Dados do cônjuge';
}

const FORM_VAZIO = {
  nome: '',
  nacionalidade: 'Brasileiro(a)',
  estadoCivil: '',
  conjugeNome: '',
  conjugeCpfCnpj: '',
  conjugeTelefone: '',
  conjugeRg: '',
  conjugeEmail: '',
  profissao: '',
  ramoAtividade: '',
  cpfCnpj: '',
  rg: '',
  cep: '',
  endereco: '',
  numero: '',
  bairro: '',
  cidade: '',
  estado: '',
  telefone: '',
  telefoneAdicional: '',
  socioResponsavelNome: '',
  socioResponsavelCpf: '',
  socioResponsavelTelefone: '',
  socioResponsavelEmail: '',
  socioResponsavel2Nome: '',
  socioResponsavel2Cpf: '',
  socioResponsavel2Telefone: '',
  socioResponsavel2Email: '',
  email: '',
  tipoChavePix: 'celular' as TipoChavePix,
  chavePix: '',
  bancoNome: '',
  bancoAgencia: '',
  bancoConta: '',
  tipoContaBancaria: 'corrente',
  diaRepasse: '',
  observacoes: '',
};

function formatarMoeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ProprietariosPage() {
  const [proprietarios, setProprietarios] = useState<any[]>([]);
  const [form, setForm] = useState<any>(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [erroCpf, setErroCpf] = useState('');
  const [erroCpfConjuge, setErroCpfConjuge] = useState('');
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [repasses, setRepasses] = useState<any>(null);
  const [carregandoRepasses, setCarregandoRepasses] = useState(false);

  const [notasAbertoId, setNotasAbertoId] = useState<number | null>(null);
  const [notas, setNotas] = useState<any[]>([]);
  const [carregandoNotas, setCarregandoNotas] = useState(false);
  const [mostrarFormNota, setMostrarFormNota] = useState(false);
  const [formNota, setFormNota] = useState<any>(FORM_NOTA_VAZIO);
  const [arquivoXml, setArquivoXml] = useState<File | null>(null);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [erroNota, setErroNota] = useState('');
  const [mensagemNota, setMensagemNota] = useState('');
  const [linkWhatsappNota, setLinkWhatsappNota] = useState('');

  const [mostrarMensagens, setMostrarMensagens] = useState(false);
  const [tipoMensagem, setTipoMensagem] = useState('RECIBO');
  const [conteudoMensagem, setConteudoMensagem] = useState('');
  const [placeholdersMensagem, setPlaceholdersMensagem] = useState<any[]>([]);
  const [labelTiposMensagem, setLabelTiposMensagem] = useState<Record<string, string>>({});
  const [salvandoMensagem, setSalvandoMensagem] = useState(false);

  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [config, setConfig] = useState({
    nomeEmpresa: '', creci: '', cnpj: '', cep: '', endereco: '', numero: '', bairro: '', cidade: '', estado: '', telefone: '', email: '',
    corretoraResponsavelNome: '', corretoraResponsavelCpf: '', corretoraResponsavelRg: '',
    tipoChavePix: 'celular' as TipoChavePix, chavePix: '', bancoNome: '', bancoAgencia: '', bancoConta: '',
  });
  const [buscandoCepConfig, setBuscandoCepConfig] = useState(false);

  async function buscarCepEPreencherConfig(cep: string) {
    const cepLimpo = apenasDigitos(cep);
    if (cepLimpo.length !== 8) return;
    setBuscandoCepConfig(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await resposta.json();
      if (dados.erro) return;
      setConfig((c) => ({
        ...c,
        endereco: dados.logradouro || c.endereco,
        bairro: dados.bairro || c.bairro,
        cidade: dados.localidade || c.cidade,
        estado: dados.uf || c.estado,
      }));
    } catch {
      // Falha na consulta não deve travar - preenche manualmente
    } finally {
      setBuscandoCepConfig(false);
    }
  }

  const [linhaDestacadaId, setLinhaDestacadaId] = useState<number | null>(null);

  function destacarLinha(id: number) {
    setLinhaDestacadaId(id);
    setTimeout(() => setLinhaDestacadaId((atual) => (atual === id ? null : atual)), 2500);
  }

  function carregar(buscaAtual = busca, paginaAtual = pagina) {
    const params = new URLSearchParams();
    if (buscaAtual) params.set('busca', buscaAtual);
    params.set('pagina', String(paginaAtual));
    api.get(`/api/proprietarios?${params.toString()}`)
      .then((resposta) => {
        if (resposta.dados.length === 0 && resposta.pagina > 1 && resposta.pagina > resposta.totalPaginas) {
          carregar(buscaAtual, resposta.totalPaginas);
          return;
        }
        setProprietarios(resposta.dados);
        setTotalRegistros(resposta.total);
        setTotalPaginas(resposta.totalPaginas);
        setPagina(resposta.pagina);
      })
      .catch((e) => setErro(e.message));
  }

  function irParaPagina(p: number) {
    carregar(busca, p);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => carregar(busca, 1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function resetarFormulario() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setErroCpf('');
    setErroCpfConjuge('');
  }

  function validarCpfConjugeCampo() {
    if (form.conjugeCpfCnpj && !validarCpfCnpj(form.conjugeCpfCnpj)) {
      setErroCpfConjuge('CPF/CNPJ do cônjuge inválido.');
    } else {
      setErroCpfConjuge('');
    }
  }

  const [buscandoCep, setBuscandoCep] = useState(false);

  async function buscarCepEPreencher(cep: string) {
    if (apenasDigitos(cep).length !== 8) return;
    setBuscandoCep(true);
    try {
      const dados = await consultarCep(cep);
      if (dados) {
        setForm((f: any) => ({
          ...f,
          endereco: dados.logradouro || f.endereco,
          bairro: dados.bairro || f.bairro,
          cidade: dados.cidade || f.cidade,
          estado: dados.estado || f.estado,
        }));
      }
    } catch {
      // Falha na consulta não deve travar o cadastro - o usuário preenche manualmente
    } finally {
      setBuscandoCep(false);
    }
  }

  function alternarFormulario() {
    if (mostrarForm) {
      resetarFormulario();
      setMostrarForm(false);
    } else {
      resetarFormulario();
      setMostrarForm(true);
    }
  }

  function abrirEdicao(p: any) {
    setForm({
      nome: p.nome || '',
      nacionalidade: p.nacionalidade || 'Brasileiro(a)',
      estadoCivil: p.estadoCivil || '',
      conjugeNome: p.conjugeNome || '',
      conjugeCpfCnpj: p.conjugeCpfCnpj ? mascararCpfCnpj(p.conjugeCpfCnpj) : '',
      conjugeTelefone: p.conjugeTelefone ? mascararTelefone(p.conjugeTelefone) : '',
      conjugeRg: p.conjugeRg ? mascararRg(p.conjugeRg) : '',
      conjugeEmail: p.conjugeEmail || '',
      profissao: p.profissao || '',
      ramoAtividade: p.ramoAtividade || '',
      cpfCnpj: p.cpfCnpj ? mascararCpfCnpj(p.cpfCnpj) : '',
      rg: p.rg ? mascararRg(p.rg) : '',
      cep: p.cep ? mascararCep(p.cep) : '',
      endereco: p.endereco || '',
      numero: p.numero || '',
      bairro: p.bairro || '',
      cidade: p.cidade || '',
      estado: p.estado || '',
      telefone: p.telefone ? mascararTelefone(p.telefone) : '',
      telefoneAdicional: p.telefoneAdicional ? mascararTelefone(p.telefoneAdicional) : '',
      socioResponsavelNome: p.socioResponsavelNome || '',
      socioResponsavelCpf: p.socioResponsavelCpf ? mascararCpfCnpj(p.socioResponsavelCpf) : '',
      socioResponsavelTelefone: p.socioResponsavelTelefone ? mascararTelefone(p.socioResponsavelTelefone) : '',
      socioResponsavelEmail: p.socioResponsavelEmail || '',
      socioResponsavel2Nome: p.socioResponsavel2Nome || '',
      socioResponsavel2Cpf: p.socioResponsavel2Cpf ? mascararCpfCnpj(p.socioResponsavel2Cpf) : '',
      socioResponsavel2Telefone: p.socioResponsavel2Telefone ? mascararTelefone(p.socioResponsavel2Telefone) : '',
      socioResponsavel2Email: p.socioResponsavel2Email || '',
      email: p.email || '',
      tipoChavePix: p.tipoChavePix || (p.chavePix ? detectarTipoChavePix(p.chavePix) : 'celular'),
      chavePix: p.chavePix ? mascararChavePix(p.tipoChavePix || detectarTipoChavePix(p.chavePix), p.chavePix) : '',
      bancoNome: p.bancoNome || '',
      bancoAgencia: p.bancoAgencia ? mascararAgencia(p.bancoAgencia) : '',
      bancoConta: p.bancoConta ? mascararConta(p.bancoConta) : '',
      tipoContaBancaria: p.tipoContaBancaria || 'corrente',
      diaRepasse: p.diaRepasse ? String(p.diaRepasse) : '',
      observacoes: p.observacoes || '',
    });
    setEditandoId(p.id);
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setErroCpf('');

    if (form.cpfCnpj && !validarCpfCnpj(form.cpfCnpj)) {
      setErroCpf('CPF/CNPJ inválido.');
      return;
    }

    if (ESTADOS_CIVIS_COM_PARCEIRO.includes(form.estadoCivil) && form.conjugeCpfCnpj && !validarCpfCnpj(form.conjugeCpfCnpj)) {
      setErroCpfConjuge('CPF/CNPJ do cônjuge inválido.');
      return;
    }

    const payload = form;

    try {
      if (editandoId) {
        await api.put(`/api/proprietarios/${editandoId}`, payload);
        destacarLinha(editandoId);
      } else {
        await api.post('/api/proprietarios', payload);
      }
      resetarFormulario();
      setMostrarForm(false);
      carregar(busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function excluir(id: number) {
    if (!confirm('Excluir este proprietário? (só é possível se não houver imóveis vinculados)')) return;
    try {
      await api.delete(`/api/proprietarios/${id}`);
      carregar(busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function alternarRepasses(id: number) {
    if (expandidoId === id) {
      setExpandidoId(null);
      return;
    }
    setExpandidoId(id);
    setCarregandoRepasses(true);
    try {
      const dados = await api.get(`/api/proprietarios/${id}/repasses`);
      setRepasses(dados);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregandoRepasses(false);
    }
  }

  async function carregarNotas(proprietarioId: number) {
    setCarregandoNotas(true);
    try {
      const dados = await api.get(`/api/proprietarios/${proprietarioId}/notas-fiscais`);
      setNotas(dados);
    } catch (err: any) {
      setErroNota(err.message);
    } finally {
      setCarregandoNotas(false);
    }
  }

  async function alternarNotas(id: number) {
    if (notasAbertoId === id) {
      setNotasAbertoId(null);
      setMostrarFormNota(false);
      return;
    }
    setNotasAbertoId(id);
    setMostrarFormNota(false);
    setFormNota(FORM_NOTA_VAZIO);
    setArquivoXml(null);
    setErroNota('');
    setMensagemNota('');
    setLinkWhatsappNota('');
    await carregarNotas(id);
  }

  async function salvarNotaFiscal(proprietarioId: number, e: React.FormEvent) {
    e.preventDefault();
    setErroNota('');
    setMensagemNota('');

    if (!arquivoXml && !formNota.chaveAcesso && !formNota.numero) {
      setErroNota('Envie o XML da nota, informe a chave de acesso ou ao menos o número da nota.');
      return;
    }

    setSalvandoNota(true);
    try {
      const dadosForm = new FormData();
      if (arquivoXml) dadosForm.append('arquivoXml', arquivoXml);
      Object.entries(formNota).forEach(([chave, valor]) => {
        if (!valor) return;
        if (chave === 'valorTotal') {
          dadosForm.append(chave, String(moedaParaNumero(valor as string)));
          return;
        }
        dadosForm.append(chave, valor as string);
      });

      await api.post(`/api/proprietarios/${proprietarioId}/notas-fiscais`, dadosForm);
      setMensagemNota('Nota fiscal cadastrada com sucesso.');
      setFormNota(FORM_NOTA_VAZIO);
      setArquivoXml(null);
      setMostrarFormNota(false);
      await carregarNotas(proprietarioId);
    } catch (err: any) {
      setErroNota(err.message);
    } finally {
      setSalvandoNota(false);
    }
  }

  async function excluirNotaFiscal(notaId: number, proprietarioId: number) {
    if (!confirm('Excluir esta nota fiscal?')) return;
    try {
      await api.delete(`/api/proprietarios/notas-fiscais/${notaId}`);
      await carregarNotas(proprietarioId);
    } catch (err: any) {
      setErroNota(err.message);
    }
  }

  async function enviarNotaWhatsapp(notaId: number) {
    setMensagemNota('');
    setErroNota('');
    setLinkWhatsappNota('');
    try {
      const { resultado, linkAberto } = await enviarEAbrirWhatsapp(() => api.post(`/api/proprietarios/notas-fiscais/${notaId}/enviar-whatsapp`));
      if (resultado?.resultado?.simulado) {
        if (linkAberto) {
          setMensagemNota('WhatsApp aberto em uma nova aba.');
        } else {
          setMensagemNota('Não foi possível abrir o WhatsApp automaticamente (popup bloqueado). Use o link abaixo.');
          setLinkWhatsappNota(resultado?.resultado?.linkWhatsapp || '');
        }
      } else {
        setMensagemNota('Nota fiscal enviada via WhatsApp ao proprietário.');
      }
    } catch (err: any) {
      setErroNota(err.message);
    }
  }

  async function abrirEditorMensagens(tipo = 'RECIBO') {
    setErro('');
    try {
      const modelo = await api.get(`/api/modelo-mensagem?tipo=${tipo}`);
      setTipoMensagem(tipo);
      setConteudoMensagem(modelo.conteudo);
      setPlaceholdersMensagem(modelo.placeholders || []);
      setLabelTiposMensagem(modelo.labelTipos || {});
      setMostrarMensagens(true);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function trocarTipoMensagem(tipo: string) {
    setErro('');
    try {
      const modelo = await api.get(`/api/modelo-mensagem?tipo=${tipo}`);
      setTipoMensagem(tipo);
      setConteudoMensagem(modelo.conteudo);
      setPlaceholdersMensagem(modelo.placeholders || []);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function salvarMensagem() {
    setSalvandoMensagem(true);
    setErro('');
    try {
      await api.put('/api/modelo-mensagem', { tipo: tipoMensagem, conteudo: conteudoMensagem });
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvandoMensagem(false);
    }
  }

  async function restaurarMensagemPadrao() {
    if (!confirm('Isso vai substituir o texto atual pelo texto padrão sugerido. Continuar?')) return;
    setErro('');
    try {
      const modelo = await api.post('/api/modelo-mensagem/restaurar-padrao', { tipo: tipoMensagem });
      setConteudoMensagem(modelo.conteudo);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function abrirConfig() {
    setErro('');
    try {
      const dados = await api.get('/api/configuracoes');
      setConfig({
        nomeEmpresa: dados.nomeEmpresa || '',
        creci: dados.creci || '',
        cnpj: dados.cnpj ? mascararCpfCnpj(dados.cnpj) : '',
        cep: dados.cep ? mascararCep(dados.cep) : '',
        endereco: dados.endereco || '',
        numero: dados.numero || '',
        bairro: dados.bairro || '',
        cidade: dados.cidade || '',
        estado: dados.estado || '',
        telefone: dados.telefone ? mascararTelefone(dados.telefone) : '',
        email: dados.email || '',
        corretoraResponsavelNome: dados.corretoraResponsavelNome || '',
        corretoraResponsavelCpf: dados.corretoraResponsavelCpf ? mascararCpfCnpj(dados.corretoraResponsavelCpf) : '',
        corretoraResponsavelRg: dados.corretoraResponsavelRg ? mascararRg(dados.corretoraResponsavelRg) : '',
        tipoChavePix: dados.tipoChavePix || (dados.chavePix ? detectarTipoChavePix(dados.chavePix) : 'celular'),
        chavePix: dados.chavePix ? mascararChavePix(dados.tipoChavePix || detectarTipoChavePix(dados.chavePix), dados.chavePix) : '',
        bancoNome: dados.bancoNome || '',
        bancoAgencia: dados.bancoAgencia ? mascararAgencia(dados.bancoAgencia) : '',
        bancoConta: dados.bancoConta ? mascararConta(dados.bancoConta) : '',
      });
      setMostrarConfig(true);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function salvarConfig() {
    setErro('');
    const payload = config;
    try {
      await api.put('/api/configuracoes', payload);
      setMostrarConfig(false);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);

  async function gerarRelatorio() {
    setErro('');
    setGerandoRelatorio(true);
    try {
      const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
      await baixarArquivo(`/api/proprietarios/relatorio${query}`, `proprietarios-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
          <h1 className="font-display font-semibold text-2xl text-savanna-green-700">Proprietários</h1>
          <p className="text-savanna-muted text-sm">Dados bancários, PIX e repasses</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-secondary flex items-center gap-1.5" onClick={abrirConfig}>
            <IconeEngrenagem className="w-4 h-4" /> Dados da imobiliária
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => abrirEditorMensagens(tipoMensagem)}>
            <IconeWhatsapp className="w-4 h-4" /> Mensagens do WhatsApp
          </button>
          <Link href="/contratos" className="btn-secondary flex items-center gap-1.5">
            <IconeDocumento className="w-4 h-4" /> Ver contratos
          </Link>
          <button className="btn-secondary flex items-center gap-1.5" onClick={gerarRelatorio} disabled={gerandoRelatorio}>
            <IconePdf className="w-4 h-4" /> {gerandoRelatorio ? 'Gerando...' : 'Gerar relatório'}
          </button>
          <div className="w-px self-stretch bg-savanna-border mx-1" />
          <button className="btn-primary" onClick={alternarFormulario}>
            {mostrarForm ? 'Cancelar' : '+ Novo proprietário'}
          </button>
        </div>
      </div>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}

      {mostrarConfig && (
        <div className="card mb-6">
          <h3 className="font-medium text-savanna-green-700 mb-3">Dados da imobiliária</h3>
          <p className="text-sm text-savanna-muted mb-3">Usados no cabeçalho e na assinatura dos documentos gerados (contratos, recibos, termos).</p>
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">Nome da imobiliária</label>
              <input className="input" value={config.nomeEmpresa}
                onChange={(e) => setConfig({ ...config, nomeEmpresa: e.target.value })} />
            </div>
            <div>
              <label className="label">CNPJ</label>
              <input className="input" value={config.cnpj}
                onChange={(e) => setConfig({ ...config, cnpj: mascararCpfCnpj(e.target.value) })} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="label">CRECI</label>
              <input className="input" placeholder="Ex: SC 7565J" value={config.creci}
                onChange={(e) => setConfig({ ...config, creci: e.target.value })} />
            </div>
            <div>
              <label className="label">CEP</label>
              <input className="input" value={config.cep}
                onChange={(e) => setConfig({ ...config, cep: mascararCep(e.target.value) })}
                onBlur={(e) => buscarCepEPreencherConfig(e.target.value)} placeholder="00000-000" />
              {buscandoCepConfig && <p className="text-xs text-savanna-muted mt-1">Buscando endereço...</p>}
            </div>
            <div className="md:col-span-2">
              <label className="label">Endereço</label>
              <input className="input" value={config.endereco}
                onChange={(e) => setConfig({ ...config, endereco: e.target.value })} placeholder="Rua/Avenida" />
            </div>
            <div>
              <label className="label">Número</label>
              <input className="input" value={config.numero}
                onChange={(e) => setConfig({ ...config, numero: e.target.value })} />
            </div>
            <div>
              <label className="label">Bairro</label>
              <input className="input" value={config.bairro}
                onChange={(e) => setConfig({ ...config, bairro: e.target.value })} />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input className="input" value={config.cidade}
                onChange={(e) => setConfig({ ...config, cidade: e.target.value })} />
            </div>
            <div>
              <label className="label">Estado</label>
              <input className="input" maxLength={2} value={config.estado}
                onChange={(e) => setConfig({ ...config, estado: e.target.value.toUpperCase() })} placeholder="SC" />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={config.telefone}
                onChange={(e) => setConfig({ ...config, telefone: mascararTelefone(e.target.value) })} />
            </div>
            <div className="md:col-span-3">
              <label className="label">Email</label>
              <input className="input" type="email" value={config.email}
                onChange={(e) => setConfig({ ...config, email: e.target.value })} />
            </div>
          </div>

          <h4 className="text-sm font-medium text-savanna-green-700 mb-2">Corretora responsável (assinatura)</h4>
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <input className="input" placeholder="Nome completo" value={config.corretoraResponsavelNome}
              onChange={(e) => setConfig({ ...config, corretoraResponsavelNome: e.target.value })} />
            <input className="input" placeholder="000.000.000-00" value={config.corretoraResponsavelCpf}
              onChange={(e) => setConfig({ ...config, corretoraResponsavelCpf: mascararCpfCnpj(e.target.value) })} />
            <input className="input" placeholder="RG" value={config.corretoraResponsavelRg}
              onChange={(e) => setConfig({ ...config, corretoraResponsavelRg: mascararRg(e.target.value) })} />
          </div>

          <h4 className="text-sm font-medium text-savanna-green-700 mb-2">Dados bancários da imobiliária (recebimento do aluguel)</h4>
          <p className="text-xs text-gray-500 mb-2">Usado na Cláusula do valor da locação nos contratos - o inquilino paga para a imobiliária, não diretamente ao proprietário.</p>
          <div className="grid md:grid-cols-5 gap-4 mb-4">
            <select className="input" value={config.tipoChavePix}
              onChange={(e) => {
                const tipo = e.target.value as TipoChavePix;
                setConfig({ ...config, tipoChavePix: tipo, chavePix: mascararChavePix(tipo, config.chavePix) });
              }}>
              <option value="celular">Celular</option>
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">Email</option>
              <option value="aleatoria">Chave aleatória</option>
            </select>
            <input className="input" placeholder="Chave Pix" value={config.chavePix}
              onChange={(e) => setConfig({ ...config, chavePix: mascararChavePix(config.tipoChavePix, e.target.value) })} />
            <input className="input" placeholder="Banco" value={config.bancoNome}
              onChange={(e) => setConfig({ ...config, bancoNome: e.target.value })} />
            <input className="input" placeholder="Agência" value={config.bancoAgencia}
              onChange={(e) => setConfig({ ...config, bancoAgencia: mascararAgencia(e.target.value) })} />
            <input className="input" placeholder="Conta" value={config.bancoConta}
              onChange={(e) => setConfig({ ...config, bancoConta: mascararConta(e.target.value) })} />
          </div>

          <div className="flex gap-3">
            <button onClick={salvarConfig} className="btn-primary">Salvar</button>
            <button onClick={() => setMostrarConfig(false)} className="btn-secondary">Fechar</button>
          </div>
        </div>
      )}

      {mostrarMensagens && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-medium text-savanna-green-700">Mensagens do WhatsApp</h3>
              <p className="text-sm text-savanna-muted mt-1">
                Texto enviado junto com o PDF (recibo, contrato, demonstrativo ou nota fiscal) para cada tipo de envio.
                Inclua o campo <code className="bg-savanna-green-50 px-1 rounded-sm">{'{{LINK}}'}</code> onde quiser que
                o link do PDF apareça no corpo da mensagem.
              </p>
            </div>
            <button onClick={() => setMostrarMensagens(false)} className="text-sm text-savanna-muted underline">
              Fechar
            </button>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {Object.entries(labelTiposMensagem).length > 0
              ? Object.entries(labelTiposMensagem).map(([valor, label]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => trocarTipoMensagem(valor)}
                    className={`px-3 py-2 rounded-sm text-sm font-medium border transition-colors ${
                      tipoMensagem === valor
                        ? 'bg-savanna-green-600 text-white border-savanna-green-600'
                        : 'bg-white text-savanna-ink border-savanna-border hover:border-savanna-green-400'
                    }`}
                  >
                    {label}
                  </button>
                ))
              : null}
          </div>

          <textarea
            className="input font-mono text-xs leading-relaxed"
            rows={10}
            value={conteudoMensagem}
            onChange={(e) => setConteudoMensagem(e.target.value)}
          />

          <div className="mt-3 mb-4">
            <p className="label mb-2">Campos disponíveis (clique para copiar)</p>
            <div className="flex flex-wrap gap-1.5">
              {placeholdersMensagem.map((p) => (
                <button
                  key={p.chave}
                  type="button"
                  title={p.label}
                  onClick={() => navigator.clipboard.writeText(`{{${p.chave}}}`)}
                  className="text-xs px-2 py-1 rounded-sm bg-savanna-green-50 text-savanna-green-700 hover:bg-savanna-green-100"
                >
                  {`{{${p.chave}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={salvarMensagem} disabled={salvandoMensagem} className="btn-primary">
              {salvandoMensagem ? 'Salvando...' : 'Salvar mensagem'}
            </button>
            <button onClick={restaurarMensagemPadrao} className="btn-secondary">Restaurar texto padrão</button>
          </div>
        </div>
      )}

      <div className="card mb-6">
        <label className="label">Buscar por nome ou CPF/CNPJ</label>
        <input className="input md:w-1/2" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {mostrarForm && (
        <form onSubmit={salvar} className="card mb-6 grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="label">Nome completo</label>
            <input className="input" required value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <label className="label">CPF/CNPJ</label>
            <input className="input" value={form.cpfCnpj}
              onChange={(e) => setForm({ ...form, cpfCnpj: mascararCpfCnpj(e.target.value) })}
              onBlur={async () => {
                if (!form.cpfCnpj) { setErroCpf(''); return; }
                if (!validarCpfCnpj(form.cpfCnpj)) { setErroCpf('CPF/CNPJ inválido.'); return; }
                setErroCpf('');

                // Se for CNPJ (pessoa jurídica), busca a razão social automaticamente (dados públicos da Receita)
                if (apenasDigitos(form.cpfCnpj).length === 14) {
                  setBuscandoCnpj(true);
                  try {
                    const dados = await consultarCnpj(form.cpfCnpj);
                    if (dados) {
                      setForm((f: any) => ({
                        ...f,
                        nome: f.nome ? f.nome : dados.razaoSocial,
                        telefone: f.telefone ? f.telefone : (dados.telefone ? mascararTelefone(dados.telefone) : f.telefone),
                        email: f.email ? f.email : (dados.email || f.email),
                        endereco: f.endereco ? f.endereco : (dados.endereco || f.endereco),
                        rg: f.rg ? f.rg : (dados.inscricaoEstadual ? mascararInscricaoEstadual(dados.inscricaoEstadual) : f.rg),
                      }));
                    }
                  } catch {
                    // Falha na consulta não deve travar o cadastro - o usuário preenche manualmente
                  } finally {
                    setBuscandoCnpj(false);
                  }
                }
              }} />
            {buscandoCnpj && <p className="text-xs text-savanna-muted mt-1">Buscando dados da empresa...</p>}
            {erroCpf && <p className="text-xs text-savanna-rust mt-1">{erroCpf}</p>}
          </div>
          {!ehCnpj(form.cpfCnpj) && (
            <>
              <div>
                <label className="label">Nacionalidade</label>
                <input className="input" value={form.nacionalidade}
                  onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} placeholder="Ex: Brasileiro(a)" />
              </div>
              <div>
                <label className="label">Estado civil</label>
                <select className="input" value={form.estadoCivil}
                  onChange={(e) => setForm({ ...form, estadoCivil: e.target.value })}>
                  <option value="">Selecione</option>
                  {ESTADOS_CIVIS.map((op) => <option key={op.valor} value={op.valor}>{op.label}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="label">{ehCnpj(form.cpfCnpj) ? 'Ramo de atividade' : 'Profissão'}</label>
            {ehCnpj(form.cpfCnpj) ? (
              <input className="input" value={form.ramoAtividade}
                onChange={(e) => setForm({ ...form, ramoAtividade: e.target.value })} placeholder="Ex: Comércio varejista" />
            ) : (
              <input className="input" value={form.profissao}
                onChange={(e) => setForm({ ...form, profissao: e.target.value })} />
            )}
          </div>
          <div>
            <label className="label">{ehCnpj(form.cpfCnpj) ? 'Inscrição Estadual' : 'RG'}</label>
            <input className="input" value={form.rg}
              onChange={(e) => setForm({
                ...form,
                rg: ehCnpj(form.cpfCnpj) ? mascararInscricaoEstadual(e.target.value) : mascararRg(e.target.value),
              })}
              placeholder={ehCnpj(form.cpfCnpj) ? 'Isento ou nº da IE' : '00.000.000-0'} />
          </div>
          <div>
            <label className="label">CEP</label>
            <input className="input" value={form.cep}
              onChange={(e) => setForm({ ...form, cep: mascararCep(e.target.value) })}
              onBlur={(e) => buscarCepEPreencher(e.target.value)} placeholder="00000-000" />
            {buscandoCep && <p className="text-xs text-savanna-muted mt-1">Buscando endereço...</p>}
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Endereço (rua/avenida)</label>
            <input className="input" value={form.endereco}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input className="input" value={form.bairro}
              onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={form.cidade}
              onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
          </div>
          <div>
            <label className="label">Estado (UF)</label>
            <input className="input" maxLength={2} value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} placeholder="SC" />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input className="input" value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: mascararTelefone(e.target.value) })} />
          </div>
          <div>
            <label className="label">Telefone adicional</label>
            <input className="input" value={form.telefoneAdicional}
              onChange={(e) => setForm({ ...form, telefoneAdicional: mascararTelefone(e.target.value) })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {ehCnpj(form.cpfCnpj) && (
            <div className="md:col-span-3 border-t border-savanna-border pt-4">
              <h3 className="font-medium text-savanna-green-700 mb-3">Sócio(s)/Representante(s) legal(is)</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="label">Sócio(a)/Representante legal</label>
                  <input className="input" value={form.socioResponsavelNome}
                    onChange={(e) => setForm({ ...form, socioResponsavelNome: e.target.value })}
                    placeholder="Quem assina pela empresa" />
                </div>
                <div>
                  <label className="label">CPF do(a) sócio(a)/representante</label>
                  <input className="input" value={form.socioResponsavelCpf}
                    onChange={(e) => setForm({ ...form, socioResponsavelCpf: mascararCpfCnpj(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Telefone do(a) sócio(a)</label>
                  <input className="input" value={form.socioResponsavelTelefone}
                    onChange={(e) => setForm({ ...form, socioResponsavelTelefone: mascararTelefone(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Email do(a) sócio(a)</label>
                  <input className="input" type="email" value={form.socioResponsavelEmail}
                    onChange={(e) => setForm({ ...form, socioResponsavelEmail: e.target.value })} />
                </div>
                <div>
                  <label className="label">2º Sócio(a)/Representante legal (opcional)</label>
                  <input className="input" value={form.socioResponsavel2Nome}
                    onChange={(e) => setForm({ ...form, socioResponsavel2Nome: e.target.value })} />
                </div>
                <div>
                  <label className="label">CPF do(a) 2º sócio(a)/representante</label>
                  <input className="input" value={form.socioResponsavel2Cpf}
                    onChange={(e) => setForm({ ...form, socioResponsavel2Cpf: mascararCpfCnpj(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Telefone do(a) 2º sócio(a)</label>
                  <input className="input" value={form.socioResponsavel2Telefone}
                    onChange={(e) => setForm({ ...form, socioResponsavel2Telefone: mascararTelefone(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Email do(a) 2º sócio(a)</label>
                  <input className="input" type="email" value={form.socioResponsavel2Email}
                    onChange={(e) => setForm({ ...form, socioResponsavel2Email: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="label">Dia programado do repasse</label>
            <select className="input" value={form.diaRepasse}
              onChange={(e) => setForm({ ...form, diaRepasse: e.target.value })}>
              <option value="">Não definido</option>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>Dia {d}</option>
              ))}
            </select>
          </div>

          {ESTADOS_CIVIS_COM_PARCEIRO.includes(form.estadoCivil) && (
            <div className="md:col-span-3 border-t border-savanna-border pt-4">
              <h3 className="font-medium text-savanna-green-700 mb-3">
                {labelParceiro(form.estadoCivil)}
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="label">Nome completo</label>
                  <input className="input" value={form.conjugeNome}
                    onChange={(e) => setForm({ ...form, conjugeNome: e.target.value })} />
                </div>
                <div>
                  <label className="label">CPF/CNPJ</label>
                  <input className="input" value={form.conjugeCpfCnpj}
                    onChange={(e) => setForm({ ...form, conjugeCpfCnpj: mascararCpfCnpj(e.target.value) })}
                    onBlur={validarCpfConjugeCampo} />
                  {erroCpfConjuge && <p className="text-xs text-savanna-rust mt-1">{erroCpfConjuge}</p>}
                </div>
                <div>
                  <label className="label">Telefone</label>
                  <input className="input" value={form.conjugeTelefone}
                    onChange={(e) => setForm({ ...form, conjugeTelefone: mascararTelefone(e.target.value) })} />
                </div>
                <div>
                  <label className="label">RG</label>
                  <input className="input" value={form.conjugeRg}
                    onChange={(e) => setForm({ ...form, conjugeRg: mascararRg(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.conjugeEmail}
                    onChange={(e) => setForm({ ...form, conjugeEmail: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-savanna-muted mt-2">
                Quando o proprietário é casado, o cônjuge também assina o contrato de locação (linha de assinatura adicional gerada automaticamente no PDF).
              </p>
            </div>
          )}

          <div className="md:col-span-3 border-t border-savanna-border pt-4">
            <h3 className="font-medium text-savanna-green-700 mb-3">Dados para recebimento do repasse</h3>
          </div>
          <div>
            <label className="label">Tipo de chave Pix</label>
            <select className="input" value={form.tipoChavePix}
              onChange={(e) => {
                const tipo = e.target.value as TipoChavePix;
                setForm({ ...form, tipoChavePix: tipo, chavePix: mascararChavePix(tipo, form.chavePix) });
              }}>
              <option value="celular">Celular</option>
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">Email</option>
              <option value="aleatoria">Chave aleatória</option>
            </select>
          </div>
          <div>
            <label className="label">Chave PIX</label>
            <input className="input" value={form.chavePix}
              type={form.tipoChavePix === 'email' ? 'email' : 'text'}
              onChange={(e) => setForm({ ...form, chavePix: mascararChavePix(form.tipoChavePix, e.target.value) })}
              placeholder={form.tipoChavePix === 'email' ? 'nome@email.com' : form.tipoChavePix === 'aleatoria' ? 'Chave aleatória' : ''} />
          </div>
          <div>
            <label className="label">Banco</label>
            <input className="input" value={form.bancoNome}
              onChange={(e) => setForm({ ...form, bancoNome: e.target.value })} />
          </div>
          <div>
            <label className="label">Tipo de conta</label>
            <select className="input" value={form.tipoContaBancaria}
              onChange={(e) => setForm({ ...form, tipoContaBancaria: e.target.value })}>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
            </select>
          </div>
          <div>
            <label className="label">Agência</label>
            <input className="input" value={form.bancoAgencia}
              onChange={(e) => setForm({ ...form, bancoAgencia: mascararAgencia(e.target.value) })} placeholder="0000" />
          </div>
          <div>
            <label className="label">Conta</label>
            <input className="input" value={form.bancoConta}
              onChange={(e) => setForm({ ...form, bancoConta: mascararConta(e.target.value) })} placeholder="00000-0" />
          </div>
          <div className="md:col-span-3">
            <label className="label">Observações</label>
            <textarea className="input" rows={2} value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>

          <div className="md:col-span-3">
            <button className="btn-primary" type="submit">
              {editandoId ? 'Salvar alterações' : 'Salvar proprietário'}
            </button>
          </div>
        </form>
      )}

      <div className="card p-0 overflow-hidden">
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} posicao="topo" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-savanna-green-50 text-left text-savanna-muted">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Chave PIX</th>
              <th className="px-4 py-3">Dia repasse</th>
              <th className="px-4 py-3">Imóveis</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {proprietarios.map((p) => (
              <Fragment key={p.id}>
                <tr
                  className={`border-t border-savanna-border transition-colors duration-700 ${
                    linhaDestacadaId === p.id ? 'bg-savanna-gold-400/20' : ''
                  }`}
                >
                  <td className="px-4 py-3">{p.nome}</td>
                  <td className="px-4 py-3">{p.chavePix || '-'}</td>
                  <td className="px-4 py-3">{p.diaRepasse ? `Dia ${p.diaRepasse}` : '-'}</td>
                  <td className="px-4 py-3">{p.imoveis?.length || 0}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => alternarRepasses(p.id)} title={expandidoId === p.id ? 'Ocultar repasses' : 'Ver repasses'}
                        className={`p-1.5 rounded-sm hover:bg-savanna-green-50 ${expandidoId === p.id ? 'text-savanna-green-700' : 'text-savanna-gold-500'}`}>
                        <IconeFatura />
                      </button>
                      <button onClick={() => alternarNotas(p.id)} title={notasAbertoId === p.id ? 'Ocultar notas fiscais' : 'Notas fiscais'}
                        className={`p-1.5 rounded-sm hover:bg-savanna-green-50 ${notasAbertoId === p.id ? 'text-savanna-green-700' : 'text-savanna-muted'}`}>
                        <IconeNotaFiscal />
                      </button>
                      <button onClick={() => abrirEdicao(p)} title="Editar"
                        className="p-1.5 rounded-sm text-savanna-muted hover:bg-savanna-green-50">
                        <IconeEngrenagem />
                      </button>
                      <button onClick={() => excluir(p.id)} title="Excluir"
                        className="p-1.5 rounded-sm text-savanna-rust hover:bg-savanna-rust/10">
                        <IconeLixeira />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandidoId === p.id && (
                  <tr className="border-t border-savanna-border bg-savanna-green-50/40">
                    <td colSpan={5} className="px-4 py-4">
                      {carregandoRepasses ? (
                        <p className="text-sm text-savanna-muted">Carregando...</p>
                      ) : repasses ? (
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <p className="label mb-1">Pendente de repasse</p>
                            <p className="text-lg font-semibold text-savanna-gold-500 mb-2">
                              {formatarMoeda(repasses.totalPendente)}
                            </p>
                            <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                              {repasses.pendentes.map((r: any) => (
                                <li key={r.id} className="flex justify-between border-b border-savanna-border pb-1">
                                  <span>{r.inquilino.nome} · {r.referenteMes}</span>
                                  <span>{formatarMoeda(r.valorRepasse)}</span>
                                </li>
                              ))}
                              {repasses.pendentes.length === 0 && <li className="text-savanna-muted">Nada pendente.</li>}
                            </ul>
                          </div>
                          <div>
                            <p className="label mb-1">Já repassado</p>
                            <p className="text-lg font-semibold text-savanna-green-700 mb-2">
                              {formatarMoeda(repasses.totalRepassado)}
                            </p>
                            <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                              {repasses.repassados.map((r: any) => (
                                <li key={r.id} className="flex justify-between border-b border-savanna-border pb-1">
                                  <span>{r.inquilino.nome} · {r.referenteMes}</span>
                                  <span>{formatarMoeda(r.valorRepasse)}</span>
                                </li>
                              ))}
                              {repasses.repassados.length === 0 && <li className="text-savanna-muted">Nenhum repasse ainda.</li>}
                            </ul>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )}
                {notasAbertoId === p.id && (
                  <tr className="border-t border-savanna-border bg-savanna-green-50/40">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-savanna-green-700">Notas fiscais de {p.nome}</h4>
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => {
                            setMostrarFormNota((v) => !v);
                            setErroNota('');
                            setMensagemNota('');
                          }}
                        >
                          {mostrarFormNota ? 'Cancelar' : '+ Nova nota fiscal'}
                        </button>
                      </div>

                      {erroNota && <p className="text-savanna-rust text-xs mb-2">{erroNota}</p>}
                      {mensagemNota && <p className="text-savanna-green-700 text-xs mb-1">{mensagemNota}</p>}
                      {linkWhatsappNota && (
                        <a href={linkWhatsappNota} target="_blank" rel="noreferrer" className="text-xs text-savanna-gold-500 underline mb-2 inline-block">
                          Abrir no WhatsApp para enviar
                        </a>
                      )}

                      {mostrarFormNota && (
                        <form onSubmit={(e) => salvarNotaFiscal(p.id, e)} className="bg-white border border-savanna-border rounded-md p-4 mb-4 grid md:grid-cols-3 gap-3">
                          <div className="md:col-span-3">
                            <label className="label">Arquivo XML da nota (opcional)</label>
                            <input
                              className="input"
                              type="file"
                              accept=".xml"
                              onChange={(e) => setArquivoXml(e.target.files?.[0] || null)}
                            />
                            <p className="text-xs text-savanna-muted mt-1">
                              Enviando o XML, os dados abaixo (incluindo os itens/serviços) são preenchidos automaticamente quando possível,
                              e o PDF gerado sai completo. Se preferir, informe apenas a chave de acesso e os dados manualmente - a Receita/SEFAZ
                              não permite baixar o PDF automaticamente por chave (exige digitar + captcha no portal deles), então nesse caso o PDF
                              sai resumido. Depois de salvar, use a lupa na lista abaixo para copiar a chave e abrir a consulta pública de autenticidade.
                            </p>
                          </div>
                          <div>
                            <label className="label">Tipo</label>
                            <select className="input" value={formNota.tipo}
                              onChange={(e) => setFormNota({ ...formNota, tipo: e.target.value })}>
                              <option value="NFE">NF-e</option>
                              <option value="NFA">NFA-e (Avulsa)</option>
                              <option value="NFSE">NFS-e</option>
                              <option value="OUTRA">Outra</option>
                            </select>
                          </div>
                          <div>
                            <label className="label">Número</label>
                            <input className="input" value={formNota.numero}
                              onChange={(e) => setFormNota({ ...formNota, numero: e.target.value })} />
                          </div>
                          <div>
                            <label className="label">Série</label>
                            <input className="input" value={formNota.serie}
                              onChange={(e) => setFormNota({ ...formNota, serie: e.target.value })} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="label">Chave de acesso (44 dígitos)</label>
                            <input className="input" value={formNota.chaveAcesso} maxLength={44}
                              placeholder="Só números"
                              onChange={(e) => setFormNota({ ...formNota, chaveAcesso: mascararChaveAcesso(e.target.value) })} />
                          </div>
                          <div>
                            <label className="label">Data de emissão</label>
                            <input className="input" type="date" value={formNota.dataEmissao}
                              onChange={(e) => setFormNota({ ...formNota, dataEmissao: e.target.value })} />
                          </div>
                          <div>
                            <label className="label">Valor total</label>
                            <div className="flex items-center gap-2">
                              <span className="text-savanna-muted">R$</span>
                              <input className="input" value={formNota.valorTotal}
                                onChange={(e) => setFormNota({ ...formNota, valorTotal: mascararMoeda(e.target.value) })} placeholder="0,00" />
                            </div>
                          </div>
                          <div>
                            <label className="label">Emitente (nome)</label>
                            <input className="input" value={formNota.emitenteNome}
                              onChange={(e) => setFormNota({ ...formNota, emitenteNome: e.target.value })} />
                          </div>
                          <div>
                            <label className="label">CNPJ do emitente</label>
                            <input className="input" value={formNota.emitenteCnpj}
                              onChange={(e) => setFormNota({ ...formNota, emitenteCnpj: e.target.value })} />
                          </div>
                          <div className="md:col-span-3">
                            <label className="label">Discriminação / descrição</label>
                            <textarea className="input" rows={2} value={formNota.discriminacao}
                              onChange={(e) => setFormNota({ ...formNota, discriminacao: e.target.value })} />
                          </div>
                          <div className="md:col-span-3">
                            <label className="label">Observações</label>
                            <textarea className="input" rows={2} value={formNota.observacoes}
                              onChange={(e) => setFormNota({ ...formNota, observacoes: e.target.value })} />
                          </div>
                          <div className="md:col-span-3">
                            <button className="btn-primary" type="submit" disabled={salvandoNota}>
                              {salvandoNota ? 'Salvando...' : 'Salvar nota fiscal'}
                            </button>
                          </div>
                        </form>
                      )}

                      {carregandoNotas ? (
                        <p className="text-sm text-savanna-muted">Carregando...</p>
                      ) : (
                        <div className="bg-white border border-savanna-border rounded-md overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-savanna-green-50 text-left text-savanna-muted">
                                <th className="px-3 py-2">Nº</th>
                                <th className="px-3 py-2">Tipo</th>
                                <th className="px-3 py-2">Emissão</th>
                                <th className="px-3 py-2">Valor</th>
                                <th className="px-3 py-2">Emitente</th>
                                <th className="px-3 py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {notas.map((n) => (
                                <tr key={n.id} className="border-t border-savanna-border">
                                  <td className="px-3 py-2">{n.numero || '-'}</td>
                                  <td className="px-3 py-2">{n.tipo}</td>
                                  <td className="px-3 py-2">{n.dataEmissao ? new Date(n.dataEmissao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</td>
                                  <td className="px-3 py-2">{n.valorTotal ? formatarMoeda(n.valorTotal) : '-'}</td>
                                  <td className="px-3 py-2">{n.emitenteNome || '-'}</td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-1">
                                      <a
                                        href={`${API_URL}/api/proprietarios/notas-fiscais/${n.id}/pdf`}
                                        target="_blank"
                                        rel="noreferrer"
                                        title="Ver / imprimir PDF"
                                        className="p-1.5 rounded-sm text-savanna-green-700 hover:bg-savanna-green-50"
                                      >
                                        <IconeNotaFiscal />
                                      </a>
                                      {n.temXml && (
                                        <a
                                          href={`${API_URL}/api/proprietarios/notas-fiscais/${n.id}/xml`}
                                          title="Baixar XML original"
                                          className="p-1.5 rounded-sm text-savanna-muted hover:bg-savanna-green-50"
                                        >
                                          <IconeDocumento />
                                        </a>
                                      )}
                                      {n.chaveAcesso && (
                                        <button
                                          onClick={() => consultarChaveNaReceita(n.chaveAcesso)}
                                          title="Copiar chave e consultar autenticidade no portal da NF-e (Receita/SEFAZ)"
                                          className="p-1.5 rounded-sm text-savanna-muted hover:bg-savanna-green-50"
                                        >
                                          <IconeLupa />
                                        </button>
                                      )}
                                      <button onClick={() => enviarNotaWhatsapp(n.id)} title="Enviar via WhatsApp ao proprietário"
                                        className="p-1.5 rounded-sm text-savanna-gold-500 hover:bg-savanna-green-50">
                                        <IconeWhatsapp />
                                      </button>
                                      <button onClick={() => excluirNotaFiscal(n.id, p.id)} title="Excluir"
                                        className="p-1.5 rounded-sm text-savanna-rust hover:bg-savanna-rust/10">
                                        <IconeLixeira />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {notas.length === 0 && (
                                <tr><td colSpan={6} className="px-3 py-4 text-center text-savanna-muted">Nenhuma nota fiscal cadastrada.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {proprietarios.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-savanna-muted">Nenhum proprietário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} />
      </div>
    </AppShell>
  );
}
