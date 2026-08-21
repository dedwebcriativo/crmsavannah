const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { PASTA_ARQUIVOS } = require('../config/arquivos');

const PASTA_FOTOS = path.join(PASTA_ARQUIVOS, 'imoveis');
fs.mkdirSync(PASTA_FOTOS, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PASTA_FOTOS),
  filename: (req, file, cb) => {
    const sufixo = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extensao = path.extname(file.originalname).toLowerCase();
    cb(null, `imovel-${sufixo}${extensao}`);
  },
});

function filtroArquivo(req, file, cb) {
  const permitidos = ['.jpg', '.jpeg', '.png', '.webp'];
  const extensao = path.extname(file.originalname).toLowerCase();
  if (permitidos.includes(extensao)) {
    cb(null, true);
  } else {
    cb(new Error('Formato de imagem não suportado. Use JPG, PNG ou WEBP.'));
  }
}

const uploadFotoImovel = multer({
  storage,
  fileFilter: filtroArquivo,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// XML da nota fiscal: fica só em memória (não grava em disco), pois o conteúdo
// é lido, extraído e salvo como texto no banco (campo xmlConteudo).
const uploadXmlNota = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const extensao = path.extname(file.originalname).toLowerCase();
    if (extensao === '.xml') return cb(null, true);
    cb(new Error('Envie um arquivo .xml válido.'));
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

module.exports = { uploadFotoImovel, uploadXmlNota, PASTA_FOTOS };
