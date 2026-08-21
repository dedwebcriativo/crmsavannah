const express = require('express');
const prisma = require('../config/prisma');
const { autenticar } = require('../middleware/auth');
const {
  TIPOS_VALIDOS, TEMPLATES_PADRAO_MENSAGEM, LISTA_PLACEHOLDERS_MENSAGEM, LABEL_TIPO_MENSAGEM, validarTipoMensagem,
} = require('../utils/mensagemWhatsapp');

const router = express.Router();
router.use(autenticar);

// GET /api/modelo-mensagem?tipo=RECIBO - retorna o texto salvo, criando um padrão se ainda não existir
router.get('/', async (req, res) => {
  try {
    const tipo = validarTipoMensagem(req.query.tipo) ? req.query.tipo : 'RECIBO';

    let modelo = await prisma.modeloMensagemWhatsapp.findUnique({ where: { tipo } });
    if (!modelo) {
      modelo = await prisma.modeloMensagemWhatsapp.create({ data: { tipo, conteudo: TEMPLATES_PADRAO_MENSAGEM[tipo] } });
    }

    res.json({ ...modelo, placeholders: LISTA_PLACEHOLDERS_MENSAGEM, tipos: TIPOS_VALIDOS, labelTipos: LABEL_TIPO_MENSAGEM });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o modelo de mensagem.' });
  }
});

// PUT /api/modelo-mensagem { tipo, conteudo } - salva o texto editado pelo admin
router.put('/', async (req, res) => {
  try {
    const { conteudo } = req.body;
    const tipo = validarTipoMensagem(req.body.tipo) ? req.body.tipo : 'RECIBO';

    if (!conteudo || !conteudo.trim()) {
      return res.status(400).json({ erro: 'O texto da mensagem não pode ficar vazio.' });
    }

    const modelo = await prisma.modeloMensagemWhatsapp.upsert({
      where: { tipo },
      update: { conteudo },
      create: { tipo, conteudo },
    });

    res.json(modelo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar o modelo de mensagem.' });
  }
});

// POST /api/modelo-mensagem/restaurar-padrao { tipo } - restaura o texto padrão sugerido
router.post('/restaurar-padrao', async (req, res) => {
  try {
    const tipo = validarTipoMensagem(req.body.tipo) ? req.body.tipo : 'RECIBO';

    const modelo = await prisma.modeloMensagemWhatsapp.upsert({
      where: { tipo },
      update: { conteudo: TEMPLATES_PADRAO_MENSAGEM[tipo] },
      create: { tipo, conteudo: TEMPLATES_PADRAO_MENSAGEM[tipo] },
    });
    res.json(modelo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao restaurar o modelo padrão.' });
  }
});

module.exports = router;
