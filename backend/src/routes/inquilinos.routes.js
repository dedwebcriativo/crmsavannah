const express = require('express');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');
const { validarCpfCnpj } = require('../utils/validacoes');
const { paginar } = require('../utils/paginacao');
const { gerarPlanilha, enviarPlanilha, formatarMoedaRelatorio, formatarDataRelatorio } = require('../utils/relatorio');

const router = express.Router();
router.use(autenticar);
router.use(verificarPermissao('inquilinos'));

const ESTADOS_CIVIS_COM_PARCEIRO = ['casado', 'uniao_estavel', 'divorciado'];

const CAMPOS_PERMITIDOS = [
  'nome', 'cpfCnpj', 'rgCnh', 'telefone', 'telefoneAdicional', 'email', 'enderecoAtual', 'numeroAtual', 'bairroAtual', 'cidadeAtual', 'estadoAtual', 'cepAtual',
  'profissao', 'ramoAtividade', 'mediaSalarial', 'escolaridade', 'estadoCivil',
  'conjugeNome', 'conjugeCpfCnpj', 'conjugeTelefone', 'conjugeRg', 'conjugeEmail', 'dependentes', 'declaraIrpf', 'chavePix', 'tipoChavePix',
  'socioResponsavelNome', 'socioResponsavelCpf', 'socioResponsavelTelefone', 'socioResponsavelEmail', 'socioResponsavel2Nome', 'socioResponsavel2Cpf', 'socioResponsavel2Telefone', 'socioResponsavel2Email', 'sociosJson',
  'fiadorNome', 'fiadorCpf', 'fiadorRg', 'fiadorEndereco', 'fiadorNumero', 'fiadorBairro', 'fiadorCidade', 'fiadorEstado', 'fiadorCep', 'fiadorTelefone', 'fiadorEmail', 'fiadorProfissao', 'fiadorEstadoCivil',
  'fiadorConjugeNome', 'fiadorConjugeCpf', 'fiadorConjugeTelefone', 'fiadorConjugeRg', 'fiadorConjugeEmail', 'fiadorSocioResponsavelNome', 'fiadorSocioResponsavelCpf', 'fiadorSocioResponsavelTelefone', 'fiadorSocioResponsavelEmail', 'fiadorSocioResponsavel2Nome', 'fiadorSocioResponsavel2Cpf', 'fiadorSocioResponsavel2Telefone', 'fiadorSocioResponsavel2Email',
  'fiadorMediaSalarial', 'fiadorEscolaridade', 'fiadorDependentes', 'fiadorDeclaraIrpf', 'fiadorPatrimonio',
  'fiador2Nome', 'fiador2Cpf', 'fiador2Rg', 'fiador2Endereco', 'fiador2Numero', 'fiador2Bairro', 'fiador2Cidade', 'fiador2Estado', 'fiador2Cep', 'fiador2Telefone', 'fiador2Email', 'fiador2Profissao', 'fiador2EstadoCivil',
  'fiador2ConjugeNome', 'fiador2ConjugeCpf', 'fiador2ConjugeTelefone', 'fiador2ConjugeRg', 'fiador2ConjugeEmail', 'fiador2SocioResponsavelNome', 'fiador2SocioResponsavelCpf', 'fiador2SocioResponsavelTelefone', 'fiador2SocioResponsavelEmail', 'fiador2SocioResponsavel2Nome', 'fiador2SocioResponsavel2Cpf', 'fiador2SocioResponsavel2Telefone', 'fiador2SocioResponsavel2Email',
  'fiador2MediaSalarial', 'fiador2Escolaridade', 'fiador2Dependentes', 'fiador2DeclaraIrpf', 'fiador2Patrimonio',
  'testemunha1Nome', 'testemunha1Cpf', 'testemunha2Nome', 'testemunha2Cpf',
];

