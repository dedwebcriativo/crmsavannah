'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconeSino } from './icons';
import { api, getUsuario } from '@/lib/api';

const ROLES_ADMINISTRADOR = ['ADMINISTRADOR', 'ADMIN'];

function tempoRelativo(dataIso: string) {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

const ICONE_TIPO: Record<string, string> = {
  PAGAMENTO_VENCE_HOJE: '💰',
  PAGAMENTO_RECEBIDO: '✅',
  PAGAMENTO_ATRASADO: '⚠️',
  PAGAMENTO_CANCELADO: '🚫',
  REPASSE_REALIZADO: '🔁',
  REPASSE_PENDENTE: '⏳',
  REPASSE_ATRASADO: '🚨',
  IMOVEL_STATUS: '🏠',
};

export default function NotificacoesBell() {
  const router = useRouter();
  const usuario = typeof window !== 'undefined' ? getUsuario() : null;
  const ehAdmin = ROLES_ADMINISTRADOR.includes(String(usuario?.role || '').toUpperCase());

  const [aberto, setAberto] = useState(false);
  const [contagem, setContagem] = useState(0);
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [mensagemTeste, setMensagemTeste] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  function carregarContagem() {
    api.get('/api/notificacoes/contagem').then((d) => setContagem(d.total)).catch(() => {});
  }

  useEffect(() => {
    carregarContagem();
    const intervalo = setInterval(carregarContagem, 30000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  function alternarAberto() {
    const vaiAbrir = !aberto;
    setAberto(vaiAbrir);
    if (vaiAbrir) {
      setCarregando(true);
      api.get('/api/notificacoes').then(setNotificacoes).catch(() => {}).finally(() => setCarregando(false));
    }
  }

  async function abrirNotificacao(n: any) {
    if (!n.lida) {
      await api.put(`/api/notificacoes/${n.id}/marcar-lida`).catch(() => {});
      setContagem((c) => Math.max(0, c - 1));
      setNotificacoes((lista) => lista.map((item) => (item.id === n.id ? { ...item, lida: true } : item)));
    }
    setAberto(false);
    if (n.link) router.push(n.link);
  }

  async function marcarTodasLidas() {
    await api.put('/api/notificacoes/marcar-todas-lidas').catch(() => {});
    setContagem(0);
    setNotificacoes((lista) => lista.map((item) => ({ ...item, lida: true })));
  }

  async function testarLembretes() {
    setTestando(true);
    setMensagemTeste('');
    try {
      const r = await api.post('/api/notificacoes/testar-lembretes');
      setMensagemTeste(`${r.lembretesEnviados} lembrete(s), ${r.atrasosMarcados} atraso(s) e ${r.repassesAvisados} aviso(s) de repasse processados.`);
      carregarContagem();
    } catch (err: any) {
      setMensagemTeste(err.message);
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={alternarAberto}
        className="relative p-2 rounded-full hover:bg-savanna-green-50 text-savanna-ink"
        title="Notificações"
      >
        <IconeSino className="w-5 h-5" />
        {contagem > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-savanna-rust text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {contagem > 9 ? '9+' : contagem}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-savanna-border rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-savanna-border">
            <span className="font-medium text-sm text-savanna-ink">Notificações</span>
            {contagem > 0 && (
              <button onClick={marcarTodasLidas} className="text-xs text-savanna-green-700 underline">
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {carregando ? (
              <p className="text-xs text-savanna-muted p-4">Carregando...</p>
            ) : notificacoes.length === 0 ? (
              <p className="text-xs text-savanna-muted p-4 text-center">Nenhuma notificação por aqui.</p>
            ) : (
              notificacoes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => abrirNotificacao(n)}
                  className={`w-full text-left px-4 py-2.5 border-b border-savanna-border last:border-0 hover:bg-savanna-green-50 ${!n.lida ? 'bg-savanna-green-50/50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm leading-none mt-0.5">{ICONE_TIPO[n.tipo] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs ${!n.lida ? 'font-semibold text-savanna-ink' : 'text-savanna-muted'}`}>{n.titulo}</p>
                      <p className="text-xs text-savanna-muted mt-0.5 line-clamp-2">{n.mensagem}</p>
                      <p className="text-[10px] text-savanna-muted/70 mt-1">{tempoRelativo(n.criadoEm)}</p>
                    </div>
                    {!n.lida && <span className="w-1.5 h-1.5 rounded-full bg-savanna-gold-500 mt-1.5 shrink-0" />}
                  </div>
                </button>
              ))
            )}
          </div>

          {ehAdmin && (
            <div className="px-4 py-2 border-t border-savanna-border bg-savanna-green-50/30">
              <button onClick={testarLembretes} disabled={testando} className="text-xs text-savanna-muted underline">
                {testando ? 'Rodando...' : 'Testar lembretes de vencimento/atraso agora'}
              </button>
              {mensagemTeste && <p className="text-[10px] text-savanna-muted mt-1">{mensagemTeste}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
