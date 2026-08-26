# focsecord

Sala privada com call e chat em tempo real. Sem cadastro: digita o nome e entra.

Projeto de portfólio feito em HTML, CSS e JavaScript puros, sem framework e sem build.

## Como funciona

- **Call de voz e vídeo**: Jitsi Meet embutido na página (meet.jit.si). Quem abre a sala primeiro faz um login rápido com Google pra liberar; os próximos entram direto.
- **Chat em tempo real**: Supabase (Postgres + Realtime) direto do navegador. As mensagens aparecem na hora pra todo mundo que estiver na sala.
- **Presença**: a lista de quem está online usa o Presence do Supabase Realtime.
- **Visual**: glassmorphism escuro feito só com CSS (backdrop-filter), fonte Geist, ícones Phosphor.

## Rodar local

Qualquer servidor estático serve:

```bash
npx serve .
```

## Setup do banco (uma vez)

Rodar o conteúdo de `supabase-setup.sql` no SQL Editor do projeto Supabase. A chave usada no front (`js/config.js`) é a publishable, que é pública por natureza; o acesso é controlado pelas policies de RLS.

## Deploy

Hospedado no GitHub Pages direto deste repositório.
