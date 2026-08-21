const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { calcularRepasse } = require('../utils/financeiro');
const { formatarNumeroContrato, montarEnderecoCompleto } = require('../utils/template');
const { TEXTOS_PADRAO: DEFAULT_TEXTOS_PDF } = require('../utils/textoPdf');
const DEFAULT_NOTAS_PROPRIETARIO = DEFAULT_TEXTOS_PDF.DEMONSTRATIVO_PROPRIETARIO_NOTAS;
const DEFAULT_NOTAS_INQUILINO = DEFAULT_TEXTOS_PDF.DEMONSTRATIVO_INQUILINO_NOTAS;
const DEFAULT_NOTA_CONTADOR = DEFAULT_TEXTOS_PDF.DEMONSTRATIVO_CONTADOR_NOTA;

const { PASTA_ARQUIVOS } = require('../config/arquivos');
const CAMINHO_LOGO = path.join(__dirname, '..', '..', 'assets', 'logo.png');

function garantirPasta(subpasta) {
  const destino = path.join(PASTA_ARQUIVOS, subpasta);
  fs.mkdirSync(destino, { recursive: true });
  return destino;
}

// Desenha o cabeçalho padrão da empresa (logo à esquerda + CNPJ/endereço/contato à
// direita) no topo da página atual, e devolve a posição Y logo abaixo dele, pronta
// pra continuar o conteúdo. Usado por TODOS os PDFs do sistema, pra manter a
// identidade visual consistente (recibos, contratos, notas fiscais, demonstrativos).
function desenharCabecalhoEmpresa(doc, config) {
  const xEsquerda = doc.page.margins.left;
  const xDireita = doc.page.width - doc.page.margins.right;
  const larguraPagina = xDireita - xEsquerda;
  const yTopo = doc.page.margins.top;

  const larguraLogo = 165;
  let alturaLogo = 40;
  try {
    if (fs.existsSync(CAMINHO_LOGO)) {
      doc.image(CAMINHO_LOGO, xEsquerda, yTopo, { width: larguraLogo });
      alturaLogo = larguraLogo * 0.243; // proporção real do arquivo de logo (1600x389)
    }
  } catch {
    // Sem logo disponível, segue só com o texto do cabeçalho
  }

  const larguraBloco = 260;
  const xBloco = xDireita - larguraBloco;
  const enderecoEmpresaCompleto = montarEnderecoCompleto({
    endereco: config?.endereco,
    numero: config?.numero,
    bairro: config?.bairro,
    cidade: config?.cidade,
    estado: config?.estado,
    cep: config?.cep,
  });
  const linhas = [
    config?.cnpj ? `CNPJ: ${config.cnpj}` : null,
    enderecoEmpresaCompleto !== '-' ? enderecoEmpresaCompleto : null,
    config?.email ? `e-mail: ${config.email}` : null,
    config?.telefone ? `WhatsApp: ${config.telefone}` : null,
    config?.creci ? `CRECI ${config.creci}` : null,
  ].filter(Boolean);

  doc.font('Helvetica').fontSize(8.5).fillColor('#333333');
  let y = yTopo;
  linhas.forEach((linha) => {
    doc.text(linha, xBloco, y, { width: larguraBloco, align: 'right' });
    y = doc.y;
  });
  doc.fillColor('#000000');

  const yFinalCabecalho = Math.max(yTopo + alturaLogo, y) + 12;
  doc.moveTo(xEsquerda, yFinalCabecalho).lineTo(xDireita, yFinalCabecalho)
    .strokeColor('#046439').lineWidth(1.5).stroke();
  doc.strokeColor('#000000').lineWidth(1);

  doc.x = xEsquerda;
  doc.y = yFinalCabecalho + 16;
  return doc.y;
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(data) {
  if (!data) return '-';
  // Datas de calendário (sem horário) são gravadas como meia-noite UTC. Sem forçar o fuso
  // aqui, o servidor exibe no fuso local dele e a data "volta" um dia num fuso atrás de UTC.
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Converte "2026-07" em { mes: "Julho", ano: "2026" }
function formatarMesAno(referenteMes) {
  const [ano, mes] = (referenteMes || '').split('-');
  const indice = Number(mes) - 1;
  return { mes: MESES[indice] || referenteMes, ano: ano || '' };
}

// Formata uma data como "09 de Julho de 2026". usarUTC=true pra datas de calendário vindas
// do banco (evita "voltar" um dia no fuso do Brasil); false (padrão) é pra "agora".
function formatarDataExtensa(data, usarUTC = false) {
  const d = data ? new Date(data) : new Date();
  if (usarUTC) {
    const dia = String(d.getUTCDate()).padStart(2, '0');
    return `${dia} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }
  const dia = String(d.getDate()).padStart(2, '0');
  return `${dia} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Desenha a tabela de checklist da vistoria: item + 3 caixinhas (Ruim/Bom/N.A.),
// marcando com um "X" a avaliação escolhida para cada item (nenhuma marcada por padrão)
// Desenha o bloco de assinatura das duas testemunhas em colunas alinhadas de verdade -
// usa posicionamento explícito (x fixo por coluna) em vez de espaços no meio do texto,
// que só alinham corretamente em fonte monoespaçada (o contrato usa Times, proporcional).
function desenharTestemunhas(doc, { nome1, cpf1, nome2, cpf2 }) {
  const xInicial = doc.x;
  const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font('Helvetica').fontSize(11);

  doc.text('_________________________________', xInicial, doc.y, { width: largura });
  doc.text(nome1 || '', xInicial, doc.y, { width: largura });
  doc.text(`CPF: ${cpf1 || '-'}`, xInicial, doc.y, { width: largura });

  doc.moveDown(6); // espaço reservado equivalente ao das demais assinaturas (carimbo digital gov.br)

  doc.text('_________________________________', xInicial, doc.y, { width: largura });
  doc.text(nome2 || '', xInicial, doc.y, { width: largura });
  doc.text(`CPF: ${cpf2 || '-'}`, xInicial, doc.y, { width: largura });
}

function desenharChecklistVistoria(doc, { itens, observacao } = {}) {
  const listaItens = Array.isArray(itens) ? itens : (itens || []);
  const xInicial = doc.x;
  const larguraItem = 200;
  const larguraColuna = 60;
  const opcoes = [
    { chave: 'RUIM', label: 'Ruim' },
    { chave: 'BOM', label: 'Bom' },
    { chave: 'NOVO', label: 'Novo' },
    { chave: 'NA', label: 'N.A.' },
  ];
  const tamanhoCaixa = 9;
  const alturaLinha = 20;
  const margemInferior = doc.page.margins.bottom;

  function desenharCabecalho() {
    let x = xInicial;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#046439');
    doc.text('Item', x, doc.y, { width: larguraItem });
    const yCabecalho = doc.y - doc.currentLineHeight();
    x += larguraItem;
    opcoes.forEach((op) => {
      doc.text(op.label, x, yCabecalho, { width: larguraColuna, align: 'center' });
      x += larguraColuna;
    });
    doc.fillColor('#000000');
    doc.moveDown(0.3);
  }

  desenharCabecalho();
  doc.font('Helvetica').fontSize(9);

  listaItens.forEach((item) => {
    // Quebra de página EXPLÍCITA antes de faltar espaço - sem isso, o PDFKit quebra a
    // página no meio da linha de forma inconsistente (texto do item numa página, as
    // caixinhas de avaliação em outra), deixando páginas quase em branco pelo caminho.
    const espacoRestante = doc.page.height - margemInferior - doc.y;
    if (espacoRestante < alturaLinha + 4) {
      doc.addPage();
      desenharCabecalho();
      doc.font('Helvetica').fontSize(9);
    }

    const y = doc.y;
    doc.text(item.item, xInicial, y, { width: larguraItem });

    let xCol = xInicial + larguraItem;
    opcoes.forEach((op) => {
      const xCaixa = xCol + larguraColuna / 2 - tamanhoCaixa / 2;
      doc.rect(xCaixa, y + 1, tamanhoCaixa, tamanhoCaixa).stroke('#666666');
      if (item.avaliacao === op.chave) {
        doc.fontSize(9).font('Helvetica-Bold')
          .text('X', xCaixa, y - 0.5, { width: tamanhoCaixa, align: 'center' });
        doc.font('Helvetica').fontSize(9);
      }
      xCol += larguraColuna;
    });

    doc.y = y + alturaLinha;
  });

  doc.x = xInicial;
  doc.moveDown(0.5);

  if (observacao) {
    if (doc.page.height - margemInferior - doc.y < 60) doc.addPage();
    doc.x = xInicial;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#046439').text('Observações:');
    doc.font('Helvetica').fontSize(9).fillColor('#000000').text(observacao, xInicial, doc.y, { width: larguraItem + larguraColuna * opcoes.length });
    doc.moveDown(0.5);
  }

  doc.x = xInicial;
}

// Nomes dos meses, usados pra reconhecer datas por extenso (ex: "22 de Julho de 2026",
// "Dezembro 2025") e negritá-las automaticamente.
const NOMES_MESES = 'Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro';
const REGEX_VALOR = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g;
const REGEX_DATA = new RegExp(
  `\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b`
  + `|\\b\\d{1,2} de (?:${NOMES_MESES}) de \\d{4}\\b`
  + `|\\b(?:${NOMES_MESES}) de \\d{4}\\b`
  + `|\\b(?:${NOMES_MESES}) \\d{4}\\b`,
  'g',
);

// Negrita automaticamente qualquer DATA ou VALOR (R$) encontrado na linha, envolvendo em
// **...**. Pode ser aplicado em cima de texto que já tenha outras marcações **, porque o
// parser de formatação (analisarFormatacao) só alterna negrito a cada par de "**" - não
// há problema em ter pares adicionais em qualquer posição da linha.
function negritarDatasEValores(linha) {
  return linha.replace(REGEX_VALOR, (m) => `**${m}**`).replace(REGEX_DATA, (m) => `**${m}**`);
}

// Quando uma linha de cláusula vem com o corpo colado na mesma linha do cabeçalho
// (ex: "CLÁUSULA SEGUNDA: O valor do aluguel é..."), separa em: cabeçalho sozinho (negrito),
// linha em branco (espaçamento de parágrafo) e o corpo em linha própria - conforme pedido,
// toda cláusula deve ficar isolada, nunca colada no texto do corpo.
function separarCabecalhoDeClausula(linha) {
  if (linha.includes('**')) return [linha];

  const inicioTexto = linha.length - linha.trimStart().length;
  const prefixoEspacos = linha.slice(0, inicioTexto);
  const conteudo = linha.slice(inicioTexto);

  if (!/^cl[aá]usula\s/i.test(conteudo)) return [linha];

  const idxDoisPontos = conteudo.indexOf(':');
  if (idxDoisPontos === -1 || idxDoisPontos > 90) {
    return [`${prefixoEspacos}**${conteudo}**`];
  }

  const cabecalho = conteudo.slice(0, idxDoisPontos + 1);
  const corpo = conteudo.slice(idxDoisPontos + 1).trim();
  if (!corpo) return [`${prefixoEspacos}**${cabecalho}**`];

  return [`${prefixoEspacos}**${cabecalho}**`, '', `${prefixoEspacos}${corpo}`];
}

// Aplica negrito automático num rótulo curto no início da linha, terminado em ":"
// (ex: "Parágrafo primeiro:", "LOCADOR:", "GARANTIA:", "PARÁGRAFO ADICIONAL:") - só o
// rótulo (até os dois pontos, inclusive) fica em negrito, o resto segue normal.
// Linhas que já tenham marcação manual (**) não são mexidas, pra não interferir em textos
// que o admin já formatou à mão em "Configurar modelos".
function negritarRotuloDoisPontos(linha) {
  if (linha.includes('**')) return linha;
  if (!linha.trim()) return linha;

  const inicioTexto = linha.length - linha.trimStart().length;
  const prefixoEspacos = linha.slice(0, inicioTexto);
  const conteudo = linha.slice(inicioTexto);

  const match = conteudo.match(/^([^:\n]{1,60}?:)(\s|$)/);
  if (match) {
    const rotulo = match[1];
    const resto = conteudo.slice(rotulo.length);
    return `${prefixoEspacos}**${rotulo}**${resto}`;
  }

  return linha;
}

// Pipeline completo de formatação automática do contrato: separa cabeçalhos de cláusula
// em linha própria, negrita rótulos terminados em ":" e negrita datas/valores em todo o
// texto. Recebe as linhas originais do parágrafo e devolve a lista já expandida/formatada.
function aplicarFormatacaoAutomatica(linhasOriginais) {
  const linhasExpandidas = [];
  linhasOriginais.forEach((linha) => {
    separarCabecalhoDeClausula(linha).forEach((l) => linhasExpandidas.push(l));
  });
  return linhasExpandidas.map((linha) => negritarDatasEValores(negritarRotuloDoisPontos(linha)));
}

// Marcação leve suportada no texto dos modelos de contrato:
//   **texto**  -> negrito
//   ##texto##  -> azul (pode combinar com negrito, ex: **texto ##email## texto**)
// Retorna uma lista de trechos { texto, negrito, azul } na ordem em que aparecem.
function analisarFormatacao(texto) {
  const tokens = texto.split(/(\*\*|##)/);
  const partes = [];
  let negrito = false;
  let azul = false;

  tokens.forEach((token) => {
    if (token === '**') {
      negrito = !negrito;
    } else if (token === '##') {
      azul = !azul;
    } else if (token) {
      partes.push({ texto: token, negrito, azul });
    }
  });

  return partes;
}

// Renderiza um parágrafo aplicando negrito/azul conforme a marcação leve (**bold**, ##azul##).
// Se o parágrafo não tiver nenhuma marcação, cai no caminho simples (mais rápido).
// Processa linha por linha (o texto pode ter quebras de linha simples dentro do mesmo
// parágrafo), porque o modo "continued" do PDFKit não preserva quebras de linha embutidas.
// Fontes usadas no corpo do contrato (Times New Roman - PDFKit usa as 14 fontes padrão
// do PDF, então "Times-Roman"/"Times-Bold" já correspondem à Times New Roman sem precisar
// embutir arquivo de fonte).
const FONTE_CONTRATO_REGULAR = 'Times-Roman';
const FONTE_CONTRATO_NEGRITO = 'Times-Bold';

// PDFKit, com align:'justify', "engole" o espaço em branco que fica no INÍCIO de um trecho
// continuado logo após um trecho anterior (ex: negrito) terminar - "Dezembro 2025" + "
// programado" vira "Dezembro 2025programado" no PDF. Correção: em vez de deixar o espaço
// no começo do próximo trecho, move ele pro final do trecho anterior, onde o PDFKit não o perde.
function corrigirEspacosEntrePartes(partes) {
  for (let i = 1; i < partes.length; i += 1) {
    const espacoInicial = partes[i].texto.match(/^\s+/);
    if (espacoInicial) {
      partes[i].texto = partes[i].texto.slice(espacoInicial[0].length);
      partes[i - 1].texto += espacoInicial[0];
    }
  }
  return partes;
}

function renderizarParagrafo(doc, textoParagrafo, opcoesTexto) {
  const linhas = aplicarFormatacaoAutomatica(textoParagrafo.split('\n'));
  const textoProcessado = linhas.join('\n');

  if (!textoProcessado.includes('**') && !textoProcessado.includes('##')) {
    doc.font(FONTE_CONTRATO_REGULAR).fillColor('#000000').text(textoParagrafo, opcoesTexto);
    return;
  }

  linhas.forEach((linha) => {
    const partes = corrigirEspacosEntrePartes(analisarFormatacao(linha));
    if (partes.length === 0) {
      doc.text(' ', opcoesTexto);
      return;
    }
    partes.forEach((parte, indice) => {
      const ehUltimo = indice === partes.length - 1;
      doc.font(parte.negrito ? FONTE_CONTRATO_NEGRITO : FONTE_CONTRATO_REGULAR);
      doc.fillColor(parte.azul ? '#1a56db' : '#000000');
      doc.text(parte.texto, { ...opcoesTexto, continued: !ehUltimo });
    });
  });
  doc.font(FONTE_CONTRATO_REGULAR).fillColor('#000000');
}

// Deixa o número do contrato seguro pra usar como nome de arquivo - troca "/" (sempre
// presente no formato "####/ano") e outros caracteres inválidos em nome de arquivo por "-".
function sanitizarNomeArquivo(texto) {
  return String(texto || '').replace(/[\\/:*?"<>|]/g, '-').trim();
}

const NOME_ARQUIVO_POR_TIPO = {
  LOCACAO_RESIDENCIAL: (numero) => `contrato-locacao-residencial-${numero}.pdf`,
  LOCACAO_COMERCIAL: (numero) => `contrato-locacao-comercial-${numero}.pdf`,
  INTERMEDIACAO: (numero) => `contrato-intermediacao-${numero}.pdf`,
  VISTORIA_INICIAL: (numero) => `termo-vistoria-entrada-${numero}.pdf`,
  VISTORIA_FINAL: (numero) => `termo-vistoria-saida-${numero}.pdf`,
  RESCISAO: (numero) => `termo-rescisao-${numero}.pdf`,
};

// Gera o PDF do documento (contrato de locação, intermediação ou termo de vistoria) a partir
// do texto final (template já com os placeholders substituídos) e retorna o caminho do arquivo
async function gerarContratoPdf({ contratoId, numeroContrato, textoFinal, tipo = 'LOCACAO_RESIDENCIAL', config, itensVistoria, testemunhas }) {
  const pasta = garantirPasta('contratos');
  const numeroSeguro = sanitizarNomeArquivo(numeroContrato) || String(contratoId);
  const nomeArquivo = (NOME_ARQUIVO_POR_TIPO[tipo] || NOME_ARQUIVO_POR_TIPO.LOCACAO_RESIDENCIAL)(numeroSeguro);
  const caminho = path.join(pasta, nomeArquivo);

  return new Promise((resolve, reject) => {
    // Margem reduzida (~1,27cm) pra aproveitar o máximo de área útil da página - contrato
    // é documento denso, então preferimos margem estreita a sobrar espaço em branco.
    const doc = new PDFDocument({ margin: 36 });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    // Cabeçalho padrão (logo + dados da imobiliária), igual em todos os PDFs do sistema
    desenharCabecalhoEmpresa(doc, config);
    doc.x = doc.page.margins.left;

    // A primeira linha do texto é tratada como título centralizado;
    // o restante é o corpo do documento, com parágrafos separados por linha em branco.
    const linhas = textoFinal.split('\n');
    const titulo = linhas[0];
    const corpo = linhas.slice(1).join('\n').trim();

    doc.fontSize(14).font(FONTE_CONTRATO_NEGRITO).text(titulo, { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11).font(FONTE_CONTRATO_REGULAR);
    // Divide em parágrafos MANTENDO o separador capturado (grupo entre parênteses),
    // pra saber exatamente quantas linhas em branco existiam no modelo entre um
    // parágrafo e outro - isso é o que garante o espaço reservado pro carimbo de
    // assinatura digital gov.br (senão qualquer espaço em branco vira só 1 linha).
    const partes = corpo.split(/(\n{2,})/);
    for (let i = 0; i < partes.length; i += 2) {
      const trecho = partes[i].trim();
      if (trecho) {
        if ((trecho === '{{CHECKLIST_VISTORIA_INICIAL}}' || trecho === '{{CHECKLIST_VISTORIA_FINAL}}') && itensVistoria) {
          desenharChecklistVistoria(doc, itensVistoria);
        } else if (trecho === '[[BLOCO_TESTEMUNHAS]]') {
          desenharTestemunhas(doc, testemunhas || {});
        } else {
          renderizarParagrafo(doc, trecho, { align: 'justify', lineGap: 3 });
        }
      }

      const separador = partes[i + 1];
      const linhasEmBranco = separador ? Math.max(0, (separador.match(/\n/g) || []).length - 1) : 0;
      doc.moveDown(Math.max(1, linhasEmBranco));
    }

    doc.end();

    stream.on('finish', () => resolve(`arquivos/contratos/${nomeArquivo}`));
    stream.on('error', reject);
  });
}

// Gera o PDF do recibo de pagamento e retorna o caminho do arquivo.
// Segue o padrão: cabeçalho, frase de recebimento, itens em lista (aluguel +
// encargos extras), total final em destaque (fundo amarelo), local/data e assinatura.
async function gerarReciboPdf({ pagamento, inquilino, imovel, proprietario, config }) {
  const pasta = garantirPasta('recibos');
  const nomeArquivo = `recibo-${pagamento.id}.pdf`;
  const caminho = path.join(pasta, nomeArquivo);

  const nomeEmpresa = config?.nomeEmpresa || 'Savannah Imóveis';
  const creci = config?.creci ? ` Creci ${config.creci}` : '';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 55 });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    const LABEL_TIPO = { ALUGUEL: 'aluguel', CAUCAO: 'caução', TAXA: 'taxa' };
    const { mes, ano } = formatarMesAno(pagamento.referenteMes);

    desenharCabecalhoEmpresa(doc, config);

    // Título
    doc.font('Helvetica-Bold').fontSize(16).text('RECIBO DE PAGAMENTO', { align: 'center' });
    doc.moveDown(2);

    // Frase de recebimento (nome do inquilino em negrito)
    doc.font('Helvetica').fontSize(11);
    doc.text('Recebemos de ', { continued: true });
    doc.font('Helvetica-Bold').text(inquilino.nome, { continued: true });
    doc.font('Helvetica').text(
      ` a importância abaixo referente ${LABEL_TIPO[pagamento.tipo] || 'aluguel'}` +
      (imovel
        ? ` conforme contrato de locação do Imóvel ${imovel.nome || imovel.tipo}, ${imovel.endereco}, ` +
          `${imovel.cidade ? `${imovel.cidade}` : ''}${imovel.estado ? `/${imovel.estado}` : ''}` +
          `${imovel.cep ? `, CEP ${imovel.cep}` : ''}.`
        : ' conforme contrato de locação.')
    );
    doc.moveDown(1.5);

    // Itens do recibo: linha base (aluguel/caução/taxa) + encargos extras
    const itens = [];
    const labelBase = pagamento.tipo === 'ALUGUEL'
      ? { texto: 'Aluguel referente a ', destaque: mes, sufixo: ` de ${ano}` }
      : { texto: `${LABEL_TIPO[pagamento.tipo] === 'caução' ? 'Caução' : 'Taxa'} referente a `, destaque: mes, sufixo: ` de ${ano}` };

    itens.push({ ...labelBase, valor: Number(pagamento.valor) });
    (pagamento.itens || []).forEach((it) => {
      itens.push({ texto: it.descricao, destaque: null, sufixo: '', valor: Number(it.valor) });
    });

    const totalGeral = itens.reduce((soma, it) => soma + it.valor, 0);

    doc.fontSize(11);
    itens.forEach((item) => {
      doc.text('•  ', { continued: true });
      doc.font('Helvetica').text(item.texto, { continued: true });
      if (item.destaque) {
        doc.font('Helvetica-Bold').text(item.destaque, { continued: true });
        doc.font('Helvetica').text(item.sufixo, { continued: true });
      }
      doc.text(`: ${formatarMoeda(item.valor)}`);
    });

    doc.moveDown(0.3);

    // Linha final com o total, com destaque (fundo amarelo) no valor
    const labelTotal = `•  Pix ${nomeEmpresa}: `;
    const valorTotalTexto = formatarMoeda(totalGeral);
    doc.font('Helvetica-Bold').fontSize(11);
    const xInicial = doc.x;
    const yInicial = doc.y;
    const larguraLabel = doc.widthOfString(labelTotal);
    const larguraValor = doc.widthOfString(valorTotalTexto);
    const alturaLinha = doc.currentLineHeight();

    doc.save();
    doc.rect(xInicial + larguraLabel - 1, yInicial - 1, larguraValor + 4, alturaLinha + 2).fill('#FFF176');
    doc.restore();

    doc.fillColor('#000000').text(labelTotal + valorTotalTexto);

    doc.moveDown(2);

    // Local e data por extenso
    doc.font('Helvetica').fontSize(11).text(
      `${imovel?.cidade || 'Canoinhas'} – ${imovel?.estado || 'SC'}, ${formatarDataExtensa(pagamento.dataPagamento || new Date(), !!pagamento.dataPagamento)}.`
    );
    doc.moveDown(2.5);

    // Assinatura
    doc.font('Helvetica-Bold').text(`${nomeEmpresa}${creci}`);
    doc.font('Helvetica').text(`(Representando ${proprietario?.nome || 'o proprietário'}).`);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('LOCADOR');

    doc.end();

    stream.on('finish', () => resolve(`arquivos/recibos/${nomeArquivo}`));
    stream.on('error', reject);
  });
}

// Gera o recibo de repasse de aluguel entregue ao PROPRIETÁRIO (locador), mostrando
// de onde veio o dinheiro (qual inquilino/imóvel), o aluguel + encargos extras
// (taxa de mudança, gás etc.), a comissão da imobiliária e deduções, chegando no
// saldo líquido repassado. Segue o mesmo modelo usado manualmente pela imobiliária.
async function gerarReciboRepassePdf({ pagamento, inquilino, imovel, proprietario, config }) {
  const pasta = garantirPasta('repasses');
  const nomeArquivo = `repasse-${pagamento.id}.pdf`;
  const caminho = path.join(pasta, nomeArquivo);

  const nomeEmpresa = config?.nomeEmpresa || 'Savannah Imóveis';
  const { mes, ano } = formatarMesAno(pagamento.referenteMes);

  const itensExtras = pagamento.itens || [];
  const totalItensExtras = itensExtras.reduce((soma, it) => soma + Number(it.valor), 0);
  const percentual = pagamento.percentualImobiliaria !== null && pagamento.percentualImobiliaria !== undefined
    ? Number(pagamento.percentualImobiliaria) : 0;
  const valorIptu = pagamento.valorIptu !== null && pagamento.valorIptu !== undefined ? Number(pagamento.valorIptu) : 0;
  const valorCondominio = pagamento.valorCondominio !== null && pagamento.valorCondominio !== undefined ? Number(pagamento.valorCondominio) : 0;
  const valorIntermediacao = pagamento.valorIntermediacao !== null && pagamento.valorIntermediacao !== undefined ? Number(pagamento.valorIntermediacao) : 0;
  const percentualIntermediacao = pagamento.percentualIntermediacao !== null && pagamento.percentualIntermediacao !== undefined
    ? Number(pagamento.percentualIntermediacao) : 0;
  const valorComissao = Number(pagamento.valor) * (percentual / 100);
  // Mesma fórmula usada em todo o financeiro do sistema: comissão só sobre o aluguel,
  // IPTU/condomínio somados (não descontados), intermediação descontada quando houver.
  const saldoRepasse = (calcularRepasse({
    valor: pagamento.valor,
    percentualImobiliaria: percentual,
    intermediacao: valorIntermediacao,
    iptu: valorIptu,
    condominio: valorCondominio,
  }) || 0) + totalItensExtras;

  const dadosBancarios = proprietario?.chavePix
    ? `Pix: ${proprietario.chavePix}`
    : [proprietario?.bancoNome, proprietario?.bancoAgencia && `Ag: ${proprietario.bancoAgencia}`, proprietario?.bancoConta && `Conta: ${proprietario.bancoConta}`]
        .filter(Boolean).join(' - ') || '-';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 55, size: 'A4' });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    desenharCabecalhoEmpresa(doc, config);

    doc.font('Helvetica-Bold').fontSize(16).text('RECIBO REPASSE ALUGUEL LOCADOR', { align: 'center' });
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(11).text('LOCADOR: ', { continued: true }).font('Helvetica').text(proprietario?.nome || '-');
    if (proprietario?.cpfCnpj) {
      doc.font('Helvetica-Bold').text('CPF/CNPJ: ', { continued: true }).font('Helvetica').text(proprietario.cpfCnpj);
    }
    doc.font('Helvetica-Bold').text('LOCATÁRIO: ', { continued: true }).font('Helvetica').text(inquilino?.nome || '-');
    if (inquilino?.cpfCnpj) {
      doc.font('Helvetica-Bold').text('CPF/CNPJ: ', { continued: true }).font('Helvetica').text(inquilino.cpfCnpj);
    }
    if (imovel) {
      const enderecoImovel = `${imovel.nome ? `${imovel.nome} - ` : ''}${imovel.endereco || ''}`
        + `${imovel.cidade ? `, ${imovel.cidade}` : ''}${imovel.estado ? `/${imovel.estado}` : ''}${imovel.cep ? `, CEP ${imovel.cep}` : ''}`;
      doc.font('Helvetica-Bold').text('IMÓVEL: ', { continued: true }).font('Helvetica').text(enderecoImovel, { width: 480 });
    }
    doc.moveDown(1.2);

    doc.font('Helvetica').text('Mês de Referência: ', { continued: true }).font('Helvetica-Bold').text(`${mes} de ${ano}`);
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(10.5);
    doc.text(`Aluguel: ${formatarMoeda(pagamento.valor)}`);
    itensExtras.forEach((item) => {
      doc.text(`${item.descricao}: ${formatarMoeda(item.valor)}`);
    });
    if (percentual > 0) {
      doc.text(`Administração Aluguel ${percentual}%: (${formatarMoeda(valorComissao)})`);
    }
    if (valorIntermediacao > 0) {
      doc.text(`Taxa de Intermediação ${percentualIntermediacao ? `${percentualIntermediacao}%` : ''}: (${formatarMoeda(valorIntermediacao)})`);
    }
    if (valorIptu > 0) {
      doc.text(`IPTU: ${formatarMoeda(valorIptu)}`);
    }
    if (valorCondominio > 0) {
      doc.text(`Condomínio/Taxas: ${formatarMoeda(valorCondominio)}`);
    }
    doc.text(`Agência/Conta: ${dadosBancarios}`);
    doc.moveDown(0.8);

    // Saldo repasse em destaque (fundo amarelo), mesmo padrão visual dos outros PDFs
    const labelSaldo = 'Saldo Repasse: ';
    const valorSaldoTexto = formatarMoeda(saldoRepasse);
    doc.font('Helvetica-Bold').fontSize(12);
    const xInicial = doc.x;
    const yInicial = doc.y;
    const larguraLabel = doc.widthOfString(labelSaldo);
    const larguraValor = doc.widthOfString(valorSaldoTexto);
    const alturaLinha = doc.currentLineHeight();
    doc.save();
    doc.rect(xInicial + larguraLabel - 1, yInicial - 1, larguraValor + 4, alturaLinha + 2).fill('#FFF176');
    doc.restore();
    doc.fillColor('#000000').text(labelSaldo + valorSaldoTexto);

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(10.5).text(
      `Recebi de ${nomeEmpresa}${config?.cnpj ? `, CNPJ ${config.cnpj},` : ''} referente ao repasse do aluguel `
      + 'conforme acima e de acordo com o contrato de locação.',
      { width: 480 }
    );

    doc.moveDown(3);
    doc.font('Helvetica').fontSize(10.5).text(proprietario?.nome || '-');
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text(`${formatarDataExtensa(pagamento.dataRepasse || new Date(), !!pagamento.dataRepasse)}.`);

    doc.end();

    stream.on('finish', () => resolve(`arquivos/repasses/${nomeArquivo}`));
    stream.on('error', reject);
  });
}

// Gera um comprovante em PDF representando a nota fiscal cadastrada (não é o
// DANFE oficial da SEFAZ - é um documento interno da Savannah para envio ao
// proprietário). Quando a nota tem detalhesJson (extraído do XML), o PDF sai
// bem mais completo: endereços, protocolo de autorização, natureza da operação
// e a tabela de itens/produtos. Sem esses dados, cai no formato resumido.
async function gerarNotaFiscalPdf({ nota, proprietario, config }) {
  const pasta = garantirPasta('notas-fiscais');
  const nomeArquivo = `nota-fiscal-${nota.id}.pdf`;
  const caminho = path.join(pasta, nomeArquivo);

  const nomeEmpresa = config?.nomeEmpresa || 'Savannah Imóveis';
  const creci = config?.creci ? ` Creci ${config.creci}` : '';
  const LABEL_TIPO = {
    NFE: 'Nota Fiscal Eletrônica (NF-e)',
    NFA: 'Nota Fiscal Avulsa Eletrônica (NFA-e)',
    NFSE: 'Nota Fiscal de Serviço Eletrônica (NFS-e)',
    OUTRA: 'Nota Fiscal',
  };

  let detalhes = {};
  try {
    detalhes = nota.detalhesJson ? JSON.parse(nota.detalhesJson) : {};
  } catch {
    detalhes = {};
  }
  const itens = Array.isArray(detalhes.itens) ? detalhes.itens : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    // Cabeçalho padrão da empresa
    desenharCabecalhoEmpresa(doc, config);

    // Título + identificação da nota
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#046439').text('COMPROVANTE DE NOTA FISCAL', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text(LABEL_TIPO[nota.tipo] || 'Nota Fiscal', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1);

    const yTopo = doc.y;
    const larguraColuna = 250;

    // Coluna esquerda: emitente
    doc.font('Helvetica-Bold').fontSize(9).text('EMITENTE', 45, yTopo);
    doc.font('Helvetica').fontSize(9);
    doc.text(nota.emitenteNome || '-', 45, doc.y, { width: larguraColuna });
    if (nota.emitenteCnpj) doc.text(`CNPJ/CPF: ${nota.emitenteCnpj}`, { width: larguraColuna });
    if (detalhes.emitenteIe) doc.text(`Inscrição Estadual: ${detalhes.emitenteIe}`, { width: larguraColuna });
    if (detalhes.emitenteEndereco) doc.text(detalhes.emitenteEndereco, { width: larguraColuna });

    // Coluna direita: identificação da nota
    const xDireita = 45 + larguraColuna + 20;
    doc.font('Helvetica-Bold').fontSize(9).text('IDENTIFICAÇÃO', xDireita, yTopo, { width: larguraColuna });
    doc.font('Helvetica').fontSize(9);
    doc.text(`Número: ${nota.numero || '-'}   Série: ${nota.serie || '-'}`, xDireita, doc.y, { width: larguraColuna });
    doc.text(`Emissão: ${formatarData(nota.dataEmissao)}`, xDireita, doc.y, { width: larguraColuna });
    if (detalhes.naturezaOperacao) doc.text(`Natureza da operação: ${detalhes.naturezaOperacao}`, xDireita, doc.y, { width: larguraColuna });
    if (nota.chaveAcesso) {
      const chaveFormatada = nota.chaveAcesso.replace(/(\d{4})(?=\d)/g, '$1 ');
      doc.text('Chave de acesso:', xDireita, doc.y, { width: larguraColuna });
      doc.font('Helvetica-Bold').fontSize(8).text(chaveFormatada, xDireita, doc.y, { width: larguraColuna });
      doc.font('Helvetica').fontSize(9);
    }
    if (detalhes.protocoloAutorizacao) {
      doc.text(`Protocolo de autorização: ${detalhes.protocoloAutorizacao}`, xDireita, doc.y, { width: larguraColuna });
    }

    doc.x = 45;
    doc.y = Math.max(doc.y, yTopo + 90);
    doc.moveDown(0.8);

    // Destinatário (se conhecido - vem do XML)
    if (detalhes.destinatarioNome) {
      doc.font('Helvetica-Bold').fontSize(9).text('DESTINATÁRIO', 45, doc.y);
      doc.font('Helvetica').fontSize(9);
      doc.text(detalhes.destinatarioNome, { width: 500 });
      const linhaDest = [
        detalhes.destinatarioCnpjCpf ? `CNPJ/CPF: ${detalhes.destinatarioCnpjCpf}` : null,
        detalhes.destinatarioIe ? `IE: ${detalhes.destinatarioIe}` : null,
      ].filter(Boolean).join('   ');
      if (linhaDest) doc.text(linhaDest, { width: 500 });
      if (detalhes.destinatarioEndereco) doc.text(detalhes.destinatarioEndereco, { width: 500 });
      doc.moveDown(0.8);
    }

    doc.font('Helvetica-Bold').fontSize(9).text('PROPRIETÁRIO (destinatário do envio)', 45, doc.y);
    doc.font('Helvetica').fontSize(9).text(proprietario?.nome || '-', { width: 500 });
    doc.moveDown(1);

    // Tabela de itens (só aparece quando o XML trouxe produtos/serviços detalhados)
    if (itens.length) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#046439').text('ITENS / SERVIÇOS', 45, doc.y);
      doc.fillColor('#000000');
      doc.moveDown(0.3);

      doc.font('Helvetica').fontSize(9); // mesma fonte/tamanho usada pelas linhas da tabela, para medir corretamente
      const LARGURA_COL_DESCRICAO = 200 - 8;

      const yTabela = desenharTabela(doc, {
        x: 45,
        y: doc.y,
        colunas: [
          { titulo: 'Código', largura: 45 },
          { titulo: 'Descrição', largura: 200 },
          { titulo: 'NCM', largura: 55 },
          { titulo: 'CFOP', largura: 40 },
          { titulo: 'Qtd', largura: 40, align: 'right' },
          { titulo: 'Vl. Unit.', largura: 60, align: 'right' },
          { titulo: 'Vl. Total', largura: 65, align: 'right' },
        ],
        linhas: itens.map((item) => ({
          celulas: [
            item.codigo || '-',
            truncarParaLargura(doc, item.descricao || '-', LARGURA_COL_DESCRICAO),
            item.ncm || '-',
            item.cfop || '-',
            item.quantidade !== null && item.quantidade !== undefined ? String(item.quantidade) : '-',
            item.valorUnitario !== null && item.valorUnitario !== undefined ? formatarMoeda(item.valorUnitario) : '-',
            item.valorTotal !== null && item.valorTotal !== undefined ? formatarMoeda(item.valorTotal) : '-',
          ],
        })),
      });
      doc.y = yTabela + 12;
    } else if (nota.discriminacao) {
      doc.font('Helvetica-Bold').fontSize(9).text('Discriminação:', 45, doc.y);
      doc.font('Helvetica').fontSize(9).text(nota.discriminacao, { width: 500 });
      doc.moveDown(1);
    }

    // Totais (ICMS/IPI/frete/desconto quando disponíveis, sempre o valor total em destaque)
    const totaisSecundarios = [
      detalhes.valorTotalProdutos ? `Produtos: ${formatarMoeda(detalhes.valorTotalProdutos)}` : null,
      detalhes.valorIcms ? `ICMS: ${formatarMoeda(detalhes.valorIcms)}` : null,
      detalhes.valorIpi ? `IPI: ${formatarMoeda(detalhes.valorIpi)}` : null,
      detalhes.valorFrete ? `Frete: ${formatarMoeda(detalhes.valorFrete)}` : null,
      detalhes.valorSeguro ? `Seguro: ${formatarMoeda(detalhes.valorSeguro)}` : null,
      detalhes.desconto ? `Desconto: ${formatarMoeda(detalhes.desconto)}` : null,
    ].filter(Boolean);
    if (totaisSecundarios.length) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#666666').text(totaisSecundarios.join('   |   '), 45, doc.y, { width: 500 });
      doc.fillColor('#000000');
      doc.moveDown(0.5);
    }

    const labelTotal = 'VALOR TOTAL DA NOTA: ';
    const valorTotalTexto = formatarMoeda(nota.valorTotal || 0);
    doc.font('Helvetica-Bold').fontSize(12);
    const xInicial = doc.x;
    const yInicial = doc.y;
    const larguraLabel = doc.widthOfString(labelTotal);
    const larguraValor = doc.widthOfString(valorTotalTexto);
    const alturaLinha = doc.currentLineHeight();

    doc.save();
    doc.rect(xInicial + larguraLabel - 1, yInicial - 1, larguraValor + 4, alturaLinha + 2).fill('#FFF176');
    doc.restore();
    doc.fillColor('#000000').text(labelTotal + valorTotalTexto);

    if (nota.observacoes) {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(9).text('Observações:');
      doc.font('Helvetica').fontSize(9).text(nota.observacoes, { width: 500 });
    }

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(9).text(`${formatarDataExtensa(new Date())}.`);
    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(9.5).text(`${nomeEmpresa}${creci}`);
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text(
      'Documento gerado pelo CRM Savannah a partir do XML/dados cadastrados, para conferência e envio ao proprietário. '
      + 'Não substitui o DANFE/XML original para fins fiscais - a autenticidade pode ser verificada com a chave de acesso '
      + 'no portal público da NF-e (nfe.fazenda.gov.br) ou no site da Sefaz do estado emissor.',
      { width: 500 }
    );

    doc.end();

    stream.on('finish', () => resolve(`arquivos/notas-fiscais/${nomeArquivo}`));
    stream.on('error', reject);
  });
}

