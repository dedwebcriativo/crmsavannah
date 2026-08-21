// O build "standalone" do Next.js (usado no render-start e também no app
// desktop/Electron) NÃO inclui .next/static nem public/ - é uma limitação
// conhecida e documentada do próprio Next.js, não um bug daqui. Esse script
// copia essas duas pastas para dentro de .next/standalone depois do build,
// pra o servidor standalone (node .next/standalone/server.js) conseguir
// servir CSS, JS dos chunks e as imagens/arquivos estáticos de public/.
//
// Roda automaticamente no final do "npm run render-build" (usado no Render).
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const standaloneDir = path.join(raiz, '.next', 'standalone');

if (!fs.existsSync(standaloneDir)) {
  console.error('[preparar-standalone] .next/standalone não encontrado - o build falhou antes de chegar aqui?');
  process.exit(1);
}

const staticSrc = path.join(raiz, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log('[preparar-standalone] .next/static copiado.');
}

const publicSrc = path.join(raiz, 'public');
const publicDest = path.join(standaloneDir, 'public');
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log('[preparar-standalone] public/ copiado.');
}

console.log('[preparar-standalone] Pronto. Suba com: node .next/standalone/server.js');
