const express = require('express');
const prisma = require('../config/prisma');
const { autenticar } = require('../middleware/auth');
const { TEMPLATES_PADRAO, LISTA_PLACEHOLDERS, LABEL_TIPO_DOCUMENTO, extrairClausulasDoModelo } = require('../utils/template');

const router = express.Router();
router.use(autenticar);

const TIPOS_VALIDOS = ['LOCACAO_RESIDENCIAL', 'LOCACAO_COMERCIAL', 'INTERMEDIACAO', 'VISTORIA_INICIAL', 'VISTORIA_FINAL', 'RESCISAO'];

function validarTipo(tipo) {
  return TIPOS_VALIDOS.includes(tipo);
}

// GET /api/modelo-contrato?tipo=LOCACAO - retorna o template salvo, criando um padrão se ainda não existir
router.get('/', async (req, res) => {
  try {
    const tipo = validarTipo(req.query.tipo) ? req.query.tipo : 'LOCACAO_RESIDENCIAL';

    let modelo = await prisma.modeloContrato.findUnique({ where: { tipo } });

    if (!modelo) {
      modelo = await prisma.modeloContrato.create({ data: { tipo, conteudo: TEMPLATES_PADRAO[tipo] } });
    }

    res.json({ ...modelo, placeholders: LISTA_PLACEHOLDERS, tipos: TIPOS_VALIDOS, labelTipos: LABEL_TIPO_DOCUMENTO, clausulas: extrairClausulasDoModelo(modelo.conteudo) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o modelo de contrato.' });
  }
});

// PUT /api/modelo-contrato { tipo, conteudo } - salva o texto editado pelo admin
router.put('/', async (req, res) => {
  try {
    const { conteudo } = req.body;
    const tipo = validarTipo(req.body.tipo) ? req.body.tipo : 'LOCACAO_RESIDENCIAL';

    if (!conteudo || !conteudo.trim()) {
      return res.status(400).json({ erro: 'O texto do documento não pode ficar vazio.' });
    }

    const modelo = await prisma.modeloContrato.upsert({
      where: { tipo },
      update: { conteudo },
      create: { tipo, conteudo },
    });

    res.json(modelo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar o modelo de contrato.' });
  }
});

// POST /api/modelo-contrato/restaurar-padrao { tipo } - restaura o texto original sugerido
router.post('/restaurar-padrao', async (req, res) => {
  try {
    const tipo = validarTipo(req.body.tipo) ? req.body.tipo : 'LOCACAO_RESIDENCIAL';

    const modelo = await prisma.modeloContrato.upsert({
      where: { tipo },
      update: { conteudo: TEMPLATES_PADRAO[tipo] },
      create: { tipo, conteudo: TEMPLATES_PADRAO[tipo] },
    });
    res.json(modelo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao restaurar o modelo padrão.' });
  }
});

module.exports = router;
