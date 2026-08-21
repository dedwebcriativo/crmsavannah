// Textos "de rodapé"/avisos legais dos PDFs gerados pelo sistema, que podem ser
// customizados pela imobiliária (mesmo padrão do modelo-contrato e modelo-mensagem).
// O restante do PDF (cabeçalho, tabelas, cálculos) é layout fixo - não dá pra editar
// por texto, só esses blocos de observação/nota que aparecem no rodapé de cada tipo.

const TIPOS_VALIDOS = [
  'DEMONSTRATIVO_PROPRIETARIO_NOTAS',
  'DEMONSTRATIVO_INQUILINO_NOTAS',
  'DEMONSTRATIVO_CONTADOR_NOTA',
];

const LABEL_TIPO_TEXTO = {
  DEMONSTRATIVO_PROPRIETARIO_NOTAS: 'Demonstrativo do Proprietário - Notas para o IR',
  DEMONSTRATIVO_INQUILINO_NOTAS: 'Demonstrativo do Inquilino - Notas',
  DEMONSTRATIVO_CONTADOR_NOTA: 'Demonstrativo do Contador - Observação',
};

const TEXTOS_PADRAO = {
  DEMONSTRATIVO_PROPRIETARIO_NOTAS:
    '1. O valor a ser declarado como Rendimento Tributável é o VALOR BRUTO, deduzido da comissão da imobiliária e taxas. Informe no IR o valor recebido.\n' +
    "2. Informe esses valores na ficha 'Rendimentos Recebidos de Pessoa Física' ou 'Rendimentos Recebidos de Pessoa Jurídica', conforme o caso.\n" +
    '3. As despesas de condomínio e IPTU, se pagas pelo proprietário, também podem ser deduzidas do valor do aluguel bruto.',
  DEMONSTRATIVO_INQUILINO_NOTAS:
    '1. Este demonstrativo pode ser usado como comprovante de pagamento de aluguel para fins de comprovação de residência ou declaração de Imposto de Renda, conforme aplicável.\n' +
    '2. Meses sem pagamento registrado aparecem em branco na tabela acima.',
  DEMONSTRATIVO_CONTADOR_NOTA:
    '* Relatório de apoio contábil - valores de comissão referentes à intermediação/administração de locações, base de cálculo do ISS devido pela imobiliária.',
};

function validarTipoTexto(tipo) {
  return TIPOS_VALIDOS.includes(tipo);
}

module.exports = { TIPOS_VALIDOS, LABEL_TIPO_TEXTO, TEXTOS_PADRAO, validarTipoTexto };
