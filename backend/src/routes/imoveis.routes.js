const express = require('express');
const path = require('path');
const fs = require('fs');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');
const { uploadFotoImovel, PASTA_FOTOS } = require('../middleware/upload');
const { paginar } = require('../utils/paginacao');
const { criarNotificacao } = require('../utils/notificacoes');
const { gerarPlanilha, enviarPlanilha, formatarMoedaRelatorio } = require('../utils/relatorio');

const router = express.Router();
router.use(autenticar);
router.use(verificarPermissao('imoveis'));

// Monta o objeto de dados do imóvel a partir do corpo da requisição (multipart/form-data)
function montarDados(body) {
  const dados = {
    nome: body.nome || null,
    endereco: body.endereco,
    numero: body.numero || null,
    complemento: body.complemento || null,
    bairro: body.bairro || null,
    cidade: body.cidade,
    estado: body.estado,
    cep: body.cep,
    tipo: body.tipo,
    descricao: body.descricao !== undefined ? (body.descricao || null) : undefined,
    valorAluguel: body.valorAluguel ? Number(body.valorAluguel) : undefined,
    valorIptu: body.valorIptu === '' ? null : (body.valorIptu !== undefined ? Number(body.valorIptu) : undefined),
    status: body.status || undefined,
    dataVistoria: body.dataVistoria ? new Date(body.dataVistoria) : (body.dataVistoria === '' ? null : undefined),
    proprietarioId: body.proprietarioId ? Number(body.proprietarioId) : null,
    inquilinoId: body.inquilinoId ? Number(body.inquilinoId) : null,
  };

  // Remove chaves undefined para não sobrescrever campos não enviados na edição
  Object.keys(dados).forEach((chave) => dados[chave] === undefined && delete dados[chave]);

  return dados;
}

// GET /api/imoveis?filtro=todos|disponivel|alugado|vagando&busca=&diasVagando=30&pagina=1
router.get('/', async (req, res) => {
  const { filtro, busca, diasVagando, pagina } = req.query;
  const janelaDias = Number(diasVagando) > 0 ? Number(diasVagando) : 30;

  const where = {
    ...(filtro === 'disponivel' ? { status: 'DISPONIVEL' } : {}),
    ...(filtro === 'alugado' || filtro === 'vagando' ? { status: 'ALUGADO' } : {}),
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca } },
            { endereco: { contains: busca } },
            { cidade: { contains: busca } },
          ],
        }
      : {}),
  };

  const imoveis = await prisma.imovel.findMany({
    where,
    include: {
      inquilino: true,
      proprietario: true,
      contratos: { orderBy: { dataInicio: 'desc' }, take: 1 },
    },
    orderBy: { criadoEm: 'desc' },
  });

  const hoje = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + janelaDias);

  // Calcula, para cada imóvel alugado, quantos dias faltam para o fim do contrato vigente
  let resultado = imoveis.map((im) => {
    const contratoAtivo = im.contratos[0] || null;
    let diasParaVencer = null;
    if (contratoAtivo?.dataFim) {
      diasParaVencer = Math.ceil((new Date(contratoAtivo.dataFim).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    }
    const { contratos, ...resto } = im;
    return { ...resto, diasParaVencer };
  });

  if (filtro === 'vagando') {
    resultado = resultado.filter(
      (im) => im.diasParaVencer !== null && im.diasParaVencer >= 0 && im.diasParaVencer <= janelaDias
    );
  }

  res.json(paginar(resultado, pagina));
});

