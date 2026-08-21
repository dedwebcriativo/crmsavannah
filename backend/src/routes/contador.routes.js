const express = require('express');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');

const router = express.Router();

router.use(autenticar);
router.use(verificarPermissao('demonstrativos'));

// GET /api/contadores
router.get('/', async (req, res) => {
  try {
    const contadores = await prisma.contador.findMany({ orderBy: { nome: 'asc' } });
    res.json(contadores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar contadores.' });
  }
});

// POST /api/contadores
router.post('/', async (req, res) => {
  try {
    const { nome, telefone, email, cpfCnpj, observacoes } = req.body;
    if (!nome || !telefone) {
      return res.status(400).json({ erro: 'Preencha nome e telefone.' });
    }

    const contador = await prisma.contador.create({
      data: { nome, telefone, email: email || null, cpfCnpj: cpfCnpj || null, observacoes: observacoes || null },
    });
    res.status(201).json(contador);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar contador.' });
  }
});

// PUT /api/contadores/:id
router.put('/:id', async (req, res) => {
  try {
    const { nome, telefone, email, cpfCnpj, observacoes } = req.body;
    const contador = await prisma.contador.update({
      where: { id: Number(req.params.id) },
      data: { nome, telefone, email: email || null, cpfCnpj: cpfCnpj || null, observacoes: observacoes || null },
    });
    res.json(contador);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar contador.' });
  }
});

// DELETE /api/contadores/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.contador.delete({ where: { id: Number(req.params.id) } });
    res.json({ excluido: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir contador.' });
  }
});

module.exports = router;
