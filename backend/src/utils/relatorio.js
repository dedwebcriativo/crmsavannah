const XLSX = require('xlsx');

// Monta um arquivo XLSX a partir de uma lista de linhas (array de objetos simples,
// já formatados como texto/número prontos para exibição) e devolve um Buffer,
// pronto para enviar como download. Usado pelos relatórios de cada sessão do sistema
// (Inquilinos, Proprietários, Imóveis, Pagamentos, etc.).
function gerarPlanilha(linhas, nomeAba = 'Relatório') {
  const planilha = XLSX.utils.json_to_sheet(linhas);

  // Ajusta a largura das colunas com base no maior conteúdo de cada uma (mínimo 10, máximo 40)
  const colunas = linhas.length ? Object.keys(linhas[0]) : [];
  planilha['!cols'] = colunas.map((coluna) => {
    const maiorConteudo = linhas.reduce((max, linha) => {
      const valor = linha[coluna] === null || linha[coluna] === undefined ? '' : String(linha[coluna]);
      return Math.max(max, valor.length);
    }, coluna.length);
    return { wch: Math.min(Math.max(maiorConteudo + 2, 10), 40) };
  });

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, nomeAba.slice(0, 31)); // Excel limita nome de aba a 31 caracteres
  return XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' });
}

// Envia o buffer da planilha como download HTTP (Content-Type + Content-Disposition corretos)
function enviarPlanilha(res, buffer, nomeArquivo) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
  res.send(buffer);
}

function formatarMoedaRelatorio(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataRelatorio(data) {
  if (!data) return '';
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

module.exports = { gerarPlanilha, enviarPlanilha, formatarMoedaRelatorio, formatarDataRelatorio };
