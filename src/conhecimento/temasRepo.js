import { getDb } from '../db/db.js'
import { registrarAcaoAdmin, ACOES } from '../db/auditoriaAdminRepo.js'
import { normalizar } from '../text.js'

/**
 * A taxonomia de temas da base de técnicas.
 *
 * Fica em `src/conhecimento/` e não em `src/db/` de propósito: este repositório e
 * o de técnicas existem para uma capacidade só, e agrupá-los com o repositório de
 * participante esconderia que são a mesma coisa.
 *
 * FECHADA E EDITÁVEL não se contradizem aqui. Fechada quer dizer que a técnica
 * escolhe o tema desta lista, nunca digita um — se qualquer palavra pudesse virar
 * tema, a classificação por palavra-chave viraria adivinhação. Editável quer
 * dizer que o operador acrescenta tema e, principalmente, palavra-gatilho: as
 * palavras que as pessoas do piloto realmente usam só aparecem lendo as conversas
 * delas, e esperar deploy para acrescentar "empacado" transformaria ajuste
 * editorial em tarefa de programação.
 */

/** Chave: minúscula, sem acento, com underscore. É identificador, não rótulo. */
const CHAVE_VALIDA = /^[a-z][a-z0-9_]{2,39}$/

/**
 * Os sete temas semeados na primeira subida.
 *
 * As expressões são escritas como a pessoa escreve, e não como o manual escreve:
 * "travei" e "empacado" aparecem em conversa real; "dificuldade de iniciação" não.
 * Ficam sem acento porque a comparação roda sobre texto normalizado — mas o campo
 * guarda o que o operador digitar, acento e tudo.
 */
export const TEMAS_SEMENTE = Object.freeze([
  {
    chave: 'iniciar_tarefa',
    rotulo: 'Iniciar tarefa',
    palavras: [
      'nao consigo comecar', 'nao consigo começar', 'travei', 'empacado', 'empacada',
      'enrolando', 'procrastinando', 'adiando', 'deixando pra depois', 'nao sai do lugar',
      'paralisado', 'paralisada', 'so de pensar ja cansa',
    ],
  },
  {
    chave: 'foco_distracao',
    rotulo: 'Foco e distração',
    palavras: [
      'nao consigo focar', 'me distraio', 'disperso', 'dispersa', 'perco o foco',
      'cabeca a mil', 'mil coisas na cabeca', 'nao paro quieto', 'nao paro quieta',
      'comeco e largo', 'pulo de uma coisa pra outra',
    ],
  },
  {
    chave: 'gestao_tempo',
    rotulo: 'Gestão de tempo',
    palavras: [
      'nao dou conta do tempo', 'o tempo passa', 'perdi a hora', 'sempre atrasado',
      'sempre atrasada', 'nao sei quanto tempo', 'me atrasei', 'nao deu tempo',
      'to correndo atras', 'prazo',
    ],
  },
  {
    chave: 'ambiente_sensorial',
    rotulo: 'Ambiente e sensorial',
    palavras: [
      'barulho', 'barulhento', 'muita gente', 'bagunca', 'bagunçado', 'desorganizado',
      'luz forte', 'incomoda o som', 'nao aguento o barulho', 'ambiente',
    ],
  },
  {
    chave: 'sono',
    rotulo: 'Sono',
    palavras: [
      'nao consigo dormir', 'dormi mal', 'insonia', 'acordei varias vezes',
      'to sem dormir', 'durmo tarde', 'nao levanto da cama', 'sono ruim',
    ],
  },
  {
    chave: 'energia_fadiga',
    rotulo: 'Energia e fadiga',
    palavras: [
      'sem energia', 'exausto', 'exausta', 'cansado', 'cansada', 'esgotado', 'esgotada',
      'sem pilha', 'acabado', 'acabada', 'nao tenho forca pra nada',
    ],
  },
  {
    chave: 'transicao_atividade',
    rotulo: 'Transição entre atividades',
    palavras: [
      'nao consigo parar', 'nao consigo largar', 'difícil trocar', 'dificil trocar',
      'mudar de tarefa', 'sair de uma coisa pra outra', 'nao consigo sair disso',
      'grudado', 'grudada',
    ],
  },
])

export function listarTemas(db = getDb()) {
  return db.prepare('SELECT * FROM temas_tecnicas ORDER BY rotulo COLLATE NOCASE').all()
}