// Gera um PDF que compila os dados necessários para o PROPRIETÁRIO (ou seu contador)
// emitir a nota fiscal referente a um pagamento de aluguel na Receita/prefeitura.
// IMPORTANTE: isso não emite nenhuma nota fiscal de verdade - é só um documento de
// apoio com os dados já prontos (evita ter que ficar copiando informação do sistema).
async function gerarDadosNotaFiscalPdf({ pagamento, inquilino, imovel, proprietario, contrato, config }) {
  const pasta = garantirPasta('dados-nota-fiscal');
  const nomeArquivo = `dados-nota-fiscal-${pagamento.id}.pdf`;
  const caminho = path.join(pasta, nomeArquivo);

  const nomeEmpresa = config?.nomeEmpresa || 'Savannah Imóveis';
  const { mes, ano } = formatarMesAno(pagamento.referenteMes);
  const numeroContratoFmt = contrato ? formatarNumeroContrato(contrato) : '-';

  // O valor da nota é só o GANHO da imobiliária (comissão de administração), não o
  // valor cheio pago pelo inquilino - o aluguel em si pertence ao proprietário, não é
  // faturamento da imobiliária. Usa o percentual gravado no próprio pagamento (registrado
  // na hora da geração da parcela) e cai pro percentual do contrato se não tiver.
  const percentualComissao = pagamento.percentualImobiliaria !== null && pagamento.percentualImobiliaria !== undefined
    ? Number(pagamento.percentualImobiliaria)
    : Number(contrato?.percentualComissao || 0);
  const valorComissao = Number((Number(pagamento.valor) * (percentualComissao / 100)).toFixed(2));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    desenharCabecalhoEmpresa(doc, config);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#046439').text('DADOS PARA EMISSÃO DE NOTA FISCAL', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text('Documento de apoio - compila os dados cadastrados, não é uma nota fiscal emitida', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1.5);

    const yTopo = doc.y;
    const larguraColuna = 250;

    // Coluna esquerda: quem vai emitir a nota (o proprietário/locador)
    doc.font('Helvetica-Bold').fontSize(9).text('EMITENTE (Proprietário/Locador)', 45, yTopo, { width: larguraColuna });
    doc.font('Helvetica').fontSize(9);
    doc.text(proprietario?.nome || '-', 45, doc.y, { width: larguraColuna });
    if (proprietario?.cpfCnpj) doc.text(`CPF/CNPJ: ${proprietario.cpfCnpj}`, { width: larguraColuna });
    if (proprietario?.endereco) doc.text(proprietario.endereco, { width: larguraColuna });
    if (proprietario?.telefone) doc.text(`Tel: ${proprietario.telefone}`, { width: larguraColuna });
    if (proprietario?.email) doc.text(proprietario.email, { width: larguraColuna });

    // Coluna direita: destinatário do serviço (o inquilino)
    const xDireita = 45 + larguraColuna + 20;
    doc.font('Helvetica-Bold').fontSize(9).text('DESTINATÁRIO (Inquilino/Locatário)', xDireita, yTopo, { width: larguraColuna });
    doc.font('Helvetica').fontSize(9);
    doc.text(inquilino?.nome || '-', xDireita, doc.y, { width: larguraColuna });
    if (inquilino?.cpfCnpj) doc.text(`CPF/CNPJ: ${inquilino.cpfCnpj}`, xDireita, doc.y, { width: larguraColuna });
    if (inquilino?.enderecoAtual) doc.text(inquilino.enderecoAtual, xDireita, doc.y, { width: larguraColuna });
    if (inquilino?.telefone) doc.text(`Tel: ${inquilino.telefone}`, xDireita, doc.y, { width: larguraColuna });
    if (inquilino?.email) doc.text(inquilino.email, xDireita, doc.y, { width: larguraColuna });

    doc.x = 45;
    doc.y = Math.max(doc.y, yTopo + 95);
    doc.moveDown(0.8);

    // Dados do imóvel/contrato
    doc.font('Helvetica-Bold').fontSize(9).text('IMÓVEL / CONTRATO', 45, doc.y);
    doc.font('Helvetica').fontSize(9);
    doc.text(`${imovel?.tipo || 'Imóvel'} ${imovel?.nome ? `"${imovel.nome}"` : ''} - ${imovel?.endereco || '-'}${imovel?.cidade ? `, ${imovel.cidade}/${imovel.estado || ''}` : ''}`, { width: 500 });
    doc.text(`Contrato nº ${numeroContratoFmt}   |   Valor mensal do aluguel: ${formatarMoeda(contrato?.valorAluguel || pagamento.valor)}`, { width: 500 });
    doc.moveDown(0.8);

    // Dados do pagamento (base de cálculo da comissão - os encargos extras (itensExtras)
    // não entram aqui de propósito: são repasse/pass-through, não ganho da imobiliária.
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#046439').text('BASE DE CÁLCULO DA COMISSÃO', 45, doc.y);
    doc.fillColor('#000000');
    doc.moveDown(0.3);

    const linhasTabela = [
      { celulas: ['Aluguel recebido (base de cálculo)', mes ? `${mes}/${ano}` : pagamento.referenteMes, formatarMoeda(pagamento.valor)] },
      { celulas: [`Comissão da imobiliária (${percentualComissao}%)`, '-', formatarMoeda(valorComissao)] },
    ];

    const yTabela = desenharTabela(doc, {
      x: 45,
      y: doc.y,
      colunas: [
        { titulo: 'Descrição', largura: 300 },
        { titulo: 'Referência', largura: 100 },
        { titulo: 'Valor', largura: 100, align: 'right' },
      ],
      linhas: linhasTabela,
    });
    doc.y = yTabela + 10;

    doc.font('Helvetica').fontSize(8.5).fillColor('#666666').text(
      `Vencimento: ${formatarData(pagamento.dataVencimento)}   |   Pagamento: ${formatarData(pagamento.dataPagamento)}   |   `
      + `Forma de pagamento: ${pagamento.metodo}   |   Natureza sugerida: Comissão de administração/intermediação imobiliária`,
      45, doc.y, { width: 500 }
    );
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    const labelTotal = 'VALOR DA NOTA (comissão da imobiliária): ';
    const valorTotalTexto = formatarMoeda(valorComissao);
    doc.font('Helvetica-Bold').fontSize(12);
    const xInicial = doc.x;
    const yInicial = doc.y;
    const larguraLabel = doc.widthOfString(labelTotal);
    const larguraValor = doc.widthOfString(valorTotalTexto);
    const alturaLinha = doc.currentLineHeight();

    doc.save();
    doc.rect(xInicial + larguraLabel - 1, yInicial - 1, larguraValor + 4, alturaLinha + 2).fill('#FFF176');
    doc.restore();
    doc.fillColor('#000000').text(labelTotal + valorTotalTexto);

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(9).text(`${formatarDataExtensa(new Date())}.`);
    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(9.5).text(nomeEmpresa);
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text(
      'Este documento apenas compila os dados já cadastrados no sistema para facilitar a emissão da nota fiscal pelo '
      + 'proprietário ou pelo contador responsável. Não é uma nota fiscal válida e não substitui a emissão oficial junto '
      + 'à Receita Federal, à Sefaz ou à prefeitura do município do proprietário.',
      { width: 500 }
    );

    doc.end();

    stream.on('finish', () => resolve(`arquivos/dados-nota-fiscal/${nomeArquivo}`));
    stream.on('error', reject);
  });
}

