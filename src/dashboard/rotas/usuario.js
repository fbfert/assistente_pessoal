import { Router } from 'express'
import * as repo from '../../db/userRepo.js'
import * as notasRepo from '../../db/notasRepo.js'
import { listarInteracoes } from '../../db/interactionLog.js'
import { pagina, escapar, rotuloGatilho, estadoLegivel } from '../html.js'
import { SEM_INFORMACAO, TIPOS_GATILHO, TIPOS_INTERACAO } from '../../constants.js'
import { PERSONALIDADES } from '../../llm/prompts.js'
import { config } from '../../config.js'

export const rotasUsuario = Router()

const ROTULOS_CAMPO = {
  nome: 'Nome',
  o_que_trava: 'O que trava',
  rotina_boa: 'Rotina',
  rotina_ruim: 'Rotina (horário ruim)',
  gatilhos_de_sobrecarga: 'Gatilhos de sobrecarga',
  sinal_de_alerta: 'Sinal de alerta',
  pessoas_chave: 'Pessoas-chave',
  vocabulario_proprio: 'Vocabulário próprio',
  nunca_fazer: 'Nunca fazer',
}

rotasUsuario.get('/usuarios/:id', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).type('html').send(pagina('Não encontrado', '<h1>Participante não encontrado.</h1>'))

  const remedios = repo.listarRemedios(usuario.usuario_id)
  const gatilhos = repo.listarGatilhosUsuario(usuario.usuario_id)
  const interacoes = listarInteracoes(usuario.usuario_id)
  const notas = notasRepo.listarTodasAsNotas(usuario.usuario_id)

  res.type('html').send(
    pagina(
      usuario.nome || usuario.numero_whatsapp,
      renderizarDetalhe({ usuario, remedios, gatilhos, interacoes, notas }),
    ),
  )
})

export function renderizarDetalhe({ usuario, remedios, gatilhos, interacoes, notas = [] }) {
  return `<p class="nota"><a href="/">&larr; painel</a></p>
<h1>${escapar(usuario.nome) || '<em>sem nome</em>'}</h1>
<p class="nota">
  ${escapar(usuario.numero_whatsapp)} ·
  anamnese ${estadoLegivel(usuario)} ·
  personalidade: ${escapar(usuario.personalidade) || SEM_INFORMACAO}
  ${usuario.pausado ? ' · <strong>PAUSADO</strong>' : ''}
</p>

${blocoConsentimento(usuario)}
${blocoAcessoWeb(usuario)}
${blocoPersonalidade(usuario)}
${blocoAnamnese(usuario)}
${blocoAprendizado(usuario, notas)}
${blocoRemedios(usuario, remedios)}
${blocoGatilhos(usuario, gatilhos)}
${blocoContadores(usuario)}
${blocoParticipacao(usuario)}
${blocoHistorico(interacoes)}`
}

function blocoConsentimento(u) {
  return `<h2>Consentimento</h2>
<table>
<tr><th>Aceito</th><td>${u.consentimento_aceito ? 'sim' : 'não'}</td></tr>
<tr><th>Versão</th><td>${escapar(u.consentimento_versao) || SEM_INFORMACAO}</td></tr>
<tr><th>Quando</th><td class="num">${escapar(u.consentimento_timestamp) || SEM_INFORMACAO}</td></tr>
</table>`
}

/**
 * Data de nascimento: segundo fator da entrada pelo canal web.
 *
 * Fica em bloco próprio, e não junto da anamnese, porque não é resposta de
 * anamnese — é identificação. Quem foi convidado antes desta coluna existir tem
 * o campo vazio e NÃO consegue entrar pela web até alguém preencher aqui.
 */
function blocoAcessoWeb(u) {
  return `<h2>Acesso pelo canal web</h2>
<p class="nota">A pessoa entra em <code>/web</code> com o número de WhatsApp e esta data.
Sem ela, só o WhatsApp funciona. O canal web <strong>não</strong> manda nada por conta
própria: gatilho, lembrete e check-in continuam saindo apenas pelo WhatsApp.</p>
<form method="post" action="/usuarios/${u.usuario_id}/data-nascimento">
  <label for="nascimento">Data de nascimento</label>
  <input type="date" id="nascimento" name="data_nascimento"
         value="${escapar(u.data_nascimento ?? '')}" required>
  <button type="submit">Salvar</button>
</form>
${
  u.data_nascimento
    ? ''
    : `<div class="aviso">Sem data cadastrada: este participante não consegue entrar pelo
       canal web. Preencha aqui — nada é inventado por padrão.</div>`
}`
}

/**
 * Personalidade é ação PRÓPRIA, não campo do formulário genérico de anamnese.
 *
 * A coluna tem CHECK próprio no schema e não pertence a CAMPOS_ANAMNESE. Como
 * texto livre, daria para tentar gravar valor inválido e receber erro de banco
 * em vez de recusa na tela. Aqui as opções são fechadas.
 */
