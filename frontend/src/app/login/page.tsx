'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, setToken, setUsuario } from '@/lib/api';
import logoLocal from '@/logo/logo_transparente.png';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('noilor@hotmail.com');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('expirado') === '1') {
      setErro('Sua sessão expirou por inatividade. Entre novamente.');
    }
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const dados = await api.post('/api/auth/login', { email, senha });
      setToken(dados.token);
      setUsuario(dados.usuario);
      router.push('/dashboard');
    } catch (err: any) {
      setErro(err.message || 'Erro ao entrar.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4 bg-cover bg-center relative"
      style={{ 
        backgroundImage: `url('https://savannahcorretora.com.br/wp-content/uploads/2025/10/banner_2.png')` 
      }}
    >
      {/* Máscara de degradê elegante e ofuscada sobre o background (De #046439 para #03351E) */}
      <div 
        className="absolute inset-0 opacity-90 mix-blend-multiply"
        style={{ 
          background: 'linear-gradient(135deg, #046439 0%, #03351E 100%)' 
        }}
      ></div>

      {/* Container do Login */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 md:p-10 relative z-10 backdrop-blur-sm bg-white/95 border border-white/10">
        
        {/* Topo com a Logo Oficial Local da Savannah */}
        <div className="text-center mb-8">
          <Image 
            src={logoLocal} 
            alt="Savannah Imóveis" 
            className="mx-auto h-16 w-auto object-contain mb-3"
            priority
          />
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase">CRM · Controle Interno</p>
        </div>

        <form onSubmit={entrar} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#046439] focus:border-transparent transition-all duration-200 bg-slate-50/50"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
            <input
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#046439] focus:border-transparent transition-all duration-200 bg-slate-50/50"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>

          {erro && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-red-600 text-sm font-medium text-center">{erro}</p>
            </div>
          )}

          {/* Botão estilizado com o verde institucional da marca */}
          <button 
            type="submit" 
            disabled={carregando} 
            className="w-full py-3 px-4 text-white font-medium rounded-xl shadow-lg shadow-emerald-950/20 hover:shadow-xl hover:shadow-emerald-950/30 active:scale-[0.99] disabled:opacity-70 disabled:pointer-events-none transition-all duration-200"
            style={{ backgroundColor: '#046439' }}
          >
            {carregando ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Autenticando...
              </span>
            ) : 'Entrar no Sistema'}
          </button>
        </form>

        <p className="text-center text-slate-500 text-xs mt-6">
          © {new Date().getFullYear()} Savannah Imóveis · 47.722.352/0001-14. CRM desenvolvido por{' '}
          <a href="https://dedweb.com.br" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">
            DEDWEB CRIATIVO
          </a>
          . Versão 1.0.0
        </p>
      </div>
    </div>
  );
}
