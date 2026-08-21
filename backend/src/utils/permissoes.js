const prisma = require('../config/prisma');

// Perfis (roles) reconhecidos. "ADMIN" é mantido como sinônimo de ADMINISTRADOR só
// por compatibilidade com bancos que já tinham usuários criados antes desta feature.
const ROLES_ADMINISTRADOR = ['ADMINISTRADOR', 'ADMIN'];
const ROLES_VALIDOS = ['ADMINISTRADOR', 'COLABORADOR', 'CONTADOR'];

const LABEL_ROLE = {
  ADMINISTRADOR: 'Administrador',
  COLABORADOR: 'Colaborador',
  CONTADOR: 'Contador',
};

// Módulos do sistema que têm permissão configurável por perfil. A chave é o que os
// middlewares de rota usam; o label é só para exibir na tela de permissões.
const MODULOS = [
  { chave: 'imoveis', label: 'Imóveis' },
  { chave: 'inquilinos', label: 'Inquilinos' },
  { chave: 'proprietarios', label: 'Proprietários' },
  { chave: 'contratos', label: 'Contratos' },
  { chave: 'pagamentos', label: 'Pagamentos' },
  { chave: 'demonstrativos', label: 'Demonstrativos' },
];

// Permissões sugeridas ao criar um perfil novo pela primeira vez (o admin pode mudar
// tudo depois na tela de Usuários). Colaborador cuida do dia a dia operacional;
// Contador só acompanha o que importa para a parte financeira/fiscal.
const PERMISSOES_PADRAO = {
  COLABORADOR: {
    imoveis: { ver: true, editar: true },
    inquilinos: { ver: true, editar: true },
    proprietarios: { ver: true, editar: true },
    contratos: { ver: true, editar: true },
    pagamentos: { ver: true, editar: true },
    demonstrativos: { ver: true, editar: false },
  },
  CONTADOR: {
    imoveis: { ver: true, editar: false },
    inquilinos: { ver: true, editar: false },
    proprietarios: { ver: true, editar: false },
    contratos: { ver: true, editar: false },
    pagamentos: { ver: true, editar: true },
    demonstrativos: { ver: true, editar: true },
  },
};

function ehAdministrador(role) {
  return ROLES_ADMINISTRADOR.includes(String(role || '').toUpperCase());
}

function matrizPadrao(role) {
  const base = PERMISSOES_PADRAO[role] || {};
  const completa = {};
  MODULOS.forEach(({ chave }) => {
    completa[chave] = base[chave] || { ver: false, editar: false };
  });
  return completa;
}

// Devolve a matriz de permissões efetiva de um perfil: administrador sempre tem tudo
// liberado; os demais usam o que está salvo no banco (criando o padrão na primeira vez).
async function buscarPermissoesDoRole(role) {
  if (ehAdministrador(role)) {
    const tudo = {};
    MODULOS.forEach(({ chave }) => { tudo[chave] = { ver: true, editar: true }; });
    return tudo;
  }

  const registro = await prisma.permissaoRole.findUnique({ where: { role } });
  if (!registro) return matrizPadrao(role);

  try {
    const salvo = JSON.parse(registro.permissoesJson);
    const completa = matrizPadrao(role);
    return { ...completa, ...salvo };
  } catch {
    return matrizPadrao(role);
  }
}

async function podeAcessar(role, modulo, acao) {
  if (ehAdministrador(role)) return true;
  const permissoes = await buscarPermissoesDoRole(role);
  return Boolean(permissoes?.[modulo]?.[acao]);
}

module.exports = {
  ROLES_ADMINISTRADOR, ROLES_VALIDOS, LABEL_ROLE, MODULOS, PERMISSOES_PADRAO,
  ehAdministrador, matrizPadrao, buscarPermissoesDoRole, podeAcessar,
};
