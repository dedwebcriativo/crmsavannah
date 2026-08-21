const express = require('express');
const path = require('path');
const prisma = require('../config/prisma');
const { autenticar, verificarPermissao } = require('../middleware/auth');
const { gerarContratoPdf, PASTA_ARQUIVOS } = require('../services/pdf.service');
const { obterLinkPublicoOuFallback } = require('../services/ftp.service');
const { enviarDocumento } = require('../services/whatsapp.service');
const { montarMensagemPersonalizada } = require('../utils/mensagemWhatsapp');
const {
  montarDadosPlaceholders, substituirPlaceholders, TEMPLATES_PADRAO, interpretarChecklist, LABEL_TIPO_DOCUMENTO, inserirClausulasAdicionais,
} = require('../utils/template');
const { calcularRepasse, calcularValorProporcional, gerarDatasVencimentoMensal, formatarReferenteMes, parseDataLocal } = require('../utils/financeiro');
const { paginar } = require('../utils/paginacao');
const { validarCpfCnpj } = require('../utils/validacoes');

const TIPOS_VALIDOS = ['LOCACAO_RESIDENCIAL', 'LOCACAO_COMERCIAL', 'INTERMEDIACAO', 'VISTORIA_INICIAL', 'VISTORIA_FINAL', 'RESCISAO'];
const TIPOS_GARANTIA_VALIDOS = ['PROPRIO', 'CAUCAO', 'SEGURO_LOFT', 'GARANTIA_INVESTE_LOFT', 'LOFT']; // LOFT = alias antigo de GARANTIA_INVESTE_LOFT
const CAMPO_ARQUIVO = {
  LOCACAO_RESIDENCIAL: 'arquivoPdfLocacao',
  LOCACAO_COMERCIAL: 'arquivoPdfLocacao',
  INTERMEDIACAO: 'arquivoPdfIntermediacao',
  VISTORIA_INICIAL: 'arquivoPdfVistoriaInicial',
  VISTORIA_FINAL: 'arquivoPdfVistoriaFinal',
  RESCISAO: 'arquivoPdfRescisao',
};

function tipoValido(tipo) {
  return TIPOS_VALIDOS.includes(tipo);
}

function normalizarTipoGarantia(tipoGarantia) {
  if (!TIPOS_GARANTIA_VALIDOS.includes(tipoGarantia)) return 'PROPRIO';
  return tipoGarantia === 'LOFT' ? 'GARANTIA_INVESTE_LOFT' : tipoGarantia;
}

// Garantia Investe (LOFT) só é aceita pra locatário Pessoa Física (CPF, 11 dígitos) -
// retorna mensagem de erro quando o inquilino for CNPJ, ou null se estiver tudo certo.
function validarGarantiaInvesteLoft(tipoGarantia, inquilinoCpfCnpj) {
  if (tipoGarantia !== 'GARANTIA_INVESTE_LOFT') return null;
  const digitos = String(inquilinoCpfCnpj || '').replace(/\D/g, '');
  if (digitos.length !== 11) {
    return 'Garantia Investe (LOFT) só está disponível para locatário Pessoa Física (CPF).';
  }
  return null;
}

// Valida os CPFs opcionais informados (fiador, cônjuge do fiador, testemunhas). Campos vazios
// são ignorados - só reprova se algo foi preenchido e o dígito verificador não bate.
function validarCpfsOpcionais(body) {
  const campos = [
    ['fiadorCpf', 'CPF/CNPJ do fiador'],
    ['fiadorConjugeCpf', 'CPF do cônjuge/parceiro(a) do fiador'],
    ['fiadorSocioResponsavelCpf', 'CPF do sócio/representante legal do fiador'],
    ['fiadorSocioResponsavel2Cpf', 'CPF do 2º sócio/representante legal do fiador'],
    ['fiador2Cpf', 'CPF/CNPJ do 2º fiador'],
    ['fiador2ConjugeCpf', 'CPF do cônjuge/parceiro(a) do 2º fiador'],
    ['fiador2SocioResponsavelCpf', 'CPF do sócio/representante legal do 2º fiador'],
    ['fiador2SocioResponsavel2Cpf', 'CPF do 2º sócio/representante legal do 2º fiador'],
    ['socioResponsavelCpf', 'CPF do sócio/representante legal do locatário'],
    ['socioResponsavel2Cpf', 'CPF do 2º sócio/representante legal do locatário'],
    ['testemunha1Cpf', 'CPF da testemunha 1'],
    ['testemunha2Cpf', 'CPF da testemunha 2'],
  ];
  for (const [campo, label] of campos) {
    const valor = body[campo];
    if (valor && !validarCpfCnpj(valor)) {
      return `${label} inválido. Confira os dígitos informados.`;
    }
  }
  return null;
}

