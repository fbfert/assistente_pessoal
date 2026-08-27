import { Router } from 'express'
import * as cfg from '../../db/configRepo.js'
import * as conteudo from '../../db/conteudoRepo.js'
import { panoramaDeGatilhos } from '../queries.js'
import { montarMensagemGatilho } from '../../triggers/messages.js'
import { TIPOS_GATILHO } from '../../constants.js'
import { pagina, escapar, rotuloGatilho, estadoLegivel } from '../html.js'

export const rotasGatilhos = Router()

/**
 * A visão de conjunto dos gatilhos, que não existia em lugar nenhum.
 *
 * O que estava espalhado: o horário padrão vivia numa constante do código, a
 * mensagem em outro arquivo, e o estado por participante só na página de detalhe
 * de cada um. Para responder "quanta gente recebe check-in, e a que horas?" era
 * preciso abrir cinco páginas e ler dois arquivos.
 *
 * Esta tela NÃO reimplementa a edição por participante — isso já existe na página
 * de detalhe, e duplicar o formulário criaria dois caminhos para a mesma escrita.
 * Aqui é conjunto e padrão global; lá é o caso individual.
 */

/** Quais chaves de conteúdo pertencem a cada tipo de gatilho. */
const CONTEUDO_DO_TIPO = {
  [TIPOS_GATILHO.CHECKIN_MANHA]: ['mensagem_checkin_manha', 'mensagem_checkin_manha_reduzido'],
  [TIPOS_GATILHO.REMEDIO]: ['mensagem_remedio'],
  [TIPOS_GATILHO.CHECKLIST_FIM_DIA]: [
    'mensagem_checklist_fim_dia',
    'mensagem_checklist_fim_dia_reduzido',
  ],
}

/** Qual chave de configuração é o horário padrão de cada tipo. */
const HORARIO_DO_TIPO = {
  [TIPOS_GATILHO.CHECKIN_MANHA]: 'HORARIO_PADRAO_CHECKIN',
  [TIPOS_GATILHO.CHECKLIST_FIM_DIA]: 'HORARIO_PADRAO_CHECKLIST',
  // Remédio não tem horário padrão: ele vem do que a pessoa informou na anamnese.
  [TIPOS_GATILHO.REMEDIO]: null,
}

rotasGatilhos.get('/gatilhos', (_req, res) => {
  res.type('html').send(tela())
})

// --- Horário padrão ---------------------------------------------------------------

