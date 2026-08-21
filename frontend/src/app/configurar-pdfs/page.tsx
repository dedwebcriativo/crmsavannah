'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

export default function ConfigurarPdfsPage() {
  const [tipo, setTipo] = useState('DEMONSTRATIVO_PROPRIETARIO_NOTAS');
  const [tipos, setTipos] = useState<string[]>([]);
  const [labelTipos, setLabelTipos] = useState<Record<string, string>>({});
  const [conteudo, setConteudo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  async function carregar(tipoSelecionado: string) {
    setErro('');
    setMensagem('');
    setCarregando(true);
    try {
      const modelo = await api.get(`/api/modelo-texto-pdf?tipo=${tipoSelecionado}`);
      setConteudo(modelo.conteudo || '');
      setTipos(modelo.tipos || []);
      setLabelTipos(modelo.labelTipos || {});
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(tipo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selecionarTipo(novoTipo: string) {
    setTipo(novoTipo);
    carregar(novoTipo);
  }

  async function salvar() {
    setErro('');
    setMensagem('');
    setSalvando(true);
    try {
      await api.put('/api/modelo-texto-pdf', { tipo, conteudo });
      setMensagem('Texto salvo com sucesso.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function restaurarPadrao() {
    if (!confirm('Restaurar o texto padrão? As alterações feitas aqui serão perdidas.')) return;
    setErro('');
    setMensagem('');
    setSalvando(true);
    try {
      const modelo = await api.post('/api/modelo-texto-pdf/restaurar-padrao', { tipo });
      setConteudo(modelo.conteudo || '');
      setMensagem('Texto padrão restaurado.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AppShell>
      <h1 className="font-display font-semibold text-2xl text-savanna-green-700 mb-1">Configurar PDFs</h1>
      <p className="text-savanna-muted text-sm mb-6">
        Edite os textos de rodapé/observações que aparecem nos documentos gerados pelo sistema, por sessão.
      </p>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}
      {mensagem && <p className="text-savanna-green-700 text-sm mb-4">{mensagem}</p>}

      <div className="card mb-6">
        <p className="text-xs font-medium text-savanna-muted mb-3">Documento</p>
        <div className="flex gap-2 flex-wrap mb-2">
          {tipos.length > 0
            ? tipos.map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => selecionarTipo(valor)}
                  className={`px-3 py-2 rounded-sm text-sm font-medium border ${
                    tipo === valor
                      ? 'bg-savanna-green-600 text-white border-savanna-green-600'
                      : 'bg-white border-savanna-border'
                  }`}
                >
                  {labelTipos[valor] || valor}
                </button>
              ))
            : <p className="text-sm text-savanna-muted">Carregando...</p>}
        </div>
        <p className="text-xs text-savanna-muted">
          Só é possível editar o texto (rodapé/observações). O restante do documento - cabeçalho, tabelas e cálculos - segue fixo.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-savanna-green-700">{labelTipos[tipo] || tipo}</p>
          <button type="button" onClick={restaurarPadrao} disabled={salvando || carregando} className="text-xs text-savanna-rust underline">
            Restaurar padrão
          </button>
        </div>

        <textarea
          className="input min-h-[220px] font-mono text-sm"
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          disabled={carregando}
          placeholder="Cada linha vira um parágrafo separado no PDF."
        />

        <p className="text-xs text-savanna-muted mt-2">
          Cada linha desse campo aparece como uma linha separada no documento. Deixe em branco pra remover o texto do PDF.
        </p>

        <div className="flex gap-3 mt-4">
          <button onClick={salvar} disabled={salvando || carregando} className="btn-primary">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
