# Rabiola

Jogo de pipa 3D no campinho de várzea, feito com Three.js (gráficos) e Ammo.js (física).

## Como abrir

O jogo agora é dividido em vários arquivos, então precisa rodar por um servidor
(abrir o `rabiola.html` com dois cliques não funciona mais).

1. Instale o **Node.js LTS** (https://nodejs.org), se ainda não tiver.
2. Dê dois cliques em **`iniciar-servidor.bat`**. O navegador abre em `http://localhost:8080`.
   (ou, no terminal: `npm start`)
3. Na **primeira vez** precisa de internet: o servidor baixa Three.js, Ammo.js e as fontes para a pasta `vendor/`.
   Depois disso o jogo roda **sem internet**. (Para baixar tudo de uma vez: `npm run vendor`.)

## Cenários

Escolha no menu, aba **Jogar** → **Cenário**. O mundo atrás do menu já muda na hora.

- **Campinho**: o campo de várzea aberto, com árvores, traves, muro pichado e a bola.
- **Laje**: em cima da laje, no meio da favela. O morro cheio de casas sobe bem na frente (é pra lá que o vento leva a pipa), com árvores no topo. Cuidado com a laje do vizinho, os fios e os "gatos" de luz. A molecada fica nas lajes do lado.
- **Morro**: no terrão lá no alto. A favela de tijolo desce a ladeira e sobe o morro do outro lado, com o teleférico passando no meio.

No **online**, vale o cenário de quem **criou** a sala: quem entra com código ou pela "Aleatória" vai direto para o cenário dela.
(Precisa do servidor novo: feche e abra o `iniciar-servidor.bat`. No Render, basta enviar para o GitHub.)

## Modos

| Modo | O que é |
|---|---|
| Livre | Voo sem pressa. Argolas e pipas avoadas valem pontos. |
| Desafios | 6 missões até as 19h, quando a mãe chama pra janta. |
| Disputa | Contra 3 bots da molecada. Rodadas de 4 minutos. |
| Online | Crie uma sala, passe o código de 4 letras e a turma entra. Até 8 por sala. |

### Disputa (bots e online)

- **Enroscada:** cruze a sua linha na linha de outro jogador.
- **Cabo de guerra:**
  - **W** puxa (gasta fôlego).
  - **S** dá linha (relo).
  - Linha firme ajuda e pipa por cima leva vantagem.
- **Rabiola presa:** se a sua linha passar na rabiola do outro, a rabiola dele fica presa na sua linha,
  mas **ninguém perde só por isso**:
  - Se a **linha** de quem prendeu **encostar na linha** do outro, quem teve a rabiola presa **perde na hora**.
    A pipa dele não vira avoada: fica **pendurada pela rabiola** na linha de quem ganhou por 6 segundos,
    e aí vem o "Aparou!" (+100 da laçada +50 da aparada). Vale também no meio de uma enroscada de linha:
    se uma linha pegar a rabiola da outra, acabou.
  - Quem foi preso **afasta a pipa da linha do outro** (A/D). A rabiola estica e vai **escorregando** até soltar pela ponta.
    Sacudir ajuda. Depois de 25 s ela solta sozinha.
- **Pipa nas costas:** você começa (e volta depois de perder) com a pipa nas costas. Ande à vontade e aperte **E** para soltar.
  **R** guarda a pipa nas costas.
- **Resultado:** quem perde tem a linha arrebentada e a pipa vira **avoada** (marcada no céu). Qualquer jogador,
  inclusive o dono depois que soltar outra, pode **aparar** encostando a linha nela.
  Quando apara, a rabiola da avoada enrosca na sua linha e ela fica pendurada pela rabiola uns 6 segundos,
  escorregando devagar, e aí vem o "Aparou!" (todo mundo vê a pipa pendurada na linha de quem aparou).
- **Recomeço:** depois de perder, cair ou enroscar, uma contagem de **2 segundos** e já vem pipa nova Enquanto isso o boneco fica bravo (bate o pé, sacode os braços e solta um "#@$%!").
- **Pontos:** laçada = 100, aparada = 50.
- Linha comum, sem cerol: vence quem segura a enroscada.

### Jogar online com amigos

- **Mesma rede (Wi-Fi):**
  1. Quem roda o servidor vê no terminal um endereço tipo `http://192.168.x.x:8080`.
  2. Os amigos abrem esse endereço.
  3. Se não conectar, libere a porta 8080 no Firewall do Windows.
- **Pela internet:** use um túnel (ex.: `cloudflared tunnel --url http://localhost:8080` ou ngrok),
  ou hospede a pasta num serviço que rode Node (Render, Railway, Fly.io...). A porta vem da variável `PORT`.

## Versão para portais (CrazyGames, Poki, itch.io, seu site)

1. Dê dois cliques em **`gerar-versao-portal.bat`** (ou `npm run portal -- --ads=crazygames`).
2. Escolha o destino: CrazyGames, Poki, seu site (AdSense), itch.io (sem anúncios) ou Teste.
3. Informe o servidor online hospedado (`wss://...`) ou deixe vazio para gerar sem modo online.
4. O pacote sai em **`dist/rabiola-portal.zip`**. É esse arquivo que se envia ao portal.

O pacote contém só o jogo (`index.html`, `css/`, `js/`, `vendor/`), sem o servidor e sem nada vindo de outros sites.
A única exceção é o SDK de anúncios do portal escolhido, que o próprio portal exige.

### Pontos de anúncio (já prontos no jogo)
| Momento | Tipo |
|---|---|
| Ao tocar em Jogar / Jogar de novo / Continuar no livre | intervalo |
| Fim de cada rodada da disputa | intervalo |
| Voltar ao menu | intervalo |
| Estampas com selo **▶ anúncio** (uma por pipa) | premiado: assiste e libera a estampa para sempre |

- Intervalos respeitam no mínimo 2 minutos entre um e outro (no Poki, quem decide é o SDK deles).
- Durante o anúncio o jogo pausa e fica mudo (no online o mundo continua, só fica mudo).
- O jogo também avisa o portal quando começa/para de jogar, quando termina de carregar,
  quando você vence (momento feliz) e qual sala online está aberta (convite do CrazyGames).
- **Para ver o fluxo sem conta em portal:** abra `http://localhost:8080/?ads=teste`.
- Sem anúncios configurados, nenhuma estampa fica trancada.

### Modo online na versão portal
O servidor precisa estar hospedado na internet com **https** (o endereço vira `wss://.../ws`).
O arquivo `render.yaml` já está pronto para o Render (render.com): crie um "Web Service" apontando para este projeto.


## Jogar pelo celular

1. O celular precisa estar na **mesma rede Wi-Fi** do computador que roda o servidor.
2. No navegador do celular, abra o endereço "Na mesma rede" que aparece na janela do servidor (ex.: `http://192.168.0.14:8080`).
3. Jogue com o celular **deitado**. Ao tocar em Jogar, o jogo entra em tela cheia (no iPhone a tela cheia não existe; use o Safari normal).

Controles de toque:
- **Joystick** (esquerda): andar. Empurrando até o fim, o boneco corre.
- **SOLTAR PIPA**: aparece quando a pipa está nas costas.
- **◀ ▶**: embicar. **PUXA**, **DAR LINHA** e **RECOLHE**: controle da linha.
- **↩ costas**: guarda a pipa nas costas. **❚❚**: pausa.
- Arraste o dedo no resto da tela para girar a câmera.

## Estrutura

```
rabiola.html          página (só HTML)
css/style.css         estilos
js/main.js            entrada: carrega o Ammo, monta o mundo, loop
js/config.js          pipas, estampas, missões, opções de personagem  ← ajuste fino aqui
js/state.js           estado compartilhado
js/physics.js         mundo Ammo.js e atalhos
js/scene.js           renderizador, luz, céu e estrelas
js/materials.js       materiais (suaves e facetados) e atalho para malhas
js/props.js           modelos do cenário: árvores, casas, trave, poste, nuvens, capim, texturas pintadas
js/world.js           troca de cenário: monta o escolhido (malhas + colisões) e desmonta o anterior
js/cenarios/          campinho.js, laje.js, morro.js e favela.js (gerador de favela: casas, janelas, lajes, caixas d'água, fios, varal)
js/shared/terrenos.js formato do terreno de cada cenário (jogo e servidor usam o mesmo)
img/cenarios/         miniaturas dos cenários no menu
js/kite.js            formatos/estampas das pipas, rabiola e física da pipa do jogador
js/player.js          personagem estilizado (cabelos, bonés, camisas) e poses
js/remote.js          outros jogadores e avoadas (visual)
js/fx.js              efeitos: estouros, textos e rabiola enrolada na linha
js/npcs.js            molecada figurante correndo com varas atrás das avoadas
js/game.js            regras: jogador, câmera, missões, disputa
js/hud.js / menu.js   interface
js/bots.js            disputa offline contra bots
js/net.js             cliente online (WebSocket)
js/touch.js           controles de toque (celular)
js/shared/wind.js     vento determinístico (igual no cliente e no servidor)
js/shared/duel.js     enroscada, cabo de guerra e avoadas (roda no servidor e no navegador)
server/server.js      servidor Node sem dependências: arquivos + WebSocket + salas
server/vendor.js      baixa as bibliotecas para vendor/ (npm run vendor)
server/build-portal.js gera dist/rabiola-portal.zip (npm run portal)
js/platform.js        pontos de anúncio (teste, CrazyGames, Poki, AdSense)
js/settings.js        configuração da versão portal (gerada pelo build)
js/models.js          catálogo dos modelos (usado pela vitrine e pela exportação)
js/tools/glb.js       exportador .glb próprio (sem dependências)
ferramentas/          vitrine.html (ver os modelos) e exportar-assets.html (gera a pasta Assets)
Assets/               modelos 3D (.glb) e texturas (.png) do jogo — veja Assets/LEIA-ME.md
```

## Visual, vitrine e pasta Assets

- **Vitrine:** com o servidor rodando, abra `http://localhost:8080/ferramentas/vitrine.html` para ver personagens, pipas, árvores, casas e objetos girando.
- **Assets:** a pasta `Assets/` já vem com todos os modelos em `.glb` e as texturas em `.png`. Mudou algo no visual? Abra
  `http://localhost:8080/ferramentas/exportar-assets.html` e clique em **Exportar tudo** — a pasta é refeita a partir do código do jogo
  (só funciona no próprio computador que roda o servidor).
- No menu, na aba **Personagem**, arraste na tela para girar o boneco.
