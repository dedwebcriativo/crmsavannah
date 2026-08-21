require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Usuário admin principal
  const senhaHashPrincipal = await bcrypt.hash('trocar123', 10);
  await prisma.usuario.upsert({
    where: { email: 'noilor@hotmail.com' },
    update: {},
    create: {
      nome: 'Ico Noilor Almeida',
      email: 'noilor@hotmail.com',
      senha: senhaHashPrincipal,
      creci: '60060F',
      role: 'ADMINISTRADOR',
    },
  });

  // Usuário admin padrão (mantido por compatibilidade com instalações anteriores)
  const senhaHash = await bcrypt.hash('admin123', 10);
  await prisma.usuario.upsert({
    where: { email: 'admin@savannahimoveis.com.br' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@savannahimoveis.com.br',
      senha: senhaHash,
      role: 'ADMINISTRADOR',
    },
  });

  // Permissões padrão dos perfis Colaborador e Contador (o administrador sempre tem
  // acesso completo e não passa por esta tabela). Editável depois na tela de Usuários.
  const { PERMISSOES_PADRAO } = require('../src/utils/permissoes');
  for (const role of Object.keys(PERMISSOES_PADRAO)) {
    await prisma.permissaoRole.upsert({
      where: { role },
      update: {},
      create: { role, permissoesJson: JSON.stringify(PERMISSOES_PADRAO[role]) },
    });
  }

  const inquilino1 = await prisma.inquilino.upsert({
    where: { cpfCnpj: '111.444.777-35' },
    update: {},
    create: {
      nome: 'Maria Souza',
      cpfCnpj: '111.444.777-35',
      telefone: '47999998888',
      email: 'maria@example.com',
      enderecoAtual: 'Rua das Flores, 100',
    },
  });

  const proprietario1 = await prisma.proprietario.create({
    data: {
      nome: 'Juliana Engel Scarton',
      cpfCnpj: '222.333.444-55',
      telefone: '47988887777',
      chavePix: 'juliana.scarton@example.com',
      bancoNome: 'Banco do Brasil',
      bancoAgencia: '1234-5',
      bancoConta: '98765-4',
      tipoContaBancaria: 'corrente',
      diaRepasse: 10,
    },
  });

  const imovel1 = await prisma.imovel.create({
    data: {
      endereco: 'Rua Getúlio Vargas, 250',
      cidade: 'Canoinhas',
      estado: 'SC',
      cep: '89460-000',
      tipo: 'apartamento',
      valorAluguel: 1500.0,
      status: 'ALUGADO',
      inquilinoId: inquilino1.id,
      proprietarioId: proprietario1.id,
    },
  });

  await prisma.imovel.create({
    data: {
      endereco: 'Av. Brasil, 800',
      cidade: 'Canoinhas',
      estado: 'SC',
      cep: '89460-100',
      tipo: 'casa',
      valorAluguel: 2200.0,
      status: 'DISPONIVEL',
    },
  });

  const contrato1 = await prisma.contrato.create({
    data: {
      inquilinoId: inquilino1.id,
      imovelId: imovel1.id,
      valorAluguel: 1500.0,
      caucao: 1500.0,
      percentualComissao: 10.0,
      dataInicio: new Date('2026-01-01'),
      dataFim: new Date('2027-01-01'),
    },
  });

  await prisma.pagamento.create({
    data: {
      inquilinoId: inquilino1.id,
      contratoId: contrato1.id,
      valor: 1500.0,
      percentualImobiliaria: 10.0,
      valorRepasse: 1350.0,
      referenteMes: '2026-06',
      metodo: 'PIX',
      status: 'PAGO',
      dataVencimento: new Date('2026-06-05'),
      dataPagamento: new Date('2026-06-04'),
    },
  });

  await prisma.pagamento.create({
    data: {
      inquilinoId: inquilino1.id,
      contratoId: contrato1.id,
      valor: 1500.0,
      referenteMes: '2026-07',
      metodo: 'PIX',
      status: 'PENDENTE',
      dataVencimento: new Date('2026-07-05'),
    },
  });

  console.log('Seed concluído. Login: admin@savannahimoveis.com.br / senha: admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
