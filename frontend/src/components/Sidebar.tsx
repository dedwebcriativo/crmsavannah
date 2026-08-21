'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, clearToken, getUsuario } from '@/lib/api';
import { IconeUsuario, IconeBackup, IconeEngrenagem, IconeSair } from '@/components/icons';

const ITENS = [
  { href: '/dashboard', label: 'Painel', modulo: null },
  { href: '/imoveis', label: 'Imóveis', modulo: 'imoveis' },
  { href: '/inquilinos', label: 'Inquilinos', modulo: 'inquilinos' },
  { href: '/proprietarios', label: 'Proprietários', modulo: 'proprietarios' },
  { href: '/contratos', label: 'Contratos', modulo: 'contratos' },
  { href: '/pagamentos', label: 'Pagamentos', modulo: 'pagamentos' },
  { href: '/demonstrativos', label: 'Demonstrativos', modulo: 'demonstrativos' },
];

const ROLES_ADMINISTRADOR = ['ADMINISTRADOR', 'ADMIN'];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const usuario = typeof window !== 'undefined' ? getUsuario() : null;
  const ehAdmin = ROLES_ADMINISTRADOR.includes(String(usuario?.role || '').toUpperCase());

  // Enquanto não vier a resposta, mostra tudo (evita menu piscando vazio); some só o que
  // realmente não é permitido assim que a permissão chega. A aplicação de verdade é sempre
  // no backend - isto aqui é só pra não poluir o menu com telas que vão dar "sem permissão".
  const [permissoes, setPermissoes] = useState<Record<string, { ver: boolean }> | null>(null);
  const [backupEmAndamento, setBackupEmAndamento] = useState(false);
  const [mensagemBackup, setMensagemBackup] = useState('');

  useEffect(() => {
    if (ehAdmin) return; // admin sempre vê tudo, nem precisa consultar
    api.get('/api/permissoes/minhas')
      .then((dados) => setPermissoes(dados.permissoes))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itensVisiveis = ITENS.filter((item) => {
    if (!item.modulo || ehAdmin) return true;
    if (!permissoes) return true;
    return Boolean(permissoes[item.modulo]?.ver);
  });

  function sair() {
    clearToken();
    router.push('/login');
  }

  async function fazerBackupRapido() {
    setBackupEmAndamento(true);
    setMensagemBackup('');
    try {
      const resultado = await api.post('/api/backup/manual');
      const hora = new Date(resultado.modificadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setMensagemBackup(`Backup salvo às ${hora} ✓`);
    } catch (err: any) {
      setMensagemBackup('Erro ao fazer backup.');
    } finally {
      setBackupEmAndamento(false);
      setTimeout(() => setMensagemBackup(''), 6000);
    }
  }

  return (
    <aside className="w-60 shrink-0 bg-savanna-green-700 text-white min-h-screen flex flex-col">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="bg-white rounded-md px-3 py-2.5 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Savannah Imóveis" className="h-8 w-auto" />
        </div>
        <p className="text-xs text-savanna-green-100/80 tracking-wide mt-2">IMÓVEIS · CRM</p>
      </div>

      <nav className="flex-1 py-4">
        {itensVisiveis.map((item) => {
          const ativo = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-6 py-2.5 text-sm transition-colors ${
                ativo
                  ? 'bg-white/10 text-white font-medium border-l-2 border-savanna-gold-400'
                  : 'text-savanna-green-50/80 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        {ehAdmin && (
          <Link
            href="/usuarios"
            className={`block px-6 py-2.5 text-sm transition-colors border-t border-white/10 mt-2 pt-4 ${
              pathname?.startsWith('/usuarios')
                ? 'bg-white/10 text-white font-medium border-l-2 border-savanna-gold-400'
                : 'text-savanna-green-50/80 hover:bg-white/5 hover:text-white'
            }`}
          >
            Usuários
          </Link>
        )}

        {ehAdmin && (
          <Link
            href="/configurar-pdfs"
            className={`block px-6 py-2.5 text-sm transition-colors ${
              pathname?.startsWith('/configurar-pdfs')
                ? 'bg-white/10 text-white font-medium border-l-2 border-savanna-gold-400'
                : 'text-savanna-green-50/80 hover:bg-white/5 hover:text-white'
            }`}
          >
            Configurar PDFs
          </Link>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 text-xs text-savanna-green-50/70">
        {usuario?.nome && (
          <Link href="/perfil" className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-sm hover:bg-white/10 hover:text-white transition-colors">
            <IconeUsuario className="w-4 h-4 shrink-0" />
            <span className="truncate">Olá, {usuario.nome}</span>
          </Link>
        )}
        {ehAdmin && (
          <>
            <div className="my-2 border-t border-white/10" />
            <button
              onClick={fazerBackupRapido}
              disabled={backupEmAndamento}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-left hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
            >
              <IconeBackup className="w-4 h-4 shrink-0" />
              {backupEmAndamento ? 'Salvando backup...' : 'Fazer backup agora'}
            </button>
            {mensagemBackup && <p className="px-2 mt-1 mb-1 text-savanna-gold-400">{mensagemBackup}</p>}
            <Link href="/backup" className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-white/10 hover:text-white transition-colors">
              <IconeEngrenagem className="w-4 h-4 shrink-0" />
              Gerenciar backups
            </Link>
          </>
        )}
        <div className="my-2 border-t border-white/10" />
        <button onClick={sair} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-left hover:bg-white/10 hover:text-white transition-colors">
          <IconeSair className="w-4 h-4 shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  );
}