// Valida os CPFs opcionais (cônjuge, fiador, cônjuge do fiador). Campos vazios são
// ignorados - só reprova se algo foi preenchido e o dígito verificador não bate.
function validarCpfsOpcionais(body) {
  const campos = [
    ['conjugeCpfCnpj', 'CPF/CNPJ do cônjuge/parceiro(a)'],
    ['fiadorCpf', 'CPF do fiador'],
    ['fiadorConjugeCpf', 'CPF do cônjuge/parceiro(a) do fiador'],
    ['fiador2Cpf', 'CPF do 2º fiador'],
    ['fiador2ConjugeCpf', 'CPF do cônjuge/parceiro(a) do 2º fiador'],
  ];
  for (const [campo, label] of campos) {
    if (body[campo] && !validarCpfCnpj(body[campo])) {
      return `${label} inválido. Confira os dígitos informados.`;
    }
  }
  return null;
}

function montarDados(body) {
  const dados = {};
  CAMPOS_PERMITIDOS.forEach((campo) => {
    if (body[campo] !== undefined) dados[campo] = body[campo];
  });

  if (dados.mediaSalarial !== undefined) {
    dados.mediaSalarial = dados.mediaSalarial === '' ? null : Number(dados.mediaSalarial);
  }
  if (dados.dependentes !== undefined) {
    dados.dependentes = dados.dependentes === '' ? 0 : Number(dados.dependentes);
  }
  if (dados.declaraIrpf !== undefined) {
    dados.declaraIrpf = dados.declaraIrpf === '' || dados.declaraIrpf === null ? null : Boolean(dados.declaraIrpf);
  }
  if (dados.fiadorMediaSalarial !== undefined) {
    dados.fiadorMediaSalarial = dados.fiadorMediaSalarial === '' ? null : Number(dados.fiadorMediaSalarial);
  }
  if (dados.fiadorDependentes !== undefined) {
    dados.fiadorDependentes = dados.fiadorDependentes === '' ? 0 : Number(dados.fiadorDependentes);
  }
  if (dados.fiadorDeclaraIrpf !== undefined) {
    dados.fiadorDeclaraIrpf = dados.fiadorDeclaraIrpf === '' || dados.fiadorDeclaraIrpf === null ? null : Boolean(dados.fiadorDeclaraIrpf);
  }
  if (dados.fiador2MediaSalarial !== undefined) {
    dados.fiador2MediaSalarial = dados.fiador2MediaSalarial === '' ? null : Number(dados.fiador2MediaSalarial);
  }
  if (dados.fiador2Dependentes !== undefined) {
    dados.fiador2Dependentes = dados.fiador2Dependentes === '' ? 0 : Number(dados.fiador2Dependentes);
  }
  if (dados.fiador2DeclaraIrpf !== undefined) {
    dados.fiador2DeclaraIrpf = dados.fiador2DeclaraIrpf === '' || dados.fiador2DeclaraIrpf === null ? null : Boolean(dados.fiador2DeclaraIrpf);
  }
  if (dados.fiadorPatrimonio !== undefined) {
    dados.fiadorPatrimonio = dados.fiadorPatrimonio === '' ? null : Number(dados.fiadorPatrimonio);
  }
  if (dados.fiador2Patrimonio !== undefined) {
    dados.fiador2Patrimonio = dados.fiador2Patrimonio === '' ? null : Number(dados.fiador2Patrimonio);
  }

  // Limpa os campos de cônjuge/parceiro(a) se o estado civil não for casado/união estável
  if (dados.estadoCivil !== undefined && !ESTADOS_CIVIS_COM_PARCEIRO.includes(dados.estadoCivil)) {
    dados.conjugeNome = null;
    dados.conjugeCpfCnpj = null;
    dados.conjugeTelefone = null;
    dados.conjugeEmail = null;
  }

  // Idem pro cônjuge/parceiro(a) do fiador
  if (dados.fiadorEstadoCivil !== undefined && !ESTADOS_CIVIS_COM_PARCEIRO.includes(dados.fiadorEstadoCivil)) {
    dados.fiadorConjugeNome = null;
    dados.fiadorConjugeCpf = null;
    dados.fiadorConjugeTelefone = null;
    dados.fiadorConjugeEmail = null;
  }

  return dados;
}

