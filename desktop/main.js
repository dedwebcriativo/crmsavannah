const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;

let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;

const isPackaged = app.isPackaged;

// ---------------------------------------------------------------------------
// Fixa o caminho de dados do usuário em %APPDATA%\CRM Savannah, sempre.
// Isso é necessário porque o nome interno do app (usado por padrão pelo
// Electron pra montar esse caminho) pode variar dependendo de como o
// electron-builder empacota - deixando isso implícito, os scripts .bat
// (fechar-app.bat, importar-dados.bat) não conseguem prever com certeza
// onde o banco de dados real está. Fixando aqui, o caminho é sempre
// previsível: %APPDATA%\CRM Savannah\dev.db.
// ---------------------------------------------------------------------------
app.setPath('userData', path.join(app.getPath('appData'), 'CRM Savannah'));

// ---------------------------------------------------------------------------
// Caminhos (dev roda a partir do código-fonte, produção roda a partir de
// process.resourcesPath, onde o electron-builder copia backend/ e frontend/)
// ---------------------------------------------------------------------------
function getPaths() {
  if (isPackaged) {
    const resourcesPath = process.resourcesPath;
    return {
      backendDir: path.join(resourcesPath, 'backend'),
      backendEntry: path.join(resourcesPath, 'backend', 'src', 'index.js'),
      frontendDir: path.join(resourcesPath, 'frontend'),
      frontendEntry: path.join(resourcesPath, 'frontend', 'server.js'),
      seedEntry: path.join(resourcesPath, 'backend', 'prisma', 'seed.js'),
      // Banco de dados fica fora da pasta de instalação (read-only em Program Files)
      userDb: path.join(app.getPath('userData'), 'dev.db'),
      seededMarker: path.join(app.getPath('userData'), '.seeded'),
      // Fotos de imóveis, PDFs gerados etc. também ficam fora da pasta de
      // instalação, pelo mesmo motivo do banco de dados - senão são
      // perdidos a cada atualização do app. "arquivosLegado" é onde esses
      // arquivos ficavam ANTES dessa correção (dentro da instalação) -
      // usado só pra migrar automaticamente o que já tiver sido enviado
      // em versões anteriores, uma única vez.
      arquivosDir: path.join(app.getPath('userData'), 'arquivos'),
      arquivosLegado: path.join(resourcesPath, 'backend', 'arquivos'),
    };
  }

  const root = path.join(__dirname, '..');
  return {
    backendDir: path.join(root, 'backend'),
    backendEntry: path.join(root, 'backend', 'src', 'index.js'),
    frontendDir: path.join(root, 'frontend', '.next', 'standalone'),
    frontendEntry: path.join(root, 'frontend', '.next', 'standalone', 'server.js'),
    // Em dev, o build standalone não inclui .next/static nem public/ -
    // precisamos copiar manualmente a partir da pasta original do build.
    frontendStaticSrc: path.join(root, 'frontend', '.next', 'static'),
    frontendPublicSrc: path.join(root, 'frontend', 'public'),
    seedEntry: path.join(root, 'backend', 'prisma', 'seed.js'),
    userDb: path.join(root, 'backend', 'prisma', 'dev.db'),
    seededMarker: path.join(root, 'backend', 'prisma', '.seeded'),
    // Em dev não precisa configurar - o backend usa o padrão dele mesmo
    // (backend/arquivos), não tem risco de perder nada num "npm install".
  };
}