rotasGatilhos.post('/gatilhos/horario/:chave', (req, res) => {
  const chave = req.params.chave
  if (!Object.values(HORARIO_DO_TIPO).includes(chave)) {
    return res.status(404).send('chave desconhecida')
  }

  try {
    cfg.escrever(chave, req.body?.valor, req.adminId ?? null)
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/gatilhos')
})

// --- Mensagem do gatilho ----------------------------------------------------------

/**
 * Duas etapas para editar texto, uma só para o horário.
 *
 * A assimetria é deliberada: a mensagem é o que TODO participante vai ler, e o
 * erro nela aparece na conversa de todo mundo ao mesmo tempo. O horário padrão só
 * alcança quem for convidado daqui para frente.
 */
rotasGatilhos.post('/gatilhos/mensagem/:chave/confirmar', (req, res) => {
  const chave = req.params.chave
  if (!chavePermitida(chave)) return res.status(404).send('chave desconhecida')

  const novo = String(req.body?.conteudo ?? '')

  let validado
  try {
    validado = conteudo.validar(chave, novo)
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  const atual = conteudo.ler(chave)
  if (validado === atual) return res.redirect(302, '/gatilhos')

  res.type('html').send(
    pagina(
      'Confirmar mudança de mensagem',
      `<h1>Confirmar a nova mensagem</h1>
       <p class="nota">Isto muda o que <strong>todos</strong> os participantes vão receber no
       próximo disparo deste gatilho. Não retroage sobre mensagens já enviadas.</p>

       <h2>Como está hoje</h2>
       <pre>${escapar(atual)}</pre>

       <h2>Como vai ficar</h2>
       <pre>${escapar(validado)}</pre>
       ${previewDoTipo(chave, validado)}

       <form method="post" action="/gatilhos/mensagem/${escapar(chave)}">
         <input type="hidden" name="conteudo" value="${escapar(validado)}">
         <p>
           <button type="submit">Salvar mensagem</button>
           <a href="/gatilhos">cancelar</a>
         </p>
       </form>`,
    ),
  )
})

rotasGatilhos.post('/gatilhos/mensagem/:chave', (req, res) => {
  const chave = req.params.chave
  if (!chavePermitida(chave)) return res.status(404).send('chave desconhecida')

  try {
    conteudo.escrever(chave, req.body?.conteudo, { adminId: req.adminId ?? null })
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/gatilhos')
})

rotasGatilhos.post('/gatilhos/mensagem/:chave/restaurar', (req, res) => {
  const chave = req.params.chave
  if (!chavePermitida(chave)) return res.status(404).send('chave desconhecida')

  conteudo.restaurarPadrao(chave, { adminId: req.adminId ?? null })
  res.redirect(302, '/gatilhos')
})

const chavePermitida = (chave) => Object.values(CONTEUDO_DO_TIPO).flat().includes(chave)

// --- Apresentação -----------------------------------------------------------------

/** O remédio interpola o nome; mostrar o resultado evita salvar `Hora do .` */
function previewDoTipo(chave, texto) {
  if (chave !== 'mensagem_remedio') return ''

  return `<h2>Como a pessoa vai ler</h2>
  <pre>${escapar(texto.replaceAll('{remedio}', 'Ritalina'))}</pre>`
}

function blocoDoTipo(tipo, panorama) {
  const chaveHorario = HORARIO_DO_TIPO[tipo]
  const ativos = panorama.ativosPorTipo[tipo] ?? 0

  const horario = chaveHorario
    ? `<form class="inline" method="post" action="/gatilhos/horario/${chaveHorario}">
         <label for="h-${tipo}">Horário padrão</label>
         <input type="text" id="h-${tipo}" name="valor" value="${escapar(cfg.ler(chaveHorario))}"
                placeholder="HH:MM" size="6">
         <button type="submit">Salvar</button>
       </form>
       <p class="nota">Vale só para quem for convidado daqui para frente.</p>`
    : `<p class="nota">Sem horário padrão: cada lembrete usa a hora que a pessoa informou
       na anamnese.</p>`

  const mensagens = CONTEUDO_DO_TIPO[tipo]
    .map((chave) => {
      const atual = conteudo.ler(chave)
      const seed = conteudo.catalogo()[chave]
      const editado = atual !== seed.conteudo

      return `<form method="post" action="/gatilhos/mensagem/${chave}/confirmar">
        <label for="m-${chave}">${escapar(seed.rotulo)}${
          editado ? ' <span class="nota">(editada)</span>' : ''
        }</label>
        <textarea id="m-${chave}" name="conteudo" rows="4">${escapar(atual)}</textarea>
        <p>
          <button type="submit">Salvar</button>
          ${
            editado
              ? `<button type="submit" class="discreto"
                   formaction="/gatilhos/mensagem/${chave}/restaurar">Restaurar padrão</button>`
              : ''
          }
        </p>
      </form>`
    })
    .join('')

  return `<fieldset>
  <legend>${rotuloGatilho(tipo)} — <strong>${ativos}</strong> participante(s) com este gatilho ativo</legend>
  ${horario}
  ${mensagens}
</fieldset>`
}

function tabelaPorParticipante(panorama) {
  if (!panorama.participantes.length) {
    return '<p><em>nenhum participante cadastrado.</em></p>'
  }

  const linhas = panorama.participantes
    .map((p) => {
      const celulas = Object.values(TIPOS_GATILHO)
        .map((tipo) => {
          const g = p.gatilhos[tipo]
          if (!g) return '<td class="nota">—</td>'
          return `<td>${g.ativo ? '' : '<s>'}${escapar(g.horario)}${g.ativo ? '' : '</s>'}</td>`
        })
        .join('')

      return `<tr${p.pausado ? ' class="alerta"' : ''}>
        <td><a href="/usuarios/${p.usuario_id}">${
          escapar(p.nome) || escapar(p.numero_whatsapp)
        }</a>${p.pausado ? ' <span class="nota">PAUSADO</span>' : ''}</td>
        <td class="nota">${estadoLegivel(p)}</td>
        ${celulas}
      </tr>`
    })
    .join('')

  return `<table>
<thead><tr>
  <th>Participante</th><th>Anamnese</th>
  ${Object.values(TIPOS_GATILHO).map((t) => `<th>${rotuloGatilho(t)}</th>`).join('')}
</tr></thead>
<tbody>${linhas}</tbody>
</table>`
}

function tela({ erro = null } = {}) {
  const panorama = panoramaDeGatilhos()

  return pagina(
    'Gatilhos',
    `<h1>Gatilhos</h1>
<p class="nota">O que o sistema envia sem ninguém pedir. Todo disparo sai pelo WhatsApp —
o canal web é reativo por decisão de produto, e não recebe gatilho.</p>

${erro ? `<div class="aviso">${escapar(erro)}</div>` : ''}

${Object.values(TIPOS_GATILHO).map((t) => blocoDoTipo(t, panorama)).join('')}

<h2>Por participante</h2>
<p class="nota">Só leitura aqui. Para mudar o gatilho de UMA pessoa, abra a página dela —
riscado quer dizer inativo, travessão quer dizer que o gatilho nem existe para ela.</p>
${tabelaPorParticipante(panorama)}`,
  )
}