// Gera (via tx.pagamento.createMany) as parcelas mensais de aluguel de um contrato,
// usadas tanto na criação do contrato quanto na regeneração manual de parcelas.
// Reflete sempre os dados ATUAIS do contrato (valor, datas, comissão, intermediação etc.)
async function gerarParcelasAluguel(tx, contrato) {
  const {
    id: contratoId, inquilinoId, valorAluguel, dataInicio, dataFim, dataEntrada,
    diaVencimento, vencimentoQuintoDiaUtil, percentualComissao, percentualTaxaIntermediacao, mesesIntermediacao,
  } = contrato;

  if (!dataFim) return 0;

  const datasVencimento = gerarDatasVencimentoMensal(
    parseDataLocal(dataInicio), parseDataLocal(dataFim), diaVencimento, vencimentoQuintoDiaUtil,
  );
  if (datasVencimento.length === 0) return 0;

  const percentualComissaoNum = percentualComissao === null || percentualComissao === undefined ? null : Number(percentualComissao);
  const percentualIntermediacaoNum = percentualTaxaIntermediacao === null || percentualTaxaIntermediacao === undefined ? null : Number(percentualTaxaIntermediacao);
  const listaMesesIntermediacao = String(mesesIntermediacao || '1')
    .split(',').map((m) => Number(m.trim())).filter(Boolean);
  const dataEntradaObj = dataEntrada ? parseDataLocal(dataEntrada) : null;

  await tx.pagamento.createMany({
    data: datasVencimento.map((dataVencimento, indice) => {
      const ehMesProporcional = indice === 0 && !!dataEntradaObj;
      const valorDoMes = ehMesProporcional
        ? calcularValorProporcional(valorAluguel, dataEntradaObj)
        : Number(valorAluguel);

      const ehMesDaIntermediacao = listaMesesIntermediacao.includes(indice + 1) && !ehMesProporcional;
      const percentualIntermediacaoDoMes = ehMesDaIntermediacao ? percentualIntermediacaoNum : null;
      const valorIntermediacaoDoMes = ehMesDaIntermediacao && percentualIntermediacaoNum
        ? Number((Number(valorAluguel) * (percentualIntermediacaoNum / 100)).toFixed(2))
        : null;
      const percentualComissaoDoMes = ehMesDaIntermediacao ? null : percentualComissaoNum;

      return {
        inquilinoId,
        contratoId,
        tipo: 'ALUGUEL',
        valor: valorDoMes,
        referenteMes: formatarReferenteMes(dataVencimento),
        metodo: 'PIX',
        dataVencimento,
        percentualImobiliaria: percentualComissaoDoMes,
        percentualIntermediacao: percentualIntermediacaoDoMes,
        valorIntermediacao: valorIntermediacaoDoMes,
        valorRepasse: calcularRepasse({
          valor: valorDoMes,
          percentualImobiliaria: percentualComissaoDoMes,
          intermediacao: valorIntermediacaoDoMes,
        }),
      };
    }),
  });

  return datasVencimento.length;
}

const router = express.Router();

// Pública de propósito: precisa ser acessível pelo navegador via link direto e
// pela Meta (WhatsApp Cloud API) para buscar o arquivo ao enviar a mensagem.
router.get('/:id/pdf/:tipo', async (req, res) => {
  const tipo = tipoValido(req.params.tipo) ? req.params.tipo : 'LOCACAO_RESIDENCIAL';
  const contrato = await prisma.contrato.findUnique({ where: { id: Number(req.params.id) } });
  const caminhoArquivo = contrato?.[CAMPO_ARQUIVO[tipo]];

  if (!contrato || !caminhoArquivo) {
    return res.status(404).json({ erro: 'Este documento ainda não foi gerado.' });
  }

  // Sem isso, o navegador usa o final da URL (ex: "LOCACAO_RESIDENCIAL") como nome
  // sugerido ao salvar - "inline" mantém a visualização direto no navegador (não força
  // download automático), só corrige o nome sugerido quando o usuário salvar.
  const nomeArquivoReal = path.basename(caminhoArquivo);
  res.setHeader('Content-Disposition', `inline; filename="${nomeArquivoReal}"`);
  res.sendFile(path.join(PASTA_ARQUIVOS, '..', caminhoArquivo));
});

router.use(autenticar);
router.use(verificarPermissao('contratos'));

// GET /api/contratos?busca=&pagina=1
router.get('/', async (req, res) => {
  const { busca, pagina } = req.query;

  const where = busca
    ? {
        OR: [
          { inquilino: { nome: { contains: busca } } },
          { imovel: { nome: { contains: busca } } },
          { imovel: { endereco: { contains: busca } } },
        ],
      }
    : undefined;

  const contratos = await prisma.contrato.findMany({
    where,
    include: { inquilino: true, imovel: { include: { proprietario: true } } },
    orderBy: { criadoEm: 'desc' },
  });
  res.json(paginar(contratos, pagina));
});

router.get('/:id', async (req, res) => {
  const contrato = await prisma.contrato.findUnique({
    where: { id: Number(req.params.id) },
    include: { inquilino: true, imovel: { include: { proprietario: true } }, pagamentos: true },
  });
  if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });
  res.json(contrato);
});

