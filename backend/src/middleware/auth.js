const jwt = require('jsonwebtoken');
const { ehAdministrador, podeAcessar } = require('../utils/permissoes');

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: 'Token não fornecido.' });
  }

  const [, token] = authHeader.split(' ');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

// Só deixa passar quem é Administrador. Usado nas rotas de gestão de usuários e
// permissões - isso não é delegável pela tabela de permissões, é sempre exclusivo
// do administrador, pra evitar que alguém conceda acesso a si mesmo indevidamente.
function exigirAdministrador(req, res, next) {
  if (!ehAdministrador(req.usuario?.role)) {
    return res.status(403).json({ erro: 'Apenas administradores podem acessar este recurso.' });
  }
  return next();
}

// Verifica se o perfil (role) do usuário logado pode acessar o módulo pedido.
// GET é tratado como "ver"; qualquer outro método (POST/PUT/DELETE) como "editar".
function verificarPermissao(modulo) {
  return async (req, res, next) => {
    try {
      const acao = req.method === 'GET' ? 'ver' : 'editar';
      const liberado = await podeAcessar(req.usuario?.role, modulo, acao);
      if (!liberado) {
        return res.status(403).json({ erro: 'Seu perfil de acesso não tem permissão para isso.' });
      }
      return next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao verificar permissões.' });
    }
  };
}

module.exports = { autenticar, exigirAdministrador, verificarPermissao };
