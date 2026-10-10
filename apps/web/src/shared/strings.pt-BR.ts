// Every word shown on the host or a phone. tools/font.ts reads `words3d` to build the 3D font.
import type { PetClip, PetId } from './pets';

export const strings = {
  brand: 'BOOM PETS',
  mode: 'Bate-Bate',

  pets: {
    beaver: 'Castor', bee: 'Abelha', bunny: 'Coelho', cat: 'Gato', caterpillar: 'Lagarta', chick: 'Pintinho',
    cow: 'Vaca', crab: 'Caranguejo', deer: 'Cervo', dog: 'Cachorro', elephant: 'Elefante', fish: 'Peixe',
    fox: 'Raposa', giraffe: 'Girafa', hog: 'Javali', koala: 'Coala', lion: 'Leão', monkey: 'Macaco',
    panda: 'Panda', parrot: 'Papagaio', penguin: 'Pinguim', pig: 'Porco', polar: 'Urso-Polar', tiger: 'Tigre',
  } satisfies Record<PetId, string>,

  /** Big extruded words. Any character used here must exist in the 3D font. */
  words3d: {
    kaboom: 'KABUM!',
    superPull: 'SUPER SORTE!',
    jinx: 'ZICA!',
    superCurse: 'SUPER ZICA!',
    underdog: 'SORTE DE AZARÃO',
    revenge: 'TROCA DA VINGANÇA',
    go: 'JÁ!',
    roundOver: 'FIM!',
    doubleRound: 'VALE DOBRADO!',
    swap: 'TROCA!',
    escaped: 'ESCAPOU!',
  },

  /** Shown in the HUD, on phones and (in capitals) as 3D words when a power starts. */
  powers: {
    rocket: 'Botas Foguete', megaDash: 'Mega Investida', jelly: 'Corpo de Gelatina', giant: 'Modo Gigante', decoys: 'Clones Isca',
    reversed: 'Controles Invertidos', pebble: 'Pedrinha', honk: 'Modo Buzina', kaiju: 'Modo Kaiju', meteorShower: 'Chuva de Meteoros',
    pinata: 'Pinhata',
  },

  tiers: { common: 'Comum', rare: 'Raro', cursed: 'Zicado', super: 'SUPER', superCurse: 'SUPER ZICA' },

  awards: {
    selfDestruct: 'Rei da Autodestruição', accident: 'Sobreviveu Sem Querer', thrower: 'Arremessador de Amigos', unlucky: 'Pé-Frio',
    meteor: 'Terror dos Meteoros', chain: 'Maior Reação em Cadeia', faller: 'Caidor Profissional', honker: 'Buzina Sem Fim',
  },

  studio: {
    title: 'Estúdio',
    clips: {
      static: 'Parado', idle: 'Respirando', walk: 'Andando', run: 'Correndo', eat: 'Comendo',
      dance: 'Dançando', 'gesture-positive': 'Comemorando', 'gesture-negative': 'Emburrado',
    } satisfies Record<PetClip, string>,
    allPets: 'Todos',
    text3d: 'Texto 3D',
    spin: 'Girar',
    loading: 'Carregando bichos…',
    loaded: (count: number) => `${count} bichos carregados`,
    failed: 'Não consegui carregar os modelos.',
  },

  title: { press: 'Aperte qualquer tecla', loading: 'Carregando…', credits: 'Bichos, sons e céus: Kenney.nl (CC0)' },

  lobby: {
    start: 'ENTER para começar',
    startBots: 'ENTER para jogar contra robôs',
    startingIn: (seconds: number) => `Começando em ${seconds}…`,
    ready: 'Pronto!',
    rounds: (count: number) => `Rodadas: ${count}`,
    bots: (on: boolean) => `Robôs: ${on ? 'sim' : 'não'}`,
    reduced: (on: boolean) => `Menos tremor e brilho: ${on ? 'sim' : 'não'}`,
    sound: (on: boolean) => `Som: ${on ? 'sim' : 'não'}`,
    joinTitle: 'Entre no jogo',
    scan: 'Aponte a câmera do celular para o código',
    sameWifi: 'Conecte no mesmo Wi-Fi deste computador',
    network: (name: string) => `Rede: ${name}`,
    networkPlaceholder: 'Nome da rede (opcional)',
    freeSeat: 'Livre',
    sleeping: (seconds: number) => `zzz ${seconds}`,
    tryIt: 'Treine aqui: A dispara, B agarra.',
    hintNoOne: 'Ninguém entrou ainda? Redes de convidados costumam bloquear a conexão entre aparelhos. Tente a rede de casa.',
    noNetwork: 'Este computador não está em nenhuma rede. Conecte no Wi-Fi.',
    offline: 'Sem conexão com o servidor do jogo. Tentando de novo…',
    notLocal: 'Abra o jogo neste computador pelo endereço http://localhost:5173',
    replaced: 'O jogo foi aberto em outra aba. Feche esta.',
    busy: 'O jogo já está aberto em outra aba deste computador. Esta espera a vez.',
    version: 'O jogo foi atualizado. Reinicie com pnpm dev.',
  },

  hud: {
    double: '×2',
    tips: { dash: 'Segure para carregar, solte para disparar', grab: 'Agarre e arremesse barris e bichos' },
    roundTo: (name: string) => `Rodada de ${name}!`,
    roundTie: 'Empate!',
    resultsTitle: 'Fim de jogo!',
    again: 'ENTER: jogar de novo',
    toLobby: 'ESC: voltar ao início',
    points: (points: number) => `${points} pts`,
    place: (place: number) => `${place}º`,
  },

  controller: {
    ready: 'Pronto!',
    notReady: 'Estou pronto?',
    again: 'Jogar de novo',
    lever: 'Puxe!',
    jinx: 'ZICA!',
    mash: 'Aperte rápido!',
    waitNext: 'Você entra na próxima partida',
    iosHint: 'Dica: em Compartilhar, toque em “Adicionar à Tela de Início” para jogar em tela cheia.',
    place: (place: number) => `${place}º lugar`,
    namePlaceholder: 'Seu apelido',
    roomPlaceholder: 'Código',
    join: 'Entrar',
    connecting: 'Conectando…',
    reconnecting: 'Reconectando…',
    waitingHost: 'Aguardando o jogo…',
    unreachable: 'Não consegui conectar. Você está no mesmo Wi-Fi?',
    roomNotFound: 'Sala não encontrada. Leia o QR code de novo.',
    full: 'Sala cheia: já são 6 jogadores.',
    replaced: 'Este controle foi aberto em outra aba.',
    retry: 'Tentar de novo',
  },

  debug: {
    fps: 'FPS',
    room: 'Sala',
    address: 'Endereço',
    noPhones: 'Nenhum celular',
    latency: (ms: number | null) => (ms === null ? '— ms' : `${Math.round(ms)} ms`),
  },
} as const;