// POST /api/contratos - cria o contrato e já vincula o imóvel ao inquilino
router.post('/', async (req, res) => {
  try {
    const {
      inquilinoId, imovelId, valorAluguel, caucao, dataInicio, dataFim, dataEntrada, diaVencimento, vencimentoQuintoDiaUtil, observacoes, percentualComissao, clausulasAdicionaisJson,
      percentualTaxaIntermediacao, mesesIntermediacao, tipoGarantia, indiceReajuste, numeroContrato, dataAssinatura, despesasAdicionais, caucaoParcelas, caucaoDataPagamento,
      fiadorNome, fiadorCpf, fiadorRg, fiadorEndereco, fiadorNumero, fiadorBairro, fiadorCidade, fiadorEstado, fiadorCep, fiadorTelefone, fiadorEmail, fiadorProfissao, fiadorEstadoCivil,
      fiadorConjugeNome, fiadorConjugeCpf, fiadorConjugeTelefone, fiadorConjugeRg, fiadorConjugeEmail, fiadorSocioResponsavelNome, fiadorSocioResponsavelCpf, fiadorSocioResponsavelTelefone, fiadorSocioResponsavelEmail, fiadorSocioResponsavel2Nome, fiadorSocioResponsavel2Cpf, fiadorSocioResponsavel2Telefone, fiadorSocioResponsavel2Email,
      fiadorMediaSalarial, fiadorEscolaridade, fiadorDependentes, fiadorDeclaraIrpf, fiadorPatrimonio,
      fiador2Nome, fiador2Cpf, fiador2Rg, fiador2Endereco, fiador2Numero, fiador2Bairro, fiador2Cidade, fiador2Estado, fiador2Cep, fiador2Telefone, fiador2Email, fiador2Profissao, fiador2EstadoCivil,
      fiador2ConjugeNome, fiador2ConjugeCpf, fiador2ConjugeTelefone, fiador2ConjugeRg, fiador2ConjugeEmail, fiador2SocioResponsavelNome, fiador2SocioResponsavelCpf, fiador2SocioResponsavelTelefone, fiador2SocioResponsavelEmail, fiador2SocioResponsavel2Nome, fiador2SocioResponsavel2Cpf, fiador2SocioResponsavel2Telefone, fiador2SocioResponsavel2Email,
      fiador2MediaSalarial, fiador2Escolaridade, fiador2Dependentes, fiador2DeclaraIrpf, fiador2Patrimonio,
      socioResponsavelNome, socioResponsavelCpf, socioResponsavelTelefone, socioResponsavelEmail, socioResponsavel2Nome, socioResponsavel2Cpf, socioResponsavel2Telefone, socioResponsavel2Email,
      assinantesAdicionais,
      testemunha1Nome, testemunha1Cpf, testemunha2Nome, testemunha2Cpf,
      checklistVistoriaInicial, dataVistoriaInicial,
    } = req.body;

    if (!inquilinoId || !imovelId || !valorAluguel || !dataInicio) {
      return res.status(400).json({ erro: 'Preencha inquilino, imóvel, valor e data de início.' });
    }
    if (!numeroContrato || !numeroContrato.trim()) {
      return res.status(400).json({ erro: 'Informe o número do contrato.' });
    }

    const erroCpf = validarCpfsOpcionais(req.body);
    if (erroCpf) return res.status(400).json({ erro: erroCpf });

    const tipoGarantiaNormalizado = normalizarTipoGarantia(tipoGarantia);
    const inquilinoDaLocacao = await prisma.inquilino.findUnique({ where: { id: Number(inquilinoId) } });
    if (!inquilinoDaLocacao) return res.status(400).json({ erro: 'Inquilino não encontrado.' });
    const erroGarantia = validarGarantiaInvesteLoft(tipoGarantiaNormalizado, inquilinoDaLocacao.cpfCnpj);
    if (erroGarantia) return res.status(400).json({ erro: erroGarantia });

    // Vencimento do aluguel: só o dia do mês (1-31) ou "sempre o 5º dia útil" - o mês/ano
    // é sempre o do período do contrato, não precisa escolher uma data completa. Cai pro
    // dia da data de início quando nada for informado, pra manter o comportamento antigo.
    const quintoDiaUtil = !!vencimentoQuintoDiaUtil;
    const diaVencimentoNum = quintoDiaUtil || !diaVencimento ? null : Number(diaVencimento);

    // Despesas adicionais (água, luz, condomínio etc.) selecionadas para este contrato -
    // aceita tanto array (ex: ["agua","luz"]) quanto string já separada por vírgula.
    const despesasAdicionaisStr = Array.isArray(despesasAdicionais)
      ? despesasAdicionais.filter(Boolean).join(',')
      : (despesasAdicionais || null);

    const contrato = await prisma.$transaction(async (tx) => {
      const novoContrato = await tx.contrato.create({
        data: {
          inquilinoId: Number(inquilinoId),
          imovelId: Number(imovelId),
          valorAluguel,
          caucao: caucao || null,
          caucaoParcelas: caucaoParcelas === '' || caucaoParcelas === undefined || caucaoParcelas === null ? 1 : Number(caucaoParcelas),
          caucaoDataPagamento: caucaoDataPagamento ? new Date(caucaoDataPagamento) : null,
          percentualComissao: percentualComissao === '' || percentualComissao === undefined ? null : Number(percentualComissao),
          percentualTaxaIntermediacao: percentualTaxaIntermediacao === '' || percentualTaxaIntermediacao === undefined ? null : Number(percentualTaxaIntermediacao),
          mesesIntermediacao: Array.isArray(mesesIntermediacao)
            ? mesesIntermediacao.join(',')
            : (mesesIntermediacao || '1'),
          dataInicio: new Date(dataInicio),
          dataEntrada: dataEntrada ? new Date(dataEntrada) : null,
          dataFim: dataFim ? new Date(dataFim) : null,
          diaVencimento: diaVencimentoNum,
          vencimentoQuintoDiaUtil: quintoDiaUtil,
          despesasAdicionais: despesasAdicionaisStr,
          observacoes: observacoes || null,
          clausulasAdicionaisJson: clausulasAdicionaisJson || null,
          tipoGarantia: tipoGarantiaNormalizado,
          indiceReajuste: indiceReajuste || 'IVAR',
          numeroContrato: numeroContrato && numeroContrato.trim() ? numeroContrato.trim() : null,
          dataAssinatura: dataAssinatura ? parseDataLocal(dataAssinatura) : null,
          fiadorNome: fiadorNome || null,
          fiadorCpf: fiadorCpf || null,
          fiadorRg: fiadorRg || null,
          fiadorEndereco: fiadorEndereco || null,
          fiadorNumero: fiadorNumero || null,
          fiadorBairro: fiadorBairro || null,
          fiadorCidade: fiadorCidade || null,
          fiadorEstado: fiadorEstado || null,
          fiadorCep: fiadorCep || null,
          fiadorTelefone: fiadorTelefone || null,
          fiadorEmail: fiadorEmail || null,
          fiadorProfissao: fiadorProfissao || null,
          fiadorEstadoCivil: fiadorEstadoCivil || null,
          fiadorConjugeNome: fiadorConjugeNome || null,
          fiadorConjugeCpf: fiadorConjugeCpf || null,
          fiadorConjugeTelefone: fiadorConjugeTelefone || null,
          fiadorConjugeRg: fiadorConjugeRg || null,
          fiadorConjugeEmail: fiadorConjugeEmail || null,
          fiadorSocioResponsavelNome: fiadorSocioResponsavelNome || null,
          fiadorSocioResponsavelCpf: fiadorSocioResponsavelCpf || null,
          fiadorSocioResponsavelTelefone: fiadorSocioResponsavelTelefone || null,
          fiadorSocioResponsavelEmail: fiadorSocioResponsavelEmail || null,
          fiadorSocioResponsavel2Nome: fiadorSocioResponsavel2Nome || null,
          fiadorSocioResponsavel2Cpf: fiadorSocioResponsavel2Cpf || null,
          fiadorSocioResponsavel2Telefone: fiadorSocioResponsavel2Telefone || null,
          fiadorSocioResponsavel2Email: fiadorSocioResponsavel2Email || null,
          fiadorMediaSalarial: fiadorMediaSalarial === '' || fiadorMediaSalarial === undefined ? null : Number(fiadorMediaSalarial),
          fiadorEscolaridade: fiadorEscolaridade || null,
          fiadorDependentes: fiadorDependentes === '' || fiadorDependentes === undefined ? 0 : Number(fiadorDependentes),
          fiadorDeclaraIrpf: fiadorDeclaraIrpf === '' || fiadorDeclaraIrpf === undefined || fiadorDeclaraIrpf === null ? null : Boolean(fiadorDeclaraIrpf),
          fiadorPatrimonio: fiadorPatrimonio === '' || fiadorPatrimonio === undefined ? null : Number(fiadorPatrimonio),
          fiador2Nome: fiador2Nome || null,
          fiador2Cpf: fiador2Cpf || null,
          fiador2Rg: fiador2Rg || null,
          fiador2Endereco: fiador2Endereco || null,
          fiador2Numero: fiador2Numero || null,
          fiador2Bairro: fiador2Bairro || null,
          fiador2Cidade: fiador2Cidade || null,
          fiador2Estado: fiador2Estado || null,
          fiador2Cep: fiador2Cep || null,
          fiador2Telefone: fiador2Telefone || null,
          fiador2Email: fiador2Email || null,
          fiador2Profissao: fiador2Profissao || null,
          fiador2EstadoCivil: fiador2EstadoCivil || null,
          fiador2ConjugeNome: fiador2ConjugeNome || null,
          fiador2ConjugeCpf: fiador2ConjugeCpf || null,
          fiador2ConjugeTelefone: fiador2ConjugeTelefone || null,
          fiador2ConjugeRg: fiador2ConjugeRg || null,
          fiador2ConjugeEmail: fiador2ConjugeEmail || null,
          fiador2SocioResponsavelNome: fiador2SocioResponsavelNome || null,
          fiador2SocioResponsavelCpf: fiador2SocioResponsavelCpf || null,
          fiador2SocioResponsavelTelefone: fiador2SocioResponsavelTelefone || null,
          fiador2SocioResponsavelEmail: fiador2SocioResponsavelEmail || null,
          fiador2SocioResponsavel2Nome: fiador2SocioResponsavel2Nome || null,
          fiador2SocioResponsavel2Cpf: fiador2SocioResponsavel2Cpf || null,
          fiador2SocioResponsavel2Telefone: fiador2SocioResponsavel2Telefone || null,
          fiador2SocioResponsavel2Email: fiador2SocioResponsavel2Email || null,
          fiador2MediaSalarial: fiador2MediaSalarial === '' || fiador2MediaSalarial === undefined ? null : Number(fiador2MediaSalarial),
          fiador2Escolaridade: fiador2Escolaridade || null,
          fiador2Dependentes: fiador2Dependentes === '' || fiador2Dependentes === undefined ? 0 : Number(fiador2Dependentes),
          fiador2DeclaraIrpf: fiador2DeclaraIrpf === '' || fiador2DeclaraIrpf === undefined || fiador2DeclaraIrpf === null ? null : Boolean(fiador2DeclaraIrpf),
          fiador2Patrimonio: fiador2Patrimonio === '' || fiador2Patrimonio === undefined ? null : Number(fiador2Patrimonio),
          socioResponsavelNome: socioResponsavelNome || null,
          socioResponsavelCpf: socioResponsavelCpf || null,
          socioResponsavelTelefone: socioResponsavelTelefone || null,
          socioResponsavelEmail: socioResponsavelEmail || null,
          socioResponsavel2Nome: socioResponsavel2Nome || null,
          socioResponsavel2Cpf: socioResponsavel2Cpf || null,
          socioResponsavel2Telefone: socioResponsavel2Telefone || null,
          socioResponsavel2Email: socioResponsavel2Email || null,
          assinantesAdicionais: assinantesAdicionais || null,
          testemunha1Nome: testemunha1Nome || null,
          testemunha1Cpf: testemunha1Cpf || null,
          testemunha2Nome: testemunha2Nome || null,
          testemunha2Cpf: testemunha2Cpf || null,
          checklistVistoriaInicial: checklistVistoriaInicial || null,
          dataVistoriaInicial: dataVistoriaInicial ? new Date(dataVistoriaInicial) : null,
        },
      });

      await tx.imovel.update({
        where: { id: Number(imovelId) },
        data: { status: 'ALUGADO', inquilinoId: Number(inquilinoId) },
      });

      // Gera automaticamente as parcelas mensais de aluguel para todo o
      // período do contrato (do mês de início até a data de término),
      // já lançadas em Pagamentos com o vencimento de cada mês.
      const pagamentosGerados = await gerarParcelasAluguel(tx, {
        id: novoContrato.id,
        inquilinoId: Number(inquilinoId),
        valorAluguel,
        dataInicio,
        dataFim,
        dataEntrada,
        diaVencimento: diaVencimentoNum,
        vencimentoQuintoDiaUtil: quintoDiaUtil,
        percentualComissao: percentualComissao === '' || percentualComissao === undefined ? null : Number(percentualComissao),
        percentualTaxaIntermediacao: percentualTaxaIntermediacao === '' || percentualTaxaIntermediacao === undefined ? null : Number(percentualTaxaIntermediacao),
        mesesIntermediacao: Array.isArray(mesesIntermediacao) ? mesesIntermediacao.join(',') : (mesesIntermediacao || '1'),
      });

      return { ...novoContrato, pagamentosGerados };
    });

    res.status(201).json(contrato);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar contrato.' });
  }
});

