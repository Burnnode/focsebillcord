// Config do focsecord.
// A chave abaixo e a publishable do Supabase: ela e publica por natureza,
// o que protege os dados sao as policies (RLS) no banco. A sb_secret NUNCA entra aqui.

export const SUPABASE_URL = 'https://whmhexqolhjfctnxfxpk.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_bW8qIQqa250NLG1-NiOEUg_83Q-1z96';

// Servidor Jitsi: meet.jit.si passou a recusar conexao quando embutido em site
// de terceiro (26/08/2026, "Connection failed") e meet.ffmuc.net bloqueia
// iframe por CSP frame-ancestors. fairmeeting.net (fairkom, Austria) aceita
// embed, nao pede login nenhum e nao tem portao de moderador.
export const JITSI_DOMAIN = 'fairmeeting.net';

// Sufixo pra nao colidir com sala de estranhos.
export const JITSI_ROOM = 'focsecord-lounge-8821';
