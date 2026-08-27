import { TIPOS_GATILHO } from '../constants.js'

/**
 * Camada de apresentação do admin: escaping, layout e componentes.
 *
 * Sem biblioteca de template e sem JavaScript de cliente — template string e
 * formulário HTML, como o resto do projeto. São 5 pessoas.
 */

export function escapar(v) {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

const ESTILO = `
  :root { color-scheme: light dark; --alerta: #b00020; --alerta-bg: #ffebee; --borda: #ccc; --suave: #666; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; line-height: 1.5; }
  main { margin: 1.5rem 2rem 4rem; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  h2 { margin: 2rem 0 .5rem; font-size: 1.15rem; }
  h3 { margin: 1.25rem 0 .4rem; font-size: 1rem; }
  a { color: inherit; }
  .nota { color: var(--suave); font-size: .9rem; margin-top: 0; }
  nav { background: #f4f4f4; padding: .7rem 2rem; display: flex; gap: 1.2rem; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--borda); }
  nav a { text-decoration: none; font-weight: 600; }
  nav .espaco { margin-left: auto; }
  table { border-collapse: collapse; width: 100%; margin-top: .75rem; }
  th, td { border: 1px solid var(--borda); padding: .45rem .6rem; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.alerta { background: var(--alerta-bg); color: var(--alerta); font-weight: 700; }
  .totais { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 1rem; }
  .totais div { border: 1px solid var(--borda); padding: .5rem .9rem; }
  .totais strong { display: block; font-size: 1.6rem; }
  form.inline { display: inline; }
  fieldset { border: 1px solid var(--borda); margin: 1rem 0; padding: .8rem 1rem; }
  legend { font-weight: 600; padding: 0 .4rem; }
  label { display: block; margin: .5rem 0 .15rem; font-size: .9rem; color: var(--suave); }
  input[type=text], input[type=time], input[type=password], textarea, select {
    padding: .4rem; border: 1px solid var(--borda); width: 100%; max-width: 32rem;
    font: inherit; background: transparent; color: inherit;
  }
  textarea { min-height: 5rem; }
  button { padding: .4rem .8rem; font: inherit; cursor: pointer; border: 1px solid var(--borda); background: #f4f4f4; }
  button.perigo { border-color: var(--alerta); color: var(--alerta); font-weight: 700; }
  .aviso { border-left: 4px solid var(--alerta); background: var(--alerta-bg); color: var(--alerta); padding: .7rem 1rem; margin: 1rem 0; }
  .etiqueta { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em;
              border: 1px solid var(--borda); padding: .05rem .35rem; margin-left: .4rem; }
  .etiqueta.publicada { border-color: var(--ok, #1a7f37); color: var(--ok, #1a7f37); }
  .etiqueta.arquivada { color: var(--suave); }
  section.tema { margin: 1.5rem 0; }
  details.tecnica { border-left: 2px solid var(--borda); padding-left: .8rem; margin: .5rem 0; }
  summary { cursor: pointer; }
  .historico td { font-size: .88rem; }
  .historico .texto { white-space: pre-wrap; }
  code { background: #f4f4f4; padding: .1rem .3rem; }
  @media (prefers-color-scheme: dark) {
    nav, th, .totais div, button, code { background: #222; }
    th, td, .totais div, fieldset, nav, input, textarea, select, button { border-color: #444; }
    tr.alerta { background: #3a0d14; color: #ff8a95; }
    .aviso { background: #3a0d14; color: #ff8a95; }
  }
`

/** Casca da página. `nav = false` para o login, que não tem sessão ainda. */
export function pagina(titulo, corpo, { nav = true, cabeca = '' } = {}) {
  const menu = nav
    ? `<nav>
         <a href="/">Painel</a>
         <a href="/gatilhos">Gatilhos</a>
         <a href="/ia">IA e persona</a>
         <a href="/tecnicas">Técnicas</a>
         <a href="/conexao">Conexão</a>
         <a href="/credenciais">Credenciais</a>
         <a href="/admins">Administradores</a>
         <a href="/conta">Minha conta</a>
         <span class="espaco"></span>
         <form class="inline" method="post" action="/logout"><button>Sair</button></form>
       </nav>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapar(titulo)} · TARS piloto</title>
${cabeca}
<style>${ESTILO}</style>
</head>
<body>
${menu}
<main>
${corpo}
</main>
</body>
</html>`
}

const ROTULOS_GATILHO = {
  [TIPOS_GATILHO.CHECKIN_MANHA]: 'manhã',
  [TIPOS_GATILHO.REMEDIO]: 'remédio',
  [TIPOS_GATILHO.CHECKLIST_FIM_DIA]: 'fim do dia',
}

export const rotuloGatilho = (t) => ROTULOS_GATILHO[t] ?? t

export function estadoLegivel(u) {
  if (u.concluiuAnamnese ?? u.anamnese_estado === 12) return 'concluída'
  if (!(u.consentiu ?? u.consentimento_aceito)) return 'aguardando consentimento'
  return `em andamento (${u.anamneseEstado ?? u.anamnese_estado}/12)`
}

/** Idade legível de um timestamp ISO, para "atualizado há N". */
export function haQuantoTempo(iso, agora = Date.now()) {
  if (!iso) return 'nunca'
  const ms = agora - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'agora'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s atrás`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}