// PUT /api/contratos/:id - edita os termos do contrato (valor, caução, datas, fiador,
// testemunhas, taxa de intermediação, checklists de vistoria, rescisão, observações)
router.put('/:id', async (req, res) => {
  try {
    const erroCpf = validarCpfsOpcionais(req.body);
    if (erroCpf) return res.status(400).json({ erro: erroCpf });

    if (req.body.numeroContrato !== undefined && !req.body.numeroContrato.trim()) {
      return res.status(400).json({ erro: 'Informe o número do contrato.' });
    }

    const camposDiretos = [
      'observacoes', 'indiceReajuste', 'numeroContrato', 'clausulasAdicionaisJson',
      'fiadorNome', 'fiadorCpf', 'fiadorRg', 'fiadorEndereco', 'fiadorNumero', 'fiadorBairro', 'fiadorCidade', 'fiadorEstado', 'fiadorCep', 'fiadorTelefone', 'fiadorEmail', 'fiadorProfissao', 'fiadorEstadoCivil',
      'fiadorConjugeNome', 'fiadorConjugeCpf', 'fiadorConjugeTelefone', 'fiadorConjugeRg', 'fiadorConjugeEmail', 'fiadorSocioResponsavelNome', 'fiadorSocioResponsavelCpf', 'fiadorSocioResponsavelTelefone', 'fiadorSocioResponsavelEmail', 'fiadorSocioResponsavel2Nome', 'fiadorSocioResponsavel2Cpf', 'fiadorSocioResponsavel2Telefone', 'fiadorSocioResponsavel2Email',
      'fiadorMediaSalarial', 'fiadorEscolaridade', 'fiadorDependentes', 'fiadorDeclaraIrpf', 'fiadorPatrimonio',
      'fiador2Nome', 'fiador2Cpf', 'fiador2Rg', 'fiador2Endereco', 'fiador2Numero', 'fiador2Bairro', 'fiador2Cidade', 'fiador2Estado', 'fiador2Cep', 'fiador2Telefone', 'fiador2Email', 'fiador2Profissao', 'fiador2EstadoCivil',
      'fiador2ConjugeNome', 'fiador2ConjugeCpf', 'fiador2ConjugeTelefone', 'fiador2ConjugeRg', 'fiador2ConjugeEmail', 'fiador2SocioResponsavelNome', 'fiador2SocioResponsavelCpf', 'fiador2SocioResponsavelTelefone', 'fiador2SocioResponsavelEmail', 'fiador2SocioResponsavel2Nome', 'fiador2SocioResponsavel2Cpf', 'fiador2SocioResponsavel2Telefone', 'fiador2SocioResponsavel2Email',
      'fiador2MediaSalarial', 'fiador2Escolaridade', 'fiador2Dependentes', 'fiador2DeclaraIrpf', 'fiador2Patrimonio',
      'socioResponsavelNome', 'socioResponsavelCpf', 'socioResponsavelTelefone', 'socioResponsavelEmail', 'socioResponsavel2Nome', 'socioResponsavel2Cpf', 'socioResponsavel2Telefone', 'socioResponsavel2Email',
      'assinantesAdicionais',
      'testemunha1Nome', 'testemunha1Cpf', 'testemunha2Nome', 'testemunha2Cpf',
      'checklistVistoriaInicial', 'checklistVistoriaFinal',
      'motivoRescisao', 'observacoesRescisao',
    ];

    const dados = {};
    camposDiretos.forEach((campo) => {
      if (req.body[campo] !== undefined) dados[campo] = req.body[campo] || null;
    });

    ['fiadorMediaSalarial', 'fiador2MediaSalarial', 'fiadorPatrimonio', 'fiador2Patrimonio'].forEach((campo) => {
      if (dados[campo] !== undefined) dados[campo] = dados[campo] === null || dados[campo] === '' ? null : Number(dados[campo]);
    });
    ['fiadorDependentes', 'fiador2Dependentes'].forEach((campo) => {
      if (dados[campo] !== undefined) dados[campo] = dados[campo] === null || dados[campo] === '' ? 0 : Number(dados[campo]);
    });
    ['fiadorDeclaraIrpf', 'fiador2DeclaraIrpf'].forEach((campo) => {
      if (req.body[campo] !== undefined) dados[campo] = req.body[campo] === '' || req.body[campo] === null ? null : Boolean(req.body[campo]);
    });
    if (req.body.dataAssinatura !== undefined) {
      dados.dataAssinatura = req.body.dataAssinatura ? parseDataLocal(req.body.dataAssinatura) : null;
    }

    if (req.body.tipoGarantia !== undefined) {
      const tipoGarantiaNormalizado = normalizarTipoGarantia(req.body.tipoGarantia);
      const contratoAtual = await prisma.contrato.findUnique({ where: { id: Number(req.params.id) }, include: { inquilino: true } });
      if (!contratoAtual) return res.status(404).json({ erro: 'Contrato não encontrado.' });
      const erroGarantia = validarGarantiaInvesteLoft(tipoGarantiaNormalizado, contratoAtual.inquilino.cpfCnpj);
      if (erroGarantia) return res.status(400).json({ erro: erroGarantia });
      dados.tipoGarantia = tipoGarantiaNormalizado;
    }

    if (req.body.caucaoParcelas !== undefined) {
      dados.caucaoParcelas = req.body.caucaoParcelas === '' || req.body.caucaoParcelas === null ? 1 : Number(req.body.caucaoParcelas);
    }
    if (req.body.caucaoDataPagamento !== undefined) {
      dados.caucaoDataPagamento = req.body.caucaoDataPagamento ? new Date(req.body.caucaoDataPagamento) : null;
    }

    if (req.body.valorAluguel !== undefined) dados.valorAluguel = Number(req.body.valorAluguel);
    if (req.body.caucao !== undefined) dados.caucao = req.body.caucao === '' || req.body.caucao === null ? null : Number(req.body.caucao);
    if (req.body.percentualComissao !== undefined) {
      dados.percentualComissao = req.body.percentualComissao === '' || req.body.percentualComissao === null ? null : Number(req.body.percentualComissao);
    }
    if (req.body.percentualTaxaIntermediacao !== undefined) {
      dados.percentualTaxaIntermediacao = req.body.percentualTaxaIntermediacao === '' || req.body.percentualTaxaIntermediacao === null
        ? null : Number(req.body.percentualTaxaIntermediacao);
    }
    if (req.body.mesesIntermediacao !== undefined) {
      dados.mesesIntermediacao = Array.isArray(req.body.mesesIntermediacao)
        ? req.body.mesesIntermediacao.join(',')
        : (req.body.mesesIntermediacao || '1');
    }
    if (req.body.dataEntrada !== undefined) dados.dataEntrada = req.body.dataEntrada ? new Date(req.body.dataEntrada) : null;
    if (req.body.multaRescisao !== undefined) {
      dados.multaRescisao = req.body.multaRescisao === '' || req.body.multaRescisao === null ? null : Number(req.body.multaRescisao);
    }
    if (req.body.dataInicio !== undefined) dados.dataInicio = new Date(req.body.dataInicio);
    if (req.body.dataFim !== undefined) dados.dataFim = req.body.dataFim ? new Date(req.body.dataFim) : null;
    if (req.body.diaVencimento !== undefined) {
      dados.diaVencimento = req.body.diaVencimento === '' || req.body.diaVencimento === null ? null : Number(req.body.diaVencimento);
    }
    if (req.body.vencimentoQuintoDiaUtil !== undefined) {
      dados.vencimentoQuintoDiaUtil = !!req.body.vencimentoQuintoDiaUtil;
      if (dados.vencimentoQuintoDiaUtil) dados.diaVencimento = null;
    }
    if (req.body.despesasAdicionais !== undefined) {
      dados.despesasAdicionais = Array.isArray(req.body.despesasAdicionais)
        ? req.body.despesasAdicionais.filter(Boolean).join(',') || null
        : (req.body.despesasAdicionais || null);
    }
    if (req.body.dataVistoriaInicial !== undefined) dados.dataVistoriaInicial = req.body.dataVistoriaInicial ? new Date(req.body.dataVistoriaInicial) : null;
    if (req.body.dataVistoriaFinal !== undefined) dados.dataVistoriaFinal = req.body.dataVistoriaFinal ? new Date(req.body.dataVistoriaFinal) : null;
    if (req.body.dataRescisao !== undefined) dados.dataRescisao = req.body.dataRescisao ? new Date(req.body.dataRescisao) : null;

    const contrato = await prisma.contrato.update({
      where: { id: Number(req.params.id) },
      data: dados,
    });

    res.json(contrato);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar contrato.' });
  }
});

