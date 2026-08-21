/**
 * Importa dados de um dump SQL (MySQL/phpMyAdmin) direto para o banco
 * SQLite usado pelo app desktop. SUBSTITUI os dados existentes nas
 * tabelas operacionais, preservando os IDs originais do dump para manter
 * os relacionamentos entre tabelas intactos.
 *
 * Uso:
 *   DATABASE_URL="file:./dev.db" node prisma/importar-dados.js caminho/para/backup.sql
 *
 * IMPORTANTE - como isso funciona: os campos de cada tabela são lidos
 * automaticamente da definição do schema do Prisma (via Prisma.dmmf) em
 * vez de uma lista escrita à mão. Isso significa que, quando o schema
 * ganha campos novos, ESTE SCRIPT NÃO PRECISA SER ATUALIZADO - ele já
 * pega os campos novos sozinho, desde que o dump .sql também os tenha.
 * Só a ORDEM de exclusão/inserção das tabelas (por causa das relações
 * entre elas) fica fixa na lista abaixo.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { parseSqlDump } = require('./sql-dump-parser');

const prisma = new PrismaClient();
const dmmf = Prisma.dmmf;

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Uso: node importar-dados.js caminho/para/backup.sql');
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error(`Arquivo não encontrado: ${sqlPath}`);
  process.exit(1);
}

const sqlText = fs.readFileSync(sqlPath, 'utf-8');
const dados = parseSqlDump(sqlText);

function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  return new Date(String(v).replace(' ', 'T') + 'Z');
}
function toBool(v) {
  return v === 1 || v === true;
}
function orNull(v) {
  return v === '' ? null : v ?? null;
}

// ---------------------------------------------------------------------------
// Monta o objeto "data" para o Prisma a partir de uma linha do dump,
// usando a definição real do modelo (campos, tipos) direto do schema.
// Ignora campos de relação (objetos/arrays de outros modelos) e campos
// que não existem no dump (deixa o Prisma aplicar o valor padrão dele).
// ---------------------------------------------------------------------------
function buildData(row, modelName, { skipId = false } = {}) {
  const model = dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) throw new Error(`Modelo não encontrado no schema: ${modelName}`);

  const data = {};
  for (const f of model.fields) {
    if (f.kind !== 'scalar') continue; // pula relações (objetos/arrays)
    if (skipId && f.isId) continue;
    if (!(f.name in row)) continue; // dump não tem essa coluna - Prisma usa o default
    const val = row[f.name];
    if (val === undefined) continue;

    if (f.type === 'DateTime') {
      data[f.name] = toDate(val);
    } else if (f.type === 'Boolean') {
      data[f.name] = val === null ? null : toBool(val);
    } else if (f.type === 'String') {
      data[f.name] = orNull(val);
    } else {
      // Int, Float, Decimal
      data[f.name] = val === '' || val === undefined ? null : val;
    }
  }
  return data;
}

async function main() {
  console.log(`Lendo dump: ${path.resolve(sqlPath)}`);
  console.log(
    'Tabelas encontradas no dump:',
    Object.keys(dados)
      .filter((t) => t !== '_prisma_migrations')
      .join(', ')
  );
  console.log('');

  console.log('Limpando dados atuais...');
  if (prisma.testemunha) await prisma.testemunha.deleteMany({});
  if (prisma.notificacao) await prisma.notificacao.deleteMany({});
  if (prisma.contador) await prisma.contador.deleteMany({});
  await prisma.pagamentoItem.deleteMany({});
  await prisma.pagamento.deleteMany({});
  await prisma.contrato.deleteMany({});
  await prisma.imovel.deleteMany({});
  await prisma.inquilino.deleteMany({});
  if (prisma.notaFiscal) await prisma.notaFiscal.deleteMany({});
  await prisma.proprietario.deleteMany({});
  await prisma.modeloContrato.deleteMany({});
  await prisma.configuracaoEmpresa.deleteMany({});
  // Usuario NÃO é apagado por completo: usuários criados pelo seed (ex: login
  // principal do administrador) ou manualmente pelo app não devem sumir só
  // porque não estão no dump antigo. São gravados via upsert (por email)
  // logo abaixo, sem mexer nos que já existem e não estão no dump.

  console.log('Importando usuários...');
  for (const u of dados.usuario || []) {
    const campos = buildData(u, 'Usuario', { skipId: true });
    delete campos.email; // email é a chave do upsert, não entra no "update"
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: campos,
      create: { ...campos, email: u.email },
    });
  }

  console.log('Importando proprietários...');
  for (const p of dados.proprietario || []) {
    await prisma.proprietario.create({ data: buildData(p, 'Proprietario') });
  }

  console.log('Importando inquilinos...');
  for (const i of dados.inquilino || []) {
    await prisma.inquilino.create({ data: buildData(i, 'Inquilino') });
  }

  console.log('Importando imóveis...');
  for (const im of dados.imovel || []) {
    await prisma.imovel.create({ data: buildData(im, 'Imovel') });
  }

  console.log('Importando contratos...');
  for (const c of dados.contrato || []) {
    await prisma.contrato.create({ data: buildData(c, 'Contrato') });
  }

  console.log('Importando modelos de contrato...');
  for (const mc of dados.modelocontrato || []) {
    await prisma.modeloContrato.create({ data: buildData(mc, 'ModeloContrato') });
  }

  console.log('Importando testemunhas...');
  for (const t of dados.testemunha || []) {
    if (!prisma.testemunha) break;
    await prisma.testemunha.create({ data: buildData(t, 'Testemunha') });
  }

  console.log('Importando configurações da empresa...');
  for (const ce of dados.configuracaoempresa || []) {
    await prisma.configuracaoEmpresa.create({ data: buildData(ce, 'ConfiguracaoEmpresa') });
  }

  console.log('Importando contador(es)...');
  for (const ct of dados.contador || []) {
    if (!prisma.contador) break;
    await prisma.contador.create({ data: buildData(ct, 'Contador') });
  }

  console.log('Importando notas fiscais...');
  for (const nf of dados.notafiscal || []) {
    if (!prisma.notaFiscal) break;
    await prisma.notaFiscal.create({ data: buildData(nf, 'NotaFiscal') });
  }

  console.log('Importando pagamentos...');
  for (const pg of dados.pagamento || []) {
    await prisma.pagamento.create({ data: buildData(pg, 'Pagamento') });
  }

  console.log('Importando itens de pagamento...');
  for (const pi of dados.pagamentoitem || []) {
    await prisma.pagamentoItem.create({ data: buildData(pi, 'PagamentoItem') });
  }

  console.log('Importando notificações...');
  for (const n of dados.notificacao || []) {
    if (!prisma.notificacao) break;
    await prisma.notificacao.create({ data: buildData(n, 'Notificacao') });
  }

  console.log('\nAjustando contadores de ID...');
  const tabelas = [
    'Usuario', 'Proprietario', 'Inquilino', 'Imovel', 'Contrato',
    'ModeloContrato', 'ConfiguracaoEmpresa', 'Pagamento', 'PagamentoItem',
    'Notificacao', 'Contador', 'NotaFiscal',
  ];
  for (const t of tabelas) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX(id), 0) FROM "${t}") WHERE name = '${t}'`
      );
    } catch (e) {
      // Tabela pode não existir ainda em bancos mais antigos - ignora.
    }
  }

  console.log('\nImportação concluída com sucesso!');
}

main()
  .catch((err) => {
    if (err && err.code === 'P2021') {
      console.error(
        '\nERRO: o banco de dados ainda não tem essa tabela ' +
          `(${err.meta && err.meta.table}).\n\n` +
          'Isso quer dizer que as migrations do Prisma ainda não rodaram ' +
          'nesse banco. Abra o app (instalado ou via iniciar.bat) pelo ' +
          'menos uma vez ANTES de importar - é na primeira abertura que ' +
          'o banco é criado/atualizado automaticamente.'
      );
    } else {
      console.error('\nERRO durante a importação:', err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
