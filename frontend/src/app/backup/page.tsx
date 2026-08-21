'use client';

import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api, baixarArquivo } from '@/lib/api';

type Backup = {
  arquivo: string;
  tamanho: number;
  modificadoEm: string;
  automatico: boolean;
};

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BackupPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criandoBackup, setCriandoBackup] = useState(false);
  const [restaurando, setRestaurando] = useState('');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const inputUploadRef = useRef<HTMLInputElement>(null);

  function carregar() {
    setCarregando(true);
    api
      .get('/api/backup/listar')
      .then(setBackups)
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criarBackupAgora() {
    setErro('');
    setMensagem('');
    setCriandoBackup(true);
    try {
      await api.post('/api/backup/manual');
      setMensagem('Backup criado com sucesso.');
      carregar();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCriandoBackup(false);
    }
  }

  async function baixarBackupArquivo(arquivo: string) {
    try {
      await baixarArquivo(`/api/backup/baixar/${encodeURIComponent(arquivo)}`, arquivo);
    } catch (err: any) {
      setErro(err.message);
    }
  }

  async function restaurarBackup(arquivo: string) {
    if (
      !confirm(
        `Restaurar o backup "${arquivo}"?\n\nIsso vai SUBSTITUIR todos os dados atuais do sistema pelos dados desse backup. Essa ação não pode ser desfeita.\n\nO sistema vai fechar sozinho depois - você precisa abrir de novo.`
      )
    ) {
      return;
    }

    setErro('');
    setMensagem('');
    setRestaurando(arquivo);
    try {
      const resultado = await api.post(`/api/backup/restaurar/${encodeURIComponent(arquivo)}`);
      setMensagem(resultado.mensagem || 'Backup restaurado. Feche e abra o sistema novamente.');
    } catch (err: any) {
      setErro(err.message);
      setRestaurando('');
    }
  }

  async function restaurarDeUpload(arquivo: File) {
    if (
      !confirm(
        `Restaurar o sistema a partir do arquivo "${arquivo.name}"?\n\nIsso vai SUBSTITUIR todos os dados atuais do sistema. Essa ação não pode ser desfeita.\n\nO sistema vai fechar sozinho depois - você precisa abrir de novo.`
      )
    ) {
      if (inputUploadRef.current) inputUploadRef.current.value = '';
      return;
    }

    setErro('');
    setMensagem('');
    setRestaurando('upload');
    try {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      const resultado = await api.post('/api/backup/restaurar-upload', formData);
      setMensagem(resultado.mensagem || 'Backup restaurado. Feche e abra o sistema novamente.');
    } catch (err: any) {
      setErro(err.message);
      setRestaurando('');
    } finally {
      if (inputUploadRef.current) inputUploadRef.current.value = '';
    }
  }

  const restauracaoConcluida = mensagem.toLowerCase().includes('feche e abra');

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display font-semibold text-2xl text-savanna-green-700">Backups</h1>
        <p className="text-savanna-muted text-sm">
          Cópias de segurança do banco de dados do sistema. Um backup automático é feito todo dia às 3h da manhã
          (sempre sobrescrevendo o do dia anterior); você também pode criar um backup manual a qualquer momento.
        </p>
      </div>

      {erro && <p className="text-savanna-rust text-sm mb-4">{erro}</p>}
      {mensagem && (
        <div className={`text-sm mb-4 p-3 rounded-md ${restauracaoConcluida ? 'bg-savanna-green-50 text-savanna-ink border border-savanna-gold-400' : 'text-savanna-green-700'}`}>
          {mensagem}
          {restauracaoConcluida && (
            <p className="mt-1 font-medium">Pode fechar esta janela e abrir o sistema novamente.</p>
          )}
        </div>
      )}

      {!restauracaoConcluida && (
        <>
          <div className="card mb-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-medium text-savanna-ink">Criar backup agora</p>
              <p className="text-sm text-savanna-muted">Salva uma cópia completa do banco na hora, com data e hora no nome.</p>
            </div>
            <button className="btn-primary" onClick={criarBackupAgora} disabled={criandoBackup}>
              {criandoBackup ? 'Criando...' : 'Criar backup'}
            </button>
          </div>

          <div className="card mb-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-medium text-savanna-ink">Restaurar de um arquivo enviado</p>
              <p className="text-sm text-savanna-muted">
                Envie um arquivo <code>.db</code> de backup (feito neste sistema, em qualquer computador) para restaurar.
              </p>
            </div>
            <div>
              <input
                ref={inputUploadRef}
                type="file"
                accept=".db"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) restaurarDeUpload(arquivo);
                }}
              />
              <button
                className="btn-secondary"
                onClick={() => inputUploadRef.current?.click()}
                disabled={restaurando === 'upload'}
              >
                {restaurando === 'upload' ? 'Restaurando...' : 'Escolher arquivo...'}
              </button>
            </div>
          </div>

          <div className="card">
            <p className="font-medium text-savanna-ink mb-3">Backups salvos neste computador</p>

            {carregando ? (
              <p className="text-savanna-muted text-sm">Carregando...</p>
            ) : backups.length === 0 ? (
              <p className="text-savanna-muted text-sm">Nenhum backup encontrado ainda. Crie o primeiro acima.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-savanna-muted border-b border-savanna-border">
                    <th className="py-2 font-normal">Arquivo</th>
                    <th className="py-2 font-normal">Data</th>
                    <th className="py-2 font-normal">Tamanho</th>
                    <th className="py-2 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.arquivo} className="border-b border-savanna-border last:border-0">
                      <td className="py-2.5 text-savanna-ink">
                        {b.arquivo}
                        {b.automatico && <span className="badge bg-savanna-green-50 text-savanna-green-700 ml-2">automático</span>}
                      </td>
                      <td className="py-2.5 text-savanna-muted">{formatarData(b.modificadoEm)}</td>
                      <td className="py-2.5 text-savanna-muted">{formatarTamanho(b.tamanho)}</td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        <button className="text-savanna-green-700 underline mr-4" onClick={() => baixarBackupArquivo(b.arquivo)}>
                          Baixar
                        </button>
                        <button
                          className="text-savanna-rust underline"
                          onClick={() => restaurarBackup(b.arquivo)}
                          disabled={restaurando === b.arquivo}
                        >
                          {restaurando === b.arquivo ? 'Restaurando...' : 'Restaurar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
