const express = require('express');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');

const router = express.Router();

router.use(autenticar);
router.use(verificarPermissao('contratos'));

// GET /api/testemunhas
router.get('/', async (req, res) => {
  try {
    const testemunhas = await prisma.testemunha.findMany({ orderBy: { nome: 'asc' } });
    res.json(testemunhas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar testemunhas.' });
  }
});

// POST /api/testemunhas
router.post('/', async (req, res) => {
  try {
    const { nome, cpf, email, telefone } = req.body;
    if (!nome) {
      return res.status(400).json({ erro: 'Preencha o nome da testemunha.' });
    }

    const testemunha = await prisma.testemunha.create({
      data: { nome, cpf: cpf || null, email: email || null, telefone: telefone || null },
    });
    res.status(201).json(testemunha);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar testemunha.' });
  }
});

// PUT /api/testemunhas/:id
router.put('/:id', async (req, res) => {
  try {
    const { nome, cpf, email, telefone } = req.body;
    const testemunha = await prisma.testemunha.update({
      where: { id: Number(req.params.id) },
      data: { nome, cpf: cpf || null, email: email || null, telefone: telefone || null },
    });
    res.json(testemunha);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar testemunha.' });
  }
});

// DELETE /api/testemunhas/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.testemunha.delete({ where: { id: Number(req.params.id) } });
    res.json({ excluido: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir testemunha.' });
  }
});

module.exports = router;
