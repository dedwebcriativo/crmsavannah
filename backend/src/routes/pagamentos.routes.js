const express = require('express');
const path = require('path');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');
const { gerarReciboPdf, gerarReciboRepassePdf, gerarDadosNotaFiscalPdf, PASTA_ARQUIVOS } = require('../services/pdf.service');
const { obterLinkPublicoOuFallback } = require('../services/ftp.service');
const { enviarDocumento } = require('../services/whatsapp.service');
const { montarMensagemPersonalizada } = require('../utils/mensagemWhatsapp');
const { criarNotificacao } = require('../utils/notificacoes');
const { calcularRepasse } = require('../utils/financeiro');
const { paginar } = require('../utils/paginacao');
const { gerarPlanilha, enviarPlanilha, formatarMoedaRelatorio, formatarDataRelatorio } = require('../utils/relatorio');
const { numeroContrato } = require('../utils/demonstrativo');

const router = express.Router();

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Pública de propósito: precisa ser acessível pelo navegador via link direto
// e pela Meta (WhatsApp Cloud API) para buscar o arquivo ao enviar a mensagem.
router.get('/:id/recibo', async (req, res) => {
  const pagamento = await prisma.pagamento.findUnique({ where: { id: Number(req.params.id) } });
  if (!pagamento || !pagamento.reciboPdf) {
    return res.status(404).json({ erro: 'Recibo ainda não foi gerado.' });
  }
  res.sendFile(path.join(PASTA_ARQUIVOS, '..', pagamento.reciboPdf));
});

// Pública pelo mesmo motivo acima
router.get('/:id/dados-nota-fiscal/pdf', async (req, res) => {
  const pagamento = await prisma.pagamento.findUnique({ where: { id: Number(req.params.id) } });
  if (!pagamento || !pagamento.dadosNotaFiscalPdf) {
    return res.status(404).json({ erro: 'Os dados da nota fiscal ainda não foram gerados.' });
  }
  res.sendFile(path.join(PASTA_ARQUIVOS, '..', pagamento.dadosNotaFiscalPdf));
});

// Pública pelo mesmo motivo acima
router.get('/:id/repasse/pdf', async (req, res) => {
  const pagamento = await prisma.pagamento.findUnique({ where: { id: Number(req.params.id) } });
  if (!pagamento || !pagamento.reciboRepassePdf) {
    return res.status(404).json({ erro: 'O recibo de repasse ainda não foi gerado.' });
  }
  res.sendFile(path.join(PASTA_ARQUIVOS, '..', pagamento.reciboRepassePdf));
});

router.use(autenticar);
router.use(verificarPermissao('pagamentos'));

const LIMITE_INADIMPLENCIA = 2; // mais de 2 pagamentos atrasados = inquilino inadimplente

// Recalcula status: se está PENDENTE e já passou 2 dias do vencimento, marca como ATRASADO
// (mesma carência de 2 dias usada no job de lembretes - isso aqui é só um reforço/segurança
// caso o job agendado não tenha rodado ainda no dia).
async function recalcularAtrasados() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  cutoff.setHours(23, 59, 59, 999);
  await prisma.pagamento.updateMany({
    where: { status: 'PENDENTE', dataVencimento: { lte: cutoff } },
    data: { status: 'ATRASADO' },
  });
}

// calcularRepasse agora vem de utils/financeiro.js (compartilhada com contratos.routes.js)

// Retorna o conjunto de IDs de inquilinos considerados inadimplentes
// (mais de LIMITE_INADIMPLENCIA pagamentos com status ATRASADO)
async function buscarInquilinosInadimplentes() {
  const agrupado = await prisma.pagamento.groupBy({
    by: ['inquilinoId'],
    where: { status: 'ATRASADO' },
    _count: { _all: true },
  });
  return new Set(
    agrupado.filter((g) => g._count._all > LIMITE_INADIMPLENCIA).map((g) => g.inquilinoId)
  );
}

