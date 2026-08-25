import express from 'express'
import { pathToFileURL } from 'node:url'
import { config } from '../config.js'
import { getDb } from '../db/db.js'
import { resumoPiloto } from './queries.js'
import { TIPOS_GATILHO } from '../constants.js'

const app = express()

app.get('/', (_req, res) => {
  try {
    res.type('html').send(renderizar(resumoPiloto()))
  } catch (e) {
    res.status(500).type('text').send(`Falha ao montar o dashboard: ${e?.message ?? e}`)
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))

/**
 * Tabela HTML sem biblioteca de gráfico — de propósito.
 * São 5 pessoas; BI aqui seria complexidade sem retorno.
 */
function renderizar(dados) {
  const { usuarios, totais, limiteSilencio, janelaMin, correcoes } = dados

  const linhas = usuarios.map((u) => {
    const classe = u.alertaSobrecarga ? ' class="alerta"' : ''
    const silencios = Object.values(TIPOS_GATILHO)
      .map((t) => `${rotuloGatilho(t)}: ${u.silencios[t] ?? 0}`)
      .join('<br>')

    return `<tr${classe}>
      <td>${escapar(u.nome) || '<em>sem nome ainda</em>'}</td>
      <td class="num">${escapar(u.numero)}</td>
      <td>${estadoLegivel(u)}</td>
      <td class="num">${u.checkinsRespondidos}/${u.checkinsDisparados}${
        u.taxaResposta === null ? '' : ` (${u.taxaResposta}%)`
      }</td>
      <td class="num">${u.despejosSemana}</td>
      <td>${silencios}</td>
      <td class="num">${u.correcoes || ''}</td>
      <td>${u.alertaSobrecarga ? '⚠ SOBRECARGA' : ''}</td>
    </tr>`
  })

  const listaCorrecoes = correcoes.length
    ? `<h2>Correções reportadas</h2>
       <p class="nota">Correção de anamnese é manual no banco, de propósito — ver design.md.</p>
       <ul>${correcoes
         .map(
           (c) =>
             `<li><strong>${escapar(c.nome ?? c.numero_whatsapp)}</strong> (${escapar(
               c.timestamp,
             )}): ${escapar(c.texto)}</li>`,
         )
         .join('')}</ul>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TARS piloto</title>
<style>
  :root { color-scheme: light dark; --alerta: #b00020; --alerta-bg: #ffebee; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 2rem; line-height: 1.5; }
  h1 { margin-bottom: .25rem; }
  .nota { color: #666; font-size: .9rem; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
  th, td { border: 1px solid #ccc; padding: .5rem .6rem; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.alerta { background: var(--alerta-bg); color: var(--alerta); font-weight: 700; }
  @media (prefers-color-scheme: dark) {
    th { background: #222; }
    th, td { border-color: #444; }
    tr.alerta { background: #3a0d14; color: #ff8a95; }
  }
  .totais { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: 1rem; }
  .totais div { border: 1px solid #ccc; padding: .5rem .9rem; }
  .totais strong { display: block; font-size: 1.6rem; }
</style>
</head>
<body>
<h1>TARS piloto</h1>
<p class="nota">
  Alerta de sobrecarga: ${limiteSilencio} silêncios consecutivos no mesmo gatilho ·
  janela de resposta: ${janelaMin} min ·
  <strong>127.0.0.1 apenas</strong> (acesso por túnel SSH)
</p>

<div class="totais">
  <div><strong>${totais.convidados}</strong> convidados</div>
  <div><strong>${totais.consentiram}</strong> consentiram</div>
  <div><strong>${totais.concluiram}</strong> concluíram a anamnese</div>
  <div><strong>${totais.emAlerta}</strong> em alerta</div>
</div>

<table>
<thead>
<tr>
  <th>Nome</th><th>Número</th><th>Anamnese</th>
  <th>Check-in (resp./disp.)</th><th>Despejos na semana</th>
  <th>Silêncios consecutivos</th><th>Correções</th><th></th>
</tr>
</thead>
<tbody>
${linhas.join('\n') || '<tr><td colspan="8"><em>Nenhum piloto convidado ainda.</em></td></tr>'}
</tbody>
</table>

${listaCorrecoes}
</body>
</html>`
}

const ROTULOS_GATILHO = {
  [TIPOS_GATILHO.CHECKIN_MANHA]: 'manhã',
  [TIPOS_GATILHO.REMEDIO]: 'remédio',
  [TIPOS_GATILHO.CHECKLIST_FIM_DIA]: 'fim do dia',
}
const rotuloGatilho = (t) => ROTULOS_GATILHO[t] ?? t

function estadoLegivel(u) {
  if (u.concluiuAnamnese) return 'concluída'
  if (!u.consentiu) return 'aguardando consentimento'
  return `em andamento (${u.anamneseEstado}/12)`
}

function escapar(v) {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

// Só sobe o servidor quando o arquivo é o entrypoint — assim `renderizar` pode
// ser importado por teste sem abrir porta nenhuma.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  getDb()
  // Bind explícito em 127.0.0.1: o dashboard mostra dado de saúde de pessoas
  // identificadas e NÃO tem autenticação. Nunca exponha em interface pública.
  app.listen(config.dashboard.port, config.dashboard.host, () => {
    console.log(`[dashboard] http://${config.dashboard.host}:${config.dashboard.port}`)
    console.log(
      `[dashboard] acesso remoto: ssh -L ${config.dashboard.port}:localhost:${config.dashboard.port} usuario@<ip>`,
    )
  })
}

export { app, renderizar }
