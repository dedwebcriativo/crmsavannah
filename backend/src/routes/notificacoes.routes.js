const express = require('express');
const prisma = require('../config/prisma');
const { autenticar, exigirAdministrador } = require('../middleware/auth');
const { processarLembretesEAtrasos } = require('../jobs/lembretesPagamento');

const router = express.Router();
router.use(autenticar);

// GET /api/notificacoes?apenas_nao_lidas=true - últimas notificações (mais recentes primeiro)
router.get('/', async (req, res) => {
  try {
    const apenasNaoLidas = req.query.apenas_nao_lidas === 'true';
    const notificacoes = await prisma.notificacao.findMany({
      where: apenasNaoLidas ? { lida: false } : undefined,
      orderBy: { criadoEm: 'desc' },
      take: 30,
    });
    res.json(notificacoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar notificações.' });
  }
});

// GET /api/notificacoes/contagem - total de não lidas (para o badge do sino)
router.get('/contagem', async (req, res) => {
  try {
    const total = await prisma.notificacao.count({ where: { lida: false } });
    res.json({ total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao contar notificações.' });
  }
});

// PUT /api/notificacoes/:id/marcar-lida
router.put('/:id/marcar-lida', async (req, res) => {
  try {
    const notificacao = await prisma.notificacao.update({
      where: { id: Number(req.params.id) },
      data: { lida: true },
    });
    res.json(notificacao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao marcar notificação como lida.' });
  }
});

// PUT /api/notificacoes/marcar-todas-lidas
router.put('/marcar-todas-lidas', async (req, res) => {
  try {
    await prisma.notificacao.updateMany({ where: { lida: false }, data: { lida: true } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao marcar notificações como lidas.' });
  }
});

// POST /api/notificacoes/testar-lembretes - roda a rotina de lembretes/atrasos na hora
// (só administrador), útil pra testar sem esperar o horário agendado.
router.post('/testar-lembretes', exigirAdministrador, async (req, res) => {
  try {
    const resultado = await processarLembretesEAtrasos();
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao executar a rotina de lembretes.' });
  }
});

module.exports = router;
