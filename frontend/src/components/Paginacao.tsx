'use client';

interface PaginacaoProps {
  paginaAtual: number;
  totalPaginas: number;
  total: number;
  onMudarPagina: (pagina: number) => void;
  posicao?: 'topo' | 'rodape';
}

// Controles de paginação usados em todas as listagens (Imóveis, Inquilinos,
// Proprietários, Contratos, Pagamentos). Mostra o total de registros e
// permite navegar entre páginas de 12 itens. Pode ser exibido tanto no topo
// quanto no rodapé da tabela (mesma navegação nos dois lugares).
export default function Paginacao({ paginaAtual, totalPaginas, total, onMudarPagina, posicao = 'rodape' }: PaginacaoProps) {
  if (totalPaginas <= 1) return null;

  const paginas: number[] = [];
  const inicio = Math.max(1, paginaAtual - 2);
  const fim = Math.min(totalPaginas, inicio + 4);
  for (let p = inicio; p <= fim; p++) paginas.push(p);

  return (
    <div className={`flex items-center justify-between px-4 py-3 flex-wrap gap-3 ${
      posicao === 'topo' ? 'border-b border-savanna-border' : 'border-t border-savanna-border'
    }`}>
      <p className="text-xs text-savanna-muted">
        {total} registro{total === 1 ? '' : 's'} · página {paginaAtual} de {totalPaginas}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={paginaAtual <= 1}
          onClick={() => onMudarPagina(paginaAtual - 1)}
          className="px-2 py-1 text-sm rounded-sm border border-savanna-border disabled:opacity-40 disabled:cursor-not-allowed hover:border-savanna-green-400"
        >
          Anterior
        </button>
        {inicio > 1 && <span className="px-1 text-savanna-muted text-sm">...</span>}
        {paginas.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onMudarPagina(p)}
            className={`px-3 py-1 text-sm rounded-sm border ${
              p === paginaAtual
                ? 'bg-savanna-green-600 text-white border-savanna-green-600'
                : 'border-savanna-border hover:border-savanna-green-400'
            }`}
          >
            {p}
          </button>
        ))}
        {fim < totalPaginas && <span className="px-1 text-savanna-muted text-sm">...</span>}
        <button
          type="button"
          disabled={paginaAtual >= totalPaginas}
          onClick={() => onMudarPagina(paginaAtual + 1)}
          className="px-2 py-1 text-sm rounded-sm border border-savanna-border disabled:opacity-40 disabled:cursor-not-allowed hover:border-savanna-green-400"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
