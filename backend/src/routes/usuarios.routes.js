const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { autenticar, exigirAdministrador } = require('../middleware/auth');
const { ROLES_VALIDOS, ehAdministrador } = require('../utils/permissoes');

const router = express.Router();
router.use(autenticar);

function semSenha(usuario) {
  const { senha, ...resto } = usuario;
  return resto;
}

// GET /api/usuarios/perfil - dados do próprio usuário logado (qualquer perfil pode ver o seu)
router.get('/perfil', async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  res.json(semSenha(usuario));
});

// PUT /api/usuarios/perfil - o próprio usuário edita seus dados (e, opcionalmente, a senha)
router.put('/perfil', async (req, res) => {
  try {
    const { nome, email, telefone, creci, senhaAtual, novaSenha } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ erro: 'Nome e email são obrigatórios.' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    if (email !== usuario.email) {
      const emailEmUso = await prisma.usuario.findUnique({ where: { email } });
      if (emailEmUso) return res.status(409).json({ erro: 'Já existe um usuário com este email.' });
    }

    const dados = { nome, email, telefone: telefone || null, creci: creci || null };

    if (novaSenha) {
      if (!senhaAtual) {
        return res.status(400).json({ erro: 'Informe sua senha atual para definir uma nova senha.' });
      }
      const confere = await bcrypt.compare(senhaAtual, usuario.senha);
      if (!confere) return res.status(401).json({ erro: 'Senha atual incorreta.' });
      if (novaSenha.length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres.' });
      dados.senha = await bcrypt.hash(novaSenha, 10);
    }

    const atualizado = await prisma.usuario.update({ where: { id: req.usuario.id }, data: dados });
    res.json(semSenha(atualizado));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar o perfil.' });
  }
});

// A partir daqui, só administrador: gestão de outros usuários do sistema
router.use(exigirAdministrador);

// GET /api/usuarios - lista todos os usuários com acesso ao sistema
router.get('/', async (req, res) => {
  const usuarios = await prisma.usuario.findMany({ orderBy: { nome: 'asc' } });
  res.json(usuarios.map(semSenha));
});

// POST /api/usuarios - cria um novo usuário (administrador, colaborador ou contador)
router.post('/', async (req, res) => {
  try {
    const { nome, email, senha, role, telefone, creci } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios.' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
    }
    if (role && !ROLES_VALIDOS.includes(role)) {
      return res.status(400).json({ erro: 'Perfil de acesso inválido.' });
    }

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) return res.status(409).json({ erro: 'Já existe um usuário com este email.' });

    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({
      data: {
        nome, email, senha: senhaHash, telefone: telefone || null, creci: creci || null,
        role: role || 'COLABORADOR',
      },
    });

    res.status(201).json(semSenha(usuario));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar usuário.' });
  }
});

// PUT /api/usuarios/:id - administrador edita outro usuário (dados, perfil de acesso, ativo/inativo)
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome, email, telefone, creci, role, ativo, novaSenha } = req.body;

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    if (role && !ROLES_VALIDOS.includes(role)) {
      return res.status(400).json({ erro: 'Perfil de acesso inválido.' });
    }

    // Trava de segurança: não deixa desativar/rebaixar o último administrador ativo
    const perdendoAdmin = (role && role !== 'ADMINISTRADOR' && ehAdministrador(usuario.role))
      || (ativo === false && ehAdministrador(usuario.role));
    if (perdendoAdmin) {
      const outrosAdmins = await prisma.usuario.count({
        where: { id: { not: id }, role: { in: ['ADMINISTRADOR', 'ADMIN'] }, ativo: true },
      });
      if (outrosAdmins === 0) {
        return res.status(400).json({ erro: 'Não é possível remover o último administrador ativo do sistema.' });
      }
    }

    if (email && email !== usuario.email) {
      const emailEmUso = await prisma.usuario.findUnique({ where: { email } });
      if (emailEmUso) return res.status(409).json({ erro: 'Já existe um usuário com este email.' });
    }

    const dados = {};
    if (nome !== undefined) dados.nome = nome;
    if (email !== undefined) dados.email = email;
    if (telefone !== undefined) dados.telefone = telefone || null;
    if (creci !== undefined) dados.creci = creci || null;
    if (role !== undefined) dados.role = role;
    if (ativo !== undefined) dados.ativo = Boolean(ativo);
    if (novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres.' });
      dados.senha = await bcrypt.hash(novaSenha, 10);
    }

    const atualizado = await prisma.usuario.update({ where: { id }, data: dados });
    res.json(semSenha(atualizado));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar usuário.' });
  }
});

// DELETE /api/usuarios/:id - remove o acesso de um usuário
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (id === req.usuario.id) {
      return res.status(400).json({ erro: 'Você não pode excluir seu próprio usuário.' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    if (ehAdministrador(usuario.role)) {
      const outrosAdmins = await prisma.usuario.count({
        where: { id: { not: id }, role: { in: ['ADMINISTRADOR', 'ADMIN'] }, ativo: true },
      });
      if (outrosAdmins === 0) {
        return res.status(400).json({ erro: 'Não é possível excluir o último administrador ativo do sistema.' });
      }
    }

    await prisma.usuario.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir usuário.' });
  }
});

module.exports = router;
