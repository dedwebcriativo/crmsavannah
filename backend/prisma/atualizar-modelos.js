/**
 * Atualiza SÓ os dados de "configuração/referência" a partir de um dump
 * SQL - modelos de contrato, modelos de mensagem WhatsApp, permissões por
 * perfil e configuração da empresa. NUNCA toca em dados operacionais
 * (imóveis, inquilinos, contratos, pagamentos, proprietários, usuários,
 * notas fiscais, notificações).
 *
 * Os campos de cada tabela são lidos automaticamente do schema do Prisma
 * (Prisma.dmmf), então mudanças de schema não exigem atualizar este script.
 *
 * Uso:
 *   DATABASE_URL="file:./dev.db" node prisma/atualizar-modelos.js caminho/para/dump.sql
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { parseSqlDump } = require('./sql-dump-parser');

const prisma = new PrismaClient();
const dmmf = Prisma.dmmf;

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Uso: node atualizar-modelos.js caminho/para/dump.sql');
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
function orNull(v) {
  return v === '' ? null : v ?? null;
}

function buildData(row, modelName, { skipId = false } = {}) {
  const model = dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) throw new Error(`Modelo não encontrado no schema: ${modelName}`);

  const data = {};
  for (const f of model.fields) {
    if (f.kind !== 'scalar') continue;
    if (skipId && f.isId) continue;
    if (!(f.name in row)) continue;
    const val = row[f.name];
    if (val === undefined) continue;

    if (f.type === 'DateTime') {
      data[f.name] = toDate(val);
    } else if (f.type === 'Boolean') {
      data[f.name] = val === null ? null : val === 1 || val === true;
    } else if (f.type === 'String') {
      data[f.name] = orNull(val);
    } else {
      data[f.name] = val === '' || val === undefined ? null : val;
    }
  }
  return data;
}

async function main() {
  console.log(`Lendo dump: ${path.resolve(sqlPath)}`);
  console.log('Atualizando SOMENTE dados de configuração/referência.');
  console.log('Nada em imóveis, inquilinos, contratos, pagamentos, proprietários,');
  console.log('usuários, notas fiscais ou notificações será alterado.\n');

  let total = 0;

  console.log('Modelos de contrato...');
  for (const mc of dados.modelocontrato || []) {
    const campos = buildData(mc, 'ModeloContrato', { skipId: true });
    await prisma.modeloContrato.upsert({
      where: { tipo: mc.tipo },
      update: campos,
      create: { ...campos, tipo: mc.tipo },
    });
    total++;
  }

  console.log('Modelos de mensagem do WhatsApp...');
  for (const mm of dados.modelomensagemwhatsapp || []) {
    const campos = buildData(mm, 'ModeloMensagemWhatsapp', { skipId: true });
    await prisma.modeloMensagemWhatsapp.upsert({
      where: { tipo: mm.tipo },
      update: campos,
      create: { ...campos, tipo: mm.tipo },
    });
    total++;
  }

  console.log('Textos padrão dos PDFs...');
  for (const mt of dados.modelotextopdf || []) {
    if (!prisma.modeloTextoPdf) continue;
    const campos = buildData(mt, 'ModeloTextoPdf', { skipId: true });
    await prisma.modeloTextoPdf.upsert({
      where: { tipo: mt.tipo },
      update: campos,
      create: { ...campos, tipo: mt.tipo },
    });
    total++;
  }

  console.log('Permissões por perfil...');
  for (const pr of dados.permissaorole || []) {
    const campos = buildData(pr, 'PermissaoRole', { skipId: true });
    await prisma.permissaoRole.upsert({
      where: { role: pr.role },
      update: campos,
      create: { ...campos, role: pr.role },
    });
    total++;
  }

  console.log('Configuração da empresa...');
  for (const ce of dados.configuracaoempresa || []) {
    const campos = buildData(ce, 'ConfiguracaoEmpresa', { skipId: true });
    const existente = await prisma.configuracaoEmpresa.findFirst();
    if (existente) {
      await prisma.configuracaoEmpresa.update({ where: { id: existente.id }, data: campos });
    } else {
      await prisma.configuracaoEmpresa.create({ data: campos });
    }
    total++;
  }

  console.log(`\n${total} registro(s) de configuração atualizados com sucesso.`);
}

main()
  .catch((err) => {
    if (err && err.code === 'P2021') {
      console.error(
        '\nERRO: o banco de dados ainda não tem essa tabela ' +
          `(${err.meta && err.meta.table}).\n\n` +
          'Abra o app pelo menos uma vez antes de rodar isso, para as ' +
          'migrations criarem a tabela.'
      );
    } else {
      console.error('\nERRO ao atualizar modelos:', err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