// POST /api/contratos/:id/regenerar-parcelas - gera as parcelas de aluguel que estão
// FALTANDO para o período do contrato, usando os dados ATUAIS do contrato (valor, datas,
// comissão, intermediação etc). Não é automático - só roda quando o usuário pede, tipicamente
// depois de apagar parcelas manualmente e corrigir algo no contrato (editar contrato > botão
// "Regenerar parcelas"). NUNCA mexe em parcelas já existentes (pagas ou não) - só completa os
// meses que faltam, comparando pelo referenteMes (ex: "2026-07"), pra nunca duplicar.
router.post('/:id/regenerar-parcelas', async (req, res) => {
  try {
    const contratoId = Number(req.params.id);
    const contrato = await prisma.contrato.findUnique({ where: { id: contratoId } });
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });
    if (!contrato.dataFim) {
      return res.status(400).json({ erro: 'Este contrato não tem data de término definida, não é possível gerar as parcelas.' });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const parcelasExistentes = await tx.pagamento.findMany({
        where: { contratoId, tipo: 'ALUGUEL' },
        select: { referenteMes: true },
      });
      const mesesExistentes = new Set(parcelasExistentes.map((p) => p.referenteMes));

      const todasAsDatas = gerarDatasVencimentoMensal(
        parseDataLocal(contrato.dataInicio), parseDataLocal(contrato.dataFim), contrato.diaVencimento, contrato.vencimentoQuintoDiaUtil,
      );
      // Índice de cada data mantém a posição original (1º mês = proporcional/intermediação),
      // mesmo que os meses anteriores já existam e sejam pulados aqui.
      const datasFaltantes = todasAsDatas
        .map((data, indice) => ({ data, indice }))
        .filter(({ data }) => !mesesExistentes.has(formatarReferenteMes(data)));

      if (datasFaltantes.length === 0) return { pagamentosGerados: 0 };

      const percentualComissaoNum = contrato.percentualComissao === null ? null : Number(contrato.percentualComissao);
      const percentualIntermediacaoNum = contrato.percentualTaxaIntermediacao === null ? null : Number(contrato.percentualTaxaIntermediacao);
      const listaMesesIntermediacao = String(contrato.mesesIntermediacao || '1')
        .split(',').map((m) => Number(m.trim())).filter(Boolean);
      const dataEntradaObj = contrato.dataEntrada ? parseDataLocal(contrato.dataEntrada) : null;

      await tx.pagamento.createMany({
        data: datasFaltantes.map(({ data: dataVencimento, indice }) => {
          const ehMesProporcional = indice === 0 && !!dataEntradaObj;
          const valorDoMes = ehMesProporcional
            ? calcularValorProporcional(contrato.valorAluguel, dataEntradaObj)
            : Number(contrato.valorAluguel);

          const ehMesDaIntermediacao = listaMesesIntermediacao.includes(indice + 1) && !ehMesProporcional;
          const percentualIntermediacaoDoMes = ehMesDaIntermediacao ? percentualIntermediacaoNum : null;
          const valorIntermediacaoDoMes = ehMesDaIntermediacao && percentualIntermediacaoNum
            ? Number((Number(contrato.valorAluguel) * (percentualIntermediacaoNum / 100)).toFixed(2))
            : null;
          const percentualComissaoDoMes = ehMesDaIntermediacao ? null : percentualComissaoNum;

          return {
            inquilinoId: contrato.inquilinoId,
            contratoId,
            tipo: 'ALUGUEL',
            valor: valorDoMes,
            referenteMes: formatarReferenteMes(dataVencimento),
            metodo: 'PIX',
            dataVencimento,
            percentualImobiliaria: percentualComissaoDoMes,
            percentualIntermediacao: percentualIntermediacaoDoMes,
            valorIntermediacao: valorIntermediacaoDoMes,
            valorRepasse: calcularRepasse({
              valor: valorDoMes,
              percentualImobiliaria: percentualComissaoDoMes,
              intermediacao: valorIntermediacaoDoMes,
            }),
          };
        }),
      });

      return { pagamentosGerados: datasFaltantes.length };
    });

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao regenerar parcelas.' });
  }
});

