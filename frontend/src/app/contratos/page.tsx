'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Paginacao from '@/components/Paginacao';
import { IconeEngrenagem, IconePdf, IconeFinalizar, IconeLixeira, IconeWhatsapp } from '@/components/icons';
import { api, API_URL } from '@/lib/api';
import { enviarEAbrirWhatsapp } from '@/lib/whatsapp';
import { mascararCpfCnpj, mascararTelefone, mascararRg, mascararInscricaoEstadual, ehCnpj, consultarCnpj, apenasDigitos, mascararMoeda, moedaParaNumero, mascararCep, consultarCep } from '@/lib/mascaras';

const FIADOR_VAZIO_CONTRATO = {
  fiadorNome: '',
  fiadorCpf: '',
  fiadorRg: '',
  fiadorCep: '',
  fiadorEndereco: '',
  fiadorNumero: '',
  fiadorBairro: '',
  fiadorCidade: '',
  fiadorEstado: '',
  fiadorTelefone: '',
  fiadorEmail: '',
  fiadorProfissao: '',
  fiadorEstadoCivil: '',
  fiadorConjugeNome: '',
  fiadorConjugeCpf: '',
  fiadorConjugeTelefone: '',
  fiadorConjugeRg: '',
  fiadorConjugeEmail: '',
  fiadorSocioResponsavelNome: '',
  fiadorSocioResponsavelCpf: '',
  fiadorSocioResponsavel2Nome: '',
  fiadorSocioResponsavel2Cpf: '',
  fiadorSocioResponsavelTelefone: '',
  fiadorSocioResponsavelEmail: '',
  fiadorSocioResponsavel2Telefone: '',
  fiadorSocioResponsavel2Email: '',
  fiadorMediaSalarial: '',
  fiadorEscolaridade: '',
  fiadorDependentes: '0',
  fiadorDeclaraIrpf: '',
  fiadorPatrimonio: '',
};

const FIADOR2_VAZIO_CONTRATO = {
  fiador2Nome: '',
  fiador2Cpf: '',
  fiador2Rg: '',
  fiador2Cep: '',
  fiador2Endereco: '',
  fiador2Numero: '',
  fiador2Bairro: '',
  fiador2Cidade: '',
  fiador2Estado: '',
  fiador2Telefone: '',
  fiador2Email: '',
  fiador2Profissao: '',
  fiador2EstadoCivil: '',
  fiador2ConjugeNome: '',
  fiador2ConjugeCpf: '',
  fiador2ConjugeTelefone: '',
  fiador2ConjugeRg: '',
  fiador2ConjugeEmail: '',
  fiador2SocioResponsavelNome: '',
  fiador2SocioResponsavelCpf: '',
  fiador2SocioResponsavel2Nome: '',
  fiador2SocioResponsavel2Cpf: '',
  fiador2SocioResponsavelTelefone: '',
  fiador2SocioResponsavelEmail: '',
  fiador2SocioResponsavel2Telefone: '',
  fiador2SocioResponsavel2Email: '',
  fiador2MediaSalarial: '',
  fiador2Escolaridade: '',
  fiador2Dependentes: '0',
  fiador2DeclaraIrpf: '',
  fiador2Patrimonio: '',
};

const FORM_VAZIO = {
  inquilinoId: '',
  imovelId: '',
  valorAluguel: '',
  caucao: '',
  percentualComissao: '',
  percentualTaxaIntermediacao: '',
  mesesIntermediacao: ['1'] as string[],
  dataInicio: '',
  dataEntrada: '',
  dataFim: '',
  diaVencimento: '',
  vencimentoQuintoDiaUtil: false,
  despesasAdicionais: [] as string[],
  observacoes: '',
  clausulasAdicionais: [] as Array<{ clausula: string; texto: string }>,
  tipoGarantia: 'PROPRIO',
  indiceReajuste: 'IVAR',
  numeroContrato: '',
  dataAssinatura: '',
  caucaoParcelas: '1',
  caucaoDataPagamento: '',
  socioResponsavelNome: '',
  socioResponsavelCpf: '',
  socioResponsavel2Nome: '',
  socioResponsavel2Cpf: '',
  socioResponsavelTelefone: '',
  socioResponsavelEmail: '',
  socioResponsavel2Telefone: '',
  socioResponsavel2Email: '',
  ...FIADOR_VAZIO_CONTRATO,
  mostrarFiador2: false,
  ...FIADOR2_VAZIO_CONTRATO,
  assinantesAdicionais: '',
  testemunha1Nome: '',
  testemunha1Cpf: '',
  testemunha2Nome: '',
  testemunha2Cpf: '',
  dataVistoriaInicial: '',
  dataVistoriaFinal: '',
  dataRescisao: '',
  motivoRescisao: '',
  multaRescisao: '',
  observacoesRescisao: '',
};

const DESPESAS_ADICIONAIS_OPCOES = [
  { valor: 'agua', label: 'Água' },
  { valor: 'luz', label: 'Luz' },
  { valor: 'condominio', label: 'Condomínio' },
  { valor: 'gas', label: 'Gás' },
  { valor: 'esgoto', label: 'Esgoto' },
  { valor: 'seguro', label: 'Seguro' },
  { valor: 'iptu', label: 'IPTU' },
];

const TIPOS_GARANTIA = [
  { valor: 'PROPRIO', label: 'Fiador Próprio' },
  { valor: 'CAUCAO', label: 'Caução' },
  { valor: 'SEGURO_LOFT', label: 'Seguro Locatício (LOFT)' },
  { valor: 'GARANTIA_INVESTE_LOFT', label: 'Garantia Investe (LOFT)' },
];

const TIPOS_DOCUMENTO = [
  { valor: 'LOCACAO_RESIDENCIAL', label: 'Locação Residencial' },
  { valor: 'LOCACAO_COMERCIAL', label: 'Locação Comercial' },
  { valor: 'INTERMEDIACAO', label: 'Intermediação' },
  { valor: 'VISTORIA_INICIAL', label: 'Vistoria de Entrada' },
  { valor: 'VISTORIA_FINAL', label: 'Vistoria de Saída' },
  { valor: 'RESCISAO', label: 'Rescisão' },
];

const ESCOLARIDADES = [
  'Analfabeto',
  'Fundamental Incompleto',
  'Fundamental Completo',
  'Médio Incompleto',
  'Médio Completo',
  'Superior Incompleto',
  'Superior Completo',
];

