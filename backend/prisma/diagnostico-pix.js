/**
 * Mostra o valor CRU (direto do banco, sem passar por nenhuma tela ou rota)
 * de chavePix/tipoChavePix dos últimos proprietários cadastrados/editados.
 * Serve pra descobrir se o problema é ao SALVAR (o banco já mostra errado)
 * ou ao EXIBIR (o banco está certo, mas a tela mostra errado).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const proprietarios = await prisma.proprietario.findMany({
    orderBy: { id: 'desc' },
    take: 5,
    select: { id: true, nome: true, chavePix: true, tipoChavePix: true },
  });

  console.log('Últimos 5 proprietários (direto do banco, sem passar por nenhuma tela):\n');
  for (const p of proprietarios) {
    console.log(`ID ${p.id} - ${p.nome}`);
    console.log(`  chavePix:     ${JSON.stringify(p.chavePix)}`);
    console.log(`  tipoChavePix: ${JSON.stringify(p.tipoChavePix)}`);
    console.log('');
  }
}

main()
  .catch((err) => console.error('ERRO:', err))
  .finally(() => prisma.$disconnect());
