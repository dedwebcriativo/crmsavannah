const express = require('express');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');
const { TIPOS_VALIDOS, LABEL_TIPO_TEXTO, TEXTOS_PADRAO, validarTipoTexto } = require('../utils/textoPdf');

const router = express.Router();

router.use(autenticar);
router.use(verificarPermissao('demonstrativos'));

// GET /api/modelo-texto-pdf?tipo=DEMONSTRATIVO_PROPRIETARIO_NOTAS
router.get('/', async (req, res) => {
  try {
    const tipo = validarTipoTexto(req.query.tipo) ? req.query.tipo : TIPOS_VALIDOS[0];
    let modelo = await prisma.modeloTextoPdf.findUnique({ where: { tipo } });
    if (!modelo) {
      modelo = await prisma.modeloTextoPdf.create({ data: { tipo, conteudo: TEXTOS_PADRAO[tipo] } });
    }
    res.json({ ...modelo, tipos: TIPOS_VALIDOS, labelTipos: LABEL_TIPO_TEXTO });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o texto.' });
  }
});

// PUT /api/modelo-texto-pdf { tipo, conteudo }
router.put('/', async (req, res) => {
  try {
    const tipo = validarTipoTexto(req.body.tipo) ? req.body.tipo : TIPOS_VALIDOS[0];
    const modelo = await prisma.modeloTextoPdf.upsert({
      where: { tipo },
      update: { conteudo: req.body.conteudo || '' },
      create: { tipo, conteudo: req.body.conteudo || '' },
    });
    res.json(modelo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar o texto.' });
  }
});

// POST /api/modelo-texto-pdf/restaurar-padrao { tipo }
router.post('/restaurar-padrao', async (req, res) => {
  try {
    const tipo = validarTipoTexto(req.body.tipo) ? req.body.tipo : TIPOS_VALIDOS[0];
    const modelo = await prisma.modeloTextoPdf.upsert({
      where: { tipo },
      update: { conteudo: TEXTOS_PADRAO[tipo] },
      create: { tipo, conteudo: TEXTOS_PADRAO[tipo] },
    });
    res.json(modelo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao restaurar o texto padrão.' });
  }
});

module.exports = router;
