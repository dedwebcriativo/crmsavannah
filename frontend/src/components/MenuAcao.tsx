'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';

export interface ItemMenuAcao {
  label: string;
  onClick: () => void;
  cor?: 'padrao' | 'destaque' | 'perigo';
  href?: string;
  desabilitado?: boolean;
}

interface MenuAcaoProps {
  icone: ReactNode;
  titulo: string;
  itens: ItemMenuAcao[];
  corIcone?: string;
}

const CORES_ITEM: Record<string, string> = {
  padrao: 'text-savanna-ink hover:bg-savanna-green-50',
  destaque: 'text-savanna-green-700 hover:bg-savanna-green-50',
  perigo: 'text-savanna-rust hover:bg-savanna-rust/10',
};

// Botão de ícone que, ao clicar, abre um menu com as opções relacionadas
// (ex: ícone de fatura -> Marcar pago / Gerar recibo). Fecha ao clicar fora.
export default function MenuAcao({ icone, titulo, itens, corIcone = 'text-savanna-muted' }: MenuAcaoProps) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  const itensVisiveis = itens.filter((item) => !item.desabilitado);
  if (itensVisiveis.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        title={titulo}
        onClick={() => setAberto((v) => !v)}
        className={`p-1.5 rounded-sm hover:bg-savanna-green-50 ${corIcone}`}
      >
        {icone}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-savanna-border rounded-md shadow-lg min-w-[170px] py-1">
          {itensVisiveis.map((item) =>
            item.href ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setAberto(false)}
                className={`block w-full text-left px-3 py-1.5 text-xs ${CORES_ITEM[item.cor || 'padrao']}`}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setAberto(false);
                  item.onClick();
                }}
                className={`block w-full text-left px-3 py-1.5 text-xs ${CORES_ITEM[item.cor || 'padrao']}`}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