export function obterTema(chave, db = getDb()) {
  return db.prepare('SELECT * FROM temas_tecnicas WHERE chave = ?').get(String(chave ?? '')) ?? null
}

/**
 * As expressões de um tema, uma por linha, já normalizadas e sem vazias.
 *
 * A normalização acontece na LEITURA e não na escrita: o campo guarda o que o
 * operador digitou, para reaparecer igual no formulário.
 */
export const expressoesDoTema = (tema) =>
  String(tema?.palavras_gatilho ?? '')
    .split('\n')
    .map((l) => normalizar(l))
    .filter(Boolean)

/** A taxonomia no formato que o classificador puro espera. */
export function taxonomia(db = getDb()) {
  return listarTemas(db).map((t) => ({ chave: t.chave, expressoes: expressoesDoTema(t) }))
}

export function criarTema({ chave, rotulo, palavras = '' }, adminId = null, db = getDb()) {
  const c = String(chave ?? '').trim().toLowerCase()
  const r = String(rotulo ?? '').trim()

  if (!CHAVE_VALIDA.test(c)) {
    throw new Error('A chave usa letras minúsculas, números e underscore, de 3 a 40 caracteres.')
  }
  if (!r) throw new Error('O rótulo é obrigatório.')
  if (obterTema(c, db)) throw new Error(`Já existe um tema com a chave "${c}".`)

  db.prepare('INSERT INTO temas_tecnicas (chave, rotulo, palavras_gatilho) VALUES (?, ?, ?)').run(
    c,
    r,
    String(palavras ?? ''),
  )

  registrarAcaoAdmin(
    { autorId: adminId, acao: ACOES.CONFIGUROU_SISTEMA, descricao: `criou o tema "${c}"` },
    db,
  )

  return obterTema(c, db)
}

export function atualizarTema(chave, { rotulo, palavras }, adminId = null, db = getDb()) {
  const tema = obterTema(chave, db)
  if (!tema) throw new Error(`Tema desconhecido: "${chave}".`)

  const r = rotulo === undefined ? tema.rotulo : String(rotulo).trim()
  if (!r) throw new Error('O rótulo é obrigatório.')
  const p = palavras === undefined ? tema.palavras_gatilho : String(palavras)

  db.prepare('UPDATE temas_tecnicas SET rotulo = ?, palavras_gatilho = ? WHERE chave = ?').run(
    r,
    p,
    tema.chave,
  )

  registrarAcaoAdmin(
    { autorId: adminId, acao: ACOES.CONFIGUROU_SISTEMA, descricao: `editou o tema "${tema.chave}"` },
    db,
  )

  return obterTema(tema.chave, db)
}

/**
 * Remover tema é proibido enquanto houver técnica nele.
 *
 * Guarda de SERVIDOR, não de interface: a chave estrangeira já recusaria, mas o
 * erro dela não diz ao operador o que fazer a respeito.
 */
export function removerTema(chave, adminId = null, db = getDb()) {
  const tema = obterTema(chave, db)
  if (!tema) throw new Error(`Tema desconhecido: "${chave}".`)

  const { n } = db.prepare('SELECT COUNT(*) n FROM tecnicas WHERE tema = ?').get(tema.chave)
  if (n) throw new Error(`O tema "${tema.chave}" tem ${n} técnica(s). Mova ou arquive antes.`)

  db.prepare('DELETE FROM temas_tecnicas WHERE chave = ?').run(tema.chave)
  registrarAcaoAdmin(
    { autorId: adminId, acao: ACOES.CONFIGUROU_SISTEMA, descricao: `removeu o tema "${tema.chave}"` },
    db,
  )

  return true
}

/**
 * Semeia os sete temas. Idempotente: tema já existente NÃO é sobrescrito.
 *
 * Não sobrescrever é o ponto. Quem editou as palavras-gatilho para casar com o
 * jeito de falar do piloto perderia esse trabalho a cada subida do container.
 *
 * @returns {string[]} as chaves criadas agora
 */
export function semearTemas(db = getDb()) {
  const criados = []
  const inserir = db.prepare(
    'INSERT INTO temas_tecnicas (chave, rotulo, palavras_gatilho) VALUES (?, ?, ?)',
  )

  for (const t of TEMAS_SEMENTE) {
    if (obterTema(t.chave, db)) continue
    inserir.run(t.chave, t.rotulo, t.palavras.join('\n'))
    criados.push(t.chave)
  }

  return criados
}
