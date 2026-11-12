// Configurações da "versão portal". O gerador (gerar-versao-portal.bat) reescreve este arquivo no pacote final.
//
// PORTAL         true no pacote enviado a um portal (CrazyGames, Poki...): sem servidor local junto.
// ONLINE_SERVER  endereço do servidor online hospedado, ex.: 'wss://rabiola.onrender.com/ws'.
//                Vazio = usa o próprio servidor de onde o jogo foi aberto (modo local). No portal, vazio desliga o Online.
// ADS_PROVIDER   'nenhum' | 'teste' | 'crazygames' | 'poki' | 'adsense'
//                Dá para testar sem mudar o arquivo: abra o jogo com ?ads=teste no endereço.
// ADSENSE_CLIENT seu código do AdSense (ca-pub-...), só para ADS_PROVIDER = 'adsense'.
export const PORTAL = false;
export const ONLINE_SERVER = '';
export const ADS_PROVIDER = 'nenhum';
export const ADSENSE_CLIENT = '';
