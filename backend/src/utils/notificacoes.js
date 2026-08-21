const prisma = require('../config/prisma');

// Cria uma notificação interna (sino no topo do sistema). Nunca deixa quebrar o
// fluxo principal que a chamou - se der erro ao salvar a notificação, só loga.
async function criarNotificacao({ tipo, titulo, mensagem, link = null }) {
  try {
    return await prisma.notificacao.create({ data: { tipo, titulo, mensagem, link } });
  } catch (err) {
    console.error('[Notificações] Falha ao criar notificação:', err.message);
    return null;
  }
}

module.exports = { criarNotificacao };
