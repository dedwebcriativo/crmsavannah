const ftp = require('basic-ftp');

/**
 * Envia um arquivo local para o FTP e devolve a URL pública correspondente.
 * Usado na hora de mandar um PDF pelo WhatsApp: como a Meta (e o próprio celular
 * de quem recebe) precisa acessar o arquivo pela internet, um link localhost não
 * funciona - então o PDF sobe pro FTP do site e o link público é esse.
 *
 * Configuração via .env: FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_DESTINO, FTP_URL_PUBLICA.
 * Se as credenciais não estiverem configuradas, lança erro (quem chama decide se
 * cai para um link local como alternativa, ou avisa o usuário).
 */
async function enviarArquivoParaFtp(caminhoLocalAbsoluto, nomeArquivoRemoto) {
  const {
    FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_DESTINO, FTP_URL_PUBLICA, FTP_SECURE,
  } = process.env;

  if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
    throw new Error('FTP não configurado. Defina FTP_HOST, FTP_USER e FTP_PASSWORD no .env do backend.');
  }
  if (!FTP_URL_PUBLICA) {
    throw new Error('Defina FTP_URL_PUBLICA no .env do backend (URL pública correspondente à pasta FTP_DESTINO).');
  }

  const client = new ftp.Client(20000); // timeout de 20s por operação
  client.ftp.verbose = false;

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASSWORD,
      secure: FTP_SECURE === 'true', // a maioria das hospedagens compartilhadas usa FTP simples, não FTPS
    });

    const destino = FTP_DESTINO || '/';
    await client.ensureDir(destino); // cria a pasta se não existir e já entra nela
    await client.uploadFrom(caminhoLocalAbsoluto, nomeArquivoRemoto);
  } finally {
    client.close();
  }

  const baseUrl = FTP_URL_PUBLICA.replace(/\/+$/, '');
  return `${baseUrl}/${encodeURIComponent(nomeArquivoRemoto)}`;
}

// Tenta publicar o arquivo no FTP; se falhar por qualquer motivo (credenciais erradas,
// FTP fora do ar, timeout etc.), cai para a URL local informada em vez de travar o envio -
// melhor mandar com o link local (que pode não abrir fora da rede) do que não mandar nada.
async function obterLinkPublicoOuFallback(caminhoLocalAbsoluto, nomeArquivoRemoto, urlFallback) {
  try {
    const url = await enviarArquivoParaFtp(caminhoLocalAbsoluto, nomeArquivoRemoto);
    return { url, viaFtp: true };
  } catch (err) {
    console.error(`[FTP] Falha ao publicar "${nomeArquivoRemoto}" - usando link local como alternativa. Detalhe: ${err.message}`);
    return { url: urlFallback, viaFtp: false, erroFtp: err.message };
  }
}

module.exports = { enviarArquivoParaFtp, obterLinkPublicoOuFallback };