// ---------------------------------------------------------------------------
// Localiza o executável (CLI) do Prisma dinamicamente, a partir do que
// realmente está instalado em node_modules - em vez de um caminho fixo
// tipo node_modules/prisma/build/index.js, que pode variar entre versões
// do Prisma ou não bater com o que foi de fato instalado/empacotado.
// Usa a resolução de módulos do próprio Node (a mesma lógica do require),
// então funciona não importa a versão instalada.
// ---------------------------------------------------------------------------
function resolvePrismaCli(backendDir) {
  let pkgJsonPath;
  try {
    pkgJsonPath = require.resolve('prisma/package.json', { paths: [backendDir] });
  } catch (err) {
    throw new Error(
      `Não encontrei o pacote "prisma" em:\n${path.join(backendDir, 'node_modules', 'prisma')}\n\n` +
        'Isso normalmente acontece quando o "npm install" do backend não terminou ' +
        'corretamente (rede instável ou antivírus interrompendo a instalação).\n\n' +
        'Solução: feche o app, rode novamente\n' +
        '  cd backend\n  rmdir /s /q node_modules\n  npm install\n' +
        'e gere o instalador de novo.'
    );
  }

  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const binRelative = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin.prisma;
  if (!binRelative) {
    throw new Error(`O pacote "prisma" instalado não declara um executável (bin) válido em ${pkgJsonPath}`);
  }

  const cliPath = path.join(path.dirname(pkgJsonPath), binRelative);
  if (!fs.existsSync(cliPath)) {
    throw new Error(
      `O pacote "prisma" está instalado, mas falta o arquivo do CLI em:\n${cliPath}\n\n` +
        'O "npm install" do backend provavelmente foi interrompido no meio ' +
        '(rede instável ou antivírus). Solução: feche o app, rode novamente\n' +
        '  cd backend\n  rmdir /s /q node_modules\n  npm install\n' +
        'e gere o instalador de novo.'
    );
  }

  return cliPath;
}

