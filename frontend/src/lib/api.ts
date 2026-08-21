const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('savannah_token');
}

export function setToken(token: string) {
  localStorage.setItem('savannah_token', token);
}

export function clearToken() {
  localStorage.removeItem('savannah_token');
}

export function getUsuario() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('savannah_usuario');
  return raw ? JSON.parse(raw) : null;
}

export function setUsuario(usuario: unknown) {
  localStorage.setItem('savannah_usuario', JSON.stringify(usuario));
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const ehFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const resposta = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      // Não define Content-Type manualmente para FormData: o navegador
      // precisa gerar o boundary correto do multipart automaticamente.
      ...(ehFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (resposta.status === 204) return null;

  // Sessão expirada/token inválido: limpa o login salvo e manda pra tela de login,
  // em vez de deixar o usuário preso vendo "Token inválido" e precisando descobrir
  // sozinho que precisa sair e entrar de novo. Não vale para o próprio /auth/login,
  // que usa 401 para "credenciais inválidas" (isso não é sessão expirada).
  if (resposta.status === 401 && !path.startsWith('/api/auth/login')) {
    clearToken();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login?expirado=1';
    }
    throw new Error('Sua sessão expirou. Faça login novamente.');
  }

  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const erro = new Error(dados?.erro || 'Erro na requisição.');
    // Repassa campos extras que a API manda em erros específicos (ex: quando
    // um registro tem vínculos e o backend pede confirmação para excluir em
    // cascata), para a tela poder oferecer as opções certas ao usuário.
    Object.assign(erro, dados || {});
    throw erro;
  }

  return dados;
}

function paraCorpo(body?: unknown) {
  if (body instanceof FormData) return body;
  return body ? JSON.stringify(body) : undefined;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body: paraCorpo(body) }),
  put: (path: string, body?: unknown) => request(path, { method: 'PUT', body: paraCorpo(body) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};

// Baixa um arquivo binário (ex: relatório em XLSX) que exige autenticação - um <a href> comum
// não funcionaria porque não carrega o token; aqui buscamos via fetch com o header certo e
// disparamos o download no navegador manualmente.
export async function baixarArquivo(path: string, nomeArquivoSugerido: string) {
  const token = getToken();
  const resposta = await fetch(`${API_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => null);
    throw new Error(dados?.erro || 'Erro ao gerar o arquivo.');
  }

  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivoSugerido;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { API_URL };
