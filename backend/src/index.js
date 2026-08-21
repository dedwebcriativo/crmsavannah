require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const imoveisRoutes = require('./routes/imoveis.routes');
const inquilinosRoutes = require('./routes/inquilinos.routes');
const contratosRoutes = require('./routes/contratos.routes');
const modeloContratoRoutes = require('./routes/modelo-contrato.routes');
const contadorRoutes = require('./routes/contador.routes');
const testemunhaRoutes = require('./routes/testemunha.routes');
const modeloTextoPdfRoutes = require('./routes/modelo-texto-pdf.routes');
const modeloMensagemRoutes = require('./routes/modelo-mensagem.routes');
const proprietariosRoutes = require('./routes/proprietarios.routes');
const configuracoesRoutes = require('./routes/configuracoes.routes');
const demonstrativosRoutes = require('./routes/demonstrativos.routes');
const pagamentosRoutes = require('./routes/pagamentos.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const permissoesRoutes = require('./routes/permissoes.routes');
const notificacoesRoutes = require('./routes/notificacoes.routes');
const backupRoutes = require('./routes/backup.routes');
const { iniciarAgendadorLembretes } = require('./jobs/lembretesPagamento');
const { iniciarAgendadorBackup } = require('./jobs/backupAutomatico');

const app = express();

// Em produção, restringe o CORS ao(s) domínio(s) do frontend (FRONTEND_URL, aceita uma
// lista separada por vírgula pra cobrir www e sem www, ou um domínio de preview do Render).
// Se FRONTEND_URL não estiver definida (ex: rodando localmente), libera geral como sempre.
const origensPermitidas = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : null;
app.use(cors(origensPermitidas ? { origin: origensPermitidas } : {}));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Servir fotos de imóveis publicamente (ex: /arquivos/imoveis/imovel-xyz.jpg)
const { PASTA_ARQUIVOS } = require('./config/arquivos');
app.use('/arquivos', express.static(PASTA_ARQUIVOS));

app.use('/api/auth', authRoutes);
app.use('/api/imoveis', imoveisRoutes);
app.use('/api/inquilinos', inquilinosRoutes);
app.use('/api/contratos', contratosRoutes);
app.use('/api/modelo-contrato', modeloContratoRoutes);
app.use('/api/modelo-mensagem', modeloMensagemRoutes);
app.use('/api/proprietarios', proprietariosRoutes);
app.use('/api/configuracoes', configuracoesRoutes);
app.use('/api/demonstrativos', demonstrativosRoutes);
app.use('/api/contadores', contadorRoutes);
app.use('/api/testemunhas', testemunhaRoutes);
app.use('/api/modelo-texto-pdf', modeloTextoPdfRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/permissoes', permissoesRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/backup', backupRoutes);

// Tratamento de erro genérico
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Savannah CRM API rodando em http://localhost:${PORT}`);
  iniciarAgendadorLembretes();
  iniciarAgendadorBackup();
});