// Desenha uma tabela simples com bordas: cabeçalho com fundo colorido + linhas de dados
function desenharTabela(doc, { x, y, colunas, linhas, corCabecalho = '#046439' }) {
  const alturaLinha = 22;
  const alturaCabecalho = 28;
  let yAtual = y;

  // Cabeçalho
  doc.save();
  doc.rect(x, yAtual, colunas.reduce((s, c) => s + c.largura, 0), alturaCabecalho).fill(corCabecalho);
  doc.restore();

  let xAtual = x;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
  colunas.forEach((col) => {
    doc.text(col.titulo, xAtual + 4, yAtual + 6, { width: col.largura - 8, align: col.align || 'left', lineGap: -1 });
    xAtual += col.largura;
  });
  yAtual += alturaCabecalho;

  // Linhas de dados
  doc.font('Helvetica').fontSize(9).fillColor('#000000');
  linhas.forEach((linha, indiceLinha) => {
    const corFundo = indiceLinha % 2 === 0 ? '#FFFFFF' : '#F7F5EF';
    doc.save();
    doc.rect(x, yAtual, colunas.reduce((s, c) => s + c.largura, 0), alturaLinha).fill(corFundo);
    doc.restore();

    xAtual = x;
    doc.fillColor(linha.negrito ? '#046439' : '#000000');
    doc.font(linha.negrito ? 'Helvetica-Bold' : 'Helvetica');
    linha.celulas.forEach((valorCelula, i) => {
      doc.text(valorCelula, xAtual + 4, yAtual + 7, { width: colunas[i].largura - 8, align: colunas[i].align || 'left' });
      xAtual += colunas[i].largura;
    });
    yAtual += alturaLinha;
  });

  // Bordas externas e entre colunas/linhas
  doc.strokeColor('#CCCCCC').lineWidth(0.5);
  const larguraTotal = colunas.reduce((s, c) => s + c.largura, 0);
  const alturaTotal = alturaCabecalho + alturaLinha * linhas.length;
  doc.rect(x, y, larguraTotal, alturaTotal).stroke();
  xAtual = x;
  colunas.forEach((col) => {
    xAtual += col.largura;
    doc.moveTo(xAtual, y).lineTo(xAtual, y + alturaTotal).stroke();
  });
  doc.moveTo(x, y + alturaCabecalho).lineTo(x + larguraTotal, y + alturaCabecalho).stroke();
  for (let i = 1; i <= linhas.length; i += 1) {
    const yLinha = y + alturaCabecalho + alturaLinha * i;
    doc.moveTo(x, yLinha).lineTo(x + larguraTotal, yLinha).stroke();
  }

  return yAtual;
}

