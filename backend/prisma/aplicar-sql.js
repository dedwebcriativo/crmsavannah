/**
 * Aplica um arquivo .sql (gerado por "prisma migrate diff --script") no
 * banco de dados, executando cada instrução separadamente. Este script
 * SÓ é chamado depois que o main.js já conferiu que o SQL não contém
 * nada que pareça destrutivo (DROP TABLE, DROP COLUMN, RENAME) - aqui a
 * gente só executa, a checagem de segurança acontece antes.
 *
 * Uso:
 *   DATABASE_URL="file:./dev.db" node prisma/aplicar-sql.js caminho/arquivo.sql
 */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Uso: node aplicar-sql.js caminho/arquivo.sql');
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error(`Arquivo não encontrado: ${sqlPath}`);
  process.exit(1);
}

const sqlBruto = fs.readFileSync(sqlPath, 'utf-8');

// O "migrate diff --script" separa instruções com ";" no fim da linha e
// usa comentários "-- " para anotações - removemos os comentários e
// dividimos em instruções individuais (o driver SQLite do Prisma não
// executa múltiplas instruções separadas por ";" numa única chamada).
const statements = sqlBruto
  .split('\n')
  .filter((linha) => !linha.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const prisma = new PrismaClient();

async function main() {
  console.log(`Aplicando ${statements.length} instrução(ões) de sincronização...`);
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log('Sincronização do banco de dados concluída.');
}

main()
  .catch((err) => {
    console.error('ERRO ao aplicar sincronização do banco:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
