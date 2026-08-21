const fs = require('fs');
const path = require('path');

const NOME_BACKUP_AUTOMATICO = 'backup-automatico-diario.db';

// Extrai o caminho do arquivo .db a partir da DATABASE_URL (formato "file:C:/caminho/dev.db").
function getDbPath() {
  const url = process.env.DATABASE_URL || '';
  const match = url.match(/^file:(.+)$/);
  if (!match) {
    throw new Error('DATABASE_URL não está no formato esperado ("file:...").');
  }
  return path.normalize(match[1]);
}

// Pasta de backups fica ao lado do próprio banco (ex: %APPDATA%\CRM Savannah\backups\),
// então funciona em qualquer instalação, não só na máquina onde o projeto foi gerado.
function getBackupDir() {
  const dir = path.join(path.dirname(getDbPath()), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function nomeArquivoManual() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const carimbo = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}-${pad(agora.getMinutes())}-${pad(agora.getSeconds())}`;
  return `backup-manual-${carimbo}.db`;
}

// Cria uma cópia consistente do banco usando "VACUUM INTO" - o mecanismo oficial
// do próprio SQLite para copiar um banco em uso com segurança, sem precisar
// parar o sistema nem correr risco de pegar o arquivo "no meio de uma escrita".
async function criarBackup(prisma, { automatico = false } = {}) {
  const backupDir = getBackupDir();
  const nomeArquivo = automatico ? NOME_BACKUP_AUTOMATICO : nomeArquivoManual();
  const destino = path.join(backupDir, nomeArquivo);

  // VACUUM INTO não sobrescreve - se o destino já existe (caso do backup
  // automático diário, que é sempre o mesmo nome), precisa apagar antes.
  if (fs.existsSync(destino)) fs.unlinkSync(destino);

  const destinoEscapado = destino.replace(/\\/g, '/').replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${destinoEscapado}'`);

  const stat = fs.statSync(destino);
  return { arquivo: nomeArquivo, tamanho: stat.size, modificadoEm: stat.mtime, automatico };
}

function listarBackups() {
  const backupDir = getBackupDir();
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return {
        arquivo: f,
        tamanho: stat.size,
        modificadoEm: stat.mtime,
        automatico: f === NOME_BACKUP_AUTOMATICO,
      };
    })
    .sort((a, b) => new Date(b.modificadoEm) - new Date(a.modificadoEm));
}

// Verificação simples de sanidade: confere se o arquivo parece um banco
// SQLite de verdade (assinatura de 16 bytes no início do arquivo), pra
// evitar restaurar por engano um arquivo qualquer e corromper o sistema.
function pareceBancoSqlite(caminho) {
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(caminho, 'r');
  try {
    fs.readSync(fd, buffer, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('utf-8', 0, 15) === 'SQLite format 3';
}

// Restaura um backup por cima do banco em uso. Como o backend mantém a conexão
// do Prisma aberta com o arquivo atual, a troca só é segura desconectando
// primeiro - por isso, depois de trocar o arquivo, o processo do backend se
// encerra sozinho (ver rota) e o usuário precisa reabrir o app manualmente.
async function restaurarBackup(prisma, caminhoOrigem) {
  if (!fs.existsSync(caminhoOrigem)) {
    throw new Error('Arquivo de backup não encontrado.');
  }
  if (!pareceBancoSqlite(caminhoOrigem)) {
    throw new Error('Esse arquivo não parece ser um backup válido do sistema (formato SQLite não reconhecido).');
  }

  const dbPath = getDbPath();
  await prisma.$disconnect();
  fs.copyFileSync(caminhoOrigem, dbPath);
}

module.exports = {
  NOME_BACKUP_AUTOMATICO,
  getDbPath,
  getBackupDir,
  criarBackup,
  listarBackups,
  restaurarBackup,
  pareceBancoSqlite,
};