function formatarMoedaOuVazio(valor) {
  return valor === null || valor === undefined ? '' : formatarMoeda(valor);
}

// Corta o texto (com reticências) para caber em uma linha só dentro da largura
// dada - usado nas tabelas de linha única (desenharTabela não quebra texto em
// múltiplas linhas, então uma descrição longa sem isso vazaria pra linha de baixo).
function truncarParaLargura(doc, texto, largura) {
  if (doc.widthOfString(texto) <= largura) return texto;
  let cortado = texto;
  while (cortado.length > 1 && doc.widthOfString(`${cortado}…`) > largura) {
    cortado = cortado.slice(0, -1);
  }
  return `${cortado}…`;
}

// Gera o PDF da declaração/demonstrativo anual de rendimentos, para o proprietário ou o inquilino
async function gerarDemonstrativoPdf({ tipo, dados, ano, config, observacao, textoNotasProprietario, textoNotasInquilino }) {
  const pasta = garantirPasta('demonstrativos');
  const nomeArquivo = `demonstrativo-${dados.numeroContrato.replace('/', '-')}-${ano}-${tipo}.pdf`;
  const caminho = path.join(pasta, nomeArquivo);
  const nomeEmpresa = config?.nomeEmpresa || 'Savannah Imóveis';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4', layout: 'portrait' });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    desenharCabecalhoEmpresa(doc, config);

    const titulo = tipo === 'proprietario'
      ? 'DECLARAÇÃO DE RENDIMENTOS DE ALUGUÉIS (PROPRIETÁRIO / LOCADOR)'
      : 'COMPROVANTE ANUAL DE PAGAMENTO DE ALUGUÉIS (INQUILINO / LOCATÁRIO)';

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#046439').text(titulo);
    doc.moveDown(0.6);

    // Faixa "EXERCÍCIO - ano" com destaque
    doc.font('Helvetica-BoldOblique').fontSize(10);
    const textoAno = `EXERCÍCIO - ${ano}`;
    const larguraAno = doc.widthOfString(textoAno);
    doc.save();
    doc.rect(doc.x - 2, doc.y - 1, larguraAno + 4, 14).fill('#FFF176');
    doc.restore();
    doc.fillColor('#000000').text(textoAno);
    doc.moveDown(0.8);

    doc.font('Helvetica').fontSize(10).fillColor('#000000');

    function linhaCampo(rotulo, valor) {
      doc.font('Helvetica-Bold').text(rotulo, { continued: true });
      doc.font('Helvetica').text(` ${valor}`);
    }

    const dataContratoTexto = dados.dataContrato ? formatarData(dados.dataContrato) : '-';
    doc.font('Helvetica-Bold').text('CONTRATO', { continued: true });
    doc.font('Helvetica').text('   ', { continued: true });
    doc.font('Helvetica-Bold').text('DATA:', { continued: true });
    doc.font('Helvetica').text(` ${dataContratoTexto}   `, { continued: true });
    doc.font('Helvetica-Bold').text('NR:', { continued: true });
    doc.font('Helvetica').text(` ${dados.numeroContrato}`);

    if (tipo === 'proprietario') {
      linhaCampo('Nome do Locador:', dados.nomeLocador);
      linhaCampo('CPF do Locador:', dados.cpfLocador);
      linhaCampo('Imóvel Locado:', dados.imovelLocado);
      linhaCampo('Locatário:', dados.locatario);
      linhaCampo('CPF do Locatário:', dados.cpfLocatario);
    } else {
      linhaCampo('Nome do Locatário:', dados.nomeLocatario);
      linhaCampo('CPF do Locatário:', dados.cpfLocatario);
      linhaCampo('Imóvel Locado:', dados.imovelLocado);
      linhaCampo('Locador Beneficiário:', dados.locador);
      linhaCampo('CPF/CNPJ do Locador:', dados.cpfLocador);
    }

    doc.moveDown(0.8);

    if (tipo === 'proprietario') {
      const colunas = [
        { titulo: 'Mês de Referência', largura: 100 },
        { titulo: 'Valor Bruto do Aluguel (R$)', largura: 100, align: 'right' },
        { titulo: 'Comissão Imobiliária (R$)', largura: 95, align: 'right' },
        { titulo: 'IPTU/Condomínio/Taxas R$', largura: 95, align: 'right' },
        { titulo: 'Valor Líquido Repassado (R$)', largura: 100, align: 'right' },
      ];

      const linhas = dados.linhas.map((l) => ({
        celulas: [
          l.mes,
          formatarMoedaOuVazio(l.bruto),
          formatarMoedaOuVazio(l.comissao),
          formatarMoedaOuVazio(l.deducoes),
          formatarMoedaOuVazio(l.liquido),
        ],
      }));

      linhas.push({
        negrito: true,
        celulas: [
          'TOTAL ANUAL',
          formatarMoeda(dados.totais.bruto),
          formatarMoeda(dados.totais.comissao),
          formatarMoeda(dados.totais.deducoes),
          formatarMoeda(dados.totais.liquido),
        ],
      });

      const xTabela = doc.x;
      const yFinal = desenharTabela(doc, { x: xTabela, y: doc.y, colunas, linhas });
      doc.x = xTabela;
      doc.y = yFinal + 10;

      doc.fontSize(8.5).font('Helvetica').text(
        `* Declaro que recebi os valores referente aluguéis do inquilino conforme acima informado pela Imobiliária ${nomeEmpresa}.`
      );
      if (observacao) {
        doc.moveDown(0.3);
        doc.font('Helvetica-BoldOblique');
        const larguraObs = doc.widthOfString(observacao);
        doc.save();
        doc.rect(doc.x - 2, doc.y - 1, Math.min(larguraObs + 4, 700), 12).fill('#FFF176');
        doc.restore();
        doc.fillColor('#000000').text(observacao);
        doc.font('Helvetica');
      }

      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#046439').text('Notas Importantes para o Imposto de Renda (Locador):');
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#333333');
      (textoNotasProprietario || DEFAULT_NOTAS_PROPRIETARIO).split('\n').forEach((linha) => doc.text(linha));
    } else {
      const colunas = [
        { titulo: 'Mês de Referência', largura: 100 },
        { titulo: 'Aluguel (R$)', largura: 95, align: 'right' },
        { titulo: 'Condomínio/Taxas (R$)', largura: 95, align: 'right' },
        { titulo: 'IPTU (R$)', largura: 95, align: 'right' },
        { titulo: 'Total Pago no Mês (R$)', largura: 100, align: 'right' },
      ];

      const linhas = dados.linhas.map((l) => ({
        celulas: [
          l.mes,
          formatarMoedaOuVazio(l.aluguel),
          formatarMoedaOuVazio(l.condominio),
          formatarMoedaOuVazio(l.iptu),
          formatarMoedaOuVazio(l.total),
        ],
      }));

      linhas.push({
        negrito: true,
        celulas: [
          'TOTAL ANUAL',
          formatarMoeda(dados.totais.aluguel),
          formatarMoeda(dados.totais.condominio),
          formatarMoeda(dados.totais.iptu),
          formatarMoeda(dados.totais.total),
        ],
      });

      const xTabela = doc.x;
      const yFinal = desenharTabela(doc, { x: xTabela, y: doc.y, colunas, linhas });
      doc.x = xTabela;
      doc.y = yFinal + 10;

      doc.fontSize(8.5).font('Helvetica').fillColor('#000000').text(
        `* Declaramos que os valores acima foram pagos por ${dados.nomeLocatario} referentes à locação do imóvel indicado, conforme controle da Imobiliária ${nomeEmpresa}.`
      );

      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#046439').text('Notas:');
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#333333');
      (textoNotasInquilino || DEFAULT_NOTAS_INQUILINO).split('\n').forEach((linha) => doc.text(linha));
    }

    doc.end();

    stream.on('finish', () => resolve(`arquivos/demonstrativos/${nomeArquivo}`));
    stream.on('error', reject);
  });
}

