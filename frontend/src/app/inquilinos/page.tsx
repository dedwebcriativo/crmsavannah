'use client';

import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import Paginacao from '@/components/Paginacao';
import { IconeEngrenagem, IconeLixeira } from '@/components/icons';
import { api, baixarArquivo } from '@/lib/api';
import { mascararTelefone, mascararCpfCnpj, mascararMoeda, moedaParaNumero, validarCpfCnpj, consultarCnpj, apenasDigitos, mascararRg, mascararInscricaoEstadual, ehCnpj, mascararCep, consultarCep, mascararChavePix, detectarTipoChavePix, TipoChavePix } from '@/lib/mascaras';

const FIADOR_VAZIO = {
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

const FIADOR2_VAZIO = {
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
  fiador2MediaSalarial: '',
  fiador2Escolaridade: '',
  fiador2Dependentes: '0',
  fiador2DeclaraIrpf: '',
  fiador2Patrimonio: '',
  fiador2SocioResponsavelNome: '',
  fiador2SocioResponsavelCpf: '',
  fiador2SocioResponsavel2Nome: '',
  fiador2SocioResponsavel2Cpf: '',
  fiador2SocioResponsavelTelefone: '',
  fiador2SocioResponsavelEmail: '',
  fiador2SocioResponsavel2Telefone: '',
  fiador2SocioResponsavel2Email: '',
};

const FORM_VAZIO = {
  nome: '',
  cpfCnpj: '',
  rgCnh: '',
  telefone: '',
  telefoneAdicional: '',
  email: '',
  cepAtual: '',
  enderecoAtual: '',
  numeroAtual: '',
  bairroAtual: '',
  cidadeAtual: '',
  estadoAtual: '',
  profissao: '',
  ramoAtividade: '',
  mediaSalarial: '',
  escolaridade: '',
  estadoCivil: '',
  conjugeNome: '',
  conjugeCpfCnpj: '',
  conjugeTelefone: '',
  conjugeRg: '',
  conjugeEmail: '',
  dependentes: '0',
  tipoChavePix: 'celular' as TipoChavePix,
  chavePix: '',
  socios: [] as Array<{ nome: string; cpf: string; rg: string; telefone: string; email: string }>,
  ...FIADOR_VAZIO,
  mostrarFiador2: false,
  ...FIADOR2_VAZIO,
  declaraIrpf: '',
  testemunha1Nome: '',
  testemunha1Cpf: '',
  testemunha2Nome: '',
  testemunha2Cpf: '',
};

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

export default function InquilinosPage() {
  const [inquilinos, setInquilinos] = useState<any[]>([]);
  const [form, setForm] = useState<any>(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [erroCpf, setErroCpf] = useState('');
  const [erroCpfConjuge, setErroCpfConjuge] = useState('');
  const [erroCpfFiadorConjuge, setErroCpfFiadorConjuge] = useState('');
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
    api.get(`/api/inquilinos?${params.toString()}`)
      .then((resposta) => {
        if (resposta.dados.length === 0 && resposta.pagina > 1 && resposta.pagina > resposta.totalPaginas) {
          carregar(buscaAtual, resposta.totalPaginas);
          return;
        }
        setInquilinos(resposta.dados);
        setTotalRegistros(resposta.total);
        setTotalPaginas(resposta.totalPaginas);
        setPagina(resposta.pagina);
      })
      .catch((e) => setErro(e.message));
  }

  function irParaPagina(p: number) {
    carregar(busca, p);
  }

  const primeiraRenderizacao = useRef(true);

  // Busca por texto com debounce (evita disparar uma requisição a cada tecla)
  useEffect(() => {
    if (primeiraRenderizacao.current) return;
    const timer = setTimeout(() => carregar(busca, 1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  useEffect(() => {
    carregar();
    primeiraRenderizacao.current = false;
  }, []);

  function resetarFormulario() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setErroCpf('');
    setErroCpfConjuge('');
    setErroCpfFiadorConjuge('');
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

  function abrirEdicao(inq: any) {
    setForm({
      nome: inq.nome || '',
      cpfCnpj: inq.cpfCnpj ? mascararCpfCnpj(inq.cpfCnpj) : '',
      rgCnh: inq.rgCnh ? mascararRg(inq.rgCnh) : '',
      telefone: inq.telefone ? mascararTelefone(inq.telefone) : '',
      telefoneAdicional: inq.telefoneAdicional ? mascararTelefone(inq.telefoneAdicional) : '',
      email: inq.email || '',
      cepAtual: inq.cepAtual ? mascararCep(inq.cepAtual) : '',
      enderecoAtual: inq.enderecoAtual || '',
      numeroAtual: inq.numeroAtual || '',
      bairroAtual: inq.bairroAtual || '',
      cidadeAtual: inq.cidadeAtual || '',
      estadoAtual: inq.estadoAtual || '',
      profissao: inq.profissao || '',
      ramoAtividade: inq.ramoAtividade || '',
      mediaSalarial: inq.mediaSalarial ? mascararMoeda(String(Math.round(Number(inq.mediaSalarial) * 100))) : '',
      escolaridade: inq.escolaridade || '',
      estadoCivil: inq.estadoCivil || '',
      conjugeNome: inq.conjugeNome || '',
      conjugeCpfCnpj: inq.conjugeCpfCnpj ? mascararCpfCnpj(inq.conjugeCpfCnpj) : '',
      conjugeTelefone: inq.conjugeTelefone ? mascararTelefone(inq.conjugeTelefone) : '',
      conjugeRg: inq.conjugeRg ? mascararRg(inq.conjugeRg) : '',
      conjugeEmail: inq.conjugeEmail || '',
      dependentes: String(inq.dependentes ?? 0),
      tipoChavePix: inq.tipoChavePix || (inq.chavePix ? detectarTipoChavePix(inq.chavePix) : 'celular'),
      chavePix: inq.chavePix ? mascararChavePix(inq.tipoChavePix || detectarTipoChavePix(inq.chavePix), inq.chavePix) : '',
      socios: (() => {
        if (inq.sociosJson) {
          try { return JSON.parse(inq.sociosJson); } catch { /* dado corrompido, cai no fallback abaixo */ }
        }
        return [
          inq.socioResponsavelNome ? { nome: inq.socioResponsavelNome, cpf: inq.socioResponsavelCpf ? mascararCpfCnpj(inq.socioResponsavelCpf) : '', rg: '', telefone: inq.socioResponsavelTelefone ? mascararTelefone(inq.socioResponsavelTelefone) : '', email: inq.socioResponsavelEmail || '' } : null,
          inq.socioResponsavel2Nome ? { nome: inq.socioResponsavel2Nome, cpf: inq.socioResponsavel2Cpf ? mascararCpfCnpj(inq.socioResponsavel2Cpf) : '', rg: '', telefone: inq.socioResponsavel2Telefone ? mascararTelefone(inq.socioResponsavel2Telefone) : '', email: inq.socioResponsavel2Email || '' } : null,
        ].filter(Boolean);
      })(),
      fiadorNome: inq.fiadorNome || '',
      fiadorCpf: inq.fiadorCpf ? mascararCpfCnpj(inq.fiadorCpf) : '',
      fiadorRg: inq.fiadorRg ? mascararRg(inq.fiadorRg) : '',
      fiadorCep: inq.fiadorCep ? mascararCep(inq.fiadorCep) : '',
      fiadorNumero: inq.fiadorNumero || '',
      fiadorBairro: inq.fiadorBairro || '',
      fiadorCidade: inq.fiadorCidade || '',
      fiadorEstado: inq.fiadorEstado || '',
      fiadorEndereco: inq.fiadorEndereco || '',
      fiadorTelefone: inq.fiadorTelefone ? mascararTelefone(inq.fiadorTelefone) : '',
      fiadorEmail: inq.fiadorEmail || '',
      fiadorProfissao: inq.fiadorProfissao || '',
      fiadorEstadoCivil: inq.fiadorEstadoCivil || '',
      fiadorConjugeNome: inq.fiadorConjugeNome || '',
      fiadorConjugeCpf: inq.fiadorConjugeCpf ? mascararCpfCnpj(inq.fiadorConjugeCpf) : '',
      fiadorConjugeTelefone: inq.fiadorConjugeTelefone ? mascararTelefone(inq.fiadorConjugeTelefone) : '',
      fiadorConjugeRg: inq.fiadorConjugeRg ? mascararRg(inq.fiadorConjugeRg) : '',
      fiadorConjugeEmail: inq.fiadorConjugeEmail || '',
      fiadorPatrimonio: inq.fiadorPatrimonio ? mascararMoeda(String(Math.round(Number(inq.fiadorPatrimonio) * 100))) : '',
      fiadorSocioResponsavelNome: inq.fiadorSocioResponsavelNome || '',
      fiadorSocioResponsavelCpf: inq.fiadorSocioResponsavelCpf ? mascararCpfCnpj(inq.fiadorSocioResponsavelCpf) : '',
      fiadorSocioResponsavel2Nome: inq.fiadorSocioResponsavel2Nome || '',
      fiadorSocioResponsavel2Cpf: inq.fiadorSocioResponsavel2Cpf ? mascararCpfCnpj(inq.fiadorSocioResponsavel2Cpf) : '',
      fiadorSocioResponsavelTelefone: inq.fiadorSocioResponsavelTelefone ? mascararTelefone(inq.fiadorSocioResponsavelTelefone) : '',
      fiadorSocioResponsavelEmail: inq.fiadorSocioResponsavelEmail || '',
      fiadorSocioResponsavel2Telefone: inq.fiadorSocioResponsavel2Telefone ? mascararTelefone(inq.fiadorSocioResponsavel2Telefone) : '',
      fiadorSocioResponsavel2Email: inq.fiadorSocioResponsavel2Email || '',
      fiadorMediaSalarial: inq.fiadorMediaSalarial ? mascararMoeda(String(Math.round(Number(inq.fiadorMediaSalarial) * 100))) : '',
      fiadorEscolaridade: inq.fiadorEscolaridade || '',
      fiadorDependentes: String(inq.fiadorDependentes ?? 0),
      fiadorDeclaraIrpf: inq.fiadorDeclaraIrpf === true ? 'sim' : inq.fiadorDeclaraIrpf === false ? 'nao' : '',
      mostrarFiador2: Boolean(inq.fiador2Nome),
      fiador2Nome: inq.fiador2Nome || '',
      fiador2Cpf: inq.fiador2Cpf ? mascararCpfCnpj(inq.fiador2Cpf) : '',
      fiador2Rg: inq.fiador2Rg ? mascararRg(inq.fiador2Rg) : '',
      fiador2Cep: inq.fiador2Cep ? mascararCep(inq.fiador2Cep) : '',
      fiador2Numero: inq.fiador2Numero || '',
      fiador2Bairro: inq.fiador2Bairro || '',
      fiador2Cidade: inq.fiador2Cidade || '',
      fiador2Estado: inq.fiador2Estado || '',
      fiador2Endereco: inq.fiador2Endereco || '',
      fiador2Telefone: inq.fiador2Telefone ? mascararTelefone(inq.fiador2Telefone) : '',
      fiador2Email: inq.fiador2Email || '',
      fiador2Profissao: inq.fiador2Profissao || '',
      fiador2EstadoCivil: inq.fiador2EstadoCivil || '',
      fiador2ConjugeNome: inq.fiador2ConjugeNome || '',
      fiador2ConjugeCpf: inq.fiador2ConjugeCpf ? mascararCpfCnpj(inq.fiador2ConjugeCpf) : '',
      fiador2ConjugeTelefone: inq.fiador2ConjugeTelefone ? mascararTelefone(inq.fiador2ConjugeTelefone) : '',
      fiador2ConjugeRg: inq.fiador2ConjugeRg ? mascararRg(inq.fiador2ConjugeRg) : '',
      fiador2ConjugeEmail: inq.fiador2ConjugeEmail || '',
      fiador2Patrimonio: inq.fiador2Patrimonio ? mascararMoeda(String(Math.round(Number(inq.fiador2Patrimonio) * 100))) : '',
      fiador2MediaSalarial: inq.fiador2MediaSalarial ? mascararMoeda(String(Math.round(Number(inq.fiador2MediaSalarial) * 100))) : '',
      fiador2Escolaridade: inq.fiador2Escolaridade || '',
      fiador2Dependentes: String(inq.fiador2Dependentes ?? 0),
      fiador2DeclaraIrpf: inq.fiador2DeclaraIrpf === true ? 'sim' : inq.fiador2DeclaraIrpf === false ? 'nao' : '',
      fiador2SocioResponsavelNome: inq.fiador2SocioResponsavelNome || '',
      fiador2SocioResponsavelCpf: inq.fiador2SocioResponsavelCpf ? mascararCpfCnpj(inq.fiador2SocioResponsavelCpf) : '',
      fiador2SocioResponsavel2Nome: inq.fiador2SocioResponsavel2Nome || '',
      fiador2SocioResponsavel2Cpf: inq.fiador2SocioResponsavel2Cpf ? mascararCpfCnpj(inq.fiador2SocioResponsavel2Cpf) : '',
      fiador2SocioResponsavelTelefone: inq.fiador2SocioResponsavelTelefone ? mascararTelefone(inq.fiador2SocioResponsavelTelefone) : '',
      fiador2SocioResponsavelEmail: inq.fiador2SocioResponsavelEmail || '',
      fiador2SocioResponsavel2Telefone: inq.fiador2SocioResponsavel2Telefone ? mascararTelefone(inq.fiador2SocioResponsavel2Telefone) : '',
      fiador2SocioResponsavel2Email: inq.fiador2SocioResponsavel2Email || '',
      declaraIrpf: inq.declaraIrpf === true ? 'sim' : inq.declaraIrpf === false ? 'nao' : '',
      testemunha1Nome: inq.testemunha1Nome || '',
      testemunha1Cpf: inq.testemunha1Cpf ? mascararCpfCnpj(inq.testemunha1Cpf) : '',
      testemunha2Nome: inq.testemunha2Nome || '',
      testemunha2Cpf: inq.testemunha2Cpf ? mascararCpfCnpj(inq.testemunha2Cpf) : '',
    });
    setEditandoId(inq.id);
    setErroCpf('');
    setErroCpfConjuge('');
    setErroCpfFiadorConjuge('');
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const [buscandoCnpj, setBuscandoCnpj] = useState(false);

  async function validarCpfCampo() {
    if (!form.cpfCnpj) {
      setErroCpf('');
      return;
    }
    if (!validarCpfCnpj(form.cpfCnpj)) {
      setErroCpf('CPF/CNPJ inválido.');
      return;
    }
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
            enderecoAtual: f.enderecoAtual ? f.enderecoAtual : (dados.endereco || f.enderecoAtual),
            rgCnh: f.rgCnh ? f.rgCnh : (dados.inscricaoEstadual ? mascararInscricaoEstadual(dados.inscricaoEstadual) : f.rgCnh),
          }));
        }
      } catch {
        // Falha na consulta não deve travar o cadastro - o usuário preenche manualmente
      } finally {
        setBuscandoCnpj(false);
      }
    }
  }

  function validarCpfConjugeCampo() {
    if (form.conjugeCpfCnpj && !validarCpfCnpj(form.conjugeCpfCnpj)) {
      setErroCpfConjuge('CPF/CNPJ do cônjuge inválido.');
    } else {
      setErroCpfConjuge('');
    }
  }

  function validarCpfFiadorConjugeCampo() {
    if (form.fiadorConjugeCpf && !validarCpfCnpj(form.fiadorConjugeCpf)) {
      setErroCpfFiadorConjuge('CPF do cônjuge/parceiro(a) do fiador inválido.');
    } else {
      setErroCpfFiadorConjuge('');
    }
  }

  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCnpjFiador, setBuscandoCnpjFiador] = useState(false);
  const [buscandoCnpjFiador2, setBuscandoCnpjFiador2] = useState(false);

  // Busca automática de dados quando o CPF/CNPJ do fiador (ou 2º fiador) é um CNPJ -
  // mesmo comportamento da busca do inquilino, reaproveitado pro fiador.
  async function buscarDadosFiadorPorCnpj(valor: string, prefixo: 'fiador' | 'fiador2') {
    if (!ehCnpj(valor)) return;
    const setBuscando = prefixo === 'fiador' ? setBuscandoCnpjFiador : setBuscandoCnpjFiador2;
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

  async function buscarCepEPreencher(cep: string) {
    if (apenasDigitos(cep).length !== 8) return;
    setBuscandoCep(true);
    try {
      const dados = await consultarCep(cep);
      if (dados) {
        setForm((f: any) => ({
          ...f,
          enderecoAtual: dados.logradouro || f.enderecoAtual,
          bairroAtual: dados.bairro || f.bairroAtual,
          cidadeAtual: dados.cidade || f.cidadeAtual,
          estadoAtual: dados.estado || f.estadoAtual,
        }));
      }
    } catch {
      // Falha na consulta não deve travar o cadastro - o usuário preenche manualmente
    } finally {
      setBuscandoCep(false);
    }
  }

  const [buscandoCepFiador, setBuscandoCepFiador] = useState(false);
  const [buscandoCepFiador2, setBuscandoCepFiador2] = useState(false);

  // Busca de CEP reutilizada para o fiador e o 2º fiador (mesmo padrão do inquilino/proprietário)
  async function buscarCepEPreencherFiador(cep: string, prefixo: 'fiador' | 'fiador2') {
    if (apenasDigitos(cep).length !== 8) return;
    const setBuscando = prefixo === 'fiador' ? setBuscandoCepFiador : setBuscandoCepFiador2;
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

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    if (!validarCpfCnpj(form.cpfCnpj)) {
      setErroCpf('CPF/CNPJ inválido.');
      return;
    }
    if (ESTADOS_CIVIS_COM_PARCEIRO.includes(form.estadoCivil) && form.conjugeCpfCnpj && !validarCpfCnpj(form.conjugeCpfCnpj)) {
      setErroCpfConjuge('CPF/CNPJ do cônjuge inválido.');
      return;
    }
    if (ESTADOS_CIVIS_COM_PARCEIRO.includes(form.fiadorEstadoCivil) && form.fiadorConjugeCpf && !validarCpfCnpj(form.fiadorConjugeCpf)) {
      setErroCpfFiadorConjuge('CPF do cônjuge/parceiro(a) do fiador inválido.');
      return;
    }
    if (form.fiadorCpf && !validarCpfCnpj(form.fiadorCpf)) {
      setErro('CPF do fiador inválido.');
      return;
    }
    if (form.mostrarFiador2 && form.fiador2Cpf && !validarCpfCnpj(form.fiador2Cpf)) {
      setErro('CPF do 2º fiador inválido.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mostrarFiador2, socios, ...resto } = form;
    const payload = {
      ...resto,
      sociosJson: socios.length ? JSON.stringify(socios) : null,
      mediaSalarial: form.mediaSalarial ? moedaParaNumero(form.mediaSalarial) : null,
      dependentes: Number(form.dependentes),
      declaraIrpf: form.declaraIrpf === 'sim' ? true : form.declaraIrpf === 'nao' ? false : null,
      fiadorMediaSalarial: form.fiadorMediaSalarial ? moedaParaNumero(form.fiadorMediaSalarial) : null,
      fiadorDependentes: Number(form.fiadorDependentes || 0),
      fiadorDeclaraIrpf: form.fiadorDeclaraIrpf === 'sim' ? true : form.fiadorDeclaraIrpf === 'nao' ? false : null,
      fiadorPatrimonio: form.fiadorPatrimonio ? moedaParaNumero(form.fiadorPatrimonio) : null,
      fiador2MediaSalarial: form.fiador2MediaSalarial ? moedaParaNumero(form.fiador2MediaSalarial) : null,
      fiador2Dependentes: Number(form.fiador2Dependentes || 0),
      fiador2DeclaraIrpf: form.fiador2DeclaraIrpf === 'sim' ? true : form.fiador2DeclaraIrpf === 'nao' ? false : null,
      fiador2Patrimonio: form.fiador2Patrimonio ? moedaParaNumero(form.fiador2Patrimonio) : null,
    };

    try {
      if (editandoId) {
        await api.put(`/api/inquilinos/${editandoId}`, payload);
        destacarLinha(editandoId);
      } else {
        await api.post('/api/inquilinos', payload);
      }
      resetarFormulario();
      setMostrarForm(false);
      carregar(busca, pagina);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function excluir(id: number) {
    if (!confirm('Excluir este inquilino?')) return;
    await api.delete(`/api/inquilinos/${id}`);
    carregar(busca, pagina);
  }

  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);

  async function gerarRelatorio() {
    setErro('');
    setGerandoRelatorio(true);
    try {
      const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
      await baixarArquivo(`/api/inquilinos/relatorio${query}`, `inquilinos-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
          <h1 className="font-display font-semibold text-2xl text-savanna-green-700">Inquilinos</h1>
          <p className="text-savanna-muted text-sm">Cadastro e histórico de inquilinos</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={gerarRelatorio} disabled={gerandoRelatorio}>
            {gerandoRelatorio ? 'Gerando...' : 'Gerar relatório'}
          </button>
          <button className="btn-primary" onClick={alternarFormulario}>
            {mostrarForm ? 'Cancelar' : '+ Novo inquilino'}
          </button>
        </div>
      </div>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}

      <div className="card mb-6">
        <label className="label">Buscar por nome, CPF/CNPJ, telefone ou email</label>
        <input className="input md:w-1/2" placeholder="Ex: Maria, 123.456..., 47999..."
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {mostrarForm && (
        <form onSubmit={salvar} className="card mb-6 space-y-6">
          <div>
            <h3 className="font-medium text-savanna-green-700 mb-3">Dados pessoais</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="label">Nome completo</label>
                <input className="input" required value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div>
                <label className="label">CPF/CNPJ</label>
                <input className="input" required value={form.cpfCnpj}
                  onChange={(e) => setForm({ ...form, cpfCnpj: mascararCpfCnpj(e.target.value) })}
                  onBlur={validarCpfCampo} placeholder="000.000.000-00" />
                {buscandoCnpj && <p className="text-xs text-savanna-muted mt-1">Buscando dados da empresa...</p>}
                {erroCpf && <p className="text-xs text-savanna-rust mt-1">{erroCpf}</p>}
              </div>

              <div>
                <label className="label">{ehCnpj(form.cpfCnpj) ? 'Inscrição Estadual' : 'RG/CNH'}</label>
                <input className="input" value={form.rgCnh}
                  onChange={(e) => setForm({
                    ...form,
                    rgCnh: ehCnpj(form.cpfCnpj) ? mascararInscricaoEstadual(e.target.value) : mascararRg(e.target.value),
                  })}
                  placeholder={ehCnpj(form.cpfCnpj) ? 'Isento ou nº da IE' : '00.000.000-0'} />
              </div>
              {ehCnpj(form.cpfCnpj) && (
                <div>
                  <label className="label">Ramo de atividade</label>
                  <input className="input" value={form.ramoAtividade}
                    onChange={(e) => setForm({ ...form, ramoAtividade: e.target.value })} placeholder="Ex: Comércio varejista" />
                </div>
              )}
              <div>
                <label className="label">Telefone (WhatsApp)</label>
                <input className="input" required value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: mascararTelefone(e.target.value) })}
                  placeholder="(47) 99999-8888" />
              </div>
              <div>
                <label className="label">Telefone adicional</label>
                <input className="input" value={form.telefoneAdicional}
                  onChange={(e) => setForm({ ...form, telefoneAdicional: mascararTelefone(e.target.value) })}
                  placeholder="(47) 99999-8888" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label">CEP</label>
                <input className="input" value={form.cepAtual}
                  onChange={(e) => setForm({ ...form, cepAtual: mascararCep(e.target.value) })}
                  onBlur={(e) => buscarCepEPreencher(e.target.value)} placeholder="00000-000" />
                {buscandoCep && <p className="text-xs text-savanna-muted mt-1">Buscando endereço...</p>}
              </div>
              <div className="md:col-span-2">
                <label className="label">Endereço (rua/avenida)</label>
                <input className="input" value={form.enderecoAtual}
                  onChange={(e) => setForm({ ...form, enderecoAtual: e.target.value })} />
              </div>
              <div>
                <label className="label">Número</label>
                <input className="input" value={form.numeroAtual}
                  onChange={(e) => setForm({ ...form, numeroAtual: e.target.value })} />
              </div>
              <div>
                <label className="label">Bairro</label>
                <input className="input" value={form.bairroAtual}
                  onChange={(e) => setForm({ ...form, bairroAtual: e.target.value })} />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input className="input" value={form.cidadeAtual}
                  onChange={(e) => setForm({ ...form, cidadeAtual: e.target.value })} />
              </div>
              <div>
                <label className="label">Estado (UF)</label>
                <input className="input" maxLength={2} value={form.estadoAtual}
                  onChange={(e) => setForm({ ...form, estadoAtual: e.target.value.toUpperCase() })} placeholder="SC" />
              </div>
              {ehCnpj(form.cpfCnpj) && (
                <div className="md:col-span-3 border-t border-savanna-border pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-savanna-green-700">Sócios/Representantes legais</h3>
                    <button type="button" className="btn-secondary text-sm"
                      onClick={() => setForm({ ...form, socios: [...form.socios, { nome: '', cpf: '', rg: '', telefone: '', email: '' }] })}>
                      + Adicionar sócio
                    </button>
                  </div>
                  {form.socios.length === 0 && (
                    <p className="text-xs text-savanna-muted mb-3">Nenhum sócio cadastrado ainda. Clique em "+ Adicionar sócio".</p>
                  )}
                  <div className="space-y-4">
                    {form.socios.map((socio, indice) => (
                      <div key={indice} className="border border-savanna-border rounded-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-savanna-ink">Sócio {indice + 1}</p>
                          <button type="button" className="text-xs text-savanna-rust underline"
                            onClick={() => setForm({ ...form, socios: form.socios.filter((_, i) => i !== indice) })}>
                            Remover
                          </button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                          <div>
                            <label className="label">Nome</label>
                            <input className="input" value={socio.nome}
                              onChange={(e) => {
                                const novos = [...form.socios];
                                novos[indice] = { ...novos[indice], nome: e.target.value };
                                setForm({ ...form, socios: novos });
                              }} placeholder="Quem assina pela empresa" />
                          </div>
                          <div>
                            <label className="label">CPF</label>
                            <input className="input" value={socio.cpf}
                              onChange={(e) => {
                                const novos = [...form.socios];
                                novos[indice] = { ...novos[indice], cpf: mascararCpfCnpj(e.target.value) };
                                setForm({ ...form, socios: novos });
                              }} />
                          </div>
                          <div>
                            <label className="label">RG</label>
                            <input className="input" value={socio.rg}
                              onChange={(e) => {
                                const novos = [...form.socios];
                                novos[indice] = { ...novos[indice], rg: e.target.value };
                                setForm({ ...form, socios: novos });
                              }} />
                          </div>
                          <div>
                            <label className="label">Telefone</label>
                            <input className="input" value={socio.telefone}
                              onChange={(e) => {
                                const novos = [...form.socios];
                                novos[indice] = { ...novos[indice], telefone: mascararTelefone(e.target.value) };
                                setForm({ ...form, socios: novos });
                              }} />
                          </div>
                          <div>
                            <label className="label">Email</label>
                            <input className="input" type="email" value={socio.email}
                              onChange={(e) => {
                                const novos = [...form.socios];
                                novos[indice] = { ...novos[indice], email: e.target.value };
                                setForm({ ...form, socios: novos });
                              }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-savanna-border pt-5">
            <h3 className="font-medium text-savanna-green-700 mb-3">
              {ehCnpj(form.cpfCnpj) ? 'Dados da empresa' : 'Perfil socioeconômico'}
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              {!ehCnpj(form.cpfCnpj) && (
                <div>
                  <label className="label">Profissão</label>
                  <input className="input" value={form.profissao}
                    onChange={(e) => setForm({ ...form, profissao: e.target.value })} />
                </div>
              )}

              {!ehCnpj(form.cpfCnpj) && (
                <>
                  <div>
                    <label className="label">Média salarial</label>
                    <div className="flex items-center">
                      <span className="px-3 py-2 border border-r-0 border-savanna-border rounded-l-sm bg-savanna-green-50 text-sm text-savanna-muted">R$</span>
                      <input className="input rounded-l-none" inputMode="numeric" value={form.mediaSalarial}
                        onChange={(e) => setForm({ ...form, mediaSalarial: mascararMoeda(e.target.value) })}
                        placeholder="0,00" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Grau de escolaridade</label>
                    <select className="input" value={form.escolaridade}
                      onChange={(e) => setForm({ ...form, escolaridade: e.target.value })}>
                      <option value="">Selecione</option>
                      {ESCOLARIDADES.map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="label">Estado civil</label>
                    <select className="input" value={form.estadoCivil}
                      onChange={(e) => setForm({ ...form, estadoCivil: e.target.value })}>
                      <option value="">Selecione</option>
                      {ESTADOS_CIVIS.map((op) => <option key={op.valor} value={op.valor}>{op.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Dependentes</label>
                    <select className="input" value={form.dependentes}
                      onChange={(e) => setForm({ ...form, dependentes: e.target.value })}>
                      {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Declara Imposto de Renda (IRPF)?</label>
                    <select className="input" value={form.declaraIrpf}
                      onChange={(e) => setForm({ ...form, declaraIrpf: e.target.value })}>
                      <option value="">Não informado</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </div>
                </>
              )}

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
                <label className="label">Chave Pix (p/ devoluções, ex: caução)</label>
                <input className="input" value={form.chavePix}
                  type={form.tipoChavePix === 'email' ? 'email' : 'text'}
                  onChange={(e) => setForm({ ...form, chavePix: mascararChavePix(form.tipoChavePix, e.target.value) })} />
              </div>
            </div>
          </div>

          {ESTADOS_CIVIS_COM_PARCEIRO.includes(form.estadoCivil) && (
            <div className="border-t border-savanna-border pt-5">
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
            </div>
          )}

          <div className="border-t border-savanna-border pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-savanna-green-700">Fiador (opcional)</h3>
              {!form.mostrarFiador2 && (
                <button type="button" className="text-sm text-savanna-green-700 underline"
                  onClick={() => setForm({ ...form, mostrarFiador2: true })}>
                  + Adicionar 2º fiador
                </button>
              )}
            </div>
            <p className="text-xs text-savanna-muted mb-3">
              Preenchido automaticamente nos contratos deste inquilino (pode ser ajustado por contrato).
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Nome completo</label>
                <input className="input" value={form.fiadorNome}
                  onChange={(e) => setForm({ ...form, fiadorNome: e.target.value })} />
              </div>
              <div>
                <label className="label">CPF/CNPJ</label>
                <input className="input" value={form.fiadorCpf}
                  onChange={(e) => setForm({ ...form, fiadorCpf: mascararCpfCnpj(e.target.value) })}
                  onBlur={(e) => buscarDadosFiadorPorCnpj(e.target.value, 'fiador')} />
                {buscandoCnpjFiador && <p className="text-xs text-savanna-muted mt-1">Buscando dados da empresa...</p>}
              </div>
              <div>
                <label className="label">{ehCnpj(form.fiadorCpf) ? 'Inscrição Estadual' : 'RG'}</label>
                <input className="input" value={form.fiadorRg}
                  onChange={(e) => setForm({
                    ...form,
                    fiadorRg: ehCnpj(form.fiadorCpf) ? mascararInscricaoEstadual(e.target.value) : mascararRg(e.target.value),
                  })} />
              </div>
              <div>
                <label className="label">CEP</label>
                <input className="input" value={form.fiadorCep}
                  onChange={(e) => setForm({ ...form, fiadorCep: mascararCep(e.target.value) })}
                  onBlur={(e) => buscarCepEPreencherFiador(e.target.value, 'fiador')} placeholder="00000-000" />
                {buscandoCepFiador && <p className="text-xs text-savanna-muted mt-1">Buscando endereço...</p>}
              </div>
              <div>
                <label className="label">Número</label>
                <input className="input" value={form.fiadorNumero}
                  onChange={(e) => setForm({ ...form, fiadorNumero: e.target.value })} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={form.fiadorTelefone}
                  onChange={(e) => setForm({ ...form, fiadorTelefone: mascararTelefone(e.target.value) })} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Endereço (rua/avenida)</label>
                <input className="input" value={form.fiadorEndereco}
                  onChange={(e) => setForm({ ...form, fiadorEndereco: e.target.value })} />
              </div>
              <div>
                <label className="label">Bairro</label>
                <input className="input" value={form.fiadorBairro}
                  onChange={(e) => setForm({ ...form, fiadorBairro: e.target.value })} />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input className="input" value={form.fiadorCidade}
                  onChange={(e) => setForm({ ...form, fiadorCidade: e.target.value })} />
              </div>
              <div>
                <label className="label">Estado (UF)</label>
                <input className="input" maxLength={2} value={form.fiadorEstado}
                  onChange={(e) => setForm({ ...form, fiadorEstado: e.target.value.toUpperCase() })} placeholder="SC" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.fiadorEmail}
                  onChange={(e) => setForm({ ...form, fiadorEmail: e.target.value })} />
              </div>
              <div>
                <label className="label">Profissão</label>
                <input className="input" value={form.fiadorProfissao}
                  onChange={(e) => setForm({ ...form, fiadorProfissao: e.target.value })} />
              </div>
              <div>
                <label className="label">Estado civil</label>
                <select className="input" value={form.fiadorEstadoCivil}
                  onChange={(e) => setForm({ ...form, fiadorEstadoCivil: e.target.value })}>
                  <option value="">Selecione</option>
                  {ESTADOS_CIVIS.map((op) => <option key={op.valor} value={op.valor}>{op.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Escolaridade</label>
                <select className="input" value={form.fiadorEscolaridade}
                  onChange={(e) => setForm({ ...form, fiadorEscolaridade: e.target.value })}>
                  <option value="">Selecione</option>
                  {ESCOLARIDADES.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Média salarial</label>
                <div className="flex items-center gap-2">
                  <span className="text-savanna-muted">R$</span>
                  <input className="input" value={form.fiadorMediaSalarial}
                    onChange={(e) => setForm({ ...form, fiadorMediaSalarial: mascararMoeda(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="label">Valor de patrimônio</label>
                <div className="flex items-center gap-2">
                  <span className="text-savanna-muted">R$</span>
                  <input className="input" value={form.fiadorPatrimonio}
                    onChange={(e) => setForm({ ...form, fiadorPatrimonio: mascararMoeda(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="label">Dependentes</label>
                <input className="input" type="number" min={0} value={form.fiadorDependentes}
                  onChange={(e) => setForm({ ...form, fiadorDependentes: e.target.value })} />
              </div>
              <div>
                <label className="label">Declara IRPF?</label>
                <select className="input" value={form.fiadorDeclaraIrpf}
                  onChange={(e) => setForm({ ...form, fiadorDeclaraIrpf: e.target.value })}>
                  <option value="">Não informado</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
              {ehCnpj(form.fiadorCpf) && (
                <div className="md:col-span-3 border-t border-savanna-border pt-4">
                  <h3 className="font-medium text-savanna-green-700 mb-3">Sócio(s)/Representante(s) legal(is) do fiador</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="label">Sócio(a)/Representante legal</label>
                      <input className="input" value={form.fiadorSocioResponsavelNome}
                        onChange={(e) => setForm({ ...form, fiadorSocioResponsavelNome: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">CPF do(a) sócio(a)/representante</label>
                      <input className="input" value={form.fiadorSocioResponsavelCpf}
                        onChange={(e) => setForm({ ...form, fiadorSocioResponsavelCpf: mascararCpfCnpj(e.target.value) })} />
                    </div>
                    <div>
                      <label className="label">Telefone do(a) sócio(a)</label>
                      <input className="input" value={form.fiadorSocioResponsavelTelefone}
                        onChange={(e) => setForm({ ...form, fiadorSocioResponsavelTelefone: mascararTelefone(e.target.value) })} />
                    </div>
                    <div>
                      <label className="label">Email do(a) sócio(a)</label>
                      <input className="input" type="email" value={form.fiadorSocioResponsavelEmail}
                        onChange={(e) => setForm({ ...form, fiadorSocioResponsavelEmail: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">2º Sócio(a)/Representante legal (opcional)</label>
                      <input className="input" value={form.fiadorSocioResponsavel2Nome}
                        onChange={(e) => setForm({ ...form, fiadorSocioResponsavel2Nome: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">CPF do(a) 2º sócio(a)/representante</label>
                      <input className="input" value={form.fiadorSocioResponsavel2Cpf}
                        onChange={(e) => setForm({ ...form, fiadorSocioResponsavel2Cpf: mascararCpfCnpj(e.target.value) })} />
                    </div>
                    <div>
                      <label className="label">Telefone do(a) 2º sócio(a)</label>
                      <input className="input" value={form.fiadorSocioResponsavel2Telefone}
                        onChange={(e) => setForm({ ...form, fiadorSocioResponsavel2Telefone: mascararTelefone(e.target.value) })} />
                    </div>
                    <div>
                      <label className="label">Email do(a) 2º sócio(a)</label>
                      <input className="input" type="email" value={form.fiadorSocioResponsavel2Email}
                        onChange={(e) => setForm({ ...form, fiadorSocioResponsavel2Email: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {ESTADOS_CIVIS_COM_PARCEIRO.includes(form.fiadorEstadoCivil) && (
              <div className="mt-4 pl-4 border-l-2 border-savanna-green-100">
                <p className="text-xs font-medium text-savanna-muted mb-2">
                  {labelParceiro(form.fiadorEstadoCivil)} do fiador
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  <input className="input" placeholder="Nome completo" value={form.fiadorConjugeNome}
                    onChange={(e) => setForm({ ...form, fiadorConjugeNome: e.target.value })} />
                  <div>
                    <input className="input" placeholder="CPF" value={form.fiadorConjugeCpf}
                      onChange={(e) => setForm({ ...form, fiadorConjugeCpf: mascararCpfCnpj(e.target.value) })}
                      onBlur={validarCpfFiadorConjugeCampo} />
                    {erroCpfFiadorConjuge && <p className="text-xs text-savanna-rust mt-1">{erroCpfFiadorConjuge}</p>}
                  </div>
                  <input className="input" placeholder="Telefone" value={form.fiadorConjugeTelefone}
                    onChange={(e) => setForm({ ...form, fiadorConjugeTelefone: mascararTelefone(e.target.value) })} />
                  <input className="input" placeholder="RG" value={form.fiadorConjugeRg}
                    onChange={(e) => setForm({ ...form, fiadorConjugeRg: mascararRg(e.target.value) })} />
                  <input className="input" placeholder="Email" type="email" value={form.fiadorConjugeEmail}
                    onChange={(e) => setForm({ ...form, fiadorConjugeEmail: e.target.value })} />
                </div>
              </div>
            )}

            {form.mostrarFiador2 && (
              <div className="mt-6 pt-5 border-t border-dashed border-savanna-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-savanna-green-700">2º fiador</h4>
                  <button type="button" className="text-xs text-savanna-rust underline"
                    onClick={() => setForm({ ...form, mostrarFiador2: false, ...FIADOR2_VAZIO })}>
                    Remover 2º fiador
                  </button>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Nome completo</label>
                    <input className="input" value={form.fiador2Nome}
                      onChange={(e) => setForm({ ...form, fiador2Nome: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">CPF/CNPJ</label>
                    <input className="input" value={form.fiador2Cpf}
                      onChange={(e) => setForm({ ...form, fiador2Cpf: mascararCpfCnpj(e.target.value) })}
                      onBlur={(e) => buscarDadosFiadorPorCnpj(e.target.value, 'fiador2')} />
                    {buscandoCnpjFiador2 && <p className="text-xs text-savanna-muted mt-1">Buscando dados da empresa...</p>}
                  </div>
                  <div>
                    <label className="label">{ehCnpj(form.fiador2Cpf) ? 'Inscrição Estadual' : 'RG'}</label>
                    <input className="input" value={form.fiador2Rg}
                      onChange={(e) => setForm({
                        ...form,
                        fiador2Rg: ehCnpj(form.fiador2Cpf) ? mascararInscricaoEstadual(e.target.value) : mascararRg(e.target.value),
                      })} />
                  </div>
                  <div>
                    <label className="label">CEP</label>
                    <input className="input" value={form.fiador2Cep}
                      onChange={(e) => setForm({ ...form, fiador2Cep: mascararCep(e.target.value) })}
                      onBlur={(e) => buscarCepEPreencherFiador(e.target.value, 'fiador2')} placeholder="00000-000" />
                    {buscandoCepFiador2 && <p className="text-xs text-savanna-muted mt-1">Buscando endereço...</p>}
                  </div>
                  <div>
                    <label className="label">Número</label>
                    <input className="input" value={form.fiador2Numero}
                      onChange={(e) => setForm({ ...form, fiador2Numero: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Telefone</label>
                    <input className="input" value={form.fiador2Telefone}
                      onChange={(e) => setForm({ ...form, fiador2Telefone: mascararTelefone(e.target.value) })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Endereço (rua/avenida)</label>
                    <input className="input" value={form.fiador2Endereco}
                      onChange={(e) => setForm({ ...form, fiador2Endereco: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Bairro</label>
                    <input className="input" value={form.fiador2Bairro}
                      onChange={(e) => setForm({ ...form, fiador2Bairro: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Cidade</label>
                    <input className="input" value={form.fiador2Cidade}
                      onChange={(e) => setForm({ ...form, fiador2Cidade: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Estado (UF)</label>
                    <input className="input" maxLength={2} value={form.fiador2Estado}
                      onChange={(e) => setForm({ ...form, fiador2Estado: e.target.value.toUpperCase() })} placeholder="SC" />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input className="input" type="email" value={form.fiador2Email}
                      onChange={(e) => setForm({ ...form, fiador2Email: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Profissão</label>
                    <input className="input" value={form.fiador2Profissao}
                      onChange={(e) => setForm({ ...form, fiador2Profissao: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Estado civil</label>
                    <select className="input" value={form.fiador2EstadoCivil}
                      onChange={(e) => setForm({ ...form, fiador2EstadoCivil: e.target.value })}>
                      <option value="">Selecione</option>
                      {ESTADOS_CIVIS.map((op) => <option key={op.valor} value={op.valor}>{op.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Escolaridade</label>
                    <select className="input" value={form.fiador2Escolaridade}
                      onChange={(e) => setForm({ ...form, fiador2Escolaridade: e.target.value })}>
                      <option value="">Selecione</option>
                      {ESCOLARIDADES.map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Média salarial</label>
                    <div className="flex items-center gap-2">
                      <span className="text-savanna-muted">R$</span>
                      <input className="input" value={form.fiador2MediaSalarial}
                        onChange={(e) => setForm({ ...form, fiador2MediaSalarial: mascararMoeda(e.target.value) })} placeholder="0,00" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Valor de patrimônio</label>
                    <div className="flex items-center gap-2">
                      <span className="text-savanna-muted">R$</span>
                      <input className="input" value={form.fiador2Patrimonio}
                        onChange={(e) => setForm({ ...form, fiador2Patrimonio: mascararMoeda(e.target.value) })} placeholder="0,00" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Dependentes</label>
                    <input className="input" type="number" min={0} value={form.fiador2Dependentes}
                      onChange={(e) => setForm({ ...form, fiador2Dependentes: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Declara IRPF?</label>
                    <select className="input" value={form.fiador2DeclaraIrpf}
                      onChange={(e) => setForm({ ...form, fiador2DeclaraIrpf: e.target.value })}>
                      <option value="">Não informado</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </div>
                  {ehCnpj(form.fiador2Cpf) && (
                    <div className="md:col-span-3 border-t border-savanna-border pt-4">
                      <h3 className="font-medium text-savanna-green-700 mb-3">Sócio(s)/Representante(s) legal(is) do 2º fiador</h3>
                      <div className="grid md:grid-cols-3 gap-4">
                        <div>
                          <label className="label">Sócio(a)/Representante legal</label>
                          <input className="input" value={form.fiador2SocioResponsavelNome}
                            onChange={(e) => setForm({ ...form, fiador2SocioResponsavelNome: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">CPF do(a) sócio(a)/representante</label>
                          <input className="input" value={form.fiador2SocioResponsavelCpf}
                            onChange={(e) => setForm({ ...form, fiador2SocioResponsavelCpf: mascararCpfCnpj(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label">Telefone do(a) sócio(a)</label>
                          <input className="input" value={form.fiador2SocioResponsavelTelefone}
                            onChange={(e) => setForm({ ...form, fiador2SocioResponsavelTelefone: mascararTelefone(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label">Email do(a) sócio(a)</label>
                          <input className="input" type="email" value={form.fiador2SocioResponsavelEmail}
                            onChange={(e) => setForm({ ...form, fiador2SocioResponsavelEmail: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">2º Sócio(a)/Representante legal (opcional)</label>
                          <input className="input" value={form.fiador2SocioResponsavel2Nome}
                            onChange={(e) => setForm({ ...form, fiador2SocioResponsavel2Nome: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">CPF do(a) 2º sócio(a)/representante</label>
                          <input className="input" value={form.fiador2SocioResponsavel2Cpf}
                            onChange={(e) => setForm({ ...form, fiador2SocioResponsavel2Cpf: mascararCpfCnpj(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label">Telefone do(a) 2º sócio(a)</label>
                          <input className="input" value={form.fiador2SocioResponsavel2Telefone}
                            onChange={(e) => setForm({ ...form, fiador2SocioResponsavel2Telefone: mascararTelefone(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label">Email do(a) 2º sócio(a)</label>
                          <input className="input" type="email" value={form.fiador2SocioResponsavel2Email}
                            onChange={(e) => setForm({ ...form, fiador2SocioResponsavel2Email: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {ESTADOS_CIVIS_COM_PARCEIRO.includes(form.fiador2EstadoCivil) && (
                  <div className="mt-4 pl-4 border-l-2 border-savanna-green-100">
                    <p className="text-xs font-medium text-savanna-muted mb-2">
                      {labelParceiro(form.fiador2EstadoCivil)} do 2º fiador
                    </p>
                    <div className="grid md:grid-cols-3 gap-4">
                      <input className="input" placeholder="Nome completo" value={form.fiador2ConjugeNome}
                        onChange={(e) => setForm({ ...form, fiador2ConjugeNome: e.target.value })} />
                      <input className="input" placeholder="CPF" value={form.fiador2ConjugeCpf}
                        onChange={(e) => setForm({ ...form, fiador2ConjugeCpf: mascararCpfCnpj(e.target.value) })} />
                      <input className="input" placeholder="Telefone" value={form.fiador2ConjugeTelefone}
                        onChange={(e) => setForm({ ...form, fiador2ConjugeTelefone: mascararTelefone(e.target.value) })} />
                      <input className="input" placeholder="RG" value={form.fiador2ConjugeRg}
                        onChange={(e) => setForm({ ...form, fiador2ConjugeRg: mascararRg(e.target.value) })} />
                      <input className="input" placeholder="Email" type="email" value={form.fiador2ConjugeEmail}
                        onChange={(e) => setForm({ ...form, fiador2ConjugeEmail: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-savanna-border pt-5">
            <h3 className="font-medium text-savanna-green-700 mb-3">Testemunhas padrão (opcional)</h3>
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

          <button className="btn-primary" type="submit">
            {editandoId ? 'Salvar alterações' : 'Salvar inquilino'}
          </button>
        </form>
      )}

      <div className="card p-0 overflow-hidden">
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} posicao="topo" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-savanna-green-50 text-left text-savanna-muted">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">CPF/CNPJ</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Estado civil</th>
              <th className="px-4 py-3">Imóvel</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {inquilinos.map((inq) => (
              <tr
                key={inq.id}
                className={`border-t border-savanna-border transition-colors duration-700 ${
                  linhaDestacadaId === inq.id ? 'bg-savanna-gold-400/20' : ''
                }`}
              >
                <td className="px-4 py-3">{inq.nome}</td>
                <td className="px-4 py-3">{mascararCpfCnpj(inq.cpfCnpj)}</td>
                <td className="px-4 py-3">{mascararTelefone(inq.telefone)}</td>
                <td className="px-4 py-3 capitalize">{inq.estadoCivil || '-'}</td>
                <td className="px-4 py-3">
                  {inq.imoveis && inq.imoveis.length > 0 ? (
                    <div className="space-y-0.5">
                      {inq.imoveis.map((im: any) => (
                        <p key={im.id}>{im.nome || im.endereco}</p>
                      ))}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => abrirEdicao(inq)} title="Editar"
                      className="p-1.5 rounded-sm text-savanna-muted hover:bg-savanna-green-50">
                      <IconeEngrenagem />
                    </button>
                    <button onClick={() => excluir(inq.id)} title="Excluir"
                      className="p-1.5 rounded-sm text-savanna-rust hover:bg-savanna-rust/10">
                      <IconeLixeira />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {inquilinos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-savanna-muted">Nenhum inquilino cadastrado.</td></tr>
            )}
          </tbody>
        </table>
        <Paginacao paginaAtual={pagina} totalPaginas={totalPaginas} total={totalRegistros} onMudarPagina={irParaPagina} />
      </div>
    </AppShell>
  );
}
