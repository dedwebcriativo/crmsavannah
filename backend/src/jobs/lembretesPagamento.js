const cron = require('node-cron');
const prisma = require('../config/prisma');
const { enviarMensagemTexto } = require('../services/whatsapp.service');
const { montarMensagemPersonalizada } = require('../utils/mensagemWhatsapp');
const { criarNotificacao } = require('../utils/notificacoes');

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function mesLabel(referenteMes) {
  const [ano, mesNumero] = referenteMes.split('-');
  const nome = MESES_PT[Number(mesNumero) - 1];
  return nome ? `${nome} de ${ano}` : referenteMes;
}

function formatarValor(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Roda uma vez por dia (ou sob demanda, via rota de teste):
 *  1. Pagamentos que vencem HOJE e ainda estão pendentes -> lembrete por WhatsApp ao
 *     inquilino + notificação interna para a equipe.
 *  2. Pagamentos vencidos há 2 dias (ainda pendentes) -> marcados como ATRASADO,
 *     com aviso por WhatsApp ao inquilino.
 * Cada pagamento só entra em cada etapa uma única vez (campos lembreteVencimentoEnviadoEm
 * e avisoAtrasoEnviadoEm), então rodar mais de uma vez no mesmo dia não reenvia nada.
 */
async function processarLembretesEAtrasos() {
  const resultado = { lembretesEnviados: 0, atrasosMarcados: 0, repassesAvisados: 0, erros: [] };

  const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
    || { nomeEmpresa: 'Savannah Imóveis' };

  // 1) Vencem hoje
  const hoje = inicioDoDia(new Date());
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const vencemHoje = await prisma.pagamento.findMany({
    where: {
      status: 'PENDENTE',
      dataVencimento: { gte: hoje, lt: amanha },
      lembreteVencimentoEnviadoEm: null,
    },
    include: { inquilino: true },
  });

  for (const pagamento of vencemHoje) {
    try {
      const mensagem = await montarMensagemPersonalizada('LEMBRETE_VENCIMENTO', {
        NOME: pagamento.inquilino.nome,
        NOME_EMPRESA: config.nomeEmpresa,
        MES: mesLabel(pagamento.referenteMes),
        VALOR: formatarValor(pagamento.valor),
      });

      let envio = { simulado: true };
      if (pagamento.inquilino.telefone) {
        envio = await enviarMensagemTexto({ telefone: pagamento.inquilino.telefone, mensagem });
      }

      await prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { lembreteVencimentoEnviadoEm: new Date() },
      });

      await criarNotificacao({
        tipo: 'PAGAMENTO_VENCE_HOJE',
        titulo: 'Pagamento vence hoje',
        mensagem: !pagamento.inquilino.telefone
          ? `${pagamento.inquilino.nome} - ${formatarValor(pagamento.valor)} (${mesLabel(pagamento.referenteMes)}). Sem telefone cadastrado, lembrete não pôde ser enviado.`
          : envio.simulado
            ? `${pagamento.inquilino.nome} - ${formatarValor(pagamento.valor)} (${mesLabel(pagamento.referenteMes)}). WhatsApp não configurado - envie o lembrete manualmente.`
            : `${pagamento.inquilino.nome} - ${formatarValor(pagamento.valor)} (${mesLabel(pagamento.referenteMes)}). Lembrete enviado por WhatsApp.`,
        link: '/pagamentos',
      });

      resultado.lembretesEnviados += 1;
    } catch (err) {
      console.error(`[Lembretes] Erro no pagamento ${pagamento.id}:`, err.message);
      resultado.erros.push({ pagamentoId: pagamento.id, etapa: 'lembrete', erro: err.message });
    }
  }

  // 2) Vencidos há 2 dias (ainda pendentes) -> marca atrasado + avisa
  const cutoff = inicioDoDia(new Date());
  cutoff.setDate(cutoff.getDate() - 2);
  cutoff.setHours(23, 59, 59, 999);

  const atrasando = await prisma.pagamento.findMany({
    where: {
      status: 'PENDENTE',
      dataVencimento: { lte: cutoff },
      avisoAtrasoEnviadoEm: null,
    },
    include: { inquilino: true },
  });

  for (const pagamento of atrasando) {
    try {
      await prisma.pagamento.update({ where: { id: pagamento.id }, data: { status: 'ATRASADO' } });

      const mensagem = await montarMensagemPersonalizada('PAGAMENTO_ATRASADO', {
        NOME: pagamento.inquilino.nome,
        NOME_EMPRESA: config.nomeEmpresa,
        MES: mesLabel(pagamento.referenteMes),
        VALOR: formatarValor(pagamento.valor),
      });

      if (pagamento.inquilino.telefone) {
        await enviarMensagemTexto({ telefone: pagamento.inquilino.telefone, mensagem });
      }

      await prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { avisoAtrasoEnviadoEm: new Date() },
      });

      await criarNotificacao({
        tipo: 'PAGAMENTO_ATRASADO',
        titulo: 'Pagamento atrasado',
        mensagem: `${pagamento.inquilino.nome} - ${formatarValor(pagamento.valor)} referente a ${mesLabel(pagamento.referenteMes)} está atrasado (venceu há 2 dias).`,
        link: '/pagamentos',
      });

      resultado.atrasosMarcados += 1;
    } catch (err) {
      console.error(`[Lembretes] Erro no pagamento ${pagamento.id}:`, err.message);
      resultado.erros.push({ pagamentoId: pagamento.id, etapa: 'atraso', erro: err.message });
    }
  }

  // 3) Repasse ao proprietário: prazo máximo de 5 dias após o pagamento. Avisa a equipe
  // (não o inquilino - isso é assunto interno entre imobiliária e proprietário) quando o
  // prazo vence hoje, e novamente se passar do prazo sem ter sido repassado.
  const pagosNaoRepassados = await prisma.pagamento.findMany({
    where: { status: 'PAGO', repassado: false, prazoRepasseEm: { not: null } },
    include: {
      inquilino: true,
      contrato: { include: { imovel: { include: { proprietario: true } } } },
    },
  });

  for (const pagamento of pagosNaoRepassados) {
    try {
      const proprietarioNome = pagamento.contrato?.imovel?.proprietario?.nome || 'proprietário';
      const prazo = inicioDoDia(pagamento.prazoRepasseEm);

      if (prazo.getTime() === hoje.getTime() && !pagamento.avisoRepassePendenteEnviadoEm) {
        await criarNotificacao({
          tipo: 'REPASSE_PENDENTE',
          titulo: 'Prazo de repasse vence hoje',
          mensagem: `Repasse para ${proprietarioNome} (inquilino ${pagamento.inquilino.nome}, ${formatarValor(pagamento.valorRepasse ?? pagamento.valor)}) vence hoje.`,
          link: '/pagamentos',
        });
        await prisma.pagamento.update({ where: { id: pagamento.id }, data: { avisoRepassePendenteEnviadoEm: new Date() } });
        resultado.repassesAvisados += 1;
      } else if (prazo.getTime() < hoje.getTime() && !pagamento.avisoRepasseAtrasadoEnviadoEm) {
        await criarNotificacao({
          tipo: 'REPASSE_ATRASADO',
          titulo: 'Repasse atrasado',
          mensagem: `Repasse para ${proprietarioNome} (inquilino ${pagamento.inquilino.nome}, ${formatarValor(pagamento.valorRepasse ?? pagamento.valor)}) passou do prazo de 5 dias e ainda não foi feito.`,
          link: '/pagamentos',
        });
        await prisma.pagamento.update({ where: { id: pagamento.id }, data: { avisoRepasseAtrasadoEnviadoEm: new Date() } });
        resultado.repassesAvisados += 1;
      }
    } catch (err) {
      console.error(`[Lembretes] Erro no repasse do pagamento ${pagamento.id}:`, err.message);
      resultado.erros.push({ pagamentoId: pagamento.id, etapa: 'repasse', erro: err.message });
    }
  }

  return resultado;
}

// Agenda a rotina pra rodar todo dia no horário configurado (padrão: 8h da manhã).
// Formato cron: "minuto hora * * *". Configurável via LEMBRETES_HORARIO no .env.
function iniciarAgendadorLembretes() {
  const expressao = process.env.LEMBRETES_HORARIO || '0 8 * * *';
  cron.schedule(expressao, () => {
    processarLembretesEAtrasos()
      .then((r) => console.log(`[Lembretes] Execução diária concluída: ${r.lembretesEnviados} lembrete(s), ${r.atrasosMarcados} atraso(s) marcado(s), ${r.repassesAvisados} aviso(s) de repasse.`))
      .catch((err) => console.error('[Lembretes] Falha na execução diária:', err));
  });
  console.log(`[Lembretes] Agendador iniciado (expressão cron: "${expressao}").`);
}

module.exports = { iniciarAgendadorLembretes, processarLembretesEAtrasos };