// GET /api/pagamentos?filtro=todos|pago|pendente|atrasado|inadimplente&busca=&inquilinoId=
router.get('/', async (req, res) => {
  await recalcularAtrasados();
  const { filtro, busca, inquilinoId, pagina } = req.query;

  const mapaStatus = { pago: 'PAGO', pendente: 'PENDENTE', atrasado: 'ATRASADO', cancelado: 'CANCELADO' };

  const where = {
    ...(mapaStatus[filtro] ? { status: mapaStatus[filtro] } : {}),
    ...(inquilinoId ? { inquilinoId: Number(inquilinoId) } : {}),
    ...(busca ? { inquilino: { nome: { contains: busca } } } : {}),
  };

  let pagamentos = await prisma.pagamento.findMany({
    where,
    include: { inquilino: true, contrato: { include: { imovel: true } }, itens: true },
    orderBy: { dataVencimento: 'desc' },
  });

  const inadimplentes = await buscarInquilinosInadimplentes();

  if (filtro === 'inadimplente') {
    pagamentos = pagamentos.filter((p) => inadimplentes.has(p.inquilinoId));
  } else {
    // Mesmo fora do filtro "inadimplente", marcamos o inquilino para exibir um aviso na lista
    pagamentos = pagamentos.map((p) => ({ ...p, inquilinoInadimplente: inadimplentes.has(p.inquilinoId) }));
  }

  res.json(paginar(pagamentos, pagina));
});

// GET /api/pagamentos/relatorio - controle financeiro consolidado por inquilino
router.get('/relatorio', async (req, res) => {
  await recalcularAtrasados();

  const inquilinos = await prisma.inquilino.findMany({
    include: {
      pagamentos: { include: { contrato: { include: { imovel: { include: { proprietario: true } } } } } },
    },
    orderBy: { nome: 'asc' },
  });

  const relatorio = inquilinos
    .filter((inq) => inq.pagamentos.length > 0)
    .map((inq) => {
      const pagamentos = inq.pagamentos;
      const somaPorStatus = (status) =>
        pagamentos.filter((p) => p.status === status).reduce((soma, p) => soma + Number(p.valor), 0);

      const qtdAtrasados = pagamentos.filter((p) => p.status === 'ATRASADO').length;
      const totalRepassado = pagamentos
        .filter((p) => p.repassado)
        .reduce((soma, p) => soma + Number(p.valorRepasse || 0), 0);
      const totalRetidoImobiliaria = pagamentos
        .filter((p) => p.status === 'PAGO')
        .reduce((soma, p) => soma + (Number(p.valor) - Number(p.valorRepasse ?? p.valor)), 0);
      const caucao = pagamentos.find((p) => p.tipo === 'CAUCAO');
      const proprietario = pagamentos[0]?.contrato?.imovel?.proprietario || null;

      return {
        inquilinoId: inq.id,
        nome: inq.nome,
        telefone: inq.telefone,
        totalPago: somaPorStatus('PAGO'),
        totalPendente: somaPorStatus('PENDENTE'),
        totalAtrasado: somaPorStatus('ATRASADO'),
        qtdAtrasados,
        inadimplente: qtdAtrasados > LIMITE_INADIMPLENCIA,
        totalRepassado,
        totalRetidoImobiliaria,
        caucao: caucao ? { valor: caucao.valor, dataPagamento: caucao.dataPagamento, status: caucao.status } : null,
        proprietario: proprietario ? { id: proprietario.id, nome: proprietario.nome } : null,
      };
    });

  res.json(relatorio);
});