// PUT /api/contratos/:id/finalizar - encerra o contrato hoje e libera o imóvel
// (volta para DISPONIVEL e desvincula o inquilino), sem apagar o histórico
// de pagamentos já registrados.
router.put('/:id/finalizar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const contrato = await prisma.contrato.findUnique({ where: { id }, include: { imovel: true } });
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    const atualizado = await prisma.$transaction(async (tx) => {
      const contratoAtualizado = await tx.contrato.update({
        where: { id },
        data: { dataFim: new Date() },
      });

      // Só libera o imóvel se ele ainda estiver de fato ocupado por este inquilino
      // (evita desvincular por engano um imóvel já realugado para outra pessoa).
      if (contrato.imovel.inquilinoId === contrato.inquilinoId) {
        await tx.imovel.update({
          where: { id: contrato.imovelId },
          data: { status: 'DISPONIVEL', inquilinoId: null },
        });
      }

      return contratoAtualizado;
    });

    res.json(atualizado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao finalizar contrato.' });
  }
});

// DELETE /api/contratos/:id?forcar=true
// Um contrato com pagamentos registrados não é excluído sem confirmação
// explícita, já que isso apaga o histórico financeiro junto.
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const forcar = req.query.forcar === 'true' || req.query.forcar === '1';

    const contrato = await prisma.contrato.findUnique({
      where: { id },
      include: { pagamentos: true, imovel: true },
    });
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    if (contrato.pagamentos.length > 0 && !forcar) {
      return res.status(409).json({
        erro: `Este contrato possui ${contrato.pagamentos.length} pagamento(s) registrado(s). Confirme para excluir o contrato e todos os pagamentos vinculados, ou considere apenas finalizar o contrato para manter o histórico.`,
        possuiVinculos: true,
        totalPagamentos: contrato.pagamentos.length,
      });
    }

    await prisma.$transaction(async (tx) => {
      if (forcar && contrato.pagamentos.length > 0) {
        const pagamentoIds = contrato.pagamentos.map((p) => p.id);
        await tx.pagamentoItem.deleteMany({ where: { pagamentoId: { in: pagamentoIds } } });
        await tx.pagamento.deleteMany({ where: { contratoId: id } });
      }
      await tx.contrato.delete({ where: { id } });

      if (contrato.imovel.inquilinoId === contrato.inquilinoId) {
        await tx.imovel.update({
          where: { id: contrato.imovelId },
          data: { status: 'DISPONIVEL', inquilinoId: null },
        });
      }
    });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir contrato.' });
  }
});