// ---------------------------------------------------------------------------
// O build "standalone" do Next.js NÃO inclui .next/static nem public/ -
// isso precisa ser copiado manualmente (regra do próprio Next.js). Em
// produção o electron-builder já entrega isso pronto via extraResources;
// em dev fazemos essa cópia aqui, toda vez que o app inicia.
// ---------------------------------------------------------------------------
function ensureFrontendAssets(paths) {
  if (isPackaged) return;

  if (!fs.existsSync(paths.frontendEntry)) {
    throw new Error(
      `Build do frontend não encontrado em:\n${paths.frontendEntry}\n\n` +
        'Rode antes: cd frontend && npm run build'
    );
  }

  const staticDest = path.join(paths.frontendDir, '.next', 'static');
  const publicDest = path.join(paths.frontendDir, 'public');

  if (fs.existsSync(paths.frontendStaticSrc)) {
    fs.cpSync(paths.frontendStaticSrc, staticDest, { recursive: true });
  }
  if (fs.existsSync(paths.frontendPublicSrc)) {
    fs.cpSync(paths.frontendPublicSrc, publicDest, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Garante que a pasta do banco de dados existe.
// ---------------------------------------------------------------------------
function ensureDatabase(paths) {
  const userDataDir = path.dirname(paths.userDb);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Garante que a pasta de arquivos (fotos de imóveis, PDFs gerados etc.)
// existe fora da pasta de instalação. Se essa pasta ainda não existir mas
// houver arquivos na pasta antiga (dentro da instalação, de antes dessa
// correção), migra tudo automaticamente - uma única vez - pra não perder
// nada que já tenha sido enviado em versões anteriores do app.
// ---------------------------------------------------------------------------
function ensureArquivosDir(paths) {
  if (!isPackaged) return; // em dev o backend usa o caminho padrão dele mesmo

  if (!fs.existsSync(paths.arquivosDir)) {
    fs.mkdirSync(paths.arquivosDir, { recursive: true });

    if (fs.existsSync(paths.arquivosLegado)) {
      console.log(`Migrando arquivos de ${paths.arquivosLegado} para ${paths.arquivosDir}...`);
      fs.cpSync(paths.arquivosLegado, paths.arquivosDir, { recursive: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Roda um script Node até terminar, usando o binário do Electron como
// runtime (ELECTRON_RUN_AS_NODE), e resolve/rejeita com base no código
// de saída. Usado para os passos de migração/seed, que precisam
// terminar ANTES de subir o backend.
// ---------------------------------------------------------------------------
function runNodeScriptAndWait(scriptPath, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout.on('data', (d) => {
      stdoutBuf += d;
      console.log(`[${path.basename(scriptPath)}] ${d}`);
    });
    child.stderr.on('data', (d) => {
      stderrBuf += d;
      console.error(`[${path.basename(scriptPath)}] ${d}`);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      // Prioriza linhas que realmente parecem erro (evita mostrar só o
      // SQL informativo que o Prisma imprime antes de falhar).
      const combined = stdoutBuf + '\n' + stderrBuf;
      const linhasDeErro = combined
        .split('\n')
        .filter((l) => /error|erro|failed|falhou/i.test(l))
        .slice(-15)
        .join('\n');

      const resumo = linhasDeErro.trim() || combined.slice(-1500);

      reject(
        new Error(
          `${path.basename(scriptPath)} falhou (código ${code}):\n\n${resumo}`
        )
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Igual a runNodeScriptAndWait, mas retorna a saída (stdout) em vez de só
// resolver/rejeitar. Usado pra "prisma migrate diff", que só CALCULA o SQL
// necessário e imprime na saída - nunca aplica nada no banco sozinho.
// ---------------------------------------------------------------------------
function runNodeScriptAndCapture(scriptPath, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout.on('data', (d) => { stdoutBuf += d; });
    child.stderr.on('data', (d) => { stderrBuf += d; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdoutBuf);
        return;
      }
      const resumo = (stderrBuf || stdoutBuf).slice(-1500);
      reject(new Error(`${path.basename(scriptPath)} falhou (código ${code}):\n\n${resumo}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Sincroniza o banco de dados do usuário com o schema atual, SEM usar
// "prisma migrate deploy" (que trava com erro P3009 quando uma versão nova
// traz uma migração "criar tudo do zero" que colide com tabelas que já
// existem) nem "prisma db push" sozinho (que, ao detectar uma mudança que
// poderia apagar dados, pede confirmação interativa "y/N" - e como este
// processo roda sem terminal interativo, essa confirmação nunca chega, o
// que já causou perda de dados reais uma vez).
//
// Em vez disso: 1) "prisma migrate diff" calcula o SQL necessário SEM
// aplicar nada (comando somente leitura); 2) o SQL gerado é verificado -
// se tiver qualquer instrução que pareça apagar dados (DROP TABLE, DROP
// COLUMN, RENAME), a sincronização é BLOQUEADA e pede revisão manual, em
// vez de arriscar aplicar; 3) só se for seguro (CREATE TABLE, ADD COLUMN,
// CREATE INDEX etc.) o SQL é aplicado.
// ---------------------------------------------------------------------------
async function runMigrations(paths) {
  const prismaCli = resolvePrismaCli(paths.backendDir);
  const dbUrl = 'file:' + paths.userDb.replace(/\\/g, '/');
  const schemaPath = path.join(paths.backendDir, 'prisma', 'schema.prisma');

  // Garante que o arquivo do banco existe (mesmo vazio) - "migrate diff"
  // com --from-url precisa de um arquivo SQLite válido pra comparar,
  // mesmo que ainda não tenha nenhuma tabela.
  if (!fs.existsSync(paths.userDb)) {
    fs.writeFileSync(paths.userDb, '');
  }

  const diffSql = await runNodeScriptAndCapture(
    prismaCli,
    ['migrate', 'diff', '--from-url', dbUrl, '--to-schema-datamodel', schemaPath, '--script'],
    paths.backendDir,
    {}
  );

  const sql = (diffSql || '').trim();
  if (!sql) return; // banco já está em dia, nada a fazer

  const padraoDestrutivo = /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bRENAME\s+(TO|COLUMN)\b/i;
  if (padraoDestrutivo.test(sql)) {
    throw new Error(
      'O sistema detectou uma mudança de banco de dados que PODERIA apagar ' +
        'dados existentes, e não aplicou automaticamente por segurança.\n\n' +
        'Isso precisa ser revisado manualmente antes de continuar - entre em ' +
        'contato e envie esta mensagem completa para revisão:\n\n' +
        sql.slice(0, 1500)
    );
  }

  const sqlTempPath = path.join(os.tmpdir(), `crmsavannah-sync-${Date.now()}.sql`);
  fs.writeFileSync(sqlTempPath, sql, 'utf-8');
  try {
    const aplicarScript = path.join(paths.backendDir, 'prisma', 'aplicar-sql.js');
    await runNodeScriptAndWait(aplicarScript, [sqlTempPath], paths.backendDir, {
      DATABASE_URL: dbUrl,
    });
  } finally {
    fs.unlink(sqlTempPath, () => {});
  }
}

// ---------------------------------------------------------------------------
// Roda o seed (usuário admin) só na primeira vez que o banco do usuário é
// criado - nunca de novo depois, para não sobrescrever dados reais.
// ---------------------------------------------------------------------------
async function runSeedIfNeeded(paths) {
  if (fs.existsSync(paths.seededMarker)) return;
  if (!fs.existsSync(paths.seedEntry)) return;

  const dbUrl = 'file:' + paths.userDb.replace(/\\/g, '/');
  await runNodeScriptAndWait(paths.seedEntry, [], paths.backendDir, {
    DATABASE_URL: dbUrl,
  });
  fs.writeFileSync(paths.seededMarker, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Sobe um processo Node "de verdade" usando o próprio binário do Electron
// (truque ELECTRON_RUN_AS_NODE=1). Isso evita depender de o usuário ter
// Node.js instalado na máquina.
// ---------------------------------------------------------------------------
function spawnNodeScript(scriptPath, cwd, env) {
  return spawn(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      ...env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    windowsHide: true,
  });
}

function startBackend(paths) {
  if (!fs.existsSync(paths.backendEntry)) {
    throw new Error(`Backend não encontrado em:\n${paths.backendEntry}`);
  }

  const dbUrl = 'file:' + paths.userDb.replace(/\\/g, '/');

  const envExtra = {
    PORT: String(BACKEND_PORT),
    DATABASE_URL: dbUrl,
  };
  if (paths.arquivosDir) {
    envExtra.ARQUIVOS_DIR = paths.arquivosDir;
  }

  backendProcess = spawnNodeScript(paths.backendEntry, paths.backendDir, envExtra);

  backendProcess.stdout.on('data', (d) => console.log(`[backend] ${d}`));
  backendProcess.stderr.on('data', (d) => console.error(`[backend] ${d}`));
  backendProcess.on('exit', (code) => console.log(`[backend] saiu com código ${code}`));
}

function startFrontend(paths) {
  frontendProcess = spawnNodeScript(paths.frontendEntry, paths.frontendDir, {
    PORT: String(FRONTEND_PORT),
    HOSTNAME: '127.0.0.1',
    NEXT_PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}`,
  });

  frontendProcess.stdout.on('data', (d) => console.log(`[frontend] ${d}`));
  frontendProcess.stderr.on('data', (d) => console.error(`[frontend] ${d}`));
  frontendProcess.on('exit', (code) => console.log(`[frontend] saiu com código ${code}`));
}

// ---------------------------------------------------------------------------
// Espera um servidor HTTP responder antes de abrir a janela
// ---------------------------------------------------------------------------
function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout aguardando ${url}`));
          return;
        }
        setTimeout(tick, 500);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#046439',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startApp() {
  const paths = getPaths();

  try {
    ensureDatabase(paths);
    ensureArquivosDir(paths);
    await runMigrations(paths);
    await runSeedIfNeeded(paths);
    ensureFrontendAssets(paths);
    startBackend(paths);
    startFrontend(paths);

    await waitForServer(`http://localhost:${BACKEND_PORT}/api/health`);
    await waitForServer(`http://localhost:${FRONTEND_PORT}`);

    createWindow();
  } catch (err) {
    console.error(err);
    dialog.showErrorBox(
      'CRM Savannah - erro ao iniciar',
      `Não foi possível iniciar o aplicativo.\n\n${err.message}`
    );
    app.quit();
  }
}

function stopChildProcesses() {
  if (backendProcess) backendProcess.kill();
  if (frontendProcess) frontendProcess.kill();
}

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  stopChildProcesses();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopChildProcesses);

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