// GET /api/pagamentos/relatorio/exportar - mesmo relatório financeiro acima, em XLSX pra baixar
router.get('/relatorio/exportar', async (req, res) => {
  try {
    await recalcularAtrasados();

    const inquilinos = await prisma.inquilino.findMany({
      include: {
        pagamentos: { include: { contrato: { include: { imovel: { include: { proprietario: true } } } } } },
      },
      orderBy: { nome: 'asc' },
    });

    const linhas = inquilinos
      .filter((inq) => inq.pagamentos.length > 0)
      .map((inq) => {
        const pagamentos = inq.pagamentos;
        const somaPorStatus = (status) =>
          pagamentos.filter((p) => p.status === status).reduce((soma, p) => soma + Number(p.valor), 0);
        const qtdAtrasados = pagamentos.filter((p) => p.status === 'ATRASADO').length;
        const totalRepassado = pagamentos
          .filter((p) => p.repassado)
          .reduce((soma, p) => soma + Number(p.valorRepasse || 0), 0);
        const totalRetidoImobiliaria = pagamentos
          .filter((p) => p.status === 'PAGO')
          .reduce((soma, p) => soma + (Number(p.valor) - Number(p.valorRepasse ?? p.valor)), 0);
        const proprietario = pagamentos[0]?.contrato?.imovel?.proprietario || null;

        return {
          Inquilino: inq.nome,
          Telefone: inq.telefone || '',
          Proprietário: proprietario?.nome || '',
          'Total pago': formatarMoedaRelatorio(somaPorStatus('PAGO')),
          'Total pendente': formatarMoedaRelatorio(somaPorStatus('PENDENTE')),
          'Total atrasado': formatarMoedaRelatorio(somaPorStatus('ATRASADO')),
          'Qtd. em atraso': qtdAtrasados,
          Inadimplente: qtdAtrasados > LIMITE_INADIMPLENCIA ? 'Sim' : 'Não',
          'Total repassado ao proprietário': formatarMoedaRelatorio(totalRepassado),
          'Total retido pela imobiliária': formatarMoedaRelatorio(totalRetidoImobiliaria),
        };
      });

    const buffer = gerarPlanilha(linhas, 'Relatório Financeiro');
    enviarPlanilha(res, buffer, `relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório.' });
  }
});

// GET /api/pagamentos/relatorio-lista/exportar?filtro=&busca=&inquilinoId= - lista de pagamentos
// (mesma visão da tela principal de Pagamentos), em XLSX
router.get('/relatorio-lista/exportar', async (req, res) => {
  try {
    await recalcularAtrasados();
    const { filtro, busca, inquilinoId } = req.query;
    const mapaStatus = { pago: 'PAGO', pendente: 'PENDENTE', atrasado: 'ATRASADO', cancelado: 'CANCELADO' };

    const where = {
      ...(mapaStatus[filtro] ? { status: mapaStatus[filtro] } : {}),
      ...(inquilinoId ? { inquilinoId: Number(inquilinoId) } : {}),
      ...(busca ? { inquilino: { nome: { contains: busca } } } : {}),
    };

    const pagamentos = await prisma.pagamento.findMany({
      where,
      include: { inquilino: true, contrato: { include: { imovel: true } } },
      orderBy: { dataVencimento: 'desc' },
    });

    const LABEL_STATUS = { PAGO: 'Pago', PENDENTE: 'Pendente', ATRASADO: 'Atrasado', CANCELADO: 'Cancelado' };
    const LABEL_METODO = { PIX: 'Pix', BOLETO: 'Boleto', DINHEIRO: 'Dinheiro' };
    const linhas = pagamentos.map((p) => ({
      Inquilino: p.inquilino.nome,
      Imóvel: p.contrato?.imovel?.nome || p.contrato?.imovel?.endereco || '',
      'Mês de referência': p.referenteMes,
      Valor: formatarMoedaRelatorio(p.valor),
      Vencimento: formatarDataRelatorio(p.dataVencimento),
      Pagamento: p.dataPagamento ? formatarDataRelatorio(p.dataPagamento) : '',
      Método: LABEL_METODO[p.metodo] || p.metodo,
      Status: LABEL_STATUS[p.status] || p.status,
      'Valor repasse': p.valorRepasse !== null && p.valorRepasse !== undefined ? formatarMoedaRelatorio(p.valorRepasse) : '',
      Repassado: p.repassado ? 'Sim' : 'Não',
    }));

    const buffer = gerarPlanilha(linhas, 'Pagamentos');
    enviarPlanilha(res, buffer, `pagamentos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório.' });
  }
});

// GET /api/pagamentos/relatorio-iss/exportar?mes=YYYY-MM - relatório mensal de cada pagamento
// recebido, isolando o valor da comissão da imobiliária (base de cálculo do ISS), com
// contrato, data de pagamento, CPF e nome do proprietário - pra mandar pro contador.
router.get('/relatorio-iss/exportar', async (req, res) => {
  try {
    const { mes } = req.query; // "2026-07"
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ erro: 'Informe o mês no formato AAAA-MM.' });
    }

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
        'Nº do Contrato': p.contrato ? numeroContrato(p.contrato) : '',
        'Data do pagamento': formatarDataRelatorio(p.dataPagamento),
        'Mês de referência': p.referenteMes,
        Inquilino: p.inquilino.nome,
        'Proprietário (Nome)': proprietario?.nome || '',
        'Proprietário (CPF/CNPJ)': proprietario?.cpfCnpj || '',
        'Valor do aluguel': formatarMoedaRelatorio(p.valor),
        '% comissão': percentual ? `${percentual}%` : '',
        'Valor da comissão (base ISS)': formatarMoedaRelatorio(valorComissao),
      };
    });

    const totalComissao = pagamentos.reduce((soma, p) => {
      const percentual = p.percentualImobiliaria !== null && p.percentualImobiliaria !== undefined ? Number(p.percentualImobiliaria) : 0;
      return soma + Number(p.valor) * (percentual / 100);
    }, 0);
    linhas.push({
      'Nº do Contrato': '', 'Data do pagamento': '', 'Mês de referência': '', Inquilino: '',
      'Proprietário (Nome)': '', 'Proprietário (CPF/CNPJ)': 'TOTAL DO MÊS', 'Valor do aluguel': '', '% comissão': '',
      'Valor da comissão (base ISS)': formatarMoedaRelatorio(totalComissao),
    });

    const buffer = gerarPlanilha(linhas, `ISS ${mes}`);
    enviarPlanilha(res, buffer, `relatorio-iss-${mes}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      inquilinoId, contratoId, tipo, valor, referenteMes, metodo, status, dataVencimento,
      percentualImobiliaria, deducoes: deducoesValorBruto, valorIptu, valorCondominio, percentualIntermediacao, itens,
    } = req.body;

    // Se IPTU e/ou Condomínio/Taxas vierem informados separadamente (novo padrão, usado no
    // demonstrativo do inquilino), a soma deles vira o valor de "deducoes" (usado no cálculo
    // do repasse ao proprietário) - mantém compatibilidade com quem ainda usa só "deducoes".
    const temValoresSeparados = valorIptu !== undefined || valorCondominio !== undefined;
    const deducoesValor = temValoresSeparados
      ? (Number(valorIptu) || 0) + (Number(valorCondominio) || 0)
      : deducoesValorBruto;

    if (!inquilinoId || !valor || !referenteMes || !dataVencimento) {
      return res.status(400).json({ erro: 'Preencha inquilino, valor, mês de referência e vencimento.' });
    }

    // Se não foi informado um percentual manualmente, tenta herdar do contrato
    let percentual = percentualImobiliaria;
    if ((percentual === undefined || percentual === '') && contratoId) {
      const contrato = await prisma.contrato.findUnique({ where: { id: Number(contratoId) } });
      percentual = contrato?.percentualComissao ?? null;
    }

    // Taxa de intermediação sempre parte do percentual (nunca de um R$ digitado direto) - o
    // valor em reais é calculado aqui, sobre o valor do pagamento. Quando há intermediação,
    // ela substitui a comissão de administração normal - nunca cobra as duas juntas.
    const percentualIntermediacaoNum = percentualIntermediacao === '' || percentualIntermediacao === undefined
      ? null : Number(percentualIntermediacao);
    const valorIntermediacaoCalculado = percentualIntermediacaoNum
      ? Number((Number(valor) * (percentualIntermediacaoNum / 100)).toFixed(2))
      : null;
    const percentualComissaoFinal = valorIntermediacaoCalculado ? null : (percentual === '' ? null : percentual);

    // itens: lista opcional de encargos extras [{ descricao, valor }], só aparecem no recibo
    const itensValidos = Array.isArray(itens)
      ? itens.filter((it) => it && it.descricao && it.valor !== '' && it.valor !== undefined)
      : [];

    const pagamento = await prisma.pagamento.create({
      data: {
        inquilinoId: Number(inquilinoId),
        contratoId: contratoId ? Number(contratoId) : null,
        tipo: tipo || 'ALUGUEL',
        valor,
        referenteMes,
        metodo: metodo || 'PIX',
        status: status || 'PENDENTE',
        dataVencimento: new Date(dataVencimento),
        percentualImobiliaria: percentualComissaoFinal,
        deducoes: deducoesValor === '' || deducoesValor === undefined ? null : Number(deducoesValor),
        valorIptu: valorIptu === '' || valorIptu === undefined ? null : Number(valorIptu),
        valorCondominio: valorCondominio === '' || valorCondominio === undefined ? null : Number(valorCondominio),
        percentualIntermediacao: percentualIntermediacaoNum,
        valorIntermediacao: valorIntermediacaoCalculado,
        valorRepasse: calcularRepasse({
          valor, percentualImobiliaria: percentualComissaoFinal, intermediacao: valorIntermediacaoCalculado, iptu: valorIptu, condominio: valorCondominio,
        }),
        itens: itensValidos.length
          ? { create: itensValidos.map((it) => ({ descricao: it.descricao, valor: Number(it.valor) })) }
          : undefined,
      },
      include: { itens: true },
    });

    res.status(201).json(pagamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar pagamento.' });
  }
});

// PUT /api/pagamentos/marcar-pago-em-lote { ids: [1, 2, 3] } - dá baixa em vários pagamentos de uma vez.
// Precisa vir ANTES da rota "/:id/marcar-pago" (mais abaixo), senão o Express tentaria
// interpretar "marcar-pago-em-lote" como se fosse um :id.
router.put('/marcar-pago-em-lote', async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) {
      return res.status(400).json({ erro: 'Selecione ao menos um pagamento.' });
    }

    const dataPagamento = new Date();
    const prazoRepasseEm = new Date(dataPagamento);
    prazoRepasseEm.setUTCDate(prazoRepasseEm.getUTCDate() + 5);

    // Só dá baixa nos que ainda não estão pagos/cancelados - evita sobrescrever
    // a data de pagamento de algo que já foi processado antes por engano.
    const pagamentosParaAtualizar = await prisma.pagamento.findMany({
      where: { id: { in: ids }, status: { notIn: ['PAGO', 'CANCELADO'] } },
      include: { inquilino: true },
    });

    if (!pagamentosParaAtualizar.length) {
      return res.json({ atualizados: 0, pulados: ids.length });
    }

    await prisma.pagamento.updateMany({
      where: { id: { in: pagamentosParaAtualizar.map((p) => p.id) } },
      data: { status: 'PAGO', dataPagamento, prazoRepasseEm },
    });

    const valorTotal = pagamentosParaAtualizar.reduce((soma, p) => soma + Number(p.valor), 0);
    await criarNotificacao({
      tipo: 'PAGAMENTO_RECEBIDO',
      titulo: `${pagamentosParaAtualizar.length} pagamento(s) recebido(s)`,
      mensagem: `Baixa em lote: ${pagamentosParaAtualizar.length} pagamento(s), totalizando ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Repasse ao(s) proprietário(s) até ${prazoRepasseEm.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`,
      link: '/pagamentos',
    });

    res.json({ atualizados: pagamentosParaAtualizar.length, pulados: ids.length - pagamentosParaAtualizar.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao dar baixa nos pagamentos selecionados.' });
  }
});

// PUT /api/pagamentos/:id/marcar-pago
router.put('/:id/marcar-pago', async (req, res) => {
  try {
    const dataPagamento = new Date();
    const prazoRepasseEm = new Date(dataPagamento);
    prazoRepasseEm.setUTCDate(prazoRepasseEm.getUTCDate() + 5); // prazo máximo de 5 dias pra repassar ao proprietário

    const pagamento = await prisma.pagamento.update({
      where: { id: Number(req.params.id) },
      data: { status: 'PAGO', dataPagamento, prazoRepasseEm },
      include: { inquilino: true },
    });

    const [ano, mesNumero] = pagamento.referenteMes.split('-');
    const mesFmt = MESES_PT[Number(mesNumero) - 1] ? `${MESES_PT[Number(mesNumero) - 1]} de ${ano}` : pagamento.referenteMes;
    await criarNotificacao({
      tipo: 'PAGAMENTO_RECEBIDO',
      titulo: 'Pagamento recebido',
      mensagem: `${pagamento.inquilino.nome} - ${Number(pagamento.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} referente a ${mesFmt}. Repasse ao proprietário até ${prazoRepasseEm.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`,
      link: '/pagamentos',
    });

    res.json(pagamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar pagamento.' });
  }
});

// Gera (ou regenera) o PDF do recibo de repasse de um pagamento, buscando os dados
// necessários (inquilino, imóvel, proprietário) e salvando o caminho no registro.
async function gerarEDefinirReciboRepasse(pagamentoId) {
  const pagamento = await prisma.pagamento.findUnique({
    where: { id: pagamentoId },
    include: {
      inquilino: true,
      itens: true,
      contrato: { include: { imovel: { include: { proprietario: true } } } },
    },
  });
  if (!pagamento) return null;

  const proprietario = pagamento.contrato?.imovel?.proprietario;
  const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
    || { nomeEmpresa: 'Savannah Imóveis' };

  const caminhoRelativo = await gerarReciboRepassePdf({
    pagamento,
    inquilino: pagamento.inquilino,
    imovel: pagamento.contrato?.imovel || null,
    proprietario: proprietario || null,
    config,
  });

  return prisma.pagamento.update({
    where: { id: pagamentoId },
    data: { reciboRepassePdf: caminhoRelativo },
    include: { inquilino: true, contrato: { include: { imovel: { include: { proprietario: true } } } } },
  });
}

// PUT /api/pagamentos/:id/marcar-repassado
router.put('/:id/marcar-repassado', async (req, res) => {
  try {
    const { dataRepasse } = req.body;
    await prisma.pagamento.update({
      where: { id: Number(req.params.id) },
      data: { repassado: true, dataRepasse: dataRepasse ? new Date(dataRepasse) : new Date() },
    });
    // Já deixa o recibo de repasse pronto pra imprimir/enviar assim que marca o repasse
    const pagamento = await gerarEDefinirReciboRepasse(Number(req.params.id));

    const proprietario = pagamento?.contrato?.imovel?.proprietario;
    if (proprietario) {
      await criarNotificacao({
        tipo: 'REPASSE_REALIZADO',
        titulo: 'Repasse realizado',
        mensagem: `Repasse de ${Number(pagamento.valorRepasse ?? pagamento.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} `
          + `para ${proprietario.nome} (inquilino ${pagamento.inquilino?.nome || '-'}) foi marcado como realizado.`,
        link: '/pagamentos',
      });
    }

    res.json(pagamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao marcar repasse.' });
  }
});

// PUT /api/pagamentos/:id/cancelar - encerra um pagamento pendente/atrasado
// sem apagar o registro (mantém histórico, diferente de excluir).
router.put('/:id/cancelar', async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.update({
      where: { id: Number(req.params.id) },
      data: { status: 'CANCELADO' },
      include: { inquilino: true },
    });

    const [ano, mesNumero] = pagamento.referenteMes.split('-');
    const mesFmt = MESES_PT[Number(mesNumero) - 1] ? `${MESES_PT[Number(mesNumero) - 1]} de ${ano}` : pagamento.referenteMes;
    await criarNotificacao({
      tipo: 'PAGAMENTO_CANCELADO',
      titulo: 'Pagamento cancelado',
      mensagem: `${pagamento.inquilino.nome} - ${Number(pagamento.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} referente a ${mesFmt} foi cancelado.`,
      link: '/pagamentos',
    });

    res.json(pagamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cancelar pagamento.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const dados = { ...req.body };
    delete dados.itens;
    if (dados.dataVencimento) dados.dataVencimento = new Date(dados.dataVencimento);
    if (dados.dataPagamento) dados.dataPagamento = new Date(dados.dataPagamento);
    if (dados.dataRepasse) dados.dataRepasse = new Date(dados.dataRepasse);
    if (dados.valor !== undefined) dados.valor = Number(dados.valor);
    if (dados.valorIptu !== undefined) dados.valorIptu = dados.valorIptu === '' ? null : Number(dados.valorIptu);
    if (dados.valorCondominio !== undefined) dados.valorCondominio = dados.valorCondominio === '' ? null : Number(dados.valorCondominio);
    if (dados.valorIntermediacao !== undefined) delete dados.valorIntermediacao; // nunca aceita R$ direto - só percentual
    if (dados.percentualIntermediacao !== undefined) {
      dados.percentualIntermediacao = dados.percentualIntermediacao === '' ? null : Number(dados.percentualIntermediacao);
    }
    // "deducoes" fica só como registro informativo da soma IPTU+condomínio (compatibilidade
    // com relatórios antigos) - quem manda no cálculo do repasse agora é calcularRepasse.
    if (dados.valorIptu !== undefined || dados.valorCondominio !== undefined) {
      const atualParaSoma = await prisma.pagamento.findUnique({ where: { id: Number(req.params.id) } });
      const iptuFinal = dados.valorIptu !== undefined ? dados.valorIptu : atualParaSoma?.valorIptu;
      const condominioFinal = dados.valorCondominio !== undefined ? dados.valorCondominio : atualParaSoma?.valorCondominio;
      dados.deducoes = (Number(iptuFinal) || 0) + (Number(condominioFinal) || 0);
    }
    if (dados.deducoes !== undefined) dados.deducoes = dados.deducoes === '' ? null : Number(dados.deducoes);

    const camposQueAfetamRepasse = ['percentualImobiliaria', 'valorIptu', 'valorCondominio', 'percentualIntermediacao', 'valor'];
    if (camposQueAfetamRepasse.some((campo) => dados[campo] !== undefined)) {
      const atual = await prisma.pagamento.findUnique({ where: { id: Number(req.params.id) } });
      let percentualFinal = dados.percentualImobiliaria !== undefined ? dados.percentualImobiliaria : atual.percentualImobiliaria;
      const iptuFinal = dados.valorIptu !== undefined ? dados.valorIptu : atual.valorIptu;
      const condominioFinal = dados.valorCondominio !== undefined ? dados.valorCondominio : atual.valorCondominio;
      const valorFinal = dados.valor ?? atual.valor;
      const percentualIntermediacaoFinal = dados.percentualIntermediacao !== undefined ? dados.percentualIntermediacao : atual.percentualIntermediacao;
      const intermediacaoFinal = percentualIntermediacaoFinal
        ? Number((Number(valorFinal) * (Number(percentualIntermediacaoFinal) / 100)).toFixed(2))
        : null;
      // Regra de negócio: havendo intermediação neste pagamento, ela substitui a comissão de
      // administração normal - nunca cobra as duas juntas no mesmo mês.
      if (intermediacaoFinal) percentualFinal = null;
      dados.valorIntermediacao = intermediacaoFinal;
      dados.percentualImobiliaria = percentualFinal === '' ? null : (percentualFinal === null ? null : Number(percentualFinal));
      dados.valorRepasse = calcularRepasse({
        valor: valorFinal,
        percentualImobiliaria: percentualFinal,
        intermediacao: intermediacaoFinal,
        iptu: iptuFinal,
        condominio: condominioFinal,
      });
    }

    const pagamento = await prisma.pagamento.update({
      where: { id: Number(req.params.id) },
      data: dados,
    });
    res.json(pagamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar pagamento.' });
  }
});

// POST /api/pagamentos/:id/itens - adiciona um encargo extra (ex: taxa de mudança)
router.post('/:id/itens', async (req, res) => {
  try {
    const { descricao, valor } = req.body;
    if (!descricao || valor === undefined || valor === '') {
      return res.status(400).json({ erro: 'Informe a descrição e o valor do item.' });
    }
    const item = await prisma.pagamentoItem.create({
      data: { pagamentoId: Number(req.params.id), descricao, valor: Number(valor) },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao adicionar item.' });
  }
});

router.delete('/:id/itens/:itemId', async (req, res) => {
  try {
    await prisma.pagamentoItem.delete({ where: { id: Number(req.params.itemId) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover item.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.pagamento.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir pagamento.' });
  }
});

// POST /api/pagamentos/:id/recibo - gera o PDF do recibo
router.post('/:id/recibo', async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        inquilino: true,
        itens: true,
        contrato: { include: { imovel: { include: { proprietario: true } } } },
      },
    });

    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado.' });

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis', creci: null };

    const caminhoRelativo = await gerarReciboPdf({
      pagamento,
      inquilino: pagamento.inquilino,
      imovel: pagamento.contrato?.imovel || null,
      proprietario: pagamento.contrato?.imovel?.proprietario || null,
      config,
    });

    const atualizado = await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { reciboPdf: caminhoRelativo },
    });

    res.json(atualizado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar recibo.' });
  }
});

// POST /api/pagamentos/:id/enviar-whatsapp - envia o recibo já gerado via WhatsApp
router.post('/:id/enviar-whatsapp', async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { id: Number(req.params.id) },
      include: { inquilino: true },
    });

    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    if (!pagamento.reciboPdf) return res.status(400).json({ erro: 'Gere o recibo antes de enviar.' });
    if (!pagamento.inquilino.telefone) return res.status(400).json({ erro: 'Este inquilino não tem telefone cadastrado.' });

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const urlPublica = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
    const urlLocal = `${urlPublica}/api/pagamentos/${pagamento.id}/recibo`;
    const nomeArquivoRemoto = `recibo-${pagamento.id}.pdf`;
    const caminhoAbsolutoLocal = path.join(PASTA_ARQUIVOS, '..', pagamento.reciboPdf);
    const { url: urlDocumento } = await obterLinkPublicoOuFallback(caminhoAbsolutoLocal, nomeArquivoRemoto, urlLocal);

    const [ano, mesNumero] = pagamento.referenteMes.split('-');
    const mesLabel = MESES_PT[Number(mesNumero) - 1] ? `${MESES_PT[Number(mesNumero) - 1]} de ${ano}` : pagamento.referenteMes;

    const mensagem = await montarMensagemPersonalizada('RECIBO', {
      NOME: pagamento.inquilino.nome,
      NOME_EMPRESA: config.nomeEmpresa,
      MES: mesLabel,
      VALOR: Number(pagamento.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      LINK: urlDocumento,
    });

    const resultado = await enviarDocumento({
      telefone: pagamento.inquilino.telefone,
      urlDocumento,
      nomeArquivo: `recibo-${pagamento.id}.pdf`,
      mensagem,
    });

    res.json({ enviado: true, resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar recibo pelo WhatsApp.' });
  }
});

// POST /api/pagamentos/:id/dados-nota-fiscal - compila os dados do inquilino, proprietário,
// imóvel e contrato num PDF pronto pra ajudar o proprietário/contador a emitir a nota fiscal.
// Não emite nenhuma nota fiscal de verdade - só junta o que já está cadastrado no sistema.
router.post('/:id/dados-nota-fiscal', async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        inquilino: true,
        itens: true,
        contrato: { include: { imovel: { include: { proprietario: true } } } },
      },
    });

    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado.' });

    const proprietario = pagamento.contrato?.imovel?.proprietario;
    if (!proprietario) {
      return res.status(400).json({ erro: 'Este pagamento não está vinculado a um contrato com proprietário/imóvel cadastrado.' });
    }

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const caminhoRelativo = await gerarDadosNotaFiscalPdf({
      pagamento,
      inquilino: pagamento.inquilino,
      imovel: pagamento.contrato?.imovel || null,
      proprietario,
      contrato: pagamento.contrato || null,
      config,
    });

    const atualizado = await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { dadosNotaFiscalPdf: caminhoRelativo },
    });

    res.json(atualizado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar os dados da nota fiscal.' });
  }
});

// POST /api/pagamentos/:id/dados-nota-fiscal/enviar-whatsapp - envia o PDF compilado ao proprietário
router.post('/:id/dados-nota-fiscal/enviar-whatsapp', async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { id: Number(req.params.id) },
      include: { contrato: { include: { imovel: { include: { proprietario: true } } } } },
    });

    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    if (!pagamento.dadosNotaFiscalPdf) return res.status(400).json({ erro: 'Gere os dados da nota fiscal antes de enviar.' });

    const proprietario = pagamento.contrato?.imovel?.proprietario;
    if (!proprietario?.telefone) {
      return res.status(400).json({ erro: 'O proprietário deste imóvel não tem telefone cadastrado.' });
    }

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const urlPublica = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
    const urlLocal = `${urlPublica}/api/pagamentos/${pagamento.id}/dados-nota-fiscal/pdf`;
    const nomeArquivoRemoto = `dados-nota-fiscal-${pagamento.id}.pdf`;
    const caminhoAbsolutoLocal = path.join(PASTA_ARQUIVOS, '..', pagamento.dadosNotaFiscalPdf);
    const { url: urlDocumento } = await obterLinkPublicoOuFallback(caminhoAbsolutoLocal, nomeArquivoRemoto, urlLocal);

    const numeroContratoFmt = pagamento.contrato
      ? `${String(pagamento.contrato.id).padStart(4, '0')}/${new Date(pagamento.contrato.criadoEm).getFullYear()}`
      : '-';

    const mensagem = await montarMensagemPersonalizada('DADOS_NOTA_FISCAL', {
      NOME: proprietario.nome,
      NOME_EMPRESA: config.nomeEmpresa,
      NUMERO: numeroContratoFmt,
      VALOR: Number(pagamento.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      LINK: urlDocumento,
    });

    const resultado = await enviarDocumento({
      telefone: proprietario.telefone,
      urlDocumento,
      nomeArquivo: `dados-nota-fiscal-${pagamento.id}.pdf`,
      mensagem,
    });

    res.json({ enviado: true, resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar os dados da nota fiscal pelo WhatsApp.' });
  }
});

// POST /api/pagamentos/:id/repasse - gera (ou regenera) o recibo de repasse ao proprietário
router.post('/:id/repasse', async (req, res) => {
  try {
    const pagamento = await gerarEDefinirReciboRepasse(Number(req.params.id));
    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    res.json(pagamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o recibo de repasse.' });
  }
});

// POST /api/pagamentos/:id/repasse/enviar-whatsapp - envia o recibo de repasse ao proprietário
router.post('/:id/repasse/enviar-whatsapp', async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { id: Number(req.params.id) },
      include: { contrato: { include: { imovel: { include: { proprietario: true } } } } },
    });

    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    if (!pagamento.reciboRepassePdf) return res.status(400).json({ erro: 'Gere o recibo de repasse antes de enviar.' });

    const proprietario = pagamento.contrato?.imovel?.proprietario;
    if (!proprietario?.telefone) {
      return res.status(400).json({ erro: 'O proprietário deste imóvel não tem telefone cadastrado.' });
    }

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const urlPublica = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
    const urlLocal = `${urlPublica}/api/pagamentos/${pagamento.id}/repasse/pdf`;
    const nomeArquivoRemoto = `repasse-${pagamento.id}.pdf`;
    const caminhoAbsolutoLocal = path.join(PASTA_ARQUIVOS, '..', pagamento.reciboRepassePdf);
    const { url: urlDocumento } = await obterLinkPublicoOuFallback(caminhoAbsolutoLocal, nomeArquivoRemoto, urlLocal);

    const [ano, mesNumero] = pagamento.referenteMes.split('-');
    const mesLabel = MESES_PT[Number(mesNumero) - 1] ? `${MESES_PT[Number(mesNumero) - 1]} de ${ano}` : pagamento.referenteMes;

    const mensagem = await montarMensagemPersonalizada('REPASSE', {
      NOME: proprietario.nome,
      NOME_EMPRESA: config.nomeEmpresa,
      MES: mesLabel,
      VALOR: Number(pagamento.valorRepasse ?? pagamento.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      LINK: urlDocumento,
    });

    const resultado = await enviarDocumento({
      telefone: proprietario.telefone,
      urlDocumento,
      nomeArquivo: nomeArquivoRemoto,
      mensagem,
    });

    res.json({ enviado: true, resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar o recibo de repasse pelo WhatsApp.' });
  }
});

module.exports = router;