router.get('/', async (req, res) => {
  const { busca, pagina } = req.query;

  const inquilinos = await prisma.inquilino.findMany({
    where: busca
      ? {
          OR: [
            { nome: { contains: busca } },
            { cpfCnpj: { contains: busca } },
            { telefone: { contains: busca } },
            { email: { contains: busca } },
          ],
        }
      : undefined,
    include: { imoveis: true },
    orderBy: { criadoEm: 'desc' },
  });

  res.json(paginar(inquilinos, pagina));
});

// GET /api/inquilinos/relatorio?busca= - baixa um XLSX com os inquilinos (respeita o filtro de busca atual)
router.get('/relatorio', async (req, res) => {
  try {
    const { busca } = req.query;
    const inquilinos = await prisma.inquilino.findMany({
      where: busca
        ? {
            OR: [
              { nome: { contains: busca } },
              { cpfCnpj: { contains: busca } },
              { telefone: { contains: busca } },
              { email: { contains: busca } },
            ],
          }
        : undefined,
      orderBy: { nome: 'asc' },
    });

    const linhas = inquilinos.map((i) => ({
      Nome: i.nome,
      'CPF/CNPJ': i.cpfCnpj,
      Telefone: i.telefone || '',
      Email: i.email || '',
      Endereço: [i.enderecoAtual, i.numeroAtual].filter(Boolean).join(', '),
      Bairro: i.bairroAtual || '',
      Cidade: i.cidadeAtual || '',
      UF: i.estadoAtual || '',
      Profissão: i.profissao || '',
      'Média salarial': i.mediaSalarial ? formatarMoedaRelatorio(i.mediaSalarial) : '',
      'Estado civil': i.estadoCivil || '',
      'Nome do fiador': i.fiadorNome || '',
      'Telefone do fiador': i.fiadorTelefone || '',
      'Cadastrado em': formatarDataRelatorio(i.criadoEm),
    }));

    const buffer = gerarPlanilha(linhas, 'Inquilinos');
    enviarPlanilha(res, buffer, `inquilinos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o relatório.' });
  }
});

router.get('/:id', async (req, res) => {
  const inquilino = await prisma.inquilino.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      imoveis: true,
      contratos: { include: { imovel: true } },
      pagamentos: { orderBy: { dataVencimento: 'desc' } },
    },
  });

  if (!inquilino) return res.status(404).json({ erro: 'Inquilino não encontrado.' });
  res.json(inquilino);
});

router.post('/', async (req, res) => {
  try {
    const { nome, cpfCnpj, telefone } = req.body;

    if (!nome || !cpfCnpj || !telefone) {
      return res.status(400).json({ erro: 'Nome, CPF/CNPJ e telefone são obrigatórios.' });
    }

    if (!validarCpfCnpj(cpfCnpj)) {
      return res.status(400).json({ erro: 'CPF/CNPJ inválido. Confira os dígitos informados.' });
    }

    const erroCpf = validarCpfsOpcionais(req.body);
    if (erroCpf) return res.status(400).json({ erro: erroCpf });

    const inquilino = await prisma.inquilino.create({ data: montarDados(req.body) });

    res.status(201).json(inquilino);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') {
      return res.status(409).json({ erro: 'Já existe um inquilino com este CPF/CNPJ.' });
    }
    res.status(500).json({ erro: 'Erro ao cadastrar inquilino.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (req.body.cpfCnpj && !validarCpfCnpj(req.body.cpfCnpj)) {
      return res.status(400).json({ erro: 'CPF/CNPJ inválido. Confira os dígitos informados.' });
    }

    const erroCpf = validarCpfsOpcionais(req.body);
    if (erroCpf) return res.status(400).json({ erro: erroCpf });

    const inquilino = await prisma.inquilino.update({
      where: { id: Number(req.params.id) },
      data: montarDados(req.body),
    });
    res.json(inquilino);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar inquilino.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.inquilino.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir inquilino.' });
  }
});

module.exports = router;
