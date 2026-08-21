const path = require('path');

// Pasta onde ficam os arquivos enviados/gerados pelo sistema (fotos de
// imóveis, PDFs de contratos, recibos, demonstrativos, etc).
//
// Configurável via ARQUIVOS_DIR (definida pelo app desktop, apontando pra
// fora da pasta de instalação - %APPDATA%\CRM Savannah\arquivos). Isso é
// proposital: a pasta de instalação é sobrescrita a cada atualização do
// app, então qualquer arquivo enviado pelo usuário que ficasse lá dentro
// seria perdido na próxima atualização - exatamente o mesmo motivo pelo
// qual o banco de dados já fica fora da pasta de instalação.
//
// Se ARQUIVOS_DIR não estiver definida (ex: rodando localmente sem o
// Electron, via npm run dev), usa o caminho padrão dentro do próprio
// projeto, como sempre foi.
const PASTA_ARQUIVOS = process.env.ARQUIVOS_DIR
  ? path.resolve(process.env.ARQUIVOS_DIR)
  : path.join(__dirname, '..', '..', 'arquivos');

module.exports = { PASTA_ARQUIVOS };