function blocoPersonalidade(u) {
  const opcoes = PERSONALIDADES.map(
    (p) =>
      `<option value="${p.valor}"${u.personalidade === p.valor ? ' selected' : ''}>${
        p.rotulo
      } — ${p.resumo}</option>`,
  ).join('')

  return `<h2>Personalidade</h2>
<p class="nota">Define o tom de toda mensagem. O estado 10 da anamnese assume
<code>neutro</code> quando a resposta não é reconhecida — então há um caminho em que
a pessoa ficou com um tom que não escolheu.</p>
<form method="post" action="/usuarios/${u.usuario_id}/personalidade">
  <select name="personalidade">${opcoes}</select>
  <button type="submit">Salvar</button>
</form>`
}

function blocoAnamnese(u) {
  const linhas = repo.CAMPOS_ANAMNESE.map(
    (campo) => `<tr>
      <th>${ROTULOS_CAMPO[campo] ?? campo}</th>
      <td>
        <form method="post" action="/usuarios/${u.usuario_id}/campo">
          <input type="hidden" name="campo" value="${campo}">
          <input type="text" name="valor" value="${escapar(u[campo] ?? '')}"
                 placeholder="${SEM_INFORMACAO}">
          <button type="submit">Salvar</button>
        </form>
      </td>
    </tr>`,
  ).join('')

  return `<h2>Anamnese</h2>
<p class="nota">Editar aqui substitui o SQL manual que o README documentava como única saída.</p>
<table>${linhas}</table>`
}

/**
 * O que o sistema aprendeu DEPOIS da anamnese, agrupado por campo.
 *
 * Fica logo abaixo da anamnese, e separado dela, porque é outra coisa: a
 * resposta original foi dada sob consentimento formal; a nota é inferência de
 * conversa. Misturar as duas na mesma tabela apagaria a distinção justamente
 * para quem precisa dela — quem opera.
 *
 * Removida continua listada, riscada: soft delete existe para a nota errada
 * continuar auditável.
 */
function blocoAprendizado(u, notas) {
  if (!notas.length) {
    return `<h2>Aprendizado contínuo</h2>
<p class="nota">Nada aprendido ainda. O sistema anota aqui o que a pessoa contar sobre si
na conversa livre — nunca remédio, nunca nome, e só o que ela descrever como padrão, não
queixa de um dia.</p>`
  }

  const porCampo = {}
  for (const n of notas) (porCampo[n.campo] ??= []).push(n)

  const linhas = Object.entries(porCampo)
    .map(([campo, doCampo]) => {
      const itens = doCampo
        .map((n) => {
          const quando = escapar(String(n.criado_em).slice(0, 10))
          if (n.removido_em) {
            return `<li><s>${escapar(n.texto)}</s> <span class="nota">(${quando} · removida em
              ${escapar(String(n.removido_em).slice(0, 10))})</span></li>`
          }
          return `<li>${escapar(n.texto)} <span class="nota">(${quando})</span> ·
            <a href="/usuarios/${u.usuario_id}/nota/${n.nota_id}/remover">remover</a></li>`
        })
        .join('')

      return `<tr><th>${ROTULOS_CAMPO[campo] ?? escapar(campo)}</th><td><ul>${itens}</ul></td></tr>`
    })
    .join('')

  return `<h2>Aprendizado contínuo <span class="nota">(${
    notas.filter((n) => !n.removido_em).length
  } ativas)</span></h2>
<p class="nota">Anotado pelo sistema a partir da conversa livre — <strong>não</strong> substitui
a resposta da anamnese, empilha por cima dela. Remover é reversível no sentido de que a linha
continua no banco: some do contexto do assistente e fica riscada aqui.</p>
<table>${linhas}</table>`
}

function blocoRemedios(u, remedios) {
  const linhas = remedios.length
    ? remedios
        .map(
          (r) => `<tr>
      <td>
        <form method="post" action="/usuarios/${u.usuario_id}/remedio/${r.remedio_id}">
          <input type="text" name="nome" value="${escapar(r.nome)}" placeholder="${SEM_INFORMACAO}">
          <input type="text" name="horario" value="${escapar(r.horario)}" placeholder="HH:MM">
          <button type="submit">Salvar</button>
        </form>
      </td>
      <td>
        <a href="/usuarios/${u.usuario_id}/remedio/${r.remedio_id}/remover">remover</a>
      </td>
    </tr>`,
        )
        .join('')
    : `<tr><td colspan="2"><em>nenhum remédio cadastrado</em></td></tr>`

  return `<h2>Remédios</h2>
<p class="nota">Regra 1b: campo deixado vazio grava <code>${SEM_INFORMACAO}</code>, nunca um chute —
e remédio com nome ou horário nesse estado não vira gatilho.</p>
<table>${linhas}</table>`
}

