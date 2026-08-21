const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const prisma = require('../config/prisma');
const { autenticar, exigirAdministrador } = require('../middleware/auth');
const backupService = require('../services/backup.service');

const router = express.Router();

// Backup/restauração mexe no banco inteiro - só o administrador pode acessar,
// mesma regra usada para gestão de usuários e permissões.
router.use(autenticar);
router.use(exigirAdministrador);

// Esse módulo de backup (upload/download de arquivo .db) é específico do SQLite,
// usado no app desktop. Em produção no Render o banco é Postgres, então essas
// rotas retornam uma mensagem clara em vez de erro genérico - o backup em Postgres
// é feito pelo próprio Render (Dashboard do banco > Backups), automático e sem
// precisar dessa tela.
router.use((req, res, next) => {
  const ehSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
  if (!ehSqlite) {
    return res.status(400).json({
      erro: 'Este banco é Postgres (produção) - o backup/restauração por arquivo .db é exclusivo do app desktop (SQLite). No servidor, o backup é feito automaticamente pelo Render (Dashboard do banco de dados > Backups).',
    });
  }
  next();
});

const uploadBackup = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const extensao = path.extname(file.originalname).toLowerCase();
    if (extensao === '.db') return cb(null, true);
    cb(new Error('Envie um arquivo de backup .db válido.'));
  },
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB - bem acima do tamanho real do banco
});

// POST /api/backup/manual - cria um backup agora, com nome carimbado (não sobrescreve)
router.post('/manual', async (req, res) => {
  try {
    const resultado = await backupService.criarBackup(prisma, { automatico: false });
    res.json({ sucesso: true, ...resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar backup: ' + err.message });
  }
});

// GET /api/backup/listar - lista os backups já salvos (mais recente primeiro)
router.get('/listar', (req, res) => {
  try {
    res.json(backupService.listarBackups());
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar backups: ' + err.message });
  }
});

// GET /api/backup/baixar/:arquivo - baixa uma cópia do backup (ex: pra guardar num pendrive/nuvem)
router.get('/baixar/:arquivo', (req, res) => {
  try {
    const backupDir = backupService.getBackupDir();
    const nomeArquivo = path.basename(req.params.arquivo); // evita path traversal
    const caminho = path.join(backupDir, nomeArquivo);
    if (!fs.existsSync(caminho)) {
      return res.status(404).json({ erro: 'Backup não encontrado.' });
    }
    res.download(caminho, nomeArquivo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao baixar backup: ' + err.message });
  }
});

// POST /api/backup/restaurar/:arquivo - restaura um backup já salvo na pasta de backups
router.post('/restaurar/:arquivo', async (req, res) => {
  try {
    const backupDir = backupService.getBackupDir();
    const nomeArquivo = path.basename(req.params.arquivo);
    const caminho = path.join(backupDir, nomeArquivo);

    await backupService.restaurarBackup(prisma, caminho);

    res.json({
      sucesso: true,
      mensagem: 'Banco de dados restaurado com sucesso. Feche e abra o sistema novamente para carregar os dados restaurados.',
    });
    // Encerra o backend logo em seguida - o Electron não reinicia sozinho,
    // então o usuário precisa reabrir o app manualmente após a restauração.
    setTimeout(() => process.exit(0), 800);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao restaurar backup.' });
  }
});

// POST /api/backup/restaurar-upload - restaura a partir de um arquivo .db enviado pelo usuário
router.post('/restaurar-upload', uploadBackup.single('arquivo'), async (req, res) => {
  const arquivosTemp = [];
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    const caminhoTemp = path.join(os.tmpdir(), `restaurar-upload-${Date.now()}.db`);
    fs.writeFileSync(caminhoTemp, req.file.buffer);
    arquivosTemp.push(caminhoTemp);

    await backupService.restaurarBackup(prisma, caminhoTemp);

    res.json({
      sucesso: true,
      mensagem: 'Banco de dados restaurado com sucesso. Feche e abra o sistema novamente para carregar os dados restaurados.',
    });
    setTimeout(() => process.exit(0), 800);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao restaurar backup enviado.' });
  } finally {
    for (const f of arquivosTemp) {
      fs.unlink(f, () => {});
    }
  }
});

module.exports = router;
