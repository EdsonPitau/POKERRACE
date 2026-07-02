# 🏁 Poker Race — PWA (V2)

Jogo de tabuleiro digital (single-player vs. bots) baseado no seu jogo físico **Poker Race**,
adaptado para o **Manual Oficial V2.0**: todos os jogadores avançam a cada rodada conforme
a força da própria mão, com sistema de moedas persistente e Texas Hold'em com apostas reais.

## O que tem aqui

- `index.html` — app principal (interface completa)
- `engine.js` — baralho, avaliador de mãos (5/6/7 cartas, com kickers/desempate) e IA de descarte dos bots
- `board.js` — calibração da imagem real do tabuleiro (posições das 100 casas, casa 0, slots de cartas comunitárias)
- `app.js` — controlador do jogo V2: movimento de todos, colisão de casas, apostas, moedas
- `test_v2_logic.js` — bateria de testes automatizados da lógica (rode com `node test_v2_logic.js`)
- `manifest.json` + `service-worker.js` + `icons/` — infraestrutura do PWA (instalável, offline)
- `board_bg.jpg` — sua arte real do tabuleiro, usada como fundo
- `logo.png`, `kart_*_token.png` — seus karts e logo

## Regras V2 implementadas

- **Todos avançam por rodada**: cada jogador anda conforme a própria mão (Royal Flush = 10
  casas … Carta Alta = 1 casa), não só quem vence
- **Casas cheias**: no máximo 2 carros por casa — em colisão, quem tem a mão mais fraca
  recua até achar uma casa livre (cascata testada com até 4 carros na mesma casa)
- **Casa 0**: largada fica numa grade antes da casa 1, sem tocar nela
- **Empate técnico na chegada**: dois jogadores empatados na casa 100+ com mãos idênticas
  viram ambos 1º lugar, e o ranking seguinte comprime (4º vira 3º)
- **Sistema de moedas** (persistido no navegador via localStorage, só para o jogador humano):
  - 5-Card Draw paga 100/50/25/0 moedas conforme o ranking final (1º ao 4º)
  - Texas Hold'em exige saldo mínimo de 1.000 moedas para jogar
  - Apostas: pré-flop 5 moedas, flop/turn/river até 25 cada, pote vai para a melhor mão
    entre os apostadores, multiplicado por 3x/2x/1x/0x no final conforme a posição
  - Regra dos 3 zeros: ao zerar o saldo, o jogador escolhe continuar sem apostar, desistir,
    ou "assistir anúncio" (placeholder simulado — não há anúncios reais nesta versão, é só
    um botão que credita +10 moedas após um delay, pronto para plugar AdMob/Unity Ads depois)

## Simplificações conscientes (dado o escopo do manual)

- Apostas do flop/turn/river são de valor fixo (25 ou passar), em vez de um valor livre até
  25 — mais rápido de jogar num celular; fácil de trocar por um input livre depois se quiser
- IA de apostas dos bots é heurística simples (mão forte → aposta mais), não um modelo de blefe
- Bots têm um saldo de moedas interno por corrida (não persistido) só para participar das
  apostas — apenas o saldo do jogador humano é salvo entre partidas

## Como testar localmente

```bash
cd pokerrace
python3 -m http.server 8080
```

Abra `http://localhost:8080`. Para rodar a bateria de testes da lógica (sem navegador):

```bash
node test_v2_logic.js
```

## Deploy no GitHub Pages

1. Suba esta pasta inteira para um repositório (ex: `EdsonPitau/poker-race`)
2. Ative GitHub Pages apontando para a branch `main` (pasta raiz)
3. Acesse `https://EdsonPitau.github.io/poker-race/`
4. No celular, abra no Chrome e use "Adicionar à tela inicial" para instalar como app

## Possíveis próximos passos

- Modo Relâmpago (3 cartas) e Modo Equipes (seção IX do manual)
- Input de aposta livre (0-25) em vez de fixo
- Integração real de anúncios (AdMob/Unity Ads) no lugar do placeholder
- Sincronizar moedas na nuvem em vez de só localStorage (útil se trocar de aparelho)

