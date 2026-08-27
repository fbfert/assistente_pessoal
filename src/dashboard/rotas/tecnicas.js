import { Router } from 'express'
import * as temas from '../../conhecimento/temasRepo.js'
import * as tec from '../../conhecimento/tecnicasRepo.js'
import { pagina, escapar } from '../html.js'

export const rotasTecnicas = Router()

/**
 * A curadoria da base de técnicas.
 *
 * Esta tela é o mecanismo real por trás de "conteúdo curado por gente": rascunho
 * não circula porque a consulta da conversa não o enxerga, e publicar é um ato
 * deliberado com confirmação. Sem esta tela, "curada" seria frase de intenção.
 *
 * O que ela NÃO faz: gerar técnica, sugerir texto, completar campo. Nenhuma
 * chamada de modelo acontece aqui, e nenhuma deve passar a acontecer.
 */

// --- Leitura ------------------------------------------------------------------------

rotasTecnicas.get('/tecnicas', (req, res) => {
  res.type('html').send(tela({ aviso: req.query?.aviso ?? null }))
})

// --- Técnicas: criar e editar ---------------------------------------------------------

rotasTecnicas.post('/tecnicas/nova', (req, res) => {
  try {
    // Sempre rascunho: não existe caminho nesta tela que crie já publicada.
    tec.criar(
      {
        tema: req.body?.tema,
        titulo: req.body?.titulo,
        texto: req.body?.texto,
        fonte: req.body?.fonte,
      },
      req.adminId ?? null,
    )
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message, form: req.body }))
  }

  res.redirect(302, '/tecnicas')
})

