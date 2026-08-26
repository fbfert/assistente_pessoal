import { Router } from 'express'
import { resumoPiloto, esteira } from '../queries.js'
import { pagina, escapar, rotuloGatilho, estadoLegivel } from '../html.js'
import { TIPOS_GATILHO } from '../../constants.js'

export const rotasPainel = Router()

rotasPainel.get('/', (_req, res) => {
  const dados = resumoPiloto()
  res.type('html').send(pagina('Painel', renderizar(dados)))
})

/**
 * Painel principal.
 *
 * Tabela HTML sem biblioteca de gráfico — de propósito. São 5 pessoas; BI aqui
 * seria complexidade sem retorno.
 */
export function renderizar(dados) {
  const { usuarios, totais, limiteSilencio, janelaMin, correcoes } = dados

  return `<h1>TARS piloto</h1>
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

${formularioConvite()}

${tabelaPrincipal(usuarios)}

${listasDeEsteira(usuarios)}

${listaCorrecoes(correcoes)}`
}

function formularioConvite() {
  return `<fieldset>
  <legend>Convidar piloto novo</legend>
  <p class="nota">O bot fala primeiro: manda o texto de consentimento sem esperar mensagem.</p>
  <form method="post" action="/convidar">
    <label for="numero">Número de WhatsApp</label>
    <input type="text" id="numero" name="numero" placeholder="+5511999999999" required>

    <label for="data_nascimento">Data de nascimento</label>
    <input type="date" id="data_nascimento" name="data_nascimento" required>
    <p class="nota">É o segundo fator da entrada pelo canal web — sem ela a pessoa
    entra pelo WhatsApp, mas não pelo navegador.</p>

    <p><button type="submit">Convidar</button></p>
  </form>
</fieldset>`
}

function tabelaPrincipal(usuarios) {
  const linhas = usuarios.map((u) => {
    const classe = u.alertaSobrecarga ? ' class="alerta"' : ''
    const silencios = Object.values(TIPOS_GATILHO)
      .map((t) => `${rotuloGatilho(t)}: ${u.silencios[t] ?? 0}`)
      .join('<br>')

    return `<tr${classe}>
      <td><a href="/usuarios/${u.usuarioId}">${escapar(u.nome) || '<em>sem nome ainda</em>'}</a></td>
      <td class="num">${escapar(u.numero)}</td>
      <td>${estadoLegivel(u)}${u.pausado ? ' · <strong>pausado</strong>' : ''}</td>
      <td class="num">${u.checkinsRespondidos}/${u.checkinsDisparados}${
        u.taxaResposta === null ? '' : ` (${u.taxaResposta}%)`
      }</td>
      <td class="num">${u.despejosSemana}</td>
      <td>${silencios}</td>
      <td class="num">${u.correcoes || ''}</td>
      <td>${u.alertaSobrecarga ? '⚠ SOBRECARGA' : ''}</td>
    </tr>`
  })

  return `<table>
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
</table>`
}

/** A contagem diz que existe um problema; a lista diz em quem cutucar. */
function listasDeEsteira(usuarios) {
  const grupos = [
    ['Pendentes de consentimento', usuarios.filter((u) => !u.consentiu)],
    ['Consentiram, anamnese em andamento', usuarios.filter((u) => u.consentiu && !u.concluiuAnamnese)],
    ['Anamnese concluída', usuarios.filter((u) => u.concluiuAnamnese)],
  ]

  const blocos = grupos.map(([titulo, lista]) => {
    const itens = lista.length
      ? lista
          .map(
            (u) =>
              `<li><a href="/usuarios/${u.usuarioId}">${
                escapar(u.nome) || escapar(u.numero)
              }</a> — ${estadoLegivel(u)}</li>`,
          )
          .join('')
      : '<li><em>ninguém</em></li>'

    return `<h3>${titulo} <span class="nota">(${lista.length})</span></h3><ul>${itens}</ul>`
  })

  return `<h2>Esteira</h2>${blocos.join('')}`
}

/**
 * Correção reportada é a ÚNICA coisa deste painel que representa alguém
 * esperando ação humana — a pessoa apontou um erro no próprio cadastro e o
 * sistema, de propósito, não corrigiu sozinho.
 *
 * Por isso o destaque e o link direto: listada sem os dois, vira anotação que
 * ninguém abre. Aconteceu na primeira sessão real do piloto.
 */
function listaCorrecoes(correcoes) {
  if (!correcoes.length) return ''

  const itens = correcoes
    .map(
      (c) =>
        `<li><a href="/usuarios/${c.usuario_id}"><strong>${escapar(
          c.nome ?? c.numero_whatsapp,
        )}</strong></a> <span class="nota">(${escapar(c.timestamp)})</span><br>${escapar(
          c.texto,
        )}</li>`,
    )
    .join('')

  return `<h2>Correções reportadas <span class="nota">(${correcoes.length})</span></h2>
<div class="aviso">
  <p><strong>Alguém apontou um erro no próprio cadastro e está esperando.</strong>
  O sistema não corrige sozinho, de propósito — quem corrige é você, na página do
  participante. O bot já avisou a pessoa de que a correção foi só anotada.</p>
  <ul>${itens}</ul>
</div>`
}

export { esteira }
