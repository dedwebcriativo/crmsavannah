const express = require('express');
const path = require('path');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');
const { gerarDemonstrativoPdf, gerarDemonstrativoContadorPdf, PASTA_ARQUIVOS } = require('../services/pdf.service');
const { obterLinkPublicoOuFallback } = require('../services/ftp.service');
const { enviarDocumento } = require('../services/whatsapp.service');
const { montarMensagemPersonalizada } = require('../utils/mensagemWhatsapp');
const {
  montarDemonstrativoProprietario,
  montarDemonstrativoInquilino,
  numeroContrato,
} = require('../utils/demonstrativo');

const router = express.Router();

// Pública de propósito: acessível pelo navegador via link direto e pela Meta (WhatsApp Cloud API)
router.get('/:contratoId/:ano/:tipo/pdf', async (req, res) => {
  const { contratoId, ano, tipo } = req.params;
  const contrato = await prisma.contrato.findUnique({ where: { id: Number(contratoId) } });
  if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

  const numero = numeroContrato(contrato).replace('/', '-');
  const nomeArquivo = `demonstrativo-${numero}-${ano}-${tipo}.pdf`;
  const caminho = path.join(PASTA_ARQUIVOS, 'demonstrativos', nomeArquivo);

  res.sendFile(caminho, (err) => {
    if (err) res.status(404).json({ erro: 'Demonstrativo ainda não foi gerado para este contrato/ano.' });
  });
});

// Pública de propósito: acessível pelo navegador via link direto e pela Meta (WhatsApp Cloud API)
router.get('/contador/:mes/pdf', async (req, res) => {
  const { mes } = req.params;
  const caminho = path.join(PASTA_ARQUIVOS, 'demonstrativos', `demonstrativo-contador-${mes}.pdf`);
  res.sendFile(caminho, (err) => {
    if (err) res.status(404).json({ erro: 'Demonstrativo do contador ainda não foi gerado para este mês.' });
  });
});

router.use(autenticar);
router.use(verificarPermissao('demonstrativos'));

// Busca os pagamentos do contrato no ano e monta a estrutura do demonstrativo (usado no preview e no PDF)
async function montarDados(contratoId, ano, tipo) {
  const contrato = await prisma.contrato.findUnique({
    where: { id: Number(contratoId) },
    include: { inquilino: true, imovel: { include: { proprietario: true } } },
  });

  if (!contrato) return null;

  const pagamentos = await prisma.pagamento.findMany({
    where: {
      contratoId: Number(contratoId),
      tipo: 'ALUGUEL',
      referenteMes: { startsWith: String(ano) },
    },
  });

  return tipo === 'proprietario'
    ? montarDemonstrativoProprietario({ contrato, pagamentos, ano })
    : montarDemonstrativoInquilino({ contrato, pagamentos, ano });
}

