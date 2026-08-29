# 🕹️ MultiAccountIdle

[🇺🇸 English](README.md) · **Português**

Programa de Windows para rodar até **6 contas de jogos idle de navegador**
(como o [Huntera](https://huntera.com.br)) lado a lado — cada conta com login
próprio e persistente, modo economia para as contas em segundo plano,
notificações do Windows e reconexão automática.

![Captura de tela do MultiAccountIdle](docs/screenshot.png)

> ⚠️ Este app **não automatiza gameplay** — ele é um "navegador especializado"
> que abre o jogo em sessões independentes e otimiza o consumo de CPU/GPU.
> O "idle" é o próprio jogo. Verifique as regras de cada jogo sobre uso de
> múltiplas contas antes de jogar.

## Recursos

| Recurso | Como usar |
| --- | --- |
| **Até 6 contas simultâneas** | ⚙ → "Número de contas". Cada painel é uma sessão independente (cookies/login separados) |
| **Renomear contas** | Duplo clique no chip da conta (ex.: use o nome do personagem) |
| **Trocar de jogo** | Seletor "Jogo" na barra. `＋` adiciona qualquer jogo por URL, `−` remove. As sessões valem por conta, para todos os jogos |
| **Arranjos de tela** | 10 arranjos com miniatura do formato, incluindo grade 3×2 para 6 contas. Contas fora do arranjo viram miniaturas ao vivo no canto (clique para trazer de volta). Em **Tela única** as outras contas ficam totalmente ocultas, rodando em segundo plano |
| **Modo ECO** | Botão `ECO` no painel ou a pílula do chip. O jogo segue rodando com FPS limitado e o painel mostra Capacidade / Stamina / Lv / XP. Slider "Eco" (5–30 FPS); "← Arraste para voltar" sai do modo |
| **ECO automático** | ⚙ → nas contas não principais, ou após X minutos de inatividade |
| **Notificações do Windows** | ⚙ → stamina baixa (limite configurável), subida de nível e desconexão |
| **Reconexão automática** | ⚙ → recarrega a conta sozinha se a página cair, travar ou desconectar |
| **Perfis** | ⚙ → salvar a combinação atual (jogo, arranjo, eco, contas) e aplicar com 1 clique |
| **Conta principal** | Clique no chip, botão ★ do painel, ou `Ctrl+1..6` |
| **Zoom / Início / Recarregar / Tela cheia** | Botões `A−`/`A+`/🏠/⟳/⛶ na barra |
| **Som** | 🔊/🔇 por painel (ECO sempre silencia) |
| **Limpar sessão** | 🧹 desloga aquela conta somente neste app (pede confirmação) |

Tudo (jogos, arranjo, nomes, eco, notificações, perfis) fica salvo entre sessões.

## Instalação

**Jogadores:** baixe o `MultiAccountIdle-Setup-<versão>.exe` em
[Releases](../../releases) e execute (instalação de um clique, sem admin).
O SmartScreen do Windows pode avisar sobre app não assinado — escolha
"Mais informações → Executar assim mesmo".

**Pelo código-fonte:**

```
git clone <este repositório>
cd multiaccountidle
npm install
npm start          # rodar em modo dev
npm run dist       # gerar o app em dist/win-unpacked/
npm run installer  # gerar o instalador NSIS em dist/
```

Requer [Node.js](https://nodejs.org) 18+.

## Primeiro uso

Cada painel abre a tela de login do jogo. Faça login em cada conta manualmente
**uma única vez** — os logins ficam salvos em partições separadas
(`persist:conta1` … `persist:conta6`), e nas próximas aberturas todas as
contas entram sozinhas. O app nunca vê nem guarda suas senhas; as sessões
ficam no armazenamento do próprio Chromium.

## Ajustando a leitura de status

Os valores de Capacidade/Stamina/Lv/XP (usados no painel ECO e nas
notificações) são lidos do **texto da página do jogo** por padrões (regex)
feitos para o Huntera. Para outros jogos, ajuste a função `mfPageBootstrap()`
no topo de [renderer/app.js](renderer/app.js) — o painel ECO mostra "—"
quando não encontra um valor.

## Estrutura do projeto

```
main.js             processo principal (janela, sessões, popups de login, ícone)
preload.js          ponte segura renderer ↔ main
renderer/index.html barra superior + grade + painel de config/modais
renderer/styles.css tema (verde/dourado)
renderer/app.js     lógica: painéis, eco, arranjos, jogos, notificações, perfis
build/icon.ico      ícone do app
```

> **Dica de build no Windows:** se o electron-builder falhar com "Cannot
> create symbolic link" ao extrair o winCodeSign, extraia o `.7z` do cache
> manualmente em `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`
> (os links quebrados são arquivos só de macOS e podem ser ignorados) — ou
> ative o Modo Desenvolvedor do Windows.

## Autor

Desenvolvido por **Alex Chang** — [alexscchang1@gmail.com](mailto:alexscchang1@gmail.com) —
com a ajuda do [Claude Code](https://claude.com/claude-code).

## Licença

[MIT](LICENSE)
