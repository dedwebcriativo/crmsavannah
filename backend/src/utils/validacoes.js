function apenasDigitos(valor) {
  return (valor || '').replace(/\D/g, '');
}

function validarCpf(valorOriginal) {
  const cpf = apenasDigitos(valorOriginal);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais

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

function validarCnpj(valorOriginal) {
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

// Valida como CPF (11 dígitos) ou CNPJ (14 dígitos), conforme o tamanho informado
function validarCpfCnpj(valor) {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return validarCpf(digitos);
  if (digitos.length === 14) return validarCnpj(digitos);
  return false;
}

// Valida a chave de acesso de NFe/NFCe: 44 dígitos numéricos com dígito
// verificador (módulo 11, pesos de 2 a 9 repetidos) no último dígito.
function validarChaveAcesso(valorOriginal) {
  const chave = apenasDigitos(valorOriginal);
  if (chave.length !== 44) return false;

  const corpo = chave.substring(0, 43);
  const dv = parseInt(chave.charAt(43), 10);

  let soma = 0;
  let peso = 2;
  for (let i = corpo.length - 1; i >= 0; i -= 1) {
    soma += parseInt(corpo.charAt(i), 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dvCalculado = resto < 2 ? 0 : 11 - resto;

  return dvCalculado === dv;
}

module.exports = { validarCpf, validarCnpj, validarCpfCnpj, validarChaveAcesso, apenasDigitos };
