const express = require('express');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');
const { paginar } = require('../utils/paginacao');
const { gerarPlanilha, enviarPlanilha } = require('../utils/relatorio');
const { validarCpfCnpj, validarChaveAcesso } = require('../utils/validacoes');
const { uploadXmlNota } = require('../middleware/upload');
const { gerarNotaFiscalPdf, PASTA_ARQUIVOS } = require('../services/pdf.service');
const { obterLinkPublicoOuFallback } = require('../services/ftp.service');
const { extrairDadosNfe } = require('../utils/notaFiscalXml');
const { enviarDocumento } = require('../services/whatsapp.service');
const { montarMensagemPersonalizada } = require('../utils/mensagemWhatsapp');
const path = require('path');

const router = express.Router();

// Pública de propósito: precisa ser acessível pelo navegador via link direto
// (visualizar/imprimir) e pela Meta (WhatsApp Cloud API) para buscar o arquivo
// ao enviar a mensagem - mesmo padrão usado em /api/pagamentos/:id/recibo.
router.get('/notas-fiscais/:notaId/pdf', async (req, res) => {
  try {
    const nota = await prisma.notaFiscal.findUnique({
      where: { id: Number(req.params.notaId) },
      include: { proprietario: true },
    });
    if (!nota) return res.status(404).json({ erro: 'Nota fiscal não encontrada.' });

    let caminhoRelativo = nota.pdfPath;
    if (!caminhoRelativo) {
      const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
        || { nomeEmpresa: 'Savannah Imóveis', creci: null };
      caminhoRelativo = await gerarNotaFiscalPdf({ nota, proprietario: nota.proprietario, config });
      await prisma.notaFiscal.update({ where: { id: nota.id }, data: { pdfPath: caminhoRelativo } });
    }

    res.sendFile(path.join(PASTA_ARQUIVOS, '..', caminhoRelativo));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar/exibir o PDF da nota fiscal.' });
  }
});

router.use(autenticar);
router.use(verificarPermissao('proprietarios'));

router.get('/', async (req, res) => {
  const { busca, pagina } = req.query;

  const proprietarios = await prisma.proprietario.findMany({
    where: busca
      ? {
          OR: [
            { nome: { contains: busca } },
            { cpfCnpj: { contains: busca } },
          ],
        }
      : undefined,
    include: { imoveis: true },
    orderBy: { nome: 'asc' },
  });

  res.json(paginar(proprietarios, pagina));
});

