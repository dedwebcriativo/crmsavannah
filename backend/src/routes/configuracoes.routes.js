const express = require('express');
const prisma = require('../config/prisma');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

router.get('/', async (req, res) => {
  try {
    let config = await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } });
    if (!config) {
      config = await prisma.configuracaoEmpresa.create({ data: { id: 1 } });
    }
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar configurações.' });
  }
});

router.put('/', async (req, res) => {
  try {
    const {
      nomeEmpresa, creci, cnpj, endereco, numero, bairro, cidade, estado, cep, telefone, email,
      corretoraResponsavelNome, corretoraResponsavelCpf, corretoraResponsavelRg,
      chavePix, tipoChavePix, bancoNome, bancoAgencia, bancoConta,
    } = req.body;

    const dados = {
      nomeEmpresa, creci, cnpj, endereco, numero, bairro, cidade, estado, cep, telefone, email,
      corretoraResponsavelNome, corretoraResponsavelCpf, corretoraResponsavelRg,
      chavePix, tipoChavePix, bancoNome, bancoAgencia, bancoConta,
    };

    const config = await prisma.configuracaoEmpresa.upsert({
      where: { id: 1 },
      update: dados,
      create: { id: 1, ...dados },
    });
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configurações.' });
  }
});

module.exports = router;
