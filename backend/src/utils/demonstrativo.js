const { formatarNumeroContrato } = require('./template');

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Mesma numeração usada nos documentos do contrato (####/ano), pra bater com o que
// aparece no PDF do contrato de locação/vistoria/etc.
function numeroContrato(contrato) {
  return formatarNumeroContrato(contrato);
}

// Monta a estrutura do demonstrativo do PROPRIETÁRIO: bruto, comissão, deduções e líquido por mês
function montarDemonstrativoProprietario({ contrato, pagamentos, ano }) {
  const linhas = MESES.map((nomeMes, indice) => {
    const referencia = `${ano}-${String(indice + 1).padStart(2, '0')}`;
    const pagamento = pagamentos.find((p) => p.referenteMes === referencia && p.status === 'PAGO');

    if (!pagamento) {
      return { mes: nomeMes, bruto: null, comissao: null, deducoes: null, liquido: null };
    }

    const bruto = Number(pagamento.valor);
    const percentual = pagamento.percentualImobiliaria ? Number(pagamento.percentualImobiliaria) : 0;
    const comissao = Number((bruto * (percentual / 100)).toFixed(2));
    const deducoes = pagamento.deducoes ? Number(pagamento.deducoes) : 0;
    const liquido = pagamento.valorRepasse !== null && pagamento.valorRepasse !== undefined
      ? Number(pagamento.valorRepasse)
      : Number((bruto - comissao - deducoes).toFixed(2));

    return { mes: nomeMes, bruto, comissao, deducoes, liquido };
  });

  const totais = linhas.reduce(
    (acc, linha) => ({
      bruto: acc.bruto + (linha.bruto || 0),
      comissao: acc.comissao + (linha.comissao || 0),
      deducoes: acc.deducoes + (linha.deducoes || 0),
      liquido: acc.liquido + (linha.liquido || 0),
    }),
    { bruto: 0, comissao: 0, deducoes: 0, liquido: 0 }
  );

  return {
    numeroContrato: numeroContrato(contrato),
    dataContrato: contrato.dataInicio,
    nomeLocador: contrato.imovel.proprietario?.nome || '-',
    cpfLocador: contrato.imovel.proprietario?.cpfCnpj || '-',
    imovelLocado: `${contrato.imovel.endereco}, ${contrato.imovel.cidade} ${contrato.imovel.estado} CEP ${contrato.imovel.cep}`,
    locatario: contrato.inquilino.nome,
    cpfLocatario: contrato.inquilino.cpfCnpj,
    linhas,
    totais,
  };
}

// Monta a estrutura do demonstrativo do INQUILINO: aluguel, condomínio/taxas, IPTU e total pago por mês
function montarDemonstrativoInquilino({ contrato, pagamentos, ano }) {
  const linhas = MESES.map((nomeMes, indice) => {
    const referencia = `${ano}-${String(indice + 1).padStart(2, '0')}`;
    const pagamento = pagamentos.find((p) => p.referenteMes === referencia && p.status === 'PAGO');

    if (!pagamento) {
      return { mes: nomeMes, aluguel: null, condominio: null, iptu: null, total: null };
    }

    const aluguel = Number(pagamento.valor);
    const condominio = pagamento.valorCondominio !== null && pagamento.valorCondominio !== undefined
      ? Number(pagamento.valorCondominio) : 0;
    const iptu = pagamento.valorIptu !== null && pagamento.valorIptu !== undefined
      ? Number(pagamento.valorIptu) : 0;
    const total = Number((aluguel + condominio + iptu).toFixed(2));

    return { mes: nomeMes, aluguel, condominio, iptu, total };
  });

  const totais = linhas.reduce(
    (acc, linha) => ({
      aluguel: acc.aluguel + (linha.aluguel || 0),
      condominio: acc.condominio + (linha.condominio || 0),
      iptu: acc.iptu + (linha.iptu || 0),
      total: acc.total + (linha.total || 0),
    }),
    { aluguel: 0, condominio: 0, iptu: 0, total: 0 }
  );

  return {
    numeroContrato: numeroContrato(contrato),
    dataContrato: contrato.dataInicio,
    nomeLocatario: contrato.inquilino.nome,
    cpfLocatario: contrato.inquilino.cpfCnpj,
    imovelLocado: `${contrato.imovel.endereco}, ${contrato.imovel.cidade} ${contrato.imovel.estado} CEP ${contrato.imovel.cep}`,
    locador: contrato.imovel.proprietario?.nome || '-',
    cpfLocador: contrato.imovel.proprietario?.cpfCnpj || '-',
    linhas,
    totais,
  };
}

module.exports = { montarDemonstrativoProprietario, montarDemonstrativoInquilino, numeroContrato, MESES };
