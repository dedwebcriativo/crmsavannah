const express = require('express');
const prisma = require('../config/prisma');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

router.get('/', async (req, res) => {
  const cutoffAtraso = new Date();
  cutoffAtraso.setDate(cutoffAtraso.getDate() - 2);
  cutoffAtraso.setHours(23, 59, 59, 999);
  await prisma.pagamento.updateMany({
    where: { status: 'PENDENTE', dataVencimento: { lte: cutoffAtraso } },
    data: { status: 'ATRASADO' },
  });

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const fimMes = new Date(inicioMes);
  fimMes.setMonth(fimMes.getMonth() + 1);

  const em7Dias = new Date();
  em7Dias.setDate(em7Dias.getDate() + 7);

  // Início do range de 6 meses atrás, para o gráfico de recebimentos
  const inicioRange6Meses = new Date(inicioMes);
  inicioRange6Meses.setMonth(inicioRange6Meses.getMonth() - 5);

  const [
    totalImoveis,
    imoveisAlugados,
    imoveisPorTipoRaw,
    recebidoNoMes,
    pagamentosAtrasados,
    vencendoEm7Dias,
    statusPagamentosRaw,
    pagamentosUltimos6Meses,
    totalInquilinos,
    totalProprietarios,
  ] = await Promise.all([
    prisma.imovel.count(),
    prisma.imovel.count({ where: { status: 'ALUGADO' } }),
    prisma.imovel.groupBy({ by: ['tipo'], _count: { _all: true } }),
    prisma.pagamento.aggregate({
      _sum: { valor: true },
      where: { status: 'PAGO', dataPagamento: { gte: inicioMes, lt: fimMes } },
    }),
    prisma.pagamento.findMany({
      where: { status: 'ATRASADO' },
      include: { inquilino: true },
      orderBy: { dataVencimento: 'asc' },
    }),
    prisma.pagamento.findMany({
      where: { status: 'PENDENTE', dataVencimento: { gte: new Date(), lte: em7Dias } },
      include: { inquilino: true },
      orderBy: { dataVencimento: 'asc' },
    }),
    prisma.pagamento.groupBy({ by: ['status'], _count: { _all: true }, _sum: { valor: true } }),
    prisma.pagamento.findMany({
      where: { status: 'PAGO', dataPagamento: { gte: inicioRange6Meses, lt: fimMes } },
      select: { valor: true, dataPagamento: true },
    }),
    prisma.inquilino.count(),
    prisma.proprietario.count(),
  ]);

  // Monta os últimos 6 meses (mes/ano) com total recebido em cada um
  const mesesLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const graficoRecebimentos = [];
  for (let i = 5; i >= 0; i -= 1) {
    const referencia = new Date(inicioMes);
    referencia.setMonth(referencia.getMonth() - i);
    const chave = `${referencia.getFullYear()}-${referencia.getMonth()}`;
    graficoRecebimentos.push({
      mes: `${mesesLabels[referencia.getMonth()]}/${String(referencia.getFullYear()).slice(2)}`,
      chave,
      total: 0,
    });
  }
  pagamentosUltimos6Meses.forEach((p) => {
    const data = new Date(p.dataPagamento);
    const chave = `${data.getFullYear()}-${data.getMonth()}`;
    const item = graficoRecebimentos.find((g) => g.chave === chave);
    if (item) item.total += Number(p.valor);
  });

  // Total em aberto (atrasado) por inquilino, para a lista de inadimplentes
  const inadimplentesMap = {};
  pagamentosAtrasados.forEach((p) => {
    const id = p.inquilino.id;
    if (!inadimplentesMap[id]) {
      inadimplentesMap[id] = { inquilinoId: id, nome: p.inquilino.nome, telefone: p.inquilino.telefone, totalEmAberto: 0, quantidade: 0 };
    }
    inadimplentesMap[id].totalEmAberto += Number(p.valor);
    inadimplentesMap[id].quantidade += 1;
  });
  const inadimplentes = Object.values(inadimplentesMap).sort((a, b) => b.totalEmAberto - a.totalEmAberto);

  const imoveisPorTipo = imoveisPorTipoRaw.map((i) => ({ tipo: i.tipo, quantidade: i._count._all }));

  const statusPagamentos = ['PAGO', 'PENDENTE', 'ATRASADO'].map((status) => {
    const encontrado = statusPagamentosRaw.find((s) => s.status === status);
    return {
      status,
      quantidade: encontrado?._count._all || 0,
      total: encontrado?._sum.valor || 0,
    };
  });

  const valorTotalCarteiraAluguel = await prisma.imovel.aggregate({
    _sum: { valorAluguel: true },
    where: { status: 'ALUGADO' },
  });

  const valorTotalEmAberto = pagamentosAtrasados.reduce((soma, p) => soma + Number(p.valor), 0)
    + vencendoEm7Dias.reduce((soma, p) => soma + Number(p.valor), 0);

  res.json({
    resumo: {
      totalImoveis,
      imoveisAlugados,
      imoveisDisponiveis: totalImoveis - imoveisAlugados,
      taxaOcupacao: totalImoveis > 0 ? Math.round((imoveisAlugados / totalImoveis) * 100) : 0,
      recebidoNoMes: recebidoNoMes._sum.valor || 0,
      totalPagamentosAtrasados: pagamentosAtrasados.length,
      valorTotalCarteiraAluguel: valorTotalCarteiraAluguel._sum.valorAluguel || 0,
      valorTotalEmAberto,
      totalInquilinos,
      totalProprietarios,
    },
    imoveis: {
      porTipo: imoveisPorTipo,
    },
    graficos: {
      recebimentosPorMes: graficoRecebimentos.map(({ mes, total }) => ({ mes, total })),
      statusPagamentos,
    },
    alertas: {
      pagamentosAtrasados,
      vencendoEm7Dias,
      inadimplentes,
    },
  });
});

module.exports = router;
