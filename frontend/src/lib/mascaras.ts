export function apenasDigitos(valor: string): string {
  return (valor || '').replace(/\D/g, '');
}

// true quando o valor já tem 14 dígitos (CNPJ) - usado pra decidir dinamicamente entre
// campos de pessoa física (RG) e pessoa jurídica (Inscrição Estadual), e pra saber quando
// disparar a busca automática de dados na Receita.
export function ehCnpj(valor: string): boolean {
  return apenasDigitos(valor).length === 14;
}

// Formata progressivamente: (47) 99999-8888 ou (47) 9999-8888 (aceita fixo digitando junto)
export function mascararTelefone(valor: string): string {
  const digitos = apenasDigitos(valor).slice(0, 11);
  if (digitos.length <= 2) return digitos.replace(/(\d{0,2})/, '($1');
  if (digitos.length <= 6) return digitos.replace(/(\d{2})(\d{0,4})/, '($1) $2');
  if (digitos.length <= 10) return digitos.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return digitos.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

// Telefone FIXO: força 8 dígitos após o DDD - (00) 0000-0000. Use quando o campo é
// especificamente "telefone fixo" (não WhatsApp/celular).
export function mascararTelefoneFixo(valor: string): string {
  const digitos = apenasDigitos(valor).slice(0, 10);
  if (digitos.length <= 2) return digitos.replace(/(\d{0,2})/, '($1');
  if (digitos.length <= 6) return digitos.replace(/(\d{2})(\d{0,4})/, '($1) $2');
  return digitos.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
}

// Formata progressivamente como CPF (000.000.000-00) até 11 dígitos,
// e como CNPJ (00.000.000/0000-00) a partir do 12º dígito
export function mascararCpfCnpj(valor: string): string {
  const digitos = apenasDigitos(valor).slice(0, 14);

  if (digitos.length <= 11) {
    return digitos
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return digitos
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

// CEP: 00000-000
export function mascararCep(valor: string): string {
  const digitos = apenasDigitos(valor).slice(0, 8);
  if (digitos.length <= 5) return digitos;
  return digitos.replace(/(\d{5})(\d{0,3})/, '$1-$2');
}

// RG: formato livre (varia por estado, pode terminar em X ou dígito verificador alfabético),
// então só agrupa os dígitos em blocos de 3 (00.000.000) e preserva uma eventual letra final
// (X ou outra) digitada pelo usuário - não é uma validação rígida, só uma máscara visual leve.
// RG: formato livre de verdade - varia demais entre estados (pode ter letra no início,
// dígito verificador em letra tipo X, e o órgão emissor + UF junto, ex: "12.345.678-9 SSP/SC").
// Em vez de tentar impor um padrão fixo (que sempre acaba sendo curto demais pra algum
// estado), só normaliza pra maiúsculas e limita a um tamanho bem generoso (25 caracteres),
// aceitando letras, números, ponto, hífen, barra e espaço - sem reformatar o que a
// pessoa digitou.
export function mascararRg(valor: string): string {
  return (valor || '').toUpperCase().replace(/[^A-Z0-9.\-/ ]/g, '').slice(0, 25);
}

// Inscrição Estadual: alfanumérica, o formato varia demais entre estados pra ter uma máscara
// fixa - só normaliza pra maiúsculas e remove espaços/caracteres inválidos, sem forçar padrão.
export function mascararInscricaoEstadual(valor: string): string {
  return (valor || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 20);
}

// Agência bancária: até 4 dígitos (a maioria dos bancos não usa dígito verificador na agência;
// quando usa, o 5º dígito vem separado por hífen)
export function mascararAgencia(valor: string): string {
  const digitos = apenasDigitos(valor).slice(0, 5);
  if (digitos.length <= 4) return digitos;
  return digitos.replace(/(\d{4})(\d)/, '$1-$2');
}

// Conta bancária: formato flexível (o tamanho varia por banco), só separa o dígito
// verificador final com hífen quando há mais de 1 dígito digitado.
export function mascararConta(valor: string): string {
  const digitos = apenasDigitos(valor).slice(0, 12);
  if (digitos.length <= 1) return digitos;
  return digitos.replace(/(\d+)(\d)$/, '$1-$2');
}

export type TipoChavePix = 'cpf' | 'cnpj' | 'celular' | 'email' | 'aleatoria';

// Tenta identificar o tipo da chave Pix a partir do valor digitado (útil pra pré-selecionar
// o tipo quando carregando um cadastro já existente que só tem o valor salvo).
export function detectarTipoChavePix(valor: string): TipoChavePix {
  const v = (valor || '').trim();
  if (!v) return 'celular';
  if (v.includes('@')) return 'email';
  const digitos = apenasDigitos(v);
  if (digitos.length === 11 && v.replace(/\D/g, '').length === v.replace(/[^\d.-]/g, '').length && /[.-]/.test(v)) return 'cpf';
  if (digitos.length === 14) return 'cnpj';
  if (digitos.length === 11) return 'celular';
  return 'aleatoria';
}

// Aplica a máscara certa pra chave Pix conforme o tipo selecionado: CPF/CNPJ usam a máscara
// de documento, celular usa a máscara de telefone, email e chave aleatória não têm máscara
// (só validação/uso livre).
export function mascararChavePix(tipo: TipoChavePix, valor: string): string {
  if (tipo === 'cpf' || tipo === 'cnpj') return mascararCpfCnpj(valor);
  if (tipo === 'celular') return mascararTelefone(valor);
  return valor;
}

// Validação de CPF (algoritmo dos dígitos verificadores)
export function validarCpf(valorOriginal: string): boolean {
  const cpf = apenasDigitos(valorOriginal);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i += 1) soma += parseInt(cpf[i], 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9], 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i += 1) soma += parseInt(cpf[i], 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[10], 10)) return false;

  return true;
}

