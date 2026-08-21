/**
 * Roda depois que o electron-builder empacota o app, mas antes de gerar
 * o instalador NSIS. Grava o ícone da Savannah no .exe final usando o
 * pacote "rcedit" isoladamente (não é o electron-builder que faz isso,
 * já que desativamos essa etapa dele de propósito - "signAndEditExecutable":
 * false - para evitar o download do pacote winCodeSign, que causa erro de
 * link simbólico no Windows sem Modo Desenvolvedor/admin).
 *
 * O pacote "rcedit" usado aqui já vem com o executável rcedit.exe
 * embutido dentro dele (node_modules/rcedit/bin/), então não baixa nada
 * extra na hora de rodar - diferente do winCodeSign.
 */
const path = require('path');
const fs = require('fs');
const rcedit = require('rcedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(__dirname, 'build', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] .exe não encontrado em ${exePath}, pulando gravação do ícone.`);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[afterPack] Ícone não encontrado em ${iconPath}, pulando gravação do ícone.`);
    return;
  }

  try {
    await rcedit(exePath, { icon: iconPath });
    console.log(`[afterPack] Ícone gravado com sucesso em: ${exePath}`);
  } catch (err) {
    console.warn(`[afterPack] Não foi possível gravar o ícone (o app funciona normalmente mesmo assim): ${err.message}`);
  }
};
