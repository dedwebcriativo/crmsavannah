const cron = require('node-cron');
const prisma = require('../config/prisma');
const { criarBackup } = require('../services/backup.service');

// Agenda o backup automático diário (padrão: 3h da manhã, fora do horário de uso).
// Sempre sobrescreve o mesmo arquivo (backup-automatico-diario.db) - não acumula
// histórico, é só uma rede de segurança do "dia anterior". Configurável via
// BACKUP_HORARIO no .env.
//
// Esse mecanismo (VACUUM INTO) é específico do SQLite (usado no app desktop) - em
// produção no Render, o banco é Postgres, que tem seu próprio backup automático
// gerenciado pelo Render (Dashboard do banco > Backups), então esse agendador fica
// inativo nesse caso (evita erro no cron tentando tratar a DATABASE_URL do Postgres
// como se fosse um caminho de arquivo .db).
function iniciarAgendadorBackup() {
  const ehSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
  if (!ehSqlite) {
    console.log('[Backup] Banco não é SQLite (provavelmente Postgres em produção) - backup automático via cron desativado. Use o backup gerenciado do Render (Dashboard do banco > Backups).');
    return;
  }
  const expressao = process.env.BACKUP_HORARIO || '0 3 * * *';
  cron.schedule(expressao, () => {
    criarBackup(prisma, { automatico: true })
      .then((r) => console.log(`[Backup] Backup automático diário concluído: ${r.arquivo} (${r.tamanho} bytes).`))
      .catch((err) => console.error('[Backup] Falha no backup automático diário:', err));
  });
  console.log(`[Backup] Agendador de backup automático iniciado (expressão cron: "${expressao}").`);
}

module.exports = { iniciarAgendadorBackup };