// GET /api/imoveis/relatorio?filtro=&busca= - baixa um XLSX com os imóveis (respeita o filtro/busca atual)
router.get('/relatorio', async (req, res) => {
  try {
    const { filtro, busca } = req.query;
    const where = {
      ...(filtro === 'disponivel' ? { status: 'DISPONIVEL' } : {}),
      ...(filtro === 'alugado' || filtro === 'vagando' ? { status: 'ALUGADO' } : {}),
      ...(busca
        ? { OR: [{ nome: { contains: busca } }, { endereco: { contains: busca } }, { cidade: { contains: busca } }] }
        : {}),
    };

    const imoveis = await prisma.imovel.findMany({
      where,
      include: { inquilino: true, proprietario: true },
      orderBy: { nome: 'asc' },
    });

    const LABEL_STATUS = { DISPONIVEL: 'Disponível', ALUGADO: 'Alugado' };
    const linhas = imoveis.map((im) => ({
      Nome: im.nome || '',
      Endereço: [im.endereco, im.numero, im.complemento].filter(Boolean).join(', '),
      Bairro: im.bairro || '',
      Cidade: im.cidade,
      UF: im.estado,
      CEP: im.cep,
      Tipo: im.tipo,
      Status: LABEL_STATUS[im.status] || im.status,
      'Valor do aluguel': im.valorAluguel ? formatarMoedaRelatorio(im.valorAluguel) : '',
      Proprietário: im.proprietario?.nome || '',
      Inquilino: im.inquilino?.nome || '',
    }));

    const buffer = gerarPlanilha(linhas, 'Imóveis');
    enviarPlanilha(res, buffer, `imoveis-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório.' });
  }
});

router.get('/:id', async (req, res) => {
  const imovel = await prisma.imovel.findUnique({
    where: { id: Number(req.params.id) },
    include: { inquilino: true, proprietario: true, contratos: true },
  });

  if (!imovel) return res.status(404).json({ erro: 'Imóvel não encontrado.' });
  res.json(imovel);
});

router.post('/', uploadFotoImovel.single('foto'), async (req, res) => {
  try {
    const { endereco, cidade, estado, cep, tipo, valorAluguel } = req.body;

    if (!endereco || !cidade || !estado || !cep || !tipo || !valorAluguel) {
      return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios do imóvel.' });
    }

    const dados = montarDados(req.body);
    if (!dados.status) dados.status = 'DISPONIVEL';
    if (req.file) dados.foto = `arquivos/imoveis/${req.file.filename}`;

    const imovel = await prisma.imovel.create({ data: dados });

    res.status(201).json(imovel);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao cadastrar imóvel.' });
  }
});

router.put('/:id', uploadFotoImovel.single('foto'), async (req, res) => {
  try {
    const dados = montarDados(req.body);
    if (req.file) dados.foto = `arquivos/imoveis/${req.file.filename}`;

    const anterior = await prisma.imovel.findUnique({ where: { id: Number(req.params.id) } });

    const imovel = await prisma.imovel.update({
      where: { id: Number(req.params.id) },
      data: dados,
    });

    if (dados.status && anterior && anterior.status !== imovel.status) {
      const LABEL_STATUS = { DISPONIVEL: 'Disponível', ALUGADO: 'Alugado', PRESTES_A_VAGAR: 'Prestes a vagar' };
      await criarNotificacao({
        tipo: 'IMOVEL_STATUS',
        titulo: imovel.status === 'PRESTES_A_VAGAR' ? 'Imóvel prestes a vagar' : 'Imóvel mudou de status',
        mensagem: `${imovel.nome || imovel.endereco} passou de "${LABEL_STATUS[anterior.status] || anterior.status}" `
          + `para "${LABEL_STATUS[imovel.status] || imovel.status}".`,
        link: '/imoveis',
      });
    }

    res.json(imovel);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao atualizar imóvel.' });
  }
});

// DELETE /api/imoveis/:id?forcar=true
// Um imóvel não pode ser excluído se tiver contratos vinculados (histórico
// financeiro). Por padrão bloqueamos e avisamos o motivo; com ?forcar=true
// o usuário confirma a exclusão em cascata (contratos + pagamentos deles).
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const forcar = req.query.forcar === 'true' || req.query.forcar === '1';

    const imovel = await prisma.imovel.findUnique({
      where: { id },
      include: { contratos: true },
    });
    if (!imovel) return res.status(404).json({ erro: 'Imóvel não encontrado.' });

    if (imovel.contratos.length > 0 && !forcar) {
      return res.status(409).json({
        erro: `Este imóvel possui ${imovel.contratos.length} contrato(s) vinculado(s) e não pode ser excluído diretamente. Você pode excluir os contratos primeiro, ou confirmar a exclusão em cascata (isso apaga também os contratos e pagamentos ligados a este imóvel).`,
        possuiVinculos: true,
        totalContratos: imovel.contratos.length,
      });
    }

    await prisma.$transaction(async (tx) => {
      if (forcar && imovel.contratos.length > 0) {
        const contratoIds = imovel.contratos.map((c) => c.id);
        await tx.pagamento.deleteMany({ where: { contratoId: { in: contratoIds } } });
        await tx.contrato.deleteMany({ where: { id: { in: contratoIds } } });
      }
      await tx.imovel.delete({ where: { id } });
    });

    if (imovel.foto) {
      const caminho = path.join(PASTA_FOTOS, '..', '..', imovel.foto);
      fs.unlink(caminho, () => {});
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir imóvel.' });
  }
});

module.exports = router;