rotasTecnicas.post('/tecnicas/:id/editar', (req, res) => {
  try {
    tec.atualizar(
      req.params.id,
      {
        tema: req.body?.tema,
        titulo: req.body?.titulo,
        texto: req.body?.texto,
        fonte: req.body?.fonte,
      },
      req.adminId ?? null,
    )
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/tecnicas')
})

// --- Publicar: duas etapas ------------------------------------------------------------

/**
 * A página intermediária faz o papel do `confirm()`, que não existe aqui — o
 * admin não tem JavaScript de cliente. Ela descreve o efeito e não altera nada.
 */
rotasTecnicas.get('/tecnicas/:id/publicar', (req, res) => {
  const t = tec.obter(req.params.id)
  if (!t) return res.status(404).type('html').send(tela({ erro: 'Técnica não encontrada.' }))

  const clinicos = tec.termosClinicosEm(`${t.titulo} ${t.texto}`)

  res.type('html').send(
    pagina(
      'Publicar técnica',
      `<h1>Publicar “${escapar(t.titulo)}”?</h1>
       <p class="nota">Publicada, ela passa a poder entrar na conversa de <strong>qualquer
       participante</strong> cuja mensagem cair no tema
       <strong>${escapar(rotuloDoTema(t.tema))}</strong>. O TARS oferece no máximo uma técnica
       por resposta, e pode não usá-la.</p>

       <h2>Texto</h2>
       <pre>${escapar(t.texto)}</pre>
       <p class="nota">Fonte: ${escapar(t.fonte)}</p>

       ${avisoClinico(clinicos)}

       <form method="post" action="/tecnicas/${t.tecnica_id}/publicar">
         <p>
           <button type="submit">Publicar</button>
           <a href="/tecnicas">cancelar</a>
         </p>
       </form>`,
    ),
  )
})

rotasTecnicas.post('/tecnicas/:id/publicar', (req, res) => {
  try {
    tec.publicar(req.params.id, req.adminId ?? null)
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/tecnicas')
})

// --- Arquivar: duas etapas -------------------------------------------------------------

rotasTecnicas.get('/tecnicas/:id/arquivar', (req, res) => {
  const t = tec.obter(req.params.id)
  if (!t) return res.status(404).type('html').send(tela({ erro: 'Técnica não encontrada.' }))

  res.type('html').send(
    pagina(
      'Arquivar técnica',
      `<h1>Arquivar “${escapar(t.titulo)}”?</h1>
       <p class="nota">Ela sai de circulação imediatamente e <strong>não é apagada</strong>: o
       histórico das conversas aponta para ela, e apagar transformaria auditoria em referência
       morta. Dá para voltar a rascunho depois.</p>

       <pre>${escapar(t.texto)}</pre>

       <form method="post" action="/tecnicas/${t.tecnica_id}/arquivar">
         <p>
           <button type="submit">Arquivar</button>
           <a href="/tecnicas">cancelar</a>
         </p>
       </form>`,
    ),
  )
})

rotasTecnicas.post('/tecnicas/:id/arquivar', (req, res) => {
  try {
    tec.arquivar(req.params.id, req.adminId ?? null)
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/tecnicas')
})

rotasTecnicas.post('/tecnicas/:id/rascunho', (req, res) => {
  try {
    tec.voltarParaRascunho(req.params.id, req.adminId ?? null)
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/tecnicas')
})

// --- Temas -----------------------------------------------------------------------------

rotasTecnicas.post('/tecnicas/temas/novo', (req, res) => {
  try {
    temas.criarTema(
      { chave: req.body?.chave, rotulo: req.body?.rotulo, palavras: req.body?.palavras },
      req.adminId ?? null,
    )
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/tecnicas')
})

/**
 * Editar palavras-gatilho passa por confirmação porque muda o que o TARS
 * reconhece na conversa de todo mundo, de uma vez — tirar uma expressão faz
 * técnicas boas pararem de aparecer, sem erro visível em lugar nenhum.
 */
rotasTecnicas.post('/tecnicas/temas/:chave/confirmar', (req, res) => {
  const tema = temas.obterTema(req.params.chave)
  if (!tema) return res.status(404).type('html').send(tela({ erro: 'Tema desconhecido.' }))

  const rotulo = String(req.body?.rotulo ?? '')
  const palavras = String(req.body?.palavras ?? '')

  if (rotulo.trim() === tema.rotulo && palavras === tema.palavras_gatilho) {
    return res.redirect(302, '/tecnicas')
  }

  res.type('html').send(
    pagina(
      'Confirmar mudança de tema',
      `<h1>Confirmar “${escapar(tema.rotulo)}”</h1>
       <p class="nota">As palavras-gatilho decidem quando este tema é reconhecido na conversa.
       Tirar uma expressão faz as técnicas deste tema pararem de aparecer para quem usa aquela
       palavra — sem erro visível em lugar nenhum.</p>

       <h2>Como está hoje</h2>
       <pre>${escapar(tema.palavras_gatilho || '(nenhuma)')}</pre>

       <h2>Como vai ficar</h2>
       <pre>${escapar(palavras || '(nenhuma)')}</pre>

       <form method="post" action="/tecnicas/temas/${escapar(tema.chave)}">
         <input type="hidden" name="rotulo" value="${escapar(rotulo)}">
         <input type="hidden" name="palavras" value="${escapar(palavras)}">
         <p>
           <button type="submit">Salvar tema</button>
           <a href="/tecnicas">cancelar</a>
         </p>
       </form>`,
    ),
  )
})

rotasTecnicas.post('/tecnicas/temas/:chave', (req, res) => {
  try {
    temas.atualizarTema(
      req.params.chave,
      { rotulo: req.body?.rotulo, palavras: req.body?.palavras },
      req.adminId ?? null,
    )
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/tecnicas')
})

rotasTecnicas.post('/tecnicas/temas/:chave/remover', (req, res) => {
  try {
    temas.removerTema(req.params.chave, req.adminId ?? null)
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/tecnicas')
})

// --- Apresentação -------------------------------------------------------------------------

const ROTULO_STATUS = {
  rascunho: 'rascunho',
  publicada: 'publicada',
  arquivada: 'arquivada',
}

function rotuloDoTema(chave) {
  return temas.obterTema(chave)?.rotulo ?? chave
}

/**
 * Aviso EDITORIAL, nunca bloqueio.
 *
 * Quem cura é uma pessoa, que pode ter contexto legítimo para um termo que soou
 * clínico. Bloquear por lista daria falsa garantia: "respiração" é prático,
 * "técnica de respiração para ansiedade" não é, e nenhuma lista separa os dois.
 */
function avisoClinico(termos) {
  if (!termos.length) return ''

  return `<p class="aviso"><strong>Atenção editorial.</strong> O texto contém
    ${termos.map((t) => `<code>${escapar(t)}</code>`).join(', ')}.
    A base é só de técnica prática e organizacional — nada psicoeducativo ou clínico sobre a
    condição em si. Isto <strong>não impede</strong> publicar: quem decide é você.</p>`
}

function linhaDaTecnica(t) {
  const clinicos = tec.termosClinicosEm(`${t.titulo} ${t.texto}`)
  const exemplo = t.fonte === tec.FONTE_EXEMPLO

  const acoes =
    t.status === 'publicada'
      ? `<a href="/tecnicas/${t.tecnica_id}/arquivar">arquivar</a>`
      : `<a href="/tecnicas/${t.tecnica_id}/publicar">publicar</a>` +
        (t.status === 'arquivada'
          ? ` <form class="inline" method="post" action="/tecnicas/${t.tecnica_id}/rascunho">
               <button type="submit">voltar a rascunho</button></form>`
          : '')

  return `<details class="tecnica">
    <summary>
      <strong>${escapar(t.titulo)}</strong>
      <span class="etiqueta ${t.status}">${ROTULO_STATUS[t.status] ?? escapar(t.status)}</span>
      ${exemplo ? '<span class="nota">exemplo</span>' : ''}
      ${clinicos.length ? '<span class="nota">termo clínico</span>' : ''}
    </summary>

    <form method="post" action="/tecnicas/${t.tecnica_id}/editar">
      <label for="tx-${t.tecnica_id}">Texto</label>
      <textarea id="tx-${t.tecnica_id}" name="texto" rows="4">${escapar(t.texto)}</textarea>

      <label for="ti-${t.tecnica_id}">Título</label>
      <input type="text" id="ti-${t.tecnica_id}" name="titulo" value="${escapar(t.titulo)}">

      <label for="fo-${t.tecnica_id}">Fonte</label>
      <input type="text" id="fo-${t.tecnica_id}" name="fonte" value="${escapar(t.fonte)}">

      <label for="te-${t.tecnica_id}">Tema</label>
      ${seletorDeTema(`te-${t.tecnica_id}`, t.tema)}

      <p>
        <button type="submit">Salvar</button>
        ${acoes}
      </p>
    </form>
    ${aprovacao(t)}
  </details>`
}

function aprovacao(t) {
  if (t.status !== 'publicada') return ''
  const quando = t.aprovado_em ? ` em ${escapar(t.aprovado_em.slice(0, 10))}` : ''
  const ultima = t.ultima_sugerida_em
    ? `Última vez oferecida: ${escapar(t.ultima_sugerida_em.slice(0, 10))}.`
    : 'Ainda não foi oferecida a ninguém.'

  return `<p class="nota">Publicada${quando}. ${ultima}</p>`
}

/** Tema é `select` fechado: a técnica escolhe da lista, nunca digita um. */
function seletorDeTema(id, selecionado) {
  const opcoes = temas
    .listarTemas()
    .map(
      (t) =>
        `<option value="${escapar(t.chave)}"${t.chave === selecionado ? ' selected' : ''}>${escapar(
          t.rotulo,
        )}</option>`,
    )
    .join('')

  return `<select id="${escapar(id)}" name="tema">${opcoes}</select>`
}

function blocoDoTema(tema, doTema) {
  const publicadas = doTema.filter((t) => t.status === 'publicada').length
  const rascunhos = doTema.filter((t) => t.status === 'rascunho').length

  return `<section class="tema">
    <h2>${escapar(tema.rotulo)} <span class="nota">${publicadas} publicada(s), ${rascunhos} em rascunho</span></h2>

    <details>
      <summary>palavras-gatilho</summary>
      <form method="post" action="/tecnicas/temas/${escapar(tema.chave)}/confirmar">
        <label for="p-${escapar(tema.chave)}">Uma expressão por linha</label>
        <textarea id="p-${escapar(tema.chave)}" name="palavras" rows="6">${escapar(
          tema.palavras_gatilho,
        )}</textarea>
        <input type="hidden" name="rotulo" value="${escapar(tema.rotulo)}">
        <p><button type="submit">Salvar palavras-gatilho</button></p>
      </form>
      ${
        doTema.length
          ? ''
          : `<form class="inline" method="post" action="/tecnicas/temas/${escapar(
              tema.chave,
            )}/remover"><button type="submit">remover tema</button></form>`
      }
    </details>

    ${doTema.length ? doTema.map(linhaDaTecnica).join('') : '<p class="nota">Nenhuma técnica ainda.</p>'}
  </section>`
}

export function tela({ erro = null, aviso = null, form = {} } = {}) {
  const lista = temas.listarTemas()
  const todas = tec.listar()
  const publicadas = todas.filter((t) => t.status === 'publicada').length

  const corpo = `
    <h1>Base de técnicas</h1>

    <p class="nota">Técnica prática e organizacional — nunca conteúdo psicoeducativo ou clínico
    sobre TDAH ou autismo. O TARS oferece <strong>no máximo uma</strong> por resposta, como opção,
    e pode não usá-la. Rascunho nunca chega a ninguém.</p>

    ${
      publicadas
        ? `<p class="nota">${publicadas} técnica(s) publicada(s), em circulação agora.</p>`
        : `<p class="aviso">Nenhuma técnica publicada. Enquanto for assim, a conversa se comporta
           exatamente como antes desta base existir — as técnicas de exemplo abaixo estão em
           rascunho e servem só para você ver o formato.</p>`
    }

    ${erro ? `<p class="aviso">${escapar(erro)}</p>` : ''}
    ${aviso ? `<p class="aviso">${escapar(aviso)}</p>` : ''}

    ${lista.map((t) => blocoDoTema(t, todas.filter((x) => x.tema === t.chave))).join('')}

    <hr>
    <h2>Nova técnica</h2>
    <form method="post" action="/tecnicas/nova">
      <label for="n-titulo">Título</label>
      <input type="text" id="n-titulo" name="titulo" value="${escapar(form?.titulo ?? '')}">

      <label for="n-texto">Texto — curto e aplicável, do jeito que a pessoa vai ouvir</label>
      <textarea id="n-texto" name="texto" rows="4">${escapar(form?.texto ?? '')}</textarea>

      <label for="n-fonte">Fonte — de onde veio (obrigatória)</label>
      <input type="text" id="n-fonte" name="fonte" value="${escapar(form?.fonte ?? '')}">

      <label for="n-tema">Tema</label>
      ${seletorDeTema('n-tema', form?.tema ?? '')}

      <p><button type="submit">Criar como rascunho</button></p>
    </form>

    <h2>Novo tema</h2>
    <form method="post" action="/tecnicas/temas/novo">
      <label for="t-chave">Chave — minúsculas e underscore, é identificador</label>
      <input type="text" id="t-chave" name="chave">

      <label for="t-rotulo">Rótulo</label>
      <input type="text" id="t-rotulo" name="rotulo">

      <label for="t-palavras">Palavras-gatilho, uma por linha</label>
      <textarea id="t-palavras" name="palavras" rows="4"></textarea>

      <p><button type="submit">Criar tema</button></p>
    </form>`

  return pagina('Base de técnicas', corpo)
}
