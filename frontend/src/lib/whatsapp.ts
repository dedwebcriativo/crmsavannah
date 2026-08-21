// Abre o WhatsApp automaticamente assim que a resposta do envio chega, sem
// precisar de um segundo clique. Como navegadores bloqueiam popups abertos
// depois de um `await`, a aba já é aberta em branco ANTES da chamada (ainda
// dentro do gesto de clique do usuário) e só recebe a URL final depois.
export async function enviarEAbrirWhatsapp(chamada: () => Promise<any>): Promise<{ resultado: any; linkAberto: boolean }> {
  const janela = typeof window !== 'undefined' ? window.open('', '_blank') : null;

  try {
    const resultado = await chamada();
    const link = resultado?.resultado?.linkWhatsapp;
    const simulado = resultado?.resultado?.simulado;

    if (simulado && link) {
      if (janela) {
        janela.location.href = link;
        return { resultado, linkAberto: true };
      }
      // Popup bloqueado pelo navegador - devolve o link pra mostrar como fallback manual
      return { resultado, linkAberto: false };
    }

    // Enviado de verdade pela Cloud API (ou sem link disponível) - não precisa abrir nada
    if (janela) janela.close();
    return { resultado, linkAberto: false };
  } catch (err) {
    if (janela) janela.close();
    throw err;
  }
}
