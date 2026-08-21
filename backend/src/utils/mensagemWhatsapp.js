const prisma = require('../config/prisma');
const { substituirPlaceholders } = require('./template');

const TIPOS_VALIDOS = [
  'RECIBO', 'REPASSE', 'CONTRATO', 'DEMONSTRATIVO', 'DEMONSTRATIVO_CONTADOR', 'NOTA_FISCAL', 'DADOS_NOTA_FISCAL',
  'LEMBRETE_VENCIMENTO', 'PAGAMENTO_ATRASADO',
];

const LABEL_TIPO_MENSAGEM = {
  RECIBO: 'Recibo de pagamento',
  REPASSE: 'Recibo de repasse (proprietário)',
  CONTRATO: 'Contratos e termos',
  DEMONSTRATIVO: 'Demonstrativo / declaração de rendimentos',
  DEMONSTRATIVO_CONTADOR: 'Demonstrativo enviado ao contador',
  NOTA_FISCAL: 'Nota fiscal (proprietário)',
  DADOS_NOTA_FISCAL: 'Dados para emissão de nota fiscal (pagamentos)',
  LEMBRETE_VENCIMENTO: 'Lembrete de vencimento (dia do vencimento)',
  PAGAMENTO_ATRASADO: 'Aviso de atraso (2 dias após o vencimento)',
};

// Placeholders disponíveis nas mensagens - a mesma lista serve para todos os tipos;
// em cada envio só os que fazem sentido para aquele documento são preenchidos com
// dado real, os demais entram como "-" (não atrapalha deixar no texto).
const LISTA_PLACEHOLDERS_MENSAGEM = [
  { chave: 'NOME', label: 'Nome do destinatário' },
  { chave: 'NOME_CLIENTE', label: 'Nome do proprietário/inquilino relacionado ao documento' },
  { chave: 'NOME_EMPRESA', label: 'Nome da imobiliária' },
  { chave: 'TELEFONE_EMPRESA', label: 'Telefone da imobiliária' },
  { chave: 'TIPO_DOCUMENTO', label: 'Tipo do documento (ex: Contrato de Locação)' },
  { chave: 'NUMERO', label: 'Número (nota fiscal, contrato, etc.)' },
  { chave: 'VALOR', label: 'Valor (recibo, nota fiscal)' },
  { chave: 'MES', label: 'Mês de referência' },
  { chave: 'ANO', label: 'Ano de referência' },
  { chave: 'LINK', label: 'Link para o PDF do documento' },
];

const TEMPLATES_PADRAO_MENSAGEM = {
  RECIBO: 'Olá, {{NOME}}! Segue o recibo de pagamento referente a {{MES}}.\n\nVocê pode visualizar e baixar o PDF pelo link abaixo:\n{{LINK}}\n\nQualquer dúvida, estamos à disposição.\n{{NOME_EMPRESA}}',
  REPASSE: 'Olá, {{NOME}}! Segue o recibo de repasse do aluguel referente a {{MES}}, no valor de {{VALOR}}.\n\nVocê pode visualizar e baixar o PDF pelo link abaixo:\n{{LINK}}\n\nQualquer dúvida, estamos à disposição.\n{{NOME_EMPRESA}}',
  CONTRATO: 'Olá, {{NOME}}! Segue o documento "{{TIPO_DOCUMENTO}}" para sua conferência.\n\nVocê pode visualizar e baixar o PDF pelo link abaixo:\n{{LINK}}\n\nQualquer dúvida, estamos à disposição.\n{{NOME_EMPRESA}}',
  DEMONSTRATIVO: 'Olá, {{NOME}}! Segue a declaração de rendimentos referente ao ano de {{ANO}}.\n\nVocê pode visualizar e baixar o PDF pelo link abaixo:\n{{LINK}}\n\nQualquer dúvida, estamos à disposição.\n{{NOME_EMPRESA}}',
  DEMONSTRATIVO_CONTADOR: 'Olá, {{NOME}}! Segue para a contabilidade o demonstrativo anual de {{ANO}} referente a {{NOME_CLIENTE}} (contrato {{NUMERO}}).\n\nPDF para conferência e lançamento:\n{{LINK}}\n\nQualquer dúvida, estamos à disposição.\n{{NOME_EMPRESA}}',
  NOTA_FISCAL: 'Olá, {{NOME}}! Segue a nota fiscal {{NUMERO}}, no valor de {{VALOR}}, referente ao imóvel administrado pela {{NOME_EMPRESA}}.\n\nVocê pode visualizar e baixar o PDF pelo link abaixo:\n{{LINK}}\n\nQualquer dúvida, estamos à disposição.',
  DADOS_NOTA_FISCAL: 'Olá, {{NOME}}! Segue em anexo os dados do pagamento (contrato {{NUMERO}}, valor {{VALOR}}) já compilados para facilitar a emissão da sua nota fiscal.\n\nVocê pode visualizar e baixar o PDF pelo link abaixo:\n{{LINK}}\n\nQualquer dúvida, estamos à disposição.\n{{NOME_EMPRESA}}',
  LEMBRETE_VENCIMENTO: 'Olá, {{NOME}}! Passando para lembrar que o aluguel referente a {{MES}}, no valor de {{VALOR}}, vence hoje.\n\nQualquer dúvida, estamos à disposição.\n{{NOME_EMPRESA}}',
  PAGAMENTO_ATRASADO: 'Olá, {{NOME}}! Identificamos que o aluguel referente a {{MES}}, no valor de {{VALOR}}, ainda não foi identificado em nosso sistema e está em atraso.\n\nPor favor, regularize o pagamento o quanto antes ou entre em contato caso já tenha efetuado.\n{{NOME_EMPRESA}}',
};

function validarTipoMensagem(tipo) {
  return TIPOS_VALIDOS.includes(tipo);
}

// Preenche o template com os dados reais - qualquer placeholder não informado
// vira "-" em vez de deixar {{ALGO}} literal no texto enviado.
function montarMensagem(templateTexto, dados = {}) {
  const completos = {
    NOME: '-',
    NOME_CLIENTE: '-',
    NOME_EMPRESA: 'Savannah Imóveis',
    TELEFONE_EMPRESA: '-',
    TIPO_DOCUMENTO: 'documento',
    NUMERO: '-',
    VALOR: '-',
    MES: '-',
    ANO: '-',
    LINK: '-',
    ...dados,
  };
  return substituirPlaceholders(templateTexto, completos);
}

// Busca o template salvo pelo admin para o tipo (ou o padrão, se ele nunca editou)
// e já devolve a mensagem pronta, com os dados substituídos.
async function montarMensagemPersonalizada(tipo, dados) {
  const tipoValido = validarTipoMensagem(tipo) ? tipo : 'RECIBO';
  const modelo = await prisma.modeloMensagemWhatsapp.findUnique({ where: { tipo: tipoValido } });
  const textoBase = modelo?.conteudo || TEMPLATES_PADRAO_MENSAGEM[tipoValido];
  return montarMensagem(textoBase, dados);
}

module.exports = {
  TIPOS_VALIDOS,
  LABEL_TIPO_MENSAGEM,
  LISTA_PLACEHOLDERS_MENSAGEM,
  TEMPLATES_PADRAO_MENSAGEM,
  validarTipoMensagem,
  montarMensagem,
  montarMensagemPersonalizada,
};
