const express = require('express');
const prisma = require('../config/prisma');
const { autenticar, exigirAdministrador } = require('../middleware/auth');
const {
  MODULOS, LABEL_ROLE, ROLES_VALIDOS, ehAdministrador, buscarPermissoesDoRole,
} = require('../utils/permissoes');

const router = express.Router();
router.use(autenticar);

// GET /api/permissoes/minhas - a matriz de permissões efetiva do usuário logado.
// Usado pelo frontend pra decidir o que mostrar no menu, sem precisar ser administrador.
router.get('/minhas', async (req, res) => {
  const permissoes = await buscarPermissoesDoRole(req.usuario.role);
  res.json({ role: req.usuario.role, permissoes });
});

// A partir daqui, só administrador
router.use(exigirAdministrador);

// GET /api/permissoes - matriz completa (todos os perfis) para a tela de gestão de usuários
router.get('/', async (req, res) => {
  const roles = ROLES_VALIDOS.filter((r) => !ehAdministrador(r));
  const porRole = {};
  for (const role of roles) {
    // eslint-disable-next-line no-await-in-loop
    porRole[role] = await buscarPermissoesDoRole(role);
  }
  // Administrador entra só pra exibição (sempre tudo liberado, não é editável)
  const tudoLiberado = {};
  MODULOS.forEach(({ chave }) => { tudoLiberado[chave] = { ver: true, editar: true }; });
  porRole.ADMINISTRADOR = tudoLiberado;

  res.json({ modulos: MODULOS, labelRoles: LABEL_ROLE, permissoesPorRole: porRole });
});

// PUT /api/permissoes { role, modulo, ver, editar } - atualiza uma célula da matriz
router.put('/', async (req, res) => {
  try {
    const { role, modulo, ver, editar } = req.body;

    if (ehAdministrador(role)) {
      return res.status(400).json({ erro: 'O perfil Administrador sempre tem acesso completo e não pode ser alterado.' });
    }
    if (!ROLES_VALIDOS.includes(role)) {
      return res.status(400).json({ erro: 'Perfil de acesso inválido.' });
    }
    if (!MODULOS.some((m) => m.chave === modulo)) {
      return res.status(400).json({ erro: 'Módulo inválido.' });
    }

    const atual = await buscarPermissoesDoRole(role);
    atual[modulo] = { ver: Boolean(ver), editar: Boolean(editar) };
    // Não faz sentido poder editar sem poder ver
    if (atual[modulo].editar) atual[modulo].ver = true;

    await prisma.permissaoRole.upsert({
      where: { role },
      update: { permissoesJson: JSON.stringify(atual) },
      create: { role, permissoesJson: JSON.stringify(atual) },
    });

    res.json({ role, permissoes: atual });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar a permissão.' });
  }
});

module.exports = router;