// Gera o demonstrativo mensal pro Contador: isola a comissão da imobiliária (base de
// cálculo do ISS) de cada pagamento recebido no mês, com contrato/data/inquilino/proprietário.
// Segue o mesmo padrão visual dos outros demonstrativos (cabeçalho, faixa de período, tabela).
async function gerarDemonstrativoContadorPdf({ mes, linhas, totalComissao, config, textoNota }) {
  const pasta = garantirPasta('demonstrativos');
  const nomeArquivo = `demonstrativo-contador-${mes}.pdf`;
  const caminho = path.join(pasta, nomeArquivo);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4', layout: 'portrait' });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    desenharCabecalhoEmpresa(doc, config);

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#046439')
      .text('RELATÓRIO MENSAL DE COMISSÕES (BASE DE CÁLCULO ISS)');
    doc.moveDown(0.6);

    // Faixa "PERÍODO - mês/ano" com destaque, mesmo padrão do "EXERCÍCIO - ano"
    const [ano, mesNum] = mes.split('-');
    const textoPeriodo = `PERÍODO - ${MESES[Number(mesNum) - 1]}/${ano}`;
    doc.font('Helvetica-BoldOblique').fontSize(10);
    const larguraPeriodo = doc.widthOfString(textoPeriodo);
    doc.save();
    doc.rect(doc.x - 2, doc.y - 1, larguraPeriodo + 4, 14).fill('#FFF176');
    doc.restore();
    doc.fillColor('#000000').text(textoPeriodo);
    doc.moveDown(0.8);

    doc.font('Helvetica').fontSize(9.5).fillColor('#000000').text(
      `${config?.nomeEmpresa || 'Savannah Imóveis'}${config?.cnpj ? ` - CNPJ ${config.cnpj}` : ''}`
    );
    doc.moveDown(0.8);

    const colunas = [
      { titulo: 'Nº Contrato', largura: 60 },
      { titulo: 'Data Pgto', largura: 55 },
      { titulo: 'Inquilino', largura: 90 },
      { titulo: 'Proprietário', largura: 90 },
      { titulo: 'CPF/CNPJ Prop.', largura: 75 },
      { titulo: 'Valor Aluguel', largura: 65, align: 'right' },
      { titulo: '% Com.', largura: 40, align: 'right' },
      { titulo: 'Comissão (ISS)', largura: 70, align: 'right' },
    ];

    const linhasTabela = linhas.map((l) => ({
      celulas: [
        l.numeroContrato, l.dataPagamento, l.inquilino, l.proprietarioNome, l.proprietarioCpf,
        formatarMoeda(l.valorAluguel), l.percentual ? `${l.percentual}%` : '-', formatarMoeda(l.valorComissao),
      ],
    }));

    linhasTabela.push({
      negrito: true,
      celulas: ['', '', '', '', '', '', 'TOTAL', formatarMoeda(totalComissao)],
    });

    const xTabela = doc.x;
    const yFinal = desenharTabela(doc, { x: xTabela, y: doc.y, colunas, linhas: linhasTabela });
    doc.x = xTabela;
    doc.y = yFinal + 10;

    doc.fontSize(8.5).font('Helvetica').fillColor('#000000').text(textoNota || DEFAULT_NOTA_CONTADOR);

    doc.end();

    stream.on('finish', () => resolve(`arquivos/demonstrativos/${nomeArquivo}`));
    stream.on('error', reject);
  });
}

module.exports = {
  gerarContratoPdf, gerarReciboPdf, gerarReciboRepassePdf, gerarDemonstrativoPdf, gerarDemonstrativoContadorPdf, gerarNotaFiscalPdf, gerarDadosNotaFiscalPdf, PASTA_ARQUIVOS,
};
