'use strict';

// O aviso de segurança sobre "allowpopups" é esperado: usamos popups para o
// fluxo de login dos jogos, restritos a http/https no setWindowOpenHandler abaixo.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// User agent de Chrome "normal" para os sites dos jogos não tratarem como navegador embutido
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_SLOTS = 6;
const PARTITION_RE = /^persist:conta[1-6]$/;
const ICON_PATH = path.join(__dirname, 'build', 'icon.ico');

let win = null;

function log(...a) { console.log('[MultiAccountIdle]', ...a); }

function createWindow() {
  const opts = {
    width: Number(process.env.MF_TEST_WIDTH) || 1680,
    height: 960,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0c0f08',
    title: 'MultiAccountIdle',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  };
  if (fs.existsSync(ICON_PATH)) opts.icon = ICON_PATH;
  win = new BrowserWindow(opts);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Repassa erros do renderer para o terminal (facilita diagnóstico)
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) log(`renderer[${level}] ${message} (${sourceId}:${line})`);
  });

  win.on('closed', () => { win = null; });
  log('janela criada');
}

app.whenReady().then(() => {
  // Necessário para as notificações do Windows aparecerem com o nome do app
  app.setAppUserModelId('br.com.chang.multiaccountidle');

  // Cada conta tem sua própria partição persistente (cookies/login separados)
  for (let i = 1; i <= MAX_SLOTS; i++) {
    session.fromPartition(`persist:conta${i}`).setUserAgent(UA);
  }
  createWindow();

  // Modo de teste automatizado: abre, espera e fecha sozinho
  if (process.env.MF_SMOKE) {
    const ms = Math.max(5000, Number(process.env.MF_SMOKE) || 12000);
    log(`modo teste: fechando em ${Math.round(ms / 1000)}s`);
    setTimeout(() => app.quit(), ms);
  }
});

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() === 'webview') {
    contents.setUserAgent(UA);
    // Popups dos jogos (ex.: login) abrem como janela filha na MESMA sessão da conta
    contents.setWindowOpenHandler(({ url }) => {
      if (!/^https?:\/\//i.test(url)) return { action: 'deny' };
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 560, height: 700, autoHideMenuBar: true, backgroundColor: '#0c0f08'
        }
      };
    });
    contents.on('did-create-window', (child) => child.webContents.setUserAgent(UA));
    contents.on('render-process-gone', (_ev, details) => log('webview caiu:', details.reason));
    if (contents.setBackgroundThrottling) contents.setBackgroundThrottling(false);
  }
});

ipcMain.handle('mf:fullscreen', () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});

ipcMain.handle('mf:clear-partition', async (_e, part) => {
  if (!PARTITION_RE.test(String(part)) || !win) return false;
  const r = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancelar', 'Limpar'],
    defaultId: 0,
    cancelId: 0,
    message: 'Limpar a sessão desta conta?',
    detail: 'Você será deslogado dessa conta somente neste app. A conta do jogo em si não é alterada.'
  });
  if (r.response !== 1) return false;
  const ses = session.fromPartition(part);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

app.on('window-all-closed', () => app.quit());
