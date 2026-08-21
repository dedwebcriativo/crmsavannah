/**
 * Serviço de envio de mensagens/documentos via WhatsApp.
 *
 * Usa a WhatsApp Cloud API (Meta) oficial. Para funcionar de verdade você precisa:
 *  1. Uma conta Meta Business verificada com WhatsApp Business API habilitada
 *  2. Um número de telefone cadastrado (WHATSAPP_PHONE_NUMBER_ID)
 *  3. Um access token permanente (WHATSAPP_ACCESS_TOKEN)
 *  4. O documento (PDF) precisa estar acessível publicamente por URL - configure
 *     PUBLIC_URL no .env com o endereço público do backend (ex: hospedado atrás de
 *     um domínio com HTTPS, ou um túnel como ngrok/cloudflared em desenvolvimento)
 *
 * Enquanto essas credenciais não estiverem configuradas, este serviço roda em modo
 * "simulado": registra no console o que seria enviado, sem quebrar o restante do fluxo.
 * Em QUALQUER modo (simulado ou real), também é devolvido um "linkWhatsapp" - um link
 * de clique-para-conversar (wa.me) já com a mensagem (incluindo o link do PDF) pronta,
 * para o atendente conferir ou enviar manualmente com um clique quando quiser.
 */

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

function credenciaisConfiguradas() {
  return Boolean(WHATSAPP_API_URL && PHONE_NUMBER_ID && ACCESS_TOKEN);
}

function normalizarTelefone(telefone) {
  // Remove tudo que não é dígito. Ajuste o DDI conforme necessário (55 = Brasil).
  const apenasDigitos = telefone.replace(/\D/g, '');
  return apenasDigitos.startsWith('55') ? apenasDigitos : `55${apenasDigitos}`;
}

// Link de clique-para-conversar do WhatsApp: abre o app/WhatsApp Web já com o
// número e o texto preenchidos - basta clicar em enviar. Funciona sem nenhuma
// credencial da Cloud API, então serve de alternativa manual sempre disponível.
function montarLinkWhatsapp(telefone, mensagem) {
  const numero = normalizarTelefone(telefone);
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem || '')}`;
}

async function enviarDocumento({ telefone, urlDocumento, nomeArquivo, mensagem, legenda }) {
  const numero = normalizarTelefone(telefone);
  // "legenda" é mantido por compatibilidade com chamadas antigas; "mensagem" é o texto
  // completo (já com o link do PDF embutido) que também vira a legenda do documento.
  const texto = mensagem || legenda || '';
  const linkWhatsapp = montarLinkWhatsapp(telefone, texto);

  if (!credenciaisConfiguradas()) {
    console.log(
      `[WhatsApp - MODO SIMULADO] Enviaria "${nomeArquivo}" para ${numero}. ` +
      `Configure WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN no .env para envio automático real, ` +
      `ou use o link "Abrir no WhatsApp" para enviar manualmente.`
    );
    return {
      simulado: true, para: numero, arquivo: nomeArquivo, mensagem: texto, linkWhatsapp,
    };
  }

  const resposta = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'document',
      document: {
        link: urlDocumento,
        filename: nomeArquivo,
        caption: texto,
      },
    }),
  });

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(`Falha ao enviar via WhatsApp: ${JSON.stringify(dados)}`);
  }

  return { ...dados, mensagem: texto, linkWhatsapp };
}

// Envia uma mensagem de texto simples (sem documento anexo) - usado nos lembretes
// automáticos de vencimento/atraso. Mesmo comportamento de modo simulado da
// enviarDocumento: sem credenciais reais, não quebra o fluxo, só registra e devolve
// o link de clique-para-conversar como alternativa manual.
async function enviarMensagemTexto({ telefone, mensagem }) {
  const numero = normalizarTelefone(telefone);
  const linkWhatsapp = montarLinkWhatsapp(telefone, mensagem);

  if (!credenciaisConfiguradas()) {
    console.log(
      `[WhatsApp - MODO SIMULADO] Enviaria mensagem de texto para ${numero}: "${mensagem.slice(0, 60)}..." ` +
      'Configure WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN no .env para envio automático real.'
    );
    return { simulado: true, para: numero, mensagem, linkWhatsapp };
  }

  const resposta = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'text',
      text: { body: mensagem },
    }),
  });

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(`Falha ao enviar via WhatsApp: ${JSON.stringify(dados)}`);
  }

  return { ...dados, mensagem, linkWhatsapp };
}

module.exports = {
  enviarDocumento, enviarMensagemTexto, credenciaisConfiguradas, montarLinkWhatsapp, normalizarTelefone,
};
