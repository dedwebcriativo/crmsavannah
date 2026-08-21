// Paginação simples aplicada em memória, sobre a lista já filtrada. Como
// algumas listas têm filtros calculados em JS (ex: "prestes a vagar" em
// imóveis, "inadimplente" em pagamentos), a página é cortada depois de todo
// filtro já aplicado, garantindo que o total e as páginas batam com o que
// realmente aparece na tela.
//
// Quando `pagina` não é informado, retorna a lista completa (mesmo formato de
// antes), para não quebrar chamadas que só querem todos os registros (ex:
// preencher um <select> de inquilinos em outra tela).
const TAMANHO_PAGINA = 12;

function paginar(itens, pagina) {
  if (pagina === undefined || pagina === null || pagina === '') {
    return itens;
  }

  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const total = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const inicio = (paginaAtual - 1) * TAMANHO_PAGINA;

  return {
    dados: itens.slice(inicio, inicio + TAMANHO_PAGINA),
    total,
    pagina: paginaAtual,
    totalPaginas,
  };
}

module.exports = { TAMANHO_PAGINA, paginar };