// Validação de CNPJ (algoritmo dos dígitos verificadores)
export function validarCnpj(valorOriginal: string): boolean {
  const cnpj = apenasDigitos(valorOriginal);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  const digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i -= 1) {
    soma += parseInt(numeros.charAt(tamanho - i), 10) * pos;
    pos -= 1;
    if (pos < 2) pos = 9;
  }
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0), 10)) return false;

  tamanho += 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  for (let i = tamanho; i >= 1; i -= 1) {
    soma += parseInt(numeros.charAt(tamanho - i), 10) * pos;
    pos -= 1;
    if (pos < 2) pos = 9;
  }
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(1), 10)) return false;

  return true;
}

export function validarCpfCnpj(valor: string): boolean {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return validarCpf(valor);
  if (digitos.length === 14) return validarCnpj(valor);
  return false;
}

// Formata um número de centavos (string de dígitos) como moeda: "150000" -> "1.500,00"
export function mascararMoeda(valor: string): string {
  const digitos = apenasDigitos(valor);
  const numero = (parseInt(digitos || '0', 10) / 100).toFixed(2);
  const [inteiro, centavos] = numero.split('.');
  const inteiroFormatado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${inteiroFormatado},${centavos}`;
}

// Converte o valor mascarado ("1.500,00") de volta para número (1500.00)
export function moedaParaNumero(valorMascarado: string): number {
  const limpo = valorMascarado.replace(/\./g, '').replace(',', '.');
  return Number(limpo) || 0;
}

export interface DadosCep {
  enderecoCompleto: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

// Consulta o ViaCEP e devolve o endereço já formatado como texto único, pronto pra preencher
// um campo de "endereço completo" (padrão usado em Proprietários, Inquilinos e Configurações).
// Use em todo campo de CEP do sistema - é a mesma função usada em Imóveis.
export async function consultarCep(valor: string): Promise<DadosCep | null> {
  const digitos = apenasDigitos(valor);
  if (digitos.length !== 8) return null;

  const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
  if (!resposta.ok) return null;

  const dados = await resposta.json();
  if (dados?.erro) return null;

  const partes = [
    dados.logradouro && dados.bairro ? `${dados.logradouro}, ${dados.bairro}` : (dados.logradouro || dados.bairro),
    dados.localidade && dados.uf ? `${dados.localidade}/${dados.uf}` : dados.localidade,
    mascararCep(digitos),
  ].filter(Boolean);

  return {
    enderecoCompleto: partes.join(', '),
    logradouro: dados.logradouro || '',
    bairro: dados.bairro || '',
    cidade: dados.localidade || '',
    estado: dados.uf || '',
  };
}

export interface DadosCnpj {
  razaoSocial: string;
  nomeFantasia: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  inscricaoEstadual: string | null;
}

// Consulta dados públicos de uma empresa pelo CNPJ (BrasilAPI - gratuita, dados da Receita
// Federal). Não existe consulta equivalente para CPF: dados de pessoa física não têm API
// pública/gratuita legítima (LGPD) - por isso essa função só existe para CNPJ (14 dígitos).
//
// Inscrição Estadual: a BrasilAPI (gratuita) não garante esse dado - IE é controlada por
// cada Secretaria da Fazenda estadual (SINTEGRA), não pela Receita Federal. Tentamos ler o
// campo se a resposta trouxer (algumas integrações da BrasilAPI retornam
// "inscricoes_estaduais"), mas o normal é vir null e o usuário completar manualmente. Pra
// consulta de IE garantida seria necessário contratar uma API paga de SINTEGRA (ex:
// sintegraws.com.br), com token próprio - não incluído aqui.
export async function consultarCnpj(valor: string): Promise<DadosCnpj | null> {
  const digitos = apenasDigitos(valor);
  if (digitos.length !== 14) return null;

  const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`);
  if (!resposta.ok) return null;

  const dados = await resposta.json();
  if (!dados?.razao_social) return null;

  const enderecoPartes = [
    dados.logradouro && dados.numero ? `${dados.logradouro}, ${dados.numero}` : dados.logradouro,
    dados.bairro,
    dados.municipio && dados.uf ? `${dados.municipio}/${dados.uf}` : dados.municipio,
    dados.cep,
  ].filter(Boolean);

  const ieAtiva = Array.isArray(dados.inscricoes_estaduais)
    ? dados.inscricoes_estaduais.find((ie: any) => ie?.ativo) || dados.inscricoes_estaduais[0]
    : null;

  return {
    razaoSocial: dados.razao_social,
    nomeFantasia: dados.nome_fantasia || null,
    telefone: dados.ddd_telefone_1 ? dados.ddd_telefone_1.replace(/\D/g, '') : null,
    email: dados.email || null,
    endereco: enderecoPartes.length ? enderecoPartes.join(', ') : null,
    inscricaoEstadual: ieAtiva?.inscricao_estadual || null,
  };
}