function blocoGatilhos(u, gatilhos) {
  const linhas = gatilhos.length
    ? gatilhos
        .map(
          (g) => `<tr>
      <th>${rotuloGatilho(g.tipo)}</th>
      <td>
        <form method="post" action="/usuarios/${u.usuario_id}/gatilho/${g.gatilho_id}">
          <input type="text" name="horario" value="${escapar(g.horario)}" placeholder="HH:MM">
          <select name="ativo">
            <option value="1"${g.ativo ? ' selected' : ''}>ativo</option>
            <option value="0"${g.ativo ? '' : ' selected'}>inativo</option>
          </select>
          <button type="submit">Salvar</button>
        </form>
      </td>
    </tr>`,
        )
        .join('')
    : `<tr><td colspan="2"><em>nenhum gatilho configurado</em></td></tr>`

  return `<h2>Gatilhos</h2>${
    u.pausado
      ? '<div class="aviso">Participante pausado: nenhum destes dispara, mas a configuração está preservada.</div>'
      : ''
  }<table>${linhas}</table>`
}

function blocoContadores(u) {
  const linhas = Object.values(TIPOS_GATILHO)
    .map((tipo) => {
      const n = repo.getSilencioConsecutivo(u.usuario_id, tipo)
      const alerta = n >= config.silenciosAteReduzirTom
      return `<tr${alerta ? ' class="alerta"' : ''}>
        <th>${rotuloGatilho(tipo)}</th>
        <td class="num">${n}</td>
        <td>
          <form method="post" action="/usuarios/${u.usuario_id}/silencio/${tipo}">
            <button type="submit">Zerar</button>
          </form>
        </td>
      </tr>`
    })
    .join('')

  return `<h2>Silêncios consecutivos</h2>
<p class="nota">Zerar dá uma segunda chance sem esperar a pessoa responder. A partir de
${config.silenciosAteReduzirTom}, o tom da próxima mensagem fica mais curto — nunca mais insistente.</p>
<table>${linhas}</table>`
}

function blocoParticipacao(u) {
  const podeConvidar = u.anamnese_estado === 0 && !u.consentimento_aceito

  return `<h2>Participação</h2>
<form class="inline" method="post" action="/usuarios/${u.usuario_id}/pausa">
  <input type="hidden" name="pausado" value="${u.pausado ? '0' : '1'}">
  <button type="submit">${u.pausado ? 'Despausar' : 'Pausar'}</button>
</form>

${
  podeConvidar
    ? `<form class="inline" method="post" action="/usuarios/${u.usuario_id}/reenviar-convite">
         <button type="submit">Reenviar convite</button>
       </form>`
    : `<p class="nota">Reenviar convite não é oferecido: só vale para quem está no estado 0 sem
       consentimento. O convite reseta a anamnese, e aqui há progresso a perder.</p>`
}

<p>
  <a href="/usuarios/${u.usuario_id}/reiniciar">Reiniciar anamnese do zero</a> ·
  <a href="/usuarios/${u.usuario_id}/anonimizar">Anonimizar participante</a>
</p>`
}

function blocoHistorico(interacoes) {
  if (!interacoes.length) return '<h2>Histórico</h2><p><em>nenhuma interação registrada.</em></p>'

  const linhas = interacoes
    .map(
      (i) => `<tr>
      <td class="num">${escapar(i.timestamp)}</td>
      <td>${escapar(i.tipo)}</td>
      <td>${escapar(canalLegivel(i))}</td>
      <td>${escapar(i.gatilho_relacionado ?? '')}</td>
      <td class="texto">${escapar(i.texto ?? '')}</td>
    </tr>`,
    )
    .join('')

  return `<h2>Histórico <span class="nota">(${interacoes.length})</span></h2>
<p class="nota">A conversa real da pessoa com o bot, por qualquer canal. É o dado mais
sensível do sistema — está atrás do login por isso.</p>
<table class="historico">
<thead><tr><th>Quando</th><th>Tipo</th><th>Canal</th><th>Gatilho</th><th>Texto</th></tr></thead>
<tbody>${linhas}</tbody>
</table>`
}


/**
 * Ação do operador não veio de canal nenhum.
 *
 * A coluna é `NOT NULL` com padrão, então a linha carrega `whatsapp` no banco —
 * valor que não significa nada aqui. Exibi-lo faria a tela afirmar que o
 * operador escreveu pelo WhatsApp, que é falso. Decisão (i) do design.
 */
function canalLegivel(interacao) {
  return interacao.tipo === TIPOS_INTERACAO.ACAO_ADMIN ? '—' : (interacao.canal ?? '')
}