// GET /api/proprietarios/relatorio?busca= - baixa um XLSX com os proprietários (respeita o filtro de busca atual)
router.get('/relatorio', async (req, res) => {
  try {
    const { busca } = req.query;
    const proprietarios = await prisma.proprietario.findMany({
      where: busca
        ? {
            OR: [
              { nome: { contains: busca } },
              { cpfCnpj: { contains: busca } },
            ],
          }
        : undefined,
      include: { imoveis: true },
      orderBy: { nome: 'asc' },
    });

    const linhas = proprietarios.map((p) => ({
      Nome: p.nome,
      'CPF/CNPJ': p.cpfCnpj || '',
      Telefone: p.telefone || '',
      Email: p.email || '',
      Endereço: [p.endereco, p.numero].filter(Boolean).join(', '),
      Bairro: p.bairro || '',
      Cidade: p.cidade || '',
      UF: p.estado || '',
      'Chave Pix': p.chavePix || '',
      Banco: p.bancoNome || '',
      'Qtd. imóveis': p.imoveis.length,
      'Dia de repasse': p.diaRepasse || '',
    }));

    const buffer = gerarPlanilha(linhas, 'Proprietários');
    enviarPlanilha(res, buffer, `proprietarios-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório.' });
  }
});

// GET /api/proprietarios/:id/repasses - histórico e pendências de repasse deste proprietário
router.get('/:id/repasses', async (req, res) => {
  const proprietarioId = Number(req.params.id);

  const imoveis = await prisma.imovel.findMany({
    where: { proprietarioId },
    include: {
      contratos: {
        include: {
          inquilino: true,
          pagamentos: { orderBy: { dataVencimento: 'desc' } },
        },
      },
    },
  });

  const pagamentos = imoveis.flatMap((im) =>
    im.contratos.flatMap((c) =>
      c.pagamentos.map((p) => ({ ...p, imovel: { id: im.id, nome: im.nome, endereco: im.endereco }, inquilino: c.inquilino }))
    )
  );

  const pendentes = pagamentos.filter((p) => p.status === 'PAGO' && !p.repassado);
  const repassados = pagamentos.filter((p) => p.repassado);

  res.json({
    totalPendente: pendentes.reduce((soma, p) => soma + Number(p.valorRepasse || 0), 0),
    totalRepassado: repassados.reduce((soma, p) => soma + Number(p.valorRepasse || 0), 0),
    pendentes,
    repassados,
  });
});

router.post('/', async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ erro: 'O nome do proprietário é obrigatório.' });

    if (req.body.cpfCnpj && !validarCpfCnpj(req.body.cpfCnpj)) {
      return res.status(400).json({ erro: 'CPF/CNPJ inválido. Confira os dígitos informados.' });
    }

    const dados = { ...req.body };
    if (dados.diaRepasse !== undefined) {
      dados.diaRepasse = dados.diaRepasse === '' ? null : Number(dados.diaRepasse);
    }

    const proprietario = await prisma.proprietario.create({ data: dados });
    res.status(201).json(proprietario);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar proprietário.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (req.body.cpfCnpj && !validarCpfCnpj(req.body.cpfCnpj)) {
      return res.status(400).json({ erro: 'CPF/CNPJ inválido. Confira os dígitos informados.' });
    }

    const dados = { ...req.body };
    if (dados.diaRepasse !== undefined) {
      dados.diaRepasse = dados.diaRepasse === '' ? null : Number(dados.diaRepasse);
    }

    const proprietario = await prisma.proprietario.update({
      where: { id: Number(req.params.id) },
      data: dados,
    });
    res.json(proprietario);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar proprietário.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.proprietario.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir proprietário. Verifique se ele não está vinculado a imóveis.' });
  }
});

// GET /api/proprietarios/notas-fiscais/:notaId/xml - baixa o XML original enviado (quando houver)
router.get('/notas-fiscais/:notaId/xml', async (req, res) => {
  try {
    const nota = await prisma.notaFiscal.findUnique({ where: { id: Number(req.params.notaId) } });
    if (!nota) return res.status(404).json({ erro: 'Nota fiscal não encontrada.' });
    if (!nota.xmlConteudo) return res.status(404).json({ erro: 'Esta nota não tem um XML cadastrado.' });

    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="${nota.xmlNomeArquivo || `nota-fiscal-${nota.id}.xml`}"`);
    res.send(nota.xmlConteudo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao baixar o XML da nota fiscal.' });
  }
});

// GET /api/proprietarios/:id/notas-fiscais - lista as notas fiscais deste proprietário
router.get('/:id/notas-fiscais', async (req, res) => {
  const notas = await prisma.notaFiscal.findMany({
    where: { proprietarioId: Number(req.params.id) },
    orderBy: { criadoEm: 'desc' },
  });
  // Não devolve o XML nem o JSON de detalhes inteiros na listagem (podem ser grandes) - só indicadores de presença
  res.json(notas.map(({ xmlConteudo, detalhesJson, ...resto }) => ({
    ...resto, temXml: Boolean(xmlConteudo), temDetalhes: Boolean(detalhesJson),
  })));
});

// POST /api/proprietarios/:id/notas-fiscais - cadastra uma nota fiscal
// Aceita multipart/form-data: campo "arquivoXml" (opcional) + campos manuais.
// Se um XML for enviado, os dados extraídos dele têm prioridade; os campos
// manuais preenchem o que não for encontrado ou servem para complementar/corrigir.
router.post('/:id/notas-fiscais', uploadXmlNota.single('arquivoXml'), async (req, res) => {
  try {
    const proprietarioId = Number(req.params.id);
    const proprietario = await prisma.proprietario.findUnique({ where: { id: proprietarioId } });
    if (!proprietario) return res.status(404).json({ erro: 'Proprietário não encontrado.' });

    let extraido = {};
    let xmlConteudo = null;
    let xmlNomeArquivo = null;

    if (req.file) {
      xmlConteudo = req.file.buffer.toString('utf-8');
      xmlNomeArquivo = req.file.originalname;
      try {
        extraido = extrairDadosNfe(xmlConteudo);
      } catch (err) {
        return res.status(400).json({ erro: err.message || 'Não foi possível ler o XML enviado.' });
      }
    }

    const corpo = req.body || {};
    const chaveAcesso = corpo.chaveAcesso || extraido.chaveAcesso || null;

    if (chaveAcesso && !validarChaveAcesso(chaveAcesso)) {
      return res.status(400).json({ erro: 'Chave de acesso inválida. Confira os 44 dígitos informados.' });
    }
    if (!chaveAcesso && !xmlConteudo && !corpo.numero) {
      return res.status(400).json({ erro: 'Informe o XML da nota, a chave de acesso ou ao menos o número da nota.' });
    }

    const nota = await prisma.notaFiscal.create({
      data: {
        proprietarioId,
        tipo: corpo.tipo || extraido.tipo || 'NFE',
        numero: corpo.numero || extraido.numero || null,
        serie: corpo.serie || extraido.serie || null,
        chaveAcesso: chaveAcesso ? chaveAcesso.replace(/\D/g, '') : null,
        dataEmissao: corpo.dataEmissao ? new Date(corpo.dataEmissao) : (extraido.dataEmissao || null),
        valorTotal: corpo.valorTotal ? Number(corpo.valorTotal) : (extraido.valorTotal ?? null),
        emitenteNome: corpo.emitenteNome || extraido.emitenteNome || null,
        emitenteCnpj: corpo.emitenteCnpj || extraido.emitenteCnpj || null,
        discriminacao: corpo.discriminacao || extraido.discriminacao || null,
        observacoes: corpo.observacoes || null,
        xmlConteudo,
        xmlNomeArquivo,
        detalhesJson: extraido.detalhes ? JSON.stringify(extraido.detalhes) : null,
      },
    });

    const { xmlConteudo: _omitido, ...notaSemXml } = nota;
    res.status(201).json({ ...notaSemXml, temXml: Boolean(xmlConteudo) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar a nota fiscal.' });
  }
});

// POST /api/proprietarios/notas-fiscais/:notaId/enviar-whatsapp - envia o PDF da nota ao proprietário
router.post('/notas-fiscais/:notaId/enviar-whatsapp', async (req, res) => {
  try {
    const nota = await prisma.notaFiscal.findUnique({
      where: { id: Number(req.params.notaId) },
      include: { proprietario: true },
    });
    if (!nota) return res.status(404).json({ erro: 'Nota fiscal não encontrada.' });
    if (!nota.proprietario.telefone) {
      return res.status(400).json({ erro: 'Este proprietário não possui telefone cadastrado.' });
    }

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis', creci: null };

    let caminhoRelativo = nota.pdfPath;
    if (!caminhoRelativo) {
      caminhoRelativo = await gerarNotaFiscalPdf({ nota, proprietario: nota.proprietario, config });
      await prisma.notaFiscal.update({ where: { id: nota.id }, data: { pdfPath: caminhoRelativo } });
    }

    const urlPublica = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
    const urlLocal = `${urlPublica}/api/proprietarios/notas-fiscais/${nota.id}/pdf`;
    const nomeArquivoRemoto = `nota-fiscal-${nota.id}.pdf`;
    const caminhoAbsolutoLocal = path.join(PASTA_ARQUIVOS, '..', caminhoRelativo);
    const { url: urlDocumento } = await obterLinkPublicoOuFallback(caminhoAbsolutoLocal, nomeArquivoRemoto, urlLocal);

    const mensagem = await montarMensagemPersonalizada('NOTA_FISCAL', {
      NOME: nota.proprietario.nome,
      NOME_EMPRESA: config.nomeEmpresa,
      NUMERO: nota.numero || '-',
      VALOR: nota.valorTotal ? Number(nota.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-',
      LINK: urlDocumento,
    });

    const resultado = await enviarDocumento({
      telefone: nota.proprietario.telefone,
      urlDocumento,
      nomeArquivo: `nota-fiscal-${nota.id}.pdf`,
      mensagem,
    });

    res.json({ enviado: true, resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar a nota fiscal pelo WhatsApp.' });
  }
});

// DELETE /api/proprietarios/notas-fiscais/:notaId - remove o cadastro da nota fiscal
router.delete('/notas-fiscais/:notaId', async (req, res) => {
  try {
    await prisma.notaFiscal.delete({ where: { id: Number(req.params.notaId) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir a nota fiscal.' });
  }
});

module.exports = router;
