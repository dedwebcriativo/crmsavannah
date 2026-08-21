// Converte uma string "AAAA-MM-DD" (vinda de um campo de data do formulário) para um
// Date que representa esse dia à meia-noite NO HORÁRIO LOCAL do servidor - não em UTC.
//
// Isso existe pra evitar um bug clássico de fuso horário: `new Date("2026-06-01")`
// cria a data em UTC meia-noite, mas o Brasil está atrás de UTC (UTC-3) - então, ao
// usar métodos locais como `.getMonth()`/`.getDate()` nessa data, o resultado "volta"
// pro dia/mês anterior (31/05 às 21h, nesse exemplo). Isso já causou pagamentos sendo
// gerados com vencimento no mês errado. Aceita tanto "AAAA-MM-DD" puro quanto uma
// string ISO completa (nesse caso, ignora a hora e usa só a parte da data).
function parseDataLocal(valor) {
  if (!valor) return null;
  const [anoStr, mesStr, diaStr] = String(valor).slice(0, 10).split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

// Calcula o valor de repasse ao proprietário.
//   Repasse = aluguel - comissão da imobiliária (só sobre o aluguel) - taxa de
//             intermediação (valor já calculado, só no mês em que ela se aplica)
//             + IPTU + condomínio/taxas
//
// IPTU e condomínio NÃO são descontados do proprietário - são valores que o(a)
// inquilino(a) paga e que precisam ser repassados/somados ao proprietário (ele quem é
// responsável por essas contas), por isso entram SOMADOS, nunca como desconto. A comissão
// da imobiliária (percentualImobiliaria) incide só sobre o valor do aluguel, nunca sobre
// IPTU/condomínio. A taxa de intermediação (intermediacao) é um valor em R$ já calculado
// (normalmente só cobrado no 1º mês do contrato - ver mesIntermediacao no Contrato).
function calcularRepasse({ valor, percentualImobiliaria, intermediacao, iptu, condominio }) {
  const aluguel = Number(valor) || 0;
  const valorIntermediacao = intermediacao === null || intermediacao === undefined || intermediacao === '' ? 0 : Number(intermediacao);
  // Regra de negócio: quando há taxa de intermediação neste pagamento, ela substitui a
  // comissão de administração - nunca cobra as duas juntas no mesmo mês.
  const percentualComissao = valorIntermediacao > 0
    ? 0
    : (percentualImobiliaria === null || percentualImobiliaria === undefined || percentualImobiliaria === '' ? 0 : Number(percentualImobiliaria));
  const valorIptu = iptu === null || iptu === undefined || iptu === '' ? 0 : Number(iptu);
  const valorCondominio = condominio === null || condominio === undefined || condominio === '' ? 0 : Number(condominio);

  if (!percentualComissao && !valorIntermediacao && !valorIptu && !valorCondominio) return null;

  const comissao = aluguel * (percentualComissao / 100);

  return Number((aluguel - comissao - valorIntermediacao + valorIptu + valorCondominio).toFixed(2));
}

// Calcula o valor proporcional do primeiro aluguel, quando a data de entrada/mudança do
// inquilino é diferente do 1º dia do mês (contrato começa "no meio do mês"). Conta os dias
// restantes do mês a partir da data de entrada (inclusive) e aplica a proporção sobre o
// valor cheio do aluguel. Se a entrada foi no dia 1 (ou não há proporção a fazer), devolve
// o valor cheio sem alteração.
function calcularValorProporcional(valorAluguel, dataEntrada) {
  const ano = dataEntrada.getFullYear();
  const mes = dataEntrada.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diaEntrada = dataEntrada.getDate();
  const diasOcupados = diasNoMes - diaEntrada + 1;

  if (diasOcupados >= diasNoMes) return Number(Number(valorAluguel).toFixed(2));

  return Number((Number(valorAluguel) * diasOcupados / diasNoMes).toFixed(2));
}

// Calcula o 5º dia útil de um mês (conta só seg-sex, não considera feriados).
// mes é 0-indexado (igual Date.getMonth()).
function calcularQuintoDiaUtil(ano, mes) {
  let diasUteis = 0;
  let dia = 1;
  while (true) {
    const data = new Date(ano, mes, dia);
    const diaSemana = data.getDay(); // 0 = domingo, 6 = sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasUteis += 1;
      if (diasUteis === 5) return data;
    }
    dia += 1;
  }
}

// Gera uma data de vencimento por mês, do mês de dataInicio até o mês de dataFim
// (inclusive). O vencimento pode ser um dia fixo do mês (diaVencimento, 1-31,
// ajustado pra baixo em meses mais curtos) ou sempre o 5º dia útil do mês
// (quando quintoDiaUtil = true, ignora diaVencimento). Cai pro dia de dataInicio
// quando nada for informado, pra manter compatibilidade com contratos antigos.
function gerarDatasVencimentoMensal(dataInicio, dataFim, diaVencimento, quintoDiaUtil) {
  const datas = [];
  const diaBase = diaVencimento || dataInicio.getDate();
  let cursor = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1);
  const limite = new Date(dataFim.getFullYear(), dataFim.getMonth(), 1);

  let seguranca = 0;
  while (cursor <= limite && seguranca < 240) {
    if (quintoDiaUtil) {
      datas.push(calcularQuintoDiaUtil(cursor.getFullYear(), cursor.getMonth()));
    } else {
      const ultimoDiaDoMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const dia = Math.min(diaBase, ultimoDiaDoMes);
      datas.push(new Date(cursor.getFullYear(), cursor.getMonth(), dia));
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    seguranca += 1;
  }

  return datas;
}

// Formata uma data como "AAAA-MM", usado no campo referenteMes do pagamento.
function formatarReferenteMes(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

module.exports = { calcularRepasse, calcularValorProporcional, gerarDatasVencimentoMensal, calcularQuintoDiaUtil, formatarReferenteMes, parseDataLocal };