const ESTADOS_CIVIS = [
  { valor: '', label: 'Selecione' },
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

const ITENS_VISTORIA_PADRAO = [
  'Pintura', 'Acabamentos', 'Elétrica', 'Trincos e Fechaduras', 'Pisos e Revestimentos',
  'Vidraças e Janelas', 'Portas', 'Telhado', 'Hidráulica', 'Demais Acessórios', 'Limpeza', 'Chaves',
];

const AVALIACOES_VISTORIA = [
  { valor: 'RUIM', label: 'Ruim', cor: 'bg-savanna-rust text-white border-savanna-rust' },
  { valor: 'BOM', label: 'Bom', cor: 'bg-savanna-green-600 text-white border-savanna-green-600' },
  { valor: 'NOVO', label: 'Novo', cor: 'bg-savanna-gold-400 text-white border-savanna-gold-400' },
  { valor: 'NA', label: 'N.A.', cor: 'bg-savanna-gold-500 text-white border-savanna-gold-500' },
];

// Nenhum item vem pré-marcado - o admin precisa avaliar item a item
function checklistPadrao() {
  return ITENS_VISTORIA_PADRAO.map((item) => ({ item, avaliacao: null as string | null }));
}

const CAMPO_ARQUIVO: Record<string, string> = {
  LOCACAO_RESIDENCIAL: 'arquivoPdfLocacao',
  LOCACAO_COMERCIAL: 'arquivoPdfLocacao',
  INTERMEDIACAO: 'arquivoPdfIntermediacao',
  VISTORIA_INICIAL: 'arquivoPdfVistoriaInicial',
  VISTORIA_FINAL: 'arquivoPdfVistoriaFinal',
  RESCISAO: 'arquivoPdfRescisao',
};

export default function ContratosPage() {
  const [contratos, setContratos] = useState<any[]>([]);
  const [inquilinos, setInquilinos] = useState<any[]>([]);
  const [imoveis, setImoveis] = useState<any[]>([]);
  const [form, setForm] = useState<any>(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [linkWhatsapp, setLinkWhatsapp] = useState('');

  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState('LOCACAO_RESIDENCIAL');
  const [itensVistoriaInicial, setItensVistoriaInicial] = useState(checklistPadrao());
  const [itensVistoriaFinal, setItensVistoriaFinal] = useState(checklistPadrao());
  const [observacaoVistoriaInicial, setObservacaoVistoriaInicial] = useState('');
  const [observacaoVistoriaFinal, setObservacaoVistoriaFinal] = useState('');
  const [novoItemVistoria, setNovoItemVistoria] = useState('');

  const [mostrarModelo, setMostrarModelo] = useState(false);
  const [tipoModelo, setTipoModelo] = useState('LOCACAO_RESIDENCIAL');
  const [conteudoModelo, setConteudoModelo] = useState('');
  const [buscaModelo, setBuscaModelo] = useState('');
  const [ocorrenciasModelo, setOcorrenciasModelo] = useState<number[]>([]);
  const [ocorrenciaAtual, setOcorrenciaAtual] = useState(0);
  const textareaModeloRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightModeloRef = useRef<HTMLDivElement | null>(null);
  const [placeholders, setPlaceholders] = useState<any[]>([]);
  const [salvandoModelo, setSalvandoModelo] = useState(false);

  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [linhaDestacadaId, setLinhaDestacadaId] = useState<number | null>(null);

  function destacarLinha(id: number) {
    setLinhaDestacadaId(id);
    setTimeout(() => setLinhaDestacadaId((atual) => (atual === id ? null : atual)), 2500);
  }

  function carregar(buscaAtual = busca, paginaAtual = pagina) {
    const params = new URLSearchParams();
    if (buscaAtual) params.set('busca', buscaAtual);
    params.set('pagina', String(paginaAtual));
    api.get(`/api/contratos?${params.toString()}`)
      .then((resposta) => {
        if (resposta.dados.length === 0 && resposta.pagina > 1 && resposta.pagina > resposta.totalPaginas) {
          carregar(buscaAtual, resposta.totalPaginas);
          return;
        }
        setContratos(resposta.dados);
        setTotalRegistros(resposta.total);
        setTotalPaginas(resposta.totalPaginas);
        setPagina(resposta.pagina);
      })
      .catch((e) => setErro(e.message));
    api.get('/api/inquilinos').then(setInquilinos);
    api.get('/api/imoveis?filtro=disponivel').then(setImoveis);
  }

  function irParaPagina(p: number) {
    carregar(busca, p);
  }

  const [testemunhasCadastradas, setTestemunhasCadastradas] = useState<any[]>([]);
  const [mostrarNovaTestemunha, setMostrarNovaTestemunha] = useState<1 | 2 | null>(null);
  const [novaTestemunha, setNovaTestemunha] = useState({ nome: '', cpf: '', email: '', telefone: '' });

  async function carregarTestemunhas() {
    try {
      const lista = await api.get('/api/testemunhas');
      setTestemunhasCadastradas(lista);
    } catch {
      // Se falhar, o seletor só fica vazio - não trava o resto da tela
    }
  }

  function selecionarTestemunha(slot: 1 | 2, testemunhaId: string) {
    const t = testemunhasCadastradas.find((x) => String(x.id) === testemunhaId);
    if (!t) return;
    if (slot === 1) setForm({ ...form, testemunha1Nome: t.nome, testemunha1Cpf: t.cpf ? mascararCpfCnpj(t.cpf) : '' });
    else setForm({ ...form, testemunha2Nome: t.nome, testemunha2Cpf: t.cpf ? mascararCpfCnpj(t.cpf) : '' });
  }

  async function salvarNovaTestemunha(slot: 1 | 2) {
    if (!novaTestemunha.nome) {
      setErro('Preencha o nome da testemunha.');
      return;
    }
    setErro('');
    try {
      const criada = await api.post('/api/testemunhas', novaTestemunha);
      await carregarTestemunhas();
      if (slot === 1) setForm({ ...form, testemunha1Nome: criada.nome, testemunha1Cpf: criada.cpf ? mascararCpfCnpj(criada.cpf) : '' });
      else setForm({ ...form, testemunha2Nome: criada.nome, testemunha2Cpf: criada.cpf ? mascararCpfCnpj(criada.cpf) : '' });
      setNovaTestemunha({ nome: '', cpf: '', email: '', telefone: '' });
      setMostrarNovaTestemunha(null);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  useEffect(() => {
    carregar();
    carregarTestemunhas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => carregar(busca, 1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function resetarFormulario() {
    setForm({ ...FORM_VAZIO, dataAssinatura: new Date().toISOString().substring(0, 10) });
    setEditandoId(null);
    setTipoDocumento('LOCACAO_RESIDENCIAL');
    setItensVistoriaInicial(checklistPadrao());
    setItensVistoriaFinal(checklistPadrao());
    setNovoItemVistoria('');
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

  const listaAtiva = tipoDocumento === 'VISTORIA_FINAL' ? itensVistoriaFinal : itensVistoriaInicial;
  const setListaAtiva = tipoDocumento === 'VISTORIA_FINAL' ? setItensVistoriaFinal : setItensVistoriaInicial;

  function alterarAvaliacao(indice: number, avaliacao: string) {
    setListaAtiva((itens: any[]) => itens.map((it, i) => (i === indice ? { ...it, avaliacao } : it)));
  }

  function adicionarItemVistoria() {
    if (!novoItemVistoria.trim()) return;
    setListaAtiva((itens: any[]) => [...itens, { item: novoItemVistoria.trim(), avaliacao: null }]);
    setNovoItemVistoria('');
  }

  function removerItemVistoria(indice: number) {
    setListaAtiva((itens: any[]) => itens.filter((_, i) => i !== indice));
  }

  function selecionarInquilino(inquilinoId: string) {
    const inquilino = inquilinos.find((i) => String(i.id) === inquilinoId);
    setForm((f: any) => ({
      ...f,
      inquilinoId,
      socioResponsavelNome: inquilino?.socioResponsavelNome || f.socioResponsavelNome,
      socioResponsavelCpf: inquilino?.socioResponsavelCpf ? mascararCpfCnpj(inquilino.socioResponsavelCpf) : f.socioResponsavelCpf,
      socioResponsavel2Nome: inquilino?.socioResponsavel2Nome || f.socioResponsavel2Nome,
      socioResponsavel2Cpf: inquilino?.socioResponsavel2Cpf ? mascararCpfCnpj(inquilino.socioResponsavel2Cpf) : f.socioResponsavel2Cpf,
      socioResponsavelTelefone: inquilino?.socioResponsavelTelefone ? mascararTelefone(inquilino.socioResponsavelTelefone) : f.socioResponsavelTelefone,
      socioResponsavelEmail: inquilino?.socioResponsavelEmail || f.socioResponsavelEmail,
      socioResponsavel2Telefone: inquilino?.socioResponsavel2Telefone ? mascararTelefone(inquilino.socioResponsavel2Telefone) : f.socioResponsavel2Telefone,
      socioResponsavel2Email: inquilino?.socioResponsavel2Email || f.socioResponsavel2Email,
      // Preenche automaticamente com o fiador/testemunhas salvos no cadastro do inquilino (se houver)
      fiadorNome: inquilino?.fiadorNome || f.fiadorNome,
      fiadorCpf: inquilino?.fiadorCpf ? mascararCpfCnpj(inquilino.fiadorCpf) : f.fiadorCpf,
      fiadorRg: inquilino?.fiadorRg || f.fiadorRg,
      fiadorCep: inquilino?.fiadorCep || f.fiadorCep,
      fiadorEndereco: inquilino?.fiadorEndereco || f.fiadorEndereco,
      fiadorNumero: inquilino?.fiadorNumero || f.fiadorNumero,
      fiadorBairro: inquilino?.fiadorBairro || f.fiadorBairro,
      fiadorCidade: inquilino?.fiadorCidade || f.fiadorCidade,
      fiadorEstado: inquilino?.fiadorEstado || f.fiadorEstado,
      fiadorTelefone: inquilino?.fiadorTelefone ? mascararTelefone(inquilino.fiadorTelefone) : f.fiadorTelefone,
      fiadorEmail: inquilino?.fiadorEmail || f.fiadorEmail,
      fiadorProfissao: inquilino?.fiadorProfissao || f.fiadorProfissao,
      fiadorEstadoCivil: inquilino?.fiadorEstadoCivil || f.fiadorEstadoCivil,
      fiadorEscolaridade: inquilino?.fiadorEscolaridade || f.fiadorEscolaridade,
      fiadorMediaSalarial: inquilino?.fiadorMediaSalarial ? mascararMoeda(String(Math.round(Number(inquilino.fiadorMediaSalarial) * 100))) : f.fiadorMediaSalarial,
      fiadorPatrimonio: inquilino?.fiadorPatrimonio ? mascararMoeda(String(Math.round(Number(inquilino.fiadorPatrimonio) * 100))) : f.fiadorPatrimonio,
      fiadorDependentes: inquilino?.fiadorDependentes !== undefined && inquilino?.fiadorDependentes !== null ? String(inquilino.fiadorDependentes) : f.fiadorDependentes,
      fiadorDeclaraIrpf: inquilino?.fiadorDeclaraIrpf === true ? 'sim' : inquilino?.fiadorDeclaraIrpf === false ? 'nao' : f.fiadorDeclaraIrpf,
      fiadorConjugeNome: inquilino?.fiadorConjugeNome || f.fiadorConjugeNome,
      fiadorConjugeCpf: inquilino?.fiadorConjugeCpf ? mascararCpfCnpj(inquilino.fiadorConjugeCpf) : f.fiadorConjugeCpf,
      fiadorConjugeTelefone: inquilino?.fiadorConjugeTelefone ? mascararTelefone(inquilino.fiadorConjugeTelefone) : f.fiadorConjugeTelefone,
      fiadorConjugeRg: inquilino?.fiadorConjugeRg || f.fiadorConjugeRg,
      fiadorConjugeEmail: inquilino?.fiadorConjugeEmail || f.fiadorConjugeEmail,
      fiadorSocioResponsavelNome: inquilino?.fiadorSocioResponsavelNome || f.fiadorSocioResponsavelNome,
      fiadorSocioResponsavelCpf: inquilino?.fiadorSocioResponsavelCpf ? mascararCpfCnpj(inquilino.fiadorSocioResponsavelCpf) : f.fiadorSocioResponsavelCpf,
      fiadorSocioResponsavel2Nome: inquilino?.fiadorSocioResponsavel2Nome || f.fiadorSocioResponsavel2Nome,
      fiadorSocioResponsavel2Cpf: inquilino?.fiadorSocioResponsavel2Cpf ? mascararCpfCnpj(inquilino.fiadorSocioResponsavel2Cpf) : f.fiadorSocioResponsavel2Cpf,
      fiadorSocioResponsavelTelefone: inquilino?.fiadorSocioResponsavelTelefone ? mascararTelefone(inquilino.fiadorSocioResponsavelTelefone) : f.fiadorSocioResponsavelTelefone,
      fiadorSocioResponsavelEmail: inquilino?.fiadorSocioResponsavelEmail || f.fiadorSocioResponsavelEmail,
      fiadorSocioResponsavel2Telefone: inquilino?.fiadorSocioResponsavel2Telefone ? mascararTelefone(inquilino.fiadorSocioResponsavel2Telefone) : f.fiadorSocioResponsavel2Telefone,
      fiadorSocioResponsavel2Email: inquilino?.fiadorSocioResponsavel2Email || f.fiadorSocioResponsavel2Email,
      mostrarFiador2: !!inquilino?.fiador2Nome || f.mostrarFiador2,
      fiador2Nome: inquilino?.fiador2Nome || f.fiador2Nome,
      fiador2Cpf: inquilino?.fiador2Cpf ? mascararCpfCnpj(inquilino.fiador2Cpf) : f.fiador2Cpf,
      fiador2Rg: inquilino?.fiador2Rg || f.fiador2Rg,
      fiador2Cep: inquilino?.fiador2Cep || f.fiador2Cep,
      fiador2Endereco: inquilino?.fiador2Endereco || f.fiador2Endereco,
      fiador2Numero: inquilino?.fiador2Numero || f.fiador2Numero,
      fiador2Bairro: inquilino?.fiador2Bairro || f.fiador2Bairro,
      fiador2Cidade: inquilino?.fiador2Cidade || f.fiador2Cidade,
      fiador2Estado: inquilino?.fiador2Estado || f.fiador2Estado,
      fiador2Telefone: inquilino?.fiador2Telefone ? mascararTelefone(inquilino.fiador2Telefone) : f.fiador2Telefone,
      fiador2Email: inquilino?.fiador2Email || f.fiador2Email,
      fiador2Profissao: inquilino?.fiador2Profissao || f.fiador2Profissao,
      fiador2EstadoCivil: inquilino?.fiador2EstadoCivil || f.fiador2EstadoCivil,
      fiador2Escolaridade: inquilino?.fiador2Escolaridade || f.fiador2Escolaridade,
      fiador2MediaSalarial: inquilino?.fiador2MediaSalarial ? mascararMoeda(String(Math.round(Number(inquilino.fiador2MediaSalarial) * 100))) : f.fiador2MediaSalarial,
      fiador2Patrimonio: inquilino?.fiador2Patrimonio ? mascararMoeda(String(Math.round(Number(inquilino.fiador2Patrimonio) * 100))) : f.fiador2Patrimonio,
      fiador2Dependentes: inquilino?.fiador2Dependentes !== undefined && inquilino?.fiador2Dependentes !== null ? String(inquilino.fiador2Dependentes) : f.fiador2Dependentes,
      fiador2DeclaraIrpf: inquilino?.fiador2DeclaraIrpf === true ? 'sim' : inquilino?.fiador2DeclaraIrpf === false ? 'nao' : f.fiador2DeclaraIrpf,
      fiador2ConjugeNome: inquilino?.fiador2ConjugeNome || f.fiador2ConjugeNome,
      fiador2ConjugeCpf: inquilino?.fiador2ConjugeCpf ? mascararCpfCnpj(inquilino.fiador2ConjugeCpf) : f.fiador2ConjugeCpf,
      fiador2ConjugeTelefone: inquilino?.fiador2ConjugeTelefone ? mascararTelefone(inquilino.fiador2ConjugeTelefone) : f.fiador2ConjugeTelefone,
      fiador2ConjugeRg: inquilino?.fiador2ConjugeRg || f.fiador2ConjugeRg,
      fiador2ConjugeEmail: inquilino?.fiador2ConjugeEmail || f.fiador2ConjugeEmail,
      fiador2SocioResponsavelNome: inquilino?.fiador2SocioResponsavelNome || f.fiador2SocioResponsavelNome,
      fiador2SocioResponsavelCpf: inquilino?.fiador2SocioResponsavelCpf ? mascararCpfCnpj(inquilino.fiador2SocioResponsavelCpf) : f.fiador2SocioResponsavelCpf,
      fiador2SocioResponsavel2Nome: inquilino?.fiador2SocioResponsavel2Nome || f.fiador2SocioResponsavel2Nome,
      fiador2SocioResponsavel2Cpf: inquilino?.fiador2SocioResponsavel2Cpf ? mascararCpfCnpj(inquilino.fiador2SocioResponsavel2Cpf) : f.fiador2SocioResponsavel2Cpf,
      fiador2SocioResponsavelTelefone: inquilino?.fiador2SocioResponsavelTelefone ? mascararTelefone(inquilino.fiador2SocioResponsavelTelefone) : f.fiador2SocioResponsavelTelefone,
      fiador2SocioResponsavelEmail: inquilino?.fiador2SocioResponsavelEmail || f.fiador2SocioResponsavelEmail,
      fiador2SocioResponsavel2Telefone: inquilino?.fiador2SocioResponsavel2Telefone ? mascararTelefone(inquilino.fiador2SocioResponsavel2Telefone) : f.fiador2SocioResponsavel2Telefone,
      fiador2SocioResponsavel2Email: inquilino?.fiador2SocioResponsavel2Email || f.fiador2SocioResponsavel2Email,
      testemunha1Nome: inquilino?.testemunha1Nome || f.testemunha1Nome,
      testemunha1Cpf: inquilino?.testemunha1Cpf ? mascararCpfCnpj(inquilino.testemunha1Cpf) : f.testemunha1Cpf,
      testemunha2Nome: inquilino?.testemunha2Nome || f.testemunha2Nome,
      testemunha2Cpf: inquilino?.testemunha2Cpf ? mascararCpfCnpj(inquilino.testemunha2Cpf) : f.testemunha2Cpf,
    }));
  }

  const [buscandoCnpjFiadorContrato, setBuscandoCnpjFiadorContrato] = useState(false);
  const [buscandoCnpjFiador2Contrato, setBuscandoCnpjFiador2Contrato] = useState(false);

  // Busca automática de dados quando o CPF/CNPJ do fiador (ou 2º fiador) é um CNPJ,
  // mesmo comportamento já usado no cadastro de Inquilinos.
  async function buscarDadosFiadorPorCnpjContrato(valor: string, prefixo: 'fiador' | 'fiador2') {
    if (!ehCnpj(valor)) return;
    const setBuscando = prefixo === 'fiador' ? setBuscandoCnpjFiadorContrato : setBuscandoCnpjFiador2Contrato;
    setBuscando(true);
    try {
      const dados = await consultarCnpj(valor);
      if (dados) {
        setForm((f: any) => ({
          ...f,
          [`${prefixo}Nome`]: f[`${prefixo}Nome`] ? f[`${prefixo}Nome`] : dados.razaoSocial,
          [`${prefixo}Telefone`]: f[`${prefixo}Telefone`] ? f[`${prefixo}Telefone`] : (dados.telefone ? mascararTelefone(dados.telefone) : f[`${prefixo}Telefone`]),
          [`${prefixo}Email`]: f[`${prefixo}Email`] ? f[`${prefixo}Email`] : (dados.email || f[`${prefixo}Email`]),
          [`${prefixo}Endereco`]: f[`${prefixo}Endereco`] ? f[`${prefixo}Endereco`] : (dados.endereco || f[`${prefixo}Endereco`]),
          [`${prefixo}Rg`]: f[`${prefixo}Rg`] ? f[`${prefixo}Rg`] : (dados.inscricaoEstadual ? mascararInscricaoEstadual(dados.inscricaoEstadual) : f[`${prefixo}Rg`]),
        }));
      }
    } catch {
      // Falha na consulta não deve travar o cadastro - o usuário preenche manualmente
    } finally {
      setBuscando(false);
    }
  }

  const [buscandoCepFiadorContrato, setBuscandoCepFiadorContrato] = useState(false);
  const [buscandoCepFiador2Contrato, setBuscandoCepFiador2Contrato] = useState(false);

  // Busca de CEP reutilizada para o fiador e o 2º fiador (mesmo padrão do inquilino/proprietário)
  async function buscarCepEPreencherFiadorContrato(cep: string, prefixo: 'fiador' | 'fiador2') {
    if (apenasDigitos(cep).length !== 8) return;
    const setBuscando = prefixo === 'fiador' ? setBuscandoCepFiadorContrato : setBuscandoCepFiador2Contrato;
    setBuscando(true);
    try {
      const dados = await consultarCep(cep);
      if (dados) {
        setForm((f: any) => ({
          ...f,
          [`${prefixo}Endereco`]: dados.logradouro || f[`${prefixo}Endereco`],
          [`${prefixo}Bairro`]: dados.bairro || f[`${prefixo}Bairro`],
          [`${prefixo}Cidade`]: dados.cidade || f[`${prefixo}Cidade`],
          [`${prefixo}Estado`]: dados.estado || f[`${prefixo}Estado`],
        }));
      }
    } catch {
      // Falha na consulta não deve travar o cadastro - o usuário preenche manualmente
    } finally {
      setBuscando(false);
    }
  }

  function selecionarImovel(imovelId: string) {
    const imovel = imoveis.find((i) => String(i.id) === imovelId);
    setForm((f: any) => ({
      ...f,
      imovelId,
      valorAluguel: imovel ? mascararMoeda(String(Math.round(Number(imovel.valorAluguel) * 100))) : f.valorAluguel,
    }));
  }

  function abrirEdicao(contrato: any, tipoInicial?: string) {
    setForm({
      inquilinoId: String(contrato.inquilinoId),
      imovelId: String(contrato.imovelId),
      valorAluguel: mascararMoeda(String(Math.round(Number(contrato.valorAluguel) * 100))),
      caucao: contrato.caucao ? mascararMoeda(String(Math.round(Number(contrato.caucao) * 100))) : '',
      percentualComissao: contrato.percentualComissao ? String(contrato.percentualComissao) : '',
      percentualTaxaIntermediacao: contrato.percentualTaxaIntermediacao ? String(contrato.percentualTaxaIntermediacao) : '',
      mesesIntermediacao: contrato.mesesIntermediacao ? contrato.mesesIntermediacao.split(',') : ['1'],
      dataInicio: contrato.dataInicio ? contrato.dataInicio.substring(0, 10) : '',
      dataEntrada: contrato.dataEntrada ? contrato.dataEntrada.substring(0, 10) : '',
      dataFim: contrato.dataFim ? contrato.dataFim.substring(0, 10) : '',
      diaVencimento: contrato.diaVencimento ? String(contrato.diaVencimento) : '',
      vencimentoQuintoDiaUtil: !!contrato.vencimentoQuintoDiaUtil,
      despesasAdicionais: contrato.despesasAdicionais ? contrato.despesasAdicionais.split(',').filter(Boolean) : [],
      caucaoParcelas: contrato.caucaoParcelas ? String(contrato.caucaoParcelas) : '1',
      caucaoDataPagamento: contrato.caucaoDataPagamento ? contrato.caucaoDataPagamento.substring(0, 10) : '',
      observacoes: contrato.observacoes || '',
      clausulasAdicionais: contrato.clausulasAdicionaisJson ? (() => { try { return JSON.parse(contrato.clausulasAdicionaisJson); } catch { return []; } })() : [],
      tipoGarantia: contrato.tipoGarantia === 'LOFT' ? 'GARANTIA_INVESTE_LOFT' : (contrato.tipoGarantia || 'PROPRIO'),
      indiceReajuste: contrato.indiceReajuste || 'IVAR',
      numeroContrato: contrato.numeroContrato || '',
      dataAssinatura: contrato.dataAssinatura ? contrato.dataAssinatura.substring(0, 10) : '',
      socioResponsavelNome: contrato.socioResponsavelNome || '',
      socioResponsavelCpf: contrato.socioResponsavelCpf ? mascararCpfCnpj(contrato.socioResponsavelCpf) : '',
      socioResponsavel2Nome: contrato.socioResponsavel2Nome || '',
      socioResponsavel2Cpf: contrato.socioResponsavel2Cpf ? mascararCpfCnpj(contrato.socioResponsavel2Cpf) : '',
      socioResponsavelTelefone: contrato.socioResponsavelTelefone ? mascararTelefone(contrato.socioResponsavelTelefone) : '',
      socioResponsavelEmail: contrato.socioResponsavelEmail || '',
      socioResponsavel2Telefone: contrato.socioResponsavel2Telefone ? mascararTelefone(contrato.socioResponsavel2Telefone) : '',
      socioResponsavel2Email: contrato.socioResponsavel2Email || '',
      fiadorNome: contrato.fiadorNome || '',
      fiadorCpf: contrato.fiadorCpf ? mascararCpfCnpj(contrato.fiadorCpf) : '',
      fiadorRg: contrato.fiadorRg || '',
      fiadorCep: contrato.fiadorCep || '',
      fiadorEndereco: contrato.fiadorEndereco || '',
      fiadorNumero: contrato.fiadorNumero || '',
      fiadorBairro: contrato.fiadorBairro || '',
      fiadorCidade: contrato.fiadorCidade || '',
      fiadorEstado: contrato.fiadorEstado || '',
      fiadorTelefone: contrato.fiadorTelefone ? mascararTelefone(contrato.fiadorTelefone) : '',
      fiadorEmail: contrato.fiadorEmail || '',
      fiadorProfissao: contrato.fiadorProfissao || '',
      fiadorEstadoCivil: contrato.fiadorEstadoCivil || '',
      fiadorEscolaridade: contrato.fiadorEscolaridade || '',
      fiadorMediaSalarial: contrato.fiadorMediaSalarial ? mascararMoeda(String(Math.round(Number(contrato.fiadorMediaSalarial) * 100))) : '',
      fiadorPatrimonio: contrato.fiadorPatrimonio ? mascararMoeda(String(Math.round(Number(contrato.fiadorPatrimonio) * 100))) : '',
      fiadorDependentes: contrato.fiadorDependentes !== undefined && contrato.fiadorDependentes !== null ? String(contrato.fiadorDependentes) : '0',
      fiadorDeclaraIrpf: contrato.fiadorDeclaraIrpf === true ? 'sim' : contrato.fiadorDeclaraIrpf === false ? 'nao' : '',
      fiadorConjugeNome: contrato.fiadorConjugeNome || '',
      fiadorConjugeCpf: contrato.fiadorConjugeCpf ? mascararCpfCnpj(contrato.fiadorConjugeCpf) : '',
      fiadorConjugeTelefone: contrato.fiadorConjugeTelefone ? mascararTelefone(contrato.fiadorConjugeTelefone) : '',
      fiadorConjugeRg: contrato.fiadorConjugeRg || '',
      fiadorConjugeEmail: contrato.fiadorConjugeEmail || '',
      fiadorSocioResponsavelNome: contrato.fiadorSocioResponsavelNome || '',
      fiadorSocioResponsavelCpf: contrato.fiadorSocioResponsavelCpf ? mascararCpfCnpj(contrato.fiadorSocioResponsavelCpf) : '',
      fiadorSocioResponsavel2Nome: contrato.fiadorSocioResponsavel2Nome || '',
      fiadorSocioResponsavel2Cpf: contrato.fiadorSocioResponsavel2Cpf ? mascararCpfCnpj(contrato.fiadorSocioResponsavel2Cpf) : '',
      fiadorSocioResponsavelTelefone: contrato.fiadorSocioResponsavelTelefone ? mascararTelefone(contrato.fiadorSocioResponsavelTelefone) : '',
      fiadorSocioResponsavelEmail: contrato.fiadorSocioResponsavelEmail || '',
      fiadorSocioResponsavel2Telefone: contrato.fiadorSocioResponsavel2Telefone ? mascararTelefone(contrato.fiadorSocioResponsavel2Telefone) : '',
      fiadorSocioResponsavel2Email: contrato.fiadorSocioResponsavel2Email || '',
      mostrarFiador2: Boolean(contrato.fiador2Nome),
      fiador2Nome: contrato.fiador2Nome || '',
      fiador2Cpf: contrato.fiador2Cpf ? mascararCpfCnpj(contrato.fiador2Cpf) : '',
      fiador2Rg: contrato.fiador2Rg || '',
      fiador2Cep: contrato.fiador2Cep || '',
      fiador2Endereco: contrato.fiador2Endereco || '',
      fiador2Numero: contrato.fiador2Numero || '',
      fiador2Bairro: contrato.fiador2Bairro || '',
      fiador2Cidade: contrato.fiador2Cidade || '',
      fiador2Estado: contrato.fiador2Estado || '',
      fiador2Telefone: contrato.fiador2Telefone ? mascararTelefone(contrato.fiador2Telefone) : '',
      fiador2Email: contrato.fiador2Email || '',
      fiador2Profissao: contrato.fiador2Profissao || '',
      fiador2EstadoCivil: contrato.fiador2EstadoCivil || '',
      fiador2Escolaridade: contrato.fiador2Escolaridade || '',
      fiador2MediaSalarial: contrato.fiador2MediaSalarial ? mascararMoeda(String(Math.round(Number(contrato.fiador2MediaSalarial) * 100))) : '',
      fiador2Patrimonio: contrato.fiador2Patrimonio ? mascararMoeda(String(Math.round(Number(contrato.fiador2Patrimonio) * 100))) : '',
      fiador2Dependentes: contrato.fiador2Dependentes !== undefined && contrato.fiador2Dependentes !== null ? String(contrato.fiador2Dependentes) : '0',
      fiador2DeclaraIrpf: contrato.fiador2DeclaraIrpf === true ? 'sim' : contrato.fiador2DeclaraIrpf === false ? 'nao' : '',
      fiador2ConjugeNome: contrato.fiador2ConjugeNome || '',
      fiador2ConjugeCpf: contrato.fiador2ConjugeCpf ? mascararCpfCnpj(contrato.fiador2ConjugeCpf) : '',
      fiador2ConjugeTelefone: contrato.fiador2ConjugeTelefone ? mascararTelefone(contrato.fiador2ConjugeTelefone) : '',
      fiador2ConjugeRg: contrato.fiador2ConjugeRg || '',
      fiador2ConjugeEmail: contrato.fiador2ConjugeEmail || '',
      fiador2SocioResponsavelNome: contrato.fiador2SocioResponsavelNome || '',
      fiador2SocioResponsavelCpf: contrato.fiador2SocioResponsavelCpf ? mascararCpfCnpj(contrato.fiador2SocioResponsavelCpf) : '',
      fiador2SocioResponsavel2Nome: contrato.fiador2SocioResponsavel2Nome || '',
      fiador2SocioResponsavel2Cpf: contrato.fiador2SocioResponsavel2Cpf ? mascararCpfCnpj(contrato.fiador2SocioResponsavel2Cpf) : '',
      fiador2SocioResponsavelTelefone: contrato.fiador2SocioResponsavelTelefone ? mascararTelefone(contrato.fiador2SocioResponsavelTelefone) : '',
      fiador2SocioResponsavelEmail: contrato.fiador2SocioResponsavelEmail || '',
      fiador2SocioResponsavel2Telefone: contrato.fiador2SocioResponsavel2Telefone ? mascararTelefone(contrato.fiador2SocioResponsavel2Telefone) : '',
      fiador2SocioResponsavel2Email: contrato.fiador2SocioResponsavel2Email || '',
      assinantesAdicionais: contrato.assinantesAdicionais || '',
      testemunha1Nome: contrato.testemunha1Nome || '',
      testemunha1Cpf: contrato.testemunha1Cpf ? mascararCpfCnpj(contrato.testemunha1Cpf) : '',
      testemunha2Nome: contrato.testemunha2Nome || '',
      testemunha2Cpf: contrato.testemunha2Cpf ? mascararCpfCnpj(contrato.testemunha2Cpf) : '',
      dataVistoriaInicial: contrato.dataVistoriaInicial ? contrato.dataVistoriaInicial.substring(0, 10) : '',
      dataVistoriaFinal: contrato.dataVistoriaFinal ? contrato.dataVistoriaFinal.substring(0, 10) : '',
      dataRescisao: contrato.dataRescisao ? contrato.dataRescisao.substring(0, 10) : new Date().toISOString().substring(0, 10),
      motivoRescisao: contrato.motivoRescisao || '',
      multaRescisao: contrato.multaRescisao ? mascararMoeda(String(Math.round(Number(contrato.multaRescisao) * 100))) : '',
      observacoesRescisao: contrato.observacoesRescisao || '',
    });

    function interpretar(json: string | null) {
      if (!json) return { itens: checklistPadrao(), observacao: '' };
      try {
        const dados = JSON.parse(json);
        if (Array.isArray(dados)) {
          return { itens: dados.length ? dados : checklistPadrao(), observacao: '' };
        }
        if (dados && Array.isArray(dados.itens)) {
          return { itens: dados.itens.length ? dados.itens : checklistPadrao(), observacao: dados.observacao || '' };
        }
        return { itens: checklistPadrao(), observacao: '' };
      } catch {
        return { itens: checklistPadrao(), observacao: '' };
      }
    }
    const inicial = interpretar(contrato.checklistVistoriaInicial);
    const final = interpretar(contrato.checklistVistoriaFinal);
    setItensVistoriaInicial(inicial.itens);
    setItensVistoriaFinal(final.itens);
    setObservacaoVistoriaInicial(inicial.observacao);
    setObservacaoVistoriaFinal(final.observacao);

    setEditandoId(contrato.id);
    setTipoDocumento(
      tipoInicial
        || (contrato.arquivoPdfLocacao ? 'LOCACAO_RESIDENCIAL'
          : contrato.arquivoPdfIntermediacao ? 'INTERMEDIACAO'
          : contrato.arquivoPdfVistoriaInicial ? 'VISTORIA_INICIAL'
          : contrato.arquivoPdfVistoriaFinal ? 'VISTORIA_FINAL'
          : 'LOCACAO_RESIDENCIAL')
    );
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setMensagem('');

    if (form.tipoGarantia === 'GARANTIA_INVESTE_LOFT' && inquilinoEhCnpj) {
      setErro('Garantia Investe (LOFT) só está disponível para locatário Pessoa Física (CPF). Escolha outra garantia.');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { mostrarFiador2, clausulasAdicionais, ...formSemUi } = form;
      const payload = {
        ...formSemUi,
        clausulasAdicionaisJson: clausulasAdicionais.length ? JSON.stringify(clausulasAdicionais) : null,
        valorAluguel: moedaParaNumero(form.valorAluguel),
        caucao: form.caucao ? moedaParaNumero(form.caucao) : null,
        multaRescisao: form.multaRescisao ? moedaParaNumero(form.multaRescisao) : null,
        fiadorMediaSalarial: form.fiadorMediaSalarial ? moedaParaNumero(form.fiadorMediaSalarial) : null,
        fiadorPatrimonio: form.fiadorPatrimonio ? moedaParaNumero(form.fiadorPatrimonio) : null,
        fiadorDeclaraIrpf: form.fiadorDeclaraIrpf === 'sim' ? true : form.fiadorDeclaraIrpf === 'nao' ? false : null,
        fiador2MediaSalarial: form.fiador2MediaSalarial ? moedaParaNumero(form.fiador2MediaSalarial) : null,
        fiador2Patrimonio: form.fiador2Patrimonio ? moedaParaNumero(form.fiador2Patrimonio) : null,
        fiador2DeclaraIrpf: form.fiador2DeclaraIrpf === 'sim' ? true : form.fiador2DeclaraIrpf === 'nao' ? false : null,
        checklistVistoriaInicial: JSON.stringify({ itens: itensVistoriaInicial, observacao: observacaoVistoriaInicial }),
        checklistVistoriaFinal: JSON.stringify({ itens: itensVistoriaFinal, observacao: observacaoVistoriaFinal }),
      };

      let contratoId = editandoId;
      let pagamentosGerados = 0;

      if (editandoId) {
        // Na edição não trocamos inquilino/imóvel, só os termos do contrato
        const { inquilinoId, imovelId, ...termos } = payload;
        await api.put(`/api/contratos/${editandoId}`, termos);
      } else {
        const criado = await api.post('/api/contratos', payload);
        contratoId = criado.id;
        pagamentosGerados = criado.pagamentosGerados || 0;
      }

      resetarFormulario();
      setMostrarForm(false);
      carregar(busca, pagina);
      if (contratoId) destacarLinha(contratoId);

      // Já gera o PDF do tipo de documento escolhido no topo do formulário
      if (contratoId) {
        await gerarPdf(contratoId, tipoDocumento);
        setExpandidoId(contratoId);
      }

      if (pagamentosGerados > 0) {
        setMensagem(
          `Contrato criado e documento gerado. ${pagamentosGerados} parcela(s) de aluguel foram lançadas automaticamente em Pagamentos.`
        );
      }
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const [regenerandoParcelas, setRegenerandoParcelas] = useState(false);

  async function regenerarParcelas() {
    if (!editandoId) return;
    if (!confirm('Gerar as parcelas de aluguel que estiverem faltando para este contrato, usando os dados atuais (valor, datas, comissão etc)?\n\nParcelas já existentes (pagas ou não) não são alteradas nem duplicadas - só os meses que faltam são criados.')) return;
    setErro('');
    setMensagem('');
    setRegenerandoParcelas(true);
    try {
      const resultado = await api.post(`/api/contratos/${editandoId}/regenerar-parcelas`);
      const qtd = resultado.pagamentosGerados || 0;
      setMensagem(
        qtd > 0
          ? `${qtd} parcela(s) de aluguel foram geradas em Pagamentos.`
          : 'Nenhuma parcela faltando - todos os meses do contrato já têm parcela lançada.'
      );
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setRegenerandoParcelas(false);
    }
  }

  async function finalizarContrato(contrato: any) {
    if (!confirm('Finalizar este contrato? O imóvel voltará a ficar disponível e será desvinculado do inquilino. Os pagamentos já registrados são mantidos.\n\nEm seguida você poderá preencher os dados da rescisão e gerar o termo.')) return;
    setErro('');
    setMensagem('');
    try {
      const atualizado = await api.put(`/api/contratos/${contrato.id}/finalizar`);
      setMensagem('Contrato finalizado. O imóvel foi liberado. Preencha os dados da rescisão abaixo para gerar o termo.');
      carregar(busca, pagina);
      // Abre direto no formulário de edição, já no tipo Rescisão, pra preencher motivo/multa e gerar o termo
      abrirEdicao({ ...contrato, ...atualizado }, 'RESCISAO');
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function excluir(id: number, forcar = false) {
    if (!forcar && !confirm('Excluir este contrato?')) return;
    setErro('');
    setMensagem('');
    try {
      const params = forcar ? '?forcar=true' : '';
      await api.delete(`/api/contratos/${id}${params}`);
      setMensagem('Contrato excluído.');
      carregar(busca, pagina);
    } catch (err: any) {
      if (err.possuiVinculos) {
        const confirmarForcado = confirm(
          `${err.message}\n\nDeseja excluir o contrato e todos os pagamentos vinculados a ele?`
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

  async function gerarPdf(id: number, tipo: string) {
    setMensagem('');
    setErro('');
    try {
      await api.post(`/api/contratos/${id}/gerar-pdf`, { tipo });
      setMensagem('Documento gerado com sucesso.');
      destacarLinha(id);
      carregar(busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function enviarWhatsapp(id: number, tipo: string) {
    setMensagem('');
    setErro('');
    setLinkWhatsapp('');
    destacarLinha(id);
    try {
      const { resultado, linkAberto } = await enviarEAbrirWhatsapp(() => api.post(`/api/contratos/${id}/enviar-whatsapp`, { tipo }));
      if (resultado?.resultado?.simulado) {
        if (linkAberto) {
          setMensagem('WhatsApp aberto em uma nova aba.');
        } else {
          setMensagem('Não foi possível abrir o WhatsApp automaticamente (popup bloqueado). Use o link abaixo.');
          setLinkWhatsapp(resultado?.resultado?.linkWhatsapp || '');
        }
      } else {
        setMensagem('Documento enviado via WhatsApp.');
      }
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function abrirEditorModelo(tipo = 'LOCACAO_RESIDENCIAL') {
    setErro('');
    try {
      const modelo = await api.get(`/api/modelo-contrato?tipo=${tipo}`);
      setTipoModelo(tipo);
      setConteudoModelo(modelo.conteudo);
      setPlaceholders(modelo.placeholders || []);
      setMostrarModelo(true);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function trocarTipoModelo(tipo: string) {
    setErro('');
    try {
      const modelo = await api.get(`/api/modelo-contrato?tipo=${tipo}`);
      setTipoModelo(tipo);
      setConteudoModelo(modelo.conteudo);
      setPlaceholders(modelo.placeholders || []);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function salvarModelo() {
    setSalvandoModelo(true);
    setErro('');
    setMensagem('');
    try {
      await api.put('/api/modelo-contrato', { tipo: tipoModelo, conteudo: conteudoModelo });
      setMensagem('Modelo atualizado com sucesso.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvandoModelo(false);
    }
  }

  async function restaurarModeloPadrao() {
    if (!confirm('Isso vai substituir o texto atual pelo modelo sugerido original. Continuar?')) return;
    setErro('');
    try {
      const modelo = await api.post('/api/modelo-contrato/restaurar-padrao', { tipo: tipoModelo });
      setConteudoModelo(modelo.conteudo);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  const ehLocacao = tipoDocumento === 'LOCACAO_RESIDENCIAL' || tipoDocumento === 'LOCACAO_COMERCIAL';
  const ehVistoria = tipoDocumento === 'VISTORIA_INICIAL' || tipoDocumento === 'VISTORIA_FINAL';
  const inquilinoSelecionado = inquilinos.find((i) => String(i.id) === String(form.inquilinoId));
  // Garantia Investe (LOFT) só vale pra locatário Pessoa Física (CPF com 11 dígitos)
  const inquilinoEhCnpj = !!inquilinoSelecionado && String(inquilinoSelecionado.cpfCnpj || '').replace(/\D/g, '').length === 14;

  const [clausulasDisponiveis, setClausulasDisponiveis] = useState<string[]>([]);

  useEffect(() => {
    api.get(`/api/modelo-contrato?tipo=${tipoDocumento}`)
      .then((dados) => setClausulasDisponiveis(dados.clausulas || []))
      .catch(() => setClausulasDisponiveis([]));
  }, [tipoDocumento]);

  // Busca dentro do editor de modelo de contrato
  useEffect(() => {
    if (!buscaModelo) {
      setOcorrenciasModelo([]);
      setOcorrenciaAtual(0);
      return;
    }
    const termo = buscaModelo.toLowerCase();
    const texto = conteudoModelo.toLowerCase();
    const indices: number[] = [];
    let pos = texto.indexOf(termo);
    while (pos !== -1) {
      indices.push(pos);
      pos = texto.indexOf(termo, pos + 1);
    }
    setOcorrenciasModelo(indices);
    setOcorrenciaAtual(0);
  }, [buscaModelo, conteudoModelo]);

  function irParaOcorrencia(indice: number) {
    if (ocorrenciasModelo.length === 0) return;
    const idxNormalizado = ((indice % ocorrenciasModelo.length) + ocorrenciasModelo.length) % ocorrenciasModelo.length;
    setOcorrenciaAtual(idxNormalizado);
    const pos = ocorrenciasModelo[idxNormalizado];
    const el = textareaModeloRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pos, pos + buscaModelo.length);
      // Rola o textarea até a seleção (aproximação por linha)
      const textoAntes = conteudoModelo.slice(0, pos);
      const linha = textoAntes.split('\n').length;
      const totalLinhas = conteudoModelo.split('\n').length;
      const lineHeight = el.scrollHeight / totalLinhas;
      el.scrollTop = Math.max(0, lineHeight * (linha - 3));
      if (highlightModeloRef.current) highlightModeloRef.current.scrollTop = el.scrollTop;
    }
  }

  function buscarProximaOcorrencia() {
    irParaOcorrencia(ocorrenciaAtual + 1);
  }

  function buscarOcorrenciaAnterior() {
    irParaOcorrencia(ocorrenciaAtual - 1);
  }

  // Monta o conteúdo do overlay de destaque: mesmo texto do textarea, mas com a
  // ocorrência buscada envolvida em <mark> (destaque amarelo). A ocorrência atual
  // (a que os botões ↑/↓ estão navegando) fica com destaque mais forte que as outras.
  const trechosDestacadosModelo = (() => {
    if (!buscaModelo || ocorrenciasModelo.length === 0) return conteudoModelo;
    const partes: React.ReactNode[] = [];
    let cursor = 0;
    ocorrenciasModelo.forEach((pos, i) => {
      if (pos > cursor) partes.push(conteudoModelo.slice(cursor, pos));
      const trecho = conteudoModelo.slice(pos, pos + buscaModelo.length);
      partes.push(
        <mark
          key={pos}
          className={i === ocorrenciaAtual ? 'bg-savanna-gold-500 text-savanna-ink rounded-sm' : 'bg-yellow-200 text-savanna-ink rounded-sm'}
        >
          {trecho}
        </mark>
      );
      cursor = pos + buscaModelo.length;
    });
    if (cursor < conteudoModelo.length) partes.push(conteudoModelo.slice(cursor));
    return partes;
  })();

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-semibold text-2xl text-savanna-green-700">Contratos</h1>
          <p className="text-savanna-muted text-sm">Locação, intermediação, vistorias e rescisões</p>
        </div>
        <div className="flex gap-3">
          <Link href="/proprietarios" className="btn-secondary flex items-center">Proprietários</Link>
          <button className="btn-secondary" onClick={() => abrirEditorModelo(tipoModelo)}>
            Configurar modelos
          </button>
          <button className="btn-primary" onClick={alternarFormulario}>
            {mostrarForm ? 'Cancelar' : '+ Novo contrato'}
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

      {mostrarModelo && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-savanna-green-700">Modelos padrão de documentos</h3>
            <button onClick={() => setMostrarModelo(false)} className="text-sm text-savanna-muted underline">
              Fechar
            </button>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {TIPOS_DOCUMENTO.map((t) => (
              <button
                key={t.valor}
                type="button"
                onClick={() => trocarTipoModelo(t.valor)}
                className={`px-3 py-2 rounded-sm text-sm font-medium border transition-colors ${
                  tipoModelo === t.valor
                    ? 'bg-savanna-green-600 text-white border-savanna-green-600'
                    : 'bg-white text-savanna-ink border-savanna-border hover:border-savanna-green-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <p className="text-sm text-savanna-muted mb-3">
            Este é o texto usado ao gerar o documento selecionado acima. Os campos entre chaves duplas são
            preenchidos automaticamente com os dados do contrato/inquilino/imóvel/imobiliária. Também dá pra
            formatar o texto: <code className="bg-savanna-green-50 px-1 rounded-sm">**negrito**</code> deixa o
            trecho em negrito, e <code className="bg-savanna-green-50 px-1 rounded-sm">##azul##</code> deixa o
            trecho em azul (pode combinar os dois).
          </p>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input
              type="text"
              className="input text-sm flex-1 min-w-[200px]"
              placeholder="Buscar palavra ou campo no modelo (ex: {{NOME_INQUILINO}})"
              value={buscaModelo}
              onChange={(e) => setBuscaModelo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.shiftKey ? buscarOcorrenciaAnterior() : buscarProximaOcorrencia();
                }
              }}
            />
            <span className="text-xs text-savanna-muted whitespace-nowrap">
              {buscaModelo
                ? ocorrenciasModelo.length > 0
                  ? `${ocorrenciaAtual + 1} de ${ocorrenciasModelo.length}`
                  : 'Nenhuma ocorrência'
                : ''}
            </span>
            <button
              type="button"
              onClick={buscarOcorrenciaAnterior}
              disabled={ocorrenciasModelo.length === 0}
              className="btn-secondary px-2 py-1 text-xs disabled:opacity-40 shrink-0"
              title="Ocorrência anterior"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={buscarProximaOcorrencia}
              disabled={ocorrenciasModelo.length === 0}
              className="btn-secondary px-2 py-1 text-xs disabled:opacity-40 shrink-0"
              title="Próxima ocorrência"
            >
              ↓
            </button>
            {buscaModelo && (
              <button
                type="button"
                onClick={() => setBuscaModelo('')}
                className="text-xs text-savanna-muted underline shrink-0"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="relative">
            <div
              ref={highlightModeloRef}
              aria-hidden="true"
              className="font-mono text-xs leading-relaxed absolute inset-0 overflow-auto whitespace-pre-wrap break-words pointer-events-none text-transparent px-3 py-2 border border-transparent rounded-sm"
              style={{ margin: 0 }}
            >
              {trechosDestacadosModelo}
            </div>
            <textarea
              ref={textareaModeloRef}
              className="input font-mono text-xs leading-relaxed relative bg-transparent resize-none"
              rows={18}
              value={conteudoModelo}
              onChange={(e) => setConteudoModelo(e.target.value)}
              onScroll={(e) => {
                if (highlightModeloRef.current) {
                  highlightModeloRef.current.scrollTop = e.currentTarget.scrollTop;
                  highlightModeloRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
            />
          </div>

          <div className="mt-3 mb-4">
            <p className="label mb-2">Campos disponíveis (clique para copiar)</p>
            <div className="flex flex-wrap gap-1.5">
              {placeholders.map((p) => (
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
            <button onClick={salvarModelo} disabled={salvandoModelo} className="btn-primary">
              {salvandoModelo ? 'Salvando...' : 'Salvar modelo'}
            </button>
            <button onClick={restaurarModeloPadrao} className="btn-secondary">
              Restaurar padrão sugerido
            </button>
          </div>
        </div>
      )}

      <div className="card mb-6">
        <label className="label">Buscar por inquilino, nome do imóvel ou endereço</label>
        <input className="input md:w-1/2" placeholder="Ex: Maria, Apto Centro, Rua..."
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {mostrarForm && (
        <form onSubmit={salvar} className="card mb-6 space-y-6">
          <div className="flex justify-between items-start gap-6 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <h3 className="font-medium text-savanna-green-700 mb-3">Tipo de documento</h3>
              <p className="text-xs text-savanna-muted mb-3">
                Escolha qual documento será gerado ao salvar (dá pra gerar os outros tipos depois, em "Documentos").
              </p>
              <div className="flex gap-2 flex-wrap">
                {TIPOS_DOCUMENTO.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => setTipoDocumento(t.valor)}
                    className={`px-3 py-2 rounded-sm text-sm font-medium border transition-colors ${
                      tipoDocumento === t.valor
                        ? 'bg-savanna-green-600 text-white border-savanna-green-600'
                        : 'bg-white text-savanna-ink border-savanna-border hover:border-savanna-green-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-full sm:w-96 shrink-0">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="label">
                    Número do contrato <span className="text-savanna-rust">*</span>
                  </label>
                  <input
                    required
                    className="input border-2 border-savanna-green-600 focus:border-savanna-green-700 focus:ring-1 focus:ring-savanna-green-600 bg-savanna-green-50/50 font-medium"
                    value={form.numeroContrato}
                    onChange={(e) => setForm({ ...form, numeroContrato: e.target.value })}
                    placeholder="Ex: 0006/2026"
                  />
                  <p className="text-xs text-savanna-muted mt-1">Usado nos documentos e demonstrativos.</p>
                </div>
                <div className="flex-1">
                  <label className="label">Data de assinatura</label>
                  <input
                    type="date"
                    className="input"
                    value={form.dataAssinatura}
                    onChange={(e) => setForm({ ...form, dataAssinatura: e.target.value })}
                  />
                  <p className="text-xs text-savanna-muted mt-1">Rodapé do contrato ("Canoinhas, [data]").</p>
                </div>
              </div>

              {editandoId && (
                <div className="mt-4 p-3 rounded-sm border border-savanna-border bg-savanna-green-50/40 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-xs font-medium text-savanna-green-700 mb-0.5">Parcelas de aluguel</p>
                    <p className="text-xs text-savanna-muted">
                      Se você apagou parcelas manualmente e corrigiu algo aqui no contrato, gere de novo só os meses
                      que estão faltando (não mexe nas que já existem).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={regenerarParcelas}
                    disabled={regenerandoParcelas}
                    className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap shrink-0"
                  >
                    {regenerandoParcelas ? 'Gerando...' : 'Regenerar parcelas faltantes'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-medium text-savanna-green-700 mb-3">Dados do contrato</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Inquilino</label>
                <select className="input" required disabled={!!editandoId} value={form.inquilinoId}
                  onChange={(e) => selecionarInquilino(e.target.value)}>
                  <option value="">Selecione</option>
                  {inquilinos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Imóvel disponível</label>
                <select className="input" required disabled={!!editandoId} value={form.imovelId}
                  onChange={(e) => selecionarImovel(e.target.value)}>
                  <option value="">Selecione</option>
                  {imoveis.map((i) => <option key={i.id} value={i.id}>{i.nome || i.endereco}</option>)}
                </select>
                {editandoId && (
                  <p className="text-xs text-savanna-muted mt-1">Para trocar o imóvel/inquilino, crie um novo contrato.</p>
                )}
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
                <label className="label">Índice de reajuste anual</label>
                <select className="input" value={form.indiceReajuste}
                  onChange={(e) => setForm({ ...form, indiceReajuste: e.target.value })}>
                  <option value="IVAR">IVAR</option>
                  <option value="IGPM">IGP-M</option>
                  <option value="IPCA">IPCA</option>
                  <option value="INPC">INPC</option>
                </select>
              </div>
              <div>
                <label className="label">Caução</label>
                <div className="flex items-center gap-2">
                  <span className="text-savanna-muted">R$</span>
                  <input className="input" value={form.caucao}
                    onChange={(e) => setForm({ ...form, caucao: mascararMoeda(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="label">% comissão mensal</label>
                <input className="input" type="number" step="0.01" min="0" max="100" value={form.percentualComissao}
                  onChange={(e) => setForm({ ...form, percentualComissao: e.target.value })} placeholder="Ex: 10" />
              </div>
              <div>
                <label className="label">% taxa de intermediação</label>
                <input className="input" type="number" step="0.01" min="0" max="100" value={form.percentualTaxaIntermediacao}
                  onChange={(e) => setForm({ ...form, percentualTaxaIntermediacao: e.target.value })} placeholder="Ex: 50" />
              </div>
              <div>
                <label className="label">Cobrar intermediação no(s)</label>
                <div className="flex gap-4 items-center h-[38px]">
                  {['1', '2', '3'].map((mes) => (
                    <label key={mes} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={form.mesesIntermediacao.includes(mes)}
                        onChange={(e) => {
                          const novaLista = e.target.checked
                            ? [...form.mesesIntermediacao, mes]
                            : form.mesesIntermediacao.filter((m) => m !== mes);
                          setForm({ ...form, mesesIntermediacao: novaLista.length ? novaLista : ['1'] });
                        }} />
                      {mes}º aluguel
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Data de início</label>
                <input className="input" type="date" required value={form.dataInicio}
                  onChange={(e) => setForm({ ...form, dataInicio: e.target.value })} />
              </div>
              <div>
                <label className="label">Data de entrada (opcional)</label>
                <input className="input" type="date" value={form.dataEntrada}
                  onChange={(e) => setForm({ ...form, dataEntrada: e.target.value })} />
                <p className="text-xs text-savanna-muted mt-1">Se diferente do início, o 1º aluguel é calculado proporcional aos dias.</p>
              </div>
              <div>
                <label className="label">Data de término</label>
                <input className="input" type="date" value={form.dataFim}
                  onChange={(e) => setForm({ ...form, dataFim: e.target.value })} />
              </div>
              <div>
                <label className="label">Data de vistoria de entrada</label>
                <input className="input" type="date" value={form.dataVistoriaInicial}
                  onChange={(e) => setForm({ ...form, dataVistoriaInicial: e.target.value })} />
                <p className="text-xs text-savanna-muted mt-1">Aparece no contrato de locação. Também é usada ao gerar o Termo de Vistoria de Entrada.</p>
              </div>
              <div>
                <label className="label">Data de vistoria de saída</label>
                <input className="input" type="date" value={form.dataVistoriaFinal}
                  onChange={(e) => setForm({ ...form, dataVistoriaFinal: e.target.value })} />
                <p className="text-xs text-savanna-muted mt-1">Preencher ao final da locação (rescisão). Também é usada ao gerar o Termo de Vistoria de Saída.</p>
              </div>
              <div>
                <label className="label">Vencimento do aluguel</label>
                <select className="input" value={form.vencimentoQuintoDiaUtil ? '' : (form.diaVencimento || '')}
                  disabled={form.vencimentoQuintoDiaUtil}
                  onChange={(e) => setForm({ ...form, diaVencimento: e.target.value })}>
                  <option value="">Mesmo dia da data de início</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>Todo dia {d}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-savanna-muted mt-2">
                  <input type="checkbox" checked={form.vencimentoQuintoDiaUtil}
                    onChange={(e) => setForm({ ...form, vencimentoQuintoDiaUtil: e.target.checked, diaVencimento: e.target.checked ? '' : form.diaVencimento })} />
                  Ou todo 5º dia útil do mês
                </label>
                <p className="text-xs text-savanna-muted mt-1">
                  Só o dia é escolhido - o mês/ano do vencimento segue o período do contrato automaticamente.
                </p>
              </div>
            </div>
            {inquilinoEhCnpj && (() => {
              let socios: Array<{ nome: string; cpf?: string; rg?: string; telefone?: string; email?: string }> = [];
              if (inquilinoSelecionado?.sociosJson) {
                try { socios = JSON.parse(inquilinoSelecionado.sociosJson); } catch { socios = []; }
              } else if (inquilinoSelecionado?.socioResponsavelNome) {
                socios = [
                  { nome: inquilinoSelecionado.socioResponsavelNome, cpf: inquilinoSelecionado.socioResponsavelCpf, telefone: inquilinoSelecionado.socioResponsavelTelefone },
                  inquilinoSelecionado.socioResponsavel2Nome ? { nome: inquilinoSelecionado.socioResponsavel2Nome, cpf: inquilinoSelecionado.socioResponsavel2Cpf, telefone: inquilinoSelecionado.socioResponsavel2Telefone } : null,
                ].filter(Boolean) as any;
              }
              return (
                <div className="border-t border-savanna-border pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-savanna-green-700">Sócio(s)/Representante(s) legal(is) do locatário</h3>
                    <Link href="/inquilinos" className="text-xs text-savanna-green-700 underline">
                      Editar no cadastro do inquilino
                    </Link>
                  </div>
                  {socios.length > 0 ? (
                    <div className="space-y-2">
                      {socios.map((socio, indice) => (
                        <div key={indice} className="grid md:grid-cols-4 gap-4 text-sm bg-savanna-bg rounded-sm p-4">
                          <div>
                            <p className="text-savanna-muted text-xs">Sócio {indice + 1}</p>
                            <p className="text-savanna-ink">{socio.nome}</p>
                          </div>
                          <div>
                            <p className="text-savanna-muted text-xs">CPF</p>
                            <p className="text-savanna-ink">{socio.cpf || '-'}</p>
                          </div>
                          <div>
                            <p className="text-savanna-muted text-xs">RG</p>
                            <p className="text-savanna-ink">{socio.rg || '-'}</p>
                          </div>
                          <div>
                            <p className="text-savanna-muted text-xs">Telefone</p>
                            <p className="text-savanna-ink">{socio.telefone || '-'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-savanna-rust bg-red-50 rounded-sm p-3">
                      Nenhum sócio/representante cadastrado para esse inquilino ainda. Vá em "Editar no cadastro do inquilino" acima para preencher — esse dado é usado nos contratos.
                    </p>
                  )}
                </div>
              );
            })()}
            {ehLocacao && (
              <div className="mt-4">
                <label className="label">Despesas adicionais (sob responsabilidade do inquilino)</label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {DESPESAS_ADICIONAIS_OPCOES.map((op) => (
                    <label key={op.valor} className="flex items-center gap-2 text-sm border border-savanna-border rounded-lg px-3 py-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.despesasAdicionais.includes(op.valor)}
                        onChange={(e) => {
                          setForm({
                            ...form,
                            despesasAdicionais: e.target.checked
                              ? [...form.despesasAdicionais, op.valor]
                              : form.despesasAdicionais.filter((d: string) => d !== op.valor),
                          });
                        }}
                      />
                      {op.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-savanna-muted mt-1">Quando marcadas, aparecem automaticamente no texto do contrato.</p>

                <label className="label mt-4 block">Cláusulas adicionais (opcional)</label>
                <textarea className="input" rows={2} value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  placeholder="Ex: Permitido animal de estimação mediante taxa extra de R$ 50." />

              </div>
            )}

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Adicionar texto dentro de uma cláusula específica</label>
                    <button type="button" className="btn-secondary text-sm"
                      disabled={clausulasDisponiveis.length === 0}
                      onClick={() => setForm({ ...form, clausulasAdicionais: [...form.clausulasAdicionais, { clausula: clausulasDisponiveis[0] || '', texto: '' }] })}>
                      + Adicionar cláusula extra
                    </button>
                  </div>
                  <p className="text-xs text-savanna-muted mb-2">
                    Diferente do campo acima: aqui o texto entra dentro da cláusula escolhida do modelo atual ({TIPOS_DOCUMENTO.find((t) => t.valor === tipoDocumento)?.label || tipoDocumento}), não num bloco separado.
                  </p>
                  {clausulasDisponiveis.length === 0 && (
                    <p className="text-xs text-savanna-rust">Não encontrei cláusulas nomeadas (ex: "CLÁUSULA QUARTA") no modelo atual, então essa opção não está disponível para este tipo de documento.</p>
                  )}
                  <div className="space-y-3">
                    {form.clausulasAdicionais.map((item: { clausula: string; texto: string }, indice: number) => (
                      <div key={indice} className="border border-savanna-border rounded-sm p-3">
                        <div className="flex items-center gap-3 mb-2">
                          <select className="input" value={item.clausula}
                            onChange={(e) => {
                              const novos = [...form.clausulasAdicionais];
                              novos[indice] = { ...novos[indice], clausula: e.target.value };
                              setForm({ ...form, clausulasAdicionais: novos });
                            }}>
                            {clausulasDisponiveis.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <button type="button" className="text-xs text-savanna-rust underline whitespace-nowrap"
                            onClick={() => setForm({ ...form, clausulasAdicionais: form.clausulasAdicionais.filter((_: any, i: number) => i !== indice) })}>
                            Remover
                          </button>
                        </div>
                        <textarea className="input" rows={2} value={item.texto}
                          onChange={(e) => {
                            const novos = [...form.clausulasAdicionais];
                            novos[indice] = { ...novos[indice], texto: e.target.value };
                            setForm({ ...form, clausulasAdicionais: novos });
                          }}
                          placeholder="Texto que entra logo depois dessa cláusula no documento" />
                      </div>
                    ))}
                  </div>
                </div>
          </div>

          {tipoDocumento !== 'INTERMEDIACAO' && (
            <div className="border-t border-savanna-border pt-5">
              <h3 className="font-medium text-savanna-green-700 mb-3">Garantia locatícia</h3>
              <div className="flex gap-2 mb-4 flex-wrap">
                {TIPOS_GARANTIA.map((opcao) => {
                  const desabilitada = opcao.valor === 'GARANTIA_INVESTE_LOFT' && inquilinoEhCnpj;
                  return (
                    <button key={opcao.valor} type="button"
                      disabled={desabilitada}
                      title={desabilitada ? 'Garantia Investe (LOFT) só está disponível para locatário Pessoa Física (CPF).' : undefined}
                      onClick={() => setForm({ ...form, tipoGarantia: opcao.valor })}
                      className={`px-3 py-2 rounded-sm text-sm font-medium border transition-colors ${
                        form.tipoGarantia === opcao.valor
                          ? 'bg-savanna-green-600 text-white border-savanna-green-600'
                          : desabilitada
                            ? 'bg-savanna-bg text-savanna-muted border-savanna-border cursor-not-allowed opacity-60'
                            : 'bg-white text-savanna-ink border-savanna-border hover:border-savanna-green-400'
                      }`}
                    >
                      {opcao.label}
                    </button>
                  );
                })}
              </div>

              {form.tipoGarantia === 'GARANTIA_INVESTE_LOFT' && inquilinoEhCnpj && (
                <p className="text-xs text-savanna-rust bg-red-50 rounded-sm p-3 mb-4">
                  Garantia Investe (LOFT) só está disponível para locatário Pessoa Física (CPF). Escolha outra garantia ou troque o inquilino.
                </p>
              )}

              {form.tipoGarantia === 'GARANTIA_INVESTE_LOFT' && (
                <p className="text-xs text-savanna-muted bg-savanna-green-50 rounded-sm p-3">
                  Este contrato usará a cláusula de Garantia Investe (LOFT) em vez da fiança pessoal.
                  O texto ainda é provisório — assim que você tiver o texto oficial da LOFT, é só colar em
                  "Configurar modelos" no lugar da cláusula de garantia.
                </p>
              )}

              {form.tipoGarantia === 'SEGURO_LOFT' && (
                <p className="text-xs text-savanna-muted bg-savanna-green-50 rounded-sm p-3">
                  Este contrato usará a cláusula de Seguro Locatício (LOFT) em vez da fiança pessoal e da caução.
                  O texto ainda é provisório — assim que você tiver o texto oficial da LOFT, é só colar em
                  "Configurar modelos" no lugar da cláusula de garantia.
                </p>
              )}

              {form.tipoGarantia === 'CAUCAO' && (
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Valor da caução</label>
                    <div className="flex items-center gap-2">
                      <span className="text-savanna-muted">R$</span>
                      <input className="input" value={form.caucao}
                        onChange={(e) => setForm({ ...form, caucao: mascararMoeda(e.target.value) })} placeholder="0,00" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Parcelas</label>
                    <select className="input" value={form.caucaoParcelas}
                      onChange={(e) => setForm({ ...form, caucaoParcelas: e.target.value })}>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>{n === 1 ? 'À vista (1x)' : `${n}x`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Data do pagamento{Number(form.caucaoParcelas) > 1 ? ' (1ª parcela)' : ''}</label>
                    <input className="input" type="date" value={form.caucaoDataPagamento}
                      onChange={(e) => setForm({ ...form, caucaoDataPagamento: e.target.value })} />
                  </div>
                  {Number(form.caucaoParcelas) > 1 && form.caucao && (
                    <p className="md:col-span-3 text-xs text-savanna-muted">
                      {form.caucaoParcelas}x de {(Number(form.caucao) / Number(form.caucaoParcelas)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  )}
                </div>
              )}

              {form.tipoGarantia === 'PROPRIO' && (
                <div className="bg-savanna-green-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-savanna-green-700 mb-2">Fiador</h4>
                  {form.fiadorNome ? (
                    <div className="text-sm text-savanna-ink space-y-1">
                      <p><span className="text-savanna-muted">Nome:</span> {form.fiadorNome}</p>
                      <p><span className="text-savanna-muted">CPF/CNPJ:</span> {form.fiadorCpf || '-'}</p>
                      <p><span className="text-savanna-muted">Telefone:</span> {form.fiadorTelefone || '-'}</p>
                      {form.fiador2Nome && (
                        <p className="pt-1 border-t border-savanna-green-100 mt-2">
                          <span className="text-savanna-muted">2º fiador:</span> {form.fiador2Nome} - {form.fiador2Cpf || 'sem CPF'}
                        </p>
                      )}
                    </div>
                  ) : form.inquilinoId ? (
                    <p className="text-sm text-savanna-rust">
                      Este inquilino ainda não tem fiador cadastrado. Adicione o fiador no{' '}
                      <Link href="/inquilinos" className="underline">cadastro do inquilino</Link> e selecione-o de novo aqui.
                    </p>
                  ) : (
                    <p className="text-sm text-savanna-muted">Selecione o inquilino acima para puxar o fiador cadastrado.</p>
                  )}
                  <p className="text-xs text-savanna-muted mt-2">
                    Dados puxados automaticamente do cadastro do inquilino. Pra alterar o fiador, edite o cadastro do inquilino.
                  </p>
                </div>
              )}
            </div>
          )}


          <div className="border-t border-savanna-border pt-5">
            <h3 className="font-medium text-savanna-green-700 mb-3">Assinantes adicionais e testemunhas (opcional)</h3>
            <label className="label">Assinantes adicionais (ex: sócios da locatária PJ - uma linha por pessoa)</label>
            <textarea className="input mb-4" rows={2} value={form.assinantesAdicionais}
              onChange={(e) => setForm({ ...form, assinantesAdicionais: e.target.value })}
              placeholder={'_________________________________\nNOME DO SÓCIO\nSócio(a)'} />
            <div className="grid md:grid-cols-4 gap-4 mb-2">
              <div>
                <select className="input" value="" onChange={(e) => selecionarTestemunha(1, e.target.value)}>
                  <option value="">Testemunha 1 - selecionar cadastrada</option>
                  {testemunhasCadastradas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                <button type="button" className="text-xs text-savanna-green-700 underline mt-1"
                  onClick={() => setMostrarNovaTestemunha(mostrarNovaTestemunha === 1 ? null : 1)}>
                  + Cadastrar nova
                </button>
              </div>
              <div>
                <select className="input" value="" onChange={(e) => selecionarTestemunha(2, e.target.value)}>
                  <option value="">Testemunha 2 - selecionar cadastrada</option>
                  {testemunhasCadastradas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                <button type="button" className="text-xs text-savanna-green-700 underline mt-1"
                  onClick={() => setMostrarNovaTestemunha(mostrarNovaTestemunha === 2 ? null : 2)}>
                  + Cadastrar nova
                </button>
              </div>
            </div>
            {mostrarNovaTestemunha && (
              <div className="grid md:grid-cols-5 gap-4 mb-4 items-end p-3 bg-savanna-green-50 rounded-lg">
                <input className="input" placeholder="Nome" value={novaTestemunha.nome}
                  onChange={(e) => setNovaTestemunha({ ...novaTestemunha, nome: e.target.value })} />
                <input className="input" placeholder="CPF" value={novaTestemunha.cpf}
                  onChange={(e) => setNovaTestemunha({ ...novaTestemunha, cpf: mascararCpfCnpj(e.target.value) })} />
                <input className="input" placeholder="Telefone" value={novaTestemunha.telefone}
                  onChange={(e) => setNovaTestemunha({ ...novaTestemunha, telefone: mascararTelefone(e.target.value) })} />
                <input className="input" placeholder="Email" type="email" value={novaTestemunha.email}
                  onChange={(e) => setNovaTestemunha({ ...novaTestemunha, email: e.target.value })} />
                <button type="button" className="btn-primary" onClick={() => salvarNovaTestemunha(mostrarNovaTestemunha)}>
                  Salvar e usar
                </button>
              </div>
            )}
            <div className="grid md:grid-cols-4 gap-4">
              <input className="input" placeholder="Testemunha 1 - nome" value={form.testemunha1Nome}
                onChange={(e) => setForm({ ...form, testemunha1Nome: e.target.value })} />
              <input className="input" placeholder="Testemunha 1 - CPF" value={form.testemunha1Cpf}
                onChange={(e) => setForm({ ...form, testemunha1Cpf: mascararCpfCnpj(e.target.value) })} />
              <input className="input" placeholder="Testemunha 2 - nome" value={form.testemunha2Nome}
                onChange={(e) => setForm({ ...form, testemunha2Nome: e.target.value })} />
              <input className="input" placeholder="Testemunha 2 - CPF" value={form.testemunha2Cpf}
                onChange={(e) => setForm({ ...form, testemunha2Cpf: mascararCpfCnpj(e.target.value) })} />
            </div>
          </div>

          {ehVistoria && (
            <div className="border-t border-savanna-border pt-5">
              <h3 className="font-medium text-savanna-green-700 mb-3">
                {tipoDocumento === 'VISTORIA_FINAL' ? 'Termo de vistoria de saída' : 'Termo de vistoria de entrada'}
              </h3>
              <label className="label">Data da vistoria</label>
              <input className="input mb-4 md:w-1/3" type="date"
                value={tipoDocumento === 'VISTORIA_FINAL' ? form.dataVistoriaFinal : form.dataVistoriaInicial}
                onChange={(e) => setForm({
                  ...form,
                  ...(tipoDocumento === 'VISTORIA_FINAL' ? { dataVistoriaFinal: e.target.value } : { dataVistoriaInicial: e.target.value }),
                })} />

              <p className="label mb-2">Checklist da vistoria - marque Ruim, Bom, Novo ou N.A. (não se aplica) em cada item</p>
              <div className="border border-savanna-border rounded-sm divide-y divide-savanna-border mb-3">
                {listaAtiva.map((it: any, indice: number) => (
                  <div key={indice} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm flex-1">{it.item}</span>
                    <div className="flex gap-1.5">
                      {AVALIACOES_VISTORIA.map((av) => (
                        <button
                          key={av.valor}
                          type="button"
                          onClick={() => alterarAvaliacao(indice, av.valor)}
                          className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
                            it.avaliacao === av.valor ? av.cor : 'bg-white text-savanna-muted border-savanna-border hover:border-savanna-green-400'
                          }`}
                        >
                          {av.label}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => removerItemVistoria(indice)}
                      className="text-savanna-rust text-xs underline shrink-0">
                      Remover
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <input className="input" placeholder="Adicionar item (ex: Área de serviço)"
                  value={novoItemVistoria} onChange={(e) => setNovoItemVistoria(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarItemVistoria(); } }} />
                <button type="button" onClick={adicionarItemVistoria} className="btn-secondary whitespace-nowrap">
                  + Adicionar item
                </button>
              </div>

              <div className="mt-4">
                <label className="label">Observação importante (opcional)</label>
                <textarea className="input" rows={3} maxLength={300}
                  value={tipoDocumento === 'VISTORIA_FINAL' ? observacaoVistoriaFinal : observacaoVistoriaInicial}
                  onChange={(e) => {
                    if (tipoDocumento === 'VISTORIA_FINAL') setObservacaoVistoriaFinal(e.target.value);
                    else setObservacaoVistoriaInicial(e.target.value);
                  }}
                  placeholder="Ex: Imóvel entregue com pintura recém-feita na sala." />
                <p className="text-xs text-savanna-muted mt-1 text-right">
                  {(tipoDocumento === 'VISTORIA_FINAL' ? observacaoVistoriaFinal : observacaoVistoriaInicial).length}/300
                </p>
              </div>
            </div>
          )}

          {tipoDocumento === 'RESCISAO' && (
            <div className="border-t border-savanna-border pt-5">
              <h3 className="font-medium text-savanna-green-700 mb-3">Termo de rescisão</h3>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Data da rescisão</label>
                  <input className="input" type="date" value={form.dataRescisao}
                    onChange={(e) => setForm({ ...form, dataRescisao: e.target.value })} />
                </div>
                <div>
                  <label className="label">Multa / valores pendentes</label>
                  <div className="flex items-center gap-2">
                    <span className="text-savanna-muted">R$</span>
                    <input className="input" value={form.multaRescisao}
                      onChange={(e) => setForm({ ...form, multaRescisao: mascararMoeda(e.target.value) })} placeholder="0,00" />
                  </div>
                </div>
              </div>
              <label className="label">Motivo da rescisão</label>
              <textarea className="input mb-4" rows={2} value={form.motivoRescisao}
                onChange={(e) => setForm({ ...form, motivoRescisao: e.target.value })}
                placeholder="Ex: Rescisão de comum acordo entre as partes, antes do término do prazo contratual." />
              <label className="label">Observações adicionais</label>
              <textarea className="input" rows={2} value={form.observacoesRescisao}
                onChange={(e) => setForm({ ...form, observacoesRescisao: e.target.value })} />
            </div>
          )}

          <button className="btn-primary" type="submit">
            {editandoId ? `Salvar e gerar ${TIPOS_DOCUMENTO.find((t) => t.valor === tipoDocumento)?.label}` : `Criar contrato e gerar ${TIPOS_DOCUMENTO.find((t) => t.valor === tipoDocumento)?.label}`}
          </button>
        </form>
      )}

      <div className="card p-0 overflow-hidden">
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} posicao="topo" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-savanna-green-50 text-left text-savanna-muted">
              <th className="px-4 py-3">Imóvel</th>
              <th className="px-4 py-3">Inquilino</th>
              <th className="px-4 py-3">Proprietário</th>
              <th className="px-4 py-3">Início</th>
              <th className="px-4 py-3">Término</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {contratos.map((c) => (
              <Fragment key={c.id}>
                <tr
                  className={`border-t border-savanna-border align-top transition-colors duration-700 ${
                    linhaDestacadaId === c.id ? 'bg-savanna-gold-400/20' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.imovel.nome || c.imovel.endereco}</p>
                    <p className="text-xs text-savanna-muted">{c.imovel.endereco}</p>
                  </td>
                  <td className="px-4 py-3">{c.inquilino.nome}</td>
                  <td className="px-4 py-3">{c.imovel.proprietario?.nome || '-'}</td>
                  <td className="px-4 py-3">{new Date(c.dataInicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                  <td className="px-4 py-3">
                    {c.dataFim ? new Date(c.dataFim).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                    {c.dataFim && new Date(c.dataFim) <= new Date() && (
                      <span className="badge block w-fit mt-1 bg-savanna-green-50 text-savanna-muted">Finalizado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => abrirEdicao(c)} title="Editar"
                        className="p-1.5 rounded-sm text-savanna-muted hover:bg-savanna-green-50">
                        <IconeEngrenagem />
                      </button>
                      <button
                        onClick={() => setExpandidoId(expandidoId === c.id ? null : c.id)}
                        title={expandidoId === c.id ? 'Ocultar documentos' : 'Documentos'}
                        className={`p-1.5 rounded-sm hover:bg-savanna-green-50 ${expandidoId === c.id ? 'text-savanna-green-700' : 'text-savanna-green-600'}`}
                      >
                        <IconePdf />
                      </button>
                      {(!c.dataFim || new Date(c.dataFim) > new Date()) && (
                        <button onClick={() => finalizarContrato(c)} title="Finalizar contrato (gera rescisão)"
                          className="p-1.5 rounded-sm text-savanna-gold-500 hover:bg-savanna-green-50">
                          <IconeFinalizar />
                        </button>
                      )}
                      <button onClick={() => excluir(c.id)} title="Excluir"
                        className="p-1.5 rounded-sm text-savanna-rust hover:bg-savanna-rust/10">
                        <IconeLixeira />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandidoId === c.id && (
                  <tr className="border-t border-savanna-border bg-savanna-green-50/40">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid md:grid-cols-3 gap-4">
                        {TIPOS_DOCUMENTO.map((t) => {
                          const jaGerado = c[CAMPO_ARQUIVO[t.valor]];
                          return (
                            <div key={t.valor} className="bg-white border border-savanna-border rounded-sm p-3">
                              <p className="font-medium text-sm mb-2">{t.label}</p>
                              <div className="flex flex-wrap gap-3 text-xs">
                                <button onClick={() => gerarPdf(c.id, t.valor)} className="text-savanna-green-600 underline">
                                  {jaGerado ? 'Atualizar PDF' : 'Gerar PDF'}
                                </button>
                                {jaGerado && (
                                  <a className="text-savanna-green-600 underline" target="_blank"
                                    href={`${API_URL}/api/contratos/${c.id}/pdf/${t.valor}`}>Ver/Baixar</a>
                                )}
                                <button onClick={() => enviarWhatsapp(c.id, t.valor)} className="text-savanna-gold-500 underline flex items-center gap-1">
                                  <IconeWhatsapp className="w-3.5 h-3.5" /> Enviar WhatsApp
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {contratos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-savanna-muted">Nenhum contrato encontrado.</td></tr>
            )}
          </tbody>
        </table>
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} />
      </div>
    </AppShell>
  );
}