// GET /api/demonstrativos/preview?contratoId=&ano=&tipo=proprietario|inquilino
router.get('/preview', async (req, res) => {
  try {
    const { contratoId, ano, tipo } = req.query;
    if (!contratoId || !ano || !tipo) {
      return res.status(400).json({ erro: 'Informe contratoId, ano e tipo.' });
    }

    const dados = await montarDados(contratoId, ano, tipo);
    if (!dados) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    res.json(dados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao montar o demonstrativo.' });
  }
});

// POST /api/demonstrativos/gerar-pdf { contratoId, ano, tipo, observacao }
router.post('/gerar-pdf', async (req, res) => {
  try {
    const { contratoId, ano, tipo, observacao } = req.body;
    if (!contratoId || !ano || !tipo) {
      return res.status(400).json({ erro: 'Informe contratoId, ano e tipo.' });
    }

    const dados = await montarDados(contratoId, ano, tipo);
    if (!dados) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const tipoTexto = tipo === 'proprietario' ? 'DEMONSTRATIVO_PROPRIETARIO_NOTAS' : 'DEMONSTRATIVO_INQUILINO_NOTAS';
    const modeloTexto = await prisma.modeloTextoPdf.findUnique({ where: { tipo: tipoTexto } });
    const textoNotasProprietario = tipo === 'proprietario' ? modeloTexto?.conteudo : undefined;
    const textoNotasInquilino = tipo === 'inquilino' ? modeloTexto?.conteudo : undefined;

    const caminho = await gerarDemonstrativoPdf({ tipo, dados, ano, config, observacao, textoNotasProprietario, textoNotasInquilino });

    res.json({ caminho, dados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o PDF do demonstrativo.' });
  }
});

// POST /api/demonstrativos/enviar-whatsapp { contratoId, ano, tipo }
router.post('/enviar-whatsapp', async (req, res) => {
  try {
    const { contratoId, ano, tipo } = req.body;
    const contrato = await prisma.contrato.findUnique({
      where: { id: Number(contratoId) },
      include: { inquilino: true, imovel: { include: { proprietario: true } } },
    });
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    const destinatario = tipo === 'proprietario' ? contrato.imovel.proprietario : contrato.inquilino;
    if (!destinatario || !destinatario.telefone) {
      return res.status(400).json({ erro: 'Este destinatário não tem telefone cadastrado.' });
    }

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const numero = numeroContrato(contrato).replace('/', '-');
    const urlPublica = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
    const urlLocal = `${urlPublica}/api/demonstrativos/${contratoId}/${ano}/${tipo}/pdf`;
    const nomeArquivoRemoto = `demonstrativo-${numero}-${ano}-${tipo}.pdf`;
    const caminhoAbsolutoLocal = path.join(PASTA_ARQUIVOS, 'demonstrativos', nomeArquivoRemoto);
    const { url: urlDocumento } = await obterLinkPublicoOuFallback(caminhoAbsolutoLocal, nomeArquivoRemoto, urlLocal);

    const mensagem = await montarMensagemPersonalizada('DEMONSTRATIVO', {
      NOME: destinatario.nome,
      NOME_EMPRESA: config.nomeEmpresa,
      ANO: ano,
      LINK: urlDocumento,
    });

    const resultado = await enviarDocumento({
      telefone: destinatario.telefone,
      urlDocumento,
      nomeArquivo: `demonstrativo-${numero}-${ano}.pdf`,
      mensagem,
    });

    res.json({ enviado: true, resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar o demonstrativo pelo WhatsApp.' });
  }
});

// POST /api/demonstrativos/enviar-whatsapp-contador { contratoId, ano, tipo, contadorId }
router.post('/enviar-whatsapp-contador', async (req, res) => {
  try {
    const { contratoId, ano, tipo, contadorId } = req.body;
    if (!contadorId) return res.status(400).json({ erro: 'Selecione o contador.' });

    const contrato = await prisma.contrato.findUnique({
      where: { id: Number(contratoId) },
      include: { inquilino: true, imovel: { include: { proprietario: true } } },
    });
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    const contador = await prisma.contador.findUnique({ where: { id: Number(contadorId) } });
    if (!contador || !contador.telefone) {
      return res.status(400).json({ erro: 'Contador não encontrado ou sem telefone cadastrado.' });
    }

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const numero = numeroContrato(contrato).replace('/', '-');
    const urlPublica = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
    const urlLocal = `${urlPublica}/api/demonstrativos/${contratoId}/${ano}/${tipo}/pdf`;
    const nomeArquivoRemoto = `demonstrativo-${numero}-${ano}-${tipo}.pdf`;
    const caminhoAbsolutoLocal = path.join(PASTA_ARQUIVOS, 'demonstrativos', nomeArquivoRemoto);
    const { url: urlDocumento } = await obterLinkPublicoOuFallback(caminhoAbsolutoLocal, nomeArquivoRemoto, urlLocal);

    const nomePessoa = tipo === 'proprietario' ? contrato.imovel.proprietario?.nome : contrato.inquilino.nome;
    const mensagem = await montarMensagemPersonalizada('DEMONSTRATIVO_CONTADOR', {
      NOME: contador.nome,
      NOME_EMPRESA: config.nomeEmpresa,
      ANO: ano,
      NOME_CLIENTE: nomePessoa,
      NUMERO: numeroContrato(contrato),
      LINK: urlDocumento,
    });

    const resultado = await enviarDocumento({
      telefone: contador.telefone,
      urlDocumento,
      nomeArquivo: `demonstrativo-${numero}-${ano}.pdf`,
      mensagem,
    });

    res.json({ enviado: true, resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar o demonstrativo para o contador.' });
  }
});

// Monta os dados do relatório mensal de comissões (ISS) pro Contador - mesma lógica usada
// no export em XLSX de Pagamentos, reaproveitada aqui pro PDF no padrão dos demonstrativos.
async function montarDadosIss(mes) {
  const pagamentos = await prisma.pagamento.findMany({
    where: { status: 'PAGO', referenteMes: mes },
    include: { inquilino: true, contrato: { include: { imovel: { include: { proprietario: true } } } } },
    orderBy: { dataPagamento: 'asc' },
  });

  const linhas = pagamentos.map((p) => {
    const percentual = p.percentualImobiliaria !== null && p.percentualImobiliaria !== undefined ? Number(p.percentualImobiliaria) : 0;
    const valorComissao = Number((Number(p.valor) * (percentual / 100)).toFixed(2));
    const proprietario = p.contrato?.imovel?.proprietario || null;

    return {
      numeroContrato: p.contrato ? numeroContrato(p.contrato) : '-',
      dataPagamento: p.dataPagamento ? new Date(p.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-',
      inquilino: p.inquilino.nome,
      proprietarioNome: proprietario?.nome || '-',
      proprietarioCpf: proprietario?.cpfCnpj || '-',
      valorAluguel: Number(p.valor),
      percentual,
      valorComissao,
    };
  });

  const totalComissao = linhas.reduce((soma, l) => soma + l.valorComissao, 0);

  return { linhas, totalComissao };
}

// GET /api/demonstrativos/contador/preview?mes=AAAA-MM
router.get('/contador/preview', async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ erro: 'Informe o mês no formato AAAA-MM.' });
    const dados = await montarDadosIss(mes);
    res.json(dados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao montar o relatório.' });
  }
});

// POST /api/demonstrativos/contador/gerar-pdf { mes }
router.post('/contador/gerar-pdf', async (req, res) => {
  try {
    const { mes } = req.body;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ erro: 'Informe o mês no formato AAAA-MM.' });

    const dados = await montarDadosIss(mes);
    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } })) || { nomeEmpresa: 'Savannah Imóveis' };
    const modeloTexto = await prisma.modeloTextoPdf.findUnique({ where: { tipo: 'DEMONSTRATIVO_CONTADOR_NOTA' } });
    const caminho = await gerarDemonstrativoContadorPdf({ mes, linhas: dados.linhas, totalComissao: dados.totalComissao, config, textoNota: modeloTexto?.conteudo });

    res.json({ caminho, dados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o PDF do relatório.' });
  }
});

// POST /api/demonstrativos/contador/enviar-whatsapp { mes, contadorId }
router.post('/contador/enviar-whatsapp', async (req, res) => {
  try {
    const { mes, contadorId } = req.body;
    if (!contadorId) return res.status(400).json({ erro: 'Selecione o contador.' });
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ erro: 'Informe o mês no formato AAAA-MM.' });

    const contador = await prisma.contador.findUnique({ where: { id: Number(contadorId) } });
    if (!contador || !contador.telefone) {
      return res.status(400).json({ erro: 'Contador não encontrado ou sem telefone cadastrado.' });
    }

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } })) || { nomeEmpresa: 'Savannah Imóveis' };

    const urlPublica = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
    const urlLocal = `${urlPublica}/api/demonstrativos/contador/${mes}/pdf`;
    const nomeArquivoRemoto = `demonstrativo-contador-${mes}.pdf`;
    const caminhoAbsolutoLocal = path.join(PASTA_ARQUIVOS, 'demonstrativos', nomeArquivoRemoto);
    const { url: urlDocumento } = await obterLinkPublicoOuFallback(caminhoAbsolutoLocal, nomeArquivoRemoto, urlLocal);

    const [ano, mesNum] = mes.split('-');
    const NOMES_MESES = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];
    const mesFmt = `${NOMES_MESES[Number(mesNum) - 1]}/${ano}`;

    const mensagem = await montarMensagemPersonalizada('DEMONSTRATIVO_CONTADOR', {
      NOME: contador.nome,
      NOME_EMPRESA: config.nomeEmpresa,
      ANO: mesFmt,
      NOME_CLIENTE: 'todos os contratos do mês',
      NUMERO: '-',
      LINK: urlDocumento,
    });

    const resultado = await enviarDocumento({
      telefone: contador.telefone,
      urlDocumento,
      nomeArquivo: nomeArquivoRemoto,
      mensagem,
    });

    res.json({ enviado: true, resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar o relatório para o contador.' });
  }
});

module.exports = router;