// POST /api/contratos/:id/gerar-pdf { tipo } - preenche o modelo padrão daquele tipo com
// os dados do contrato/inquilino/imóvel e gera o PDF
router.post('/:id/gerar-pdf', async (req, res) => {
  try {
    const tipo = tipoValido(req.body.tipo) ? req.body.tipo : 'LOCACAO_RESIDENCIAL';

    const contrato = await prisma.contrato.findUnique({
      where: { id: Number(req.params.id) },
      include: { inquilino: true, imovel: { include: { proprietario: true } } },
    });

    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    const modelo = await prisma.modeloContrato.findUnique({ where: { tipo } });
    const template = modelo?.conteudo || TEMPLATES_PADRAO[tipo];

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const dadosPlaceholders = montarDadosPlaceholders({
      contrato,
      inquilino: contrato.inquilino,
      imovel: contrato.imovel,
      config,
    });

    let textoFinal = substituirPlaceholders(template, dadosPlaceholders);
    textoFinal = inserirClausulasAdicionais(textoFinal, contrato.clausulasAdicionaisJson);

    let itensVistoria;
    if (tipo === 'VISTORIA_INICIAL') itensVistoria = interpretarChecklist(contrato.checklistVistoriaInicial);
    if (tipo === 'VISTORIA_FINAL') itensVistoria = interpretarChecklist(contrato.checklistVistoriaFinal);

    const caminhoRelativo = await gerarContratoPdf({
      contratoId: contrato.id,
      numeroContrato: dadosPlaceholders.NUMERO_CONTRATO,
      textoFinal,
      tipo,
      config,
      itensVistoria,
      testemunhas: {
        nome1: dadosPlaceholders.TESTEMUNHA1_NOME,
        cpf1: dadosPlaceholders.TESTEMUNHA1_CPF,
        nome2: dadosPlaceholders.TESTEMUNHA2_NOME,
        cpf2: dadosPlaceholders.TESTEMUNHA2_CPF,
      },
    });

    const atualizado = await prisma.contrato.update({
      where: { id: contrato.id },
      data: { [CAMPO_ARQUIVO[tipo]]: caminhoRelativo },
    });

    res.json(atualizado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o PDF do documento.' });
  }
});

router.post('/:id/enviar-whatsapp', async (req, res) => {
  try {
    const tipo = tipoValido(req.body.tipo) ? req.body.tipo : 'LOCACAO_RESIDENCIAL';

    const contrato = await prisma.contrato.findUnique({
      where: { id: Number(req.params.id) },
      include: { inquilino: true },
    });

    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });
    const caminhoArquivo = contrato[CAMPO_ARQUIVO[tipo]];
    if (!caminhoArquivo) return res.status(400).json({ erro: 'Gere o PDF antes de enviar.' });
    if (!contrato.inquilino.telefone) return res.status(400).json({ erro: 'Este inquilino não tem telefone cadastrado.' });

    const config = (await prisma.configuracaoEmpresa.findUnique({ where: { id: 1 } }))
      || { nomeEmpresa: 'Savannah Imóveis' };

    const urlPublica = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
    const urlLocal = `${urlPublica}/api/contratos/${contrato.id}/pdf/${tipo}`;
    const nomeArquivo = caminhoArquivo.split('/').pop();
    const caminhoAbsolutoLocal = path.join(PASTA_ARQUIVOS, '..', caminhoArquivo);
    const { url: urlDocumento } = await obterLinkPublicoOuFallback(caminhoAbsolutoLocal, nomeArquivo, urlLocal);

    const mensagem = await montarMensagemPersonalizada('CONTRATO', {
      NOME: contrato.inquilino.nome,
      NOME_EMPRESA: config.nomeEmpresa,
      TIPO_DOCUMENTO: LABEL_TIPO_DOCUMENTO[tipo] || 'documento',
      LINK: urlDocumento,
    });

    const resultado = await enviarDocumento({
      telefone: contrato.inquilino.telefone,
      urlDocumento,
      nomeArquivo,
      mensagem,
    });

    res.json({ enviado: true, resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar o documento pelo WhatsApp.' });
  }
});

module.exports = router;
