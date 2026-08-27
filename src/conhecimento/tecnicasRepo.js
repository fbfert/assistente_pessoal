import { getDb } from '../db/db.js'
import { registrarAcaoAdmin, ACOES } from '../db/auditoriaAdminRepo.js'
import { obterTema, semearTemas, TEMAS_SEMENTE } from './temasRepo.js'
import { normalizar } from '../text.js'

/**
 * A base de técnicas práticas.
 *
 * Conteúdo CURADO por gente. Este módulo distribui; não gera. Nenhuma função
 * aqui chama modelo de linguagem, e nenhuma deve passar a chamar: o dia em que o
 * sistema escrever a própria técnica, "curada por quem responde por ela" vira
 * frase de intenção.
 *
 * Rascunho nunca circula. É o mecanismo real por trás da curadoria — não um
 * aviso na tela, uma condição na consulta.
 */

export const STATUS = Object.freeze({
  RASCUNHO: 'rascunho',
  PUBLICADA: 'publicada',
  ARQUIVADA: 'arquivada',
})

/**
 * Termos que disparam AVISO ao salvar — nunca bloqueio.
 *
 * Quem cura é uma pessoa, que pode ter contexto legítimo para um termo que soou
 * clínico à primeira vista. Bloquear por lista daria falsa garantia: "respiração"
 * é sensorial e prático, "técnica de respiração para ansiedade" não é, e nenhuma
 * lista separa os dois. O aviso serve para a pessoa reler, não para o sistema
 * decidir.
 */
export const TERMOS_CLINICOS = Object.freeze([
  'diagnostico', 'tratamento', 'terapia', 'terapeutico', 'sintoma', 'transtorno',
  'medicamento', 'remedio', 'dose', 'psiquiatra', 'comorbidade', 'patologia',
  'tdah', 'autismo', 'neurotransmissor', 'dopamina',
])

/** @returns {string[]} os termos encontrados, em ordem de aparição */
export function termosClinicosEm(texto) {
  const t = normalizar(texto)
  return TERMOS_CLINICOS.filter((termo) => t.includes(termo))
}

// --- Leitura -----------------------------------------------------------------------

export function obter(id, db = getDb()) {
  return db.prepare('SELECT * FROM tecnicas WHERE tecnica_id = ?').get(Number(id)) ?? null
}

export function listar({ tema = null, status = null } = {}, db = getDb()) {
  const onde = []
  const args = []
  if (tema) { onde.push('tema = ?'); args.push(tema) }
  if (status) { onde.push('status = ?'); args.push(status) }

  return db
    .prepare(
      `SELECT * FROM tecnicas
        ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
        ORDER BY tema, status, titulo COLLATE NOCASE`,
    )
    .all(...args)
}

/** Só publicadas. Rascunho e arquivada não existem para a conversa. */
export function publicadasPorTema(tema, db = getDb()) {
  return db
    .prepare("SELECT * FROM tecnicas WHERE tema = ? AND status = 'publicada' ORDER BY tecnica_id")
    .all(String(tema ?? ''))
}

/**
 * A técnica que sai desta vez — e a marcação de que saiu.
 *
 * RODÍZIO pela menos sugerida recentemente: `ultima_sugerida_em` mais antiga
 * primeiro, com nulo (nunca sugerida) na frente de tudo. Desempate por id, para
 * ser determinístico e testável.
 *
 * Aleatório custaria menos e repetiria: com duas ou três técnicas por tema, ouvir
 * a mesma frase três dias seguidos é exatamente o que faz o produto soar
 * automático — o defeito que esta base existe para corrigir.
 *
 * A marcação acontece AQUI, na mesma operação: separar a escolha do registro
 * abriria a janela em que duas mensagens seguidas escolhem a mesma.
 *
 * @returns {object|null} a técnica escolhida, ou null quando não há publicada
 */
export function escolherParaTema(tema, db = getDb()) {
  const escolhida = db
    .prepare(
      `SELECT * FROM tecnicas
        WHERE tema = ? AND status = 'publicada'
        ORDER BY ultima_sugerida_em IS NULL DESC, ultima_sugerida_em ASC, tecnica_id ASC
        LIMIT 1`,
    )
    .get(String(tema ?? ''))

  if (!escolhida) return null

  db.prepare('UPDATE tecnicas SET ultima_sugerida_em = ? WHERE tecnica_id = ?').run(
    new Date().toISOString(),
    escolhida.tecnica_id,
  )

  return escolhida
}

// --- Escrita -----------------------------------------------------------------------

function validar({ tema, titulo, texto, fonte }, db) {
  const t = String(tema ?? '').trim()
  if (!t) throw new Error('O tema é obrigatório.')
  if (!obterTema(t, db)) throw new Error(`Tema desconhecido: "${t}".`)

  const tit = String(titulo ?? '').trim()
  if (!tit) throw new Error('O título é obrigatório.')

  const txt = String(texto ?? '').trim()
  if (!txt) throw new Error('O texto da técnica é obrigatório.')

  // Fonte obrigatória: sem ela, daqui a seis meses ninguém sabe se a técnica foi
  // curada ou inventada — e é essa dúvida que a base existe para não ter.
  const f = String(fonte ?? '').trim()
  if (!f) throw new Error('A fonte é obrigatória — de onde veio esta técnica.')

  return { tema: t, titulo: tit, texto: txt, fonte: f }
}

/** Toda técnica nasce em rascunho. Não há caminho que crie já publicada. */
export function criar(dados, adminId = null, db = getDb()) {
  const v = validar(dados, db)

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO tecnicas (tema, titulo, texto, fonte, status)
            VALUES (?, ?, ?, ?, 'rascunho')`,
    )
    .run(v.tema, v.titulo, v.texto, v.fonte)

  registrarAcaoAdmin(
    {
      autorId: adminId,
      acao: ACOES.CONFIGUROU_SISTEMA,
      descricao: `criou a técnica "${v.titulo}" (${v.tema}, rascunho)`,
    },
    db,
  )

  return obter(lastInsertRowid, db)
}

export function atualizar(id, dados, adminId = null, db = getDb()) {
  const atual = obter(id, db)
  if (!atual) throw new Error('Técnica não encontrada.')

  const v = validar(
    {
      tema: dados.tema ?? atual.tema,
      titulo: dados.titulo ?? atual.titulo,
      texto: dados.texto ?? atual.texto,
      fonte: dados.fonte ?? atual.fonte,
    },
    db,
  )

  db.prepare(
    'UPDATE tecnicas SET tema = ?, titulo = ?, texto = ?, fonte = ? WHERE tecnica_id = ?',
  ).run(v.tema, v.titulo, v.texto, v.fonte, atual.tecnica_id)

  registrarAcaoAdmin(
    {
      autorId: adminId,
      acao: ACOES.CONFIGUROU_SISTEMA,
      descricao: `editou a técnica "${v.titulo}" (#${atual.tecnica_id})`,
    },
    db,
  )

  return obter(atual.tecnica_id, db)
}

/** Publicar é o passo que faz a técnica existir para a conversa. */
export function publicar(id, adminId = null, db = getDb()) {
  const atual = obter(id, db)
  if (!atual) throw new Error('Técnica não encontrada.')
  if (atual.status === STATUS.PUBLICADA) return atual

  db.prepare(
    "UPDATE tecnicas SET status = 'publicada', aprovado_em = ?, aprovado_por = ? WHERE tecnica_id = ?",
  ).run(new Date().toISOString(), adminId, atual.tecnica_id)

  registrarAcaoAdmin(
    {
      autorId: adminId,
      acao: ACOES.CONFIGUROU_SISTEMA,
      descricao: `publicou a técnica "${atual.titulo}" (#${atual.tecnica_id})`,
    },
    db,
  )

  return obter(atual.tecnica_id, db)
}

/**
 * Arquivar tira de circulação SEM apagar.
 *
 * O histórico aponta para a técnica: apagar a linha transformaria registro de
 * auditoria em referência morta.
 */
export function arquivar(id, adminId = null, db = getDb()) {
  const atual = obter(id, db)
  if (!atual) throw new Error('Técnica não encontrada.')

  db.prepare("UPDATE tecnicas SET status = 'arquivada' WHERE tecnica_id = ?").run(atual.tecnica_id)

  registrarAcaoAdmin(
    {
      autorId: adminId,
      acao: ACOES.CONFIGUROU_SISTEMA,
      descricao: `arquivou a técnica "${atual.titulo}" (#${atual.tecnica_id})`,
    },
    db,
  )

  return obter(atual.tecnica_id, db)
}

/** Volta uma arquivada para rascunho — reentra na curadoria, não na circulação. */
export function voltarParaRascunho(id, adminId = null, db = getDb()) {
  const atual = obter(id, db)
  if (!atual) throw new Error('Técnica não encontrada.')

  db.prepare(
    "UPDATE tecnicas SET status = 'rascunho', aprovado_em = NULL, aprovado_por = NULL WHERE tecnica_id = ?",
  ).run(atual.tecnica_id)

  registrarAcaoAdmin(
    {
      autorId: adminId,
      acao: ACOES.CONFIGUROU_SISTEMA,
      descricao: `voltou a técnica "${atual.titulo}" (#${atual.tecnica_id}) para rascunho`,
    },
    db,
  )

  return obter(atual.tecnica_id, db)
}

// --- Semente ------------------------------------------------------------------------

/**
 * A marca das técnicas de exemplo. Está na FONTE, que é campo obrigatório e
 * aparece na tela — quem abrir a lista vê na hora o que é estrutura e o que é
 * conteúdo de verdade.
 */
export const FONTE_EXEMPLO = 'exemplo — substituir'

/**
 * Duas técnicas de EXEMPLO por tema, sempre em rascunho.
 *
 * Existem para a tela ter o que mostrar e para os testes terem o que exercitar.
 * NÃO são conteúdo curado, e nenhuma delas é publicada — a base sobe inerte, e o
 * comportamento do dia zero é idêntico ao de antes desta mudança. Publicar é ato
 * de quem cura.
 */
const EXEMPLOS = {
  iniciar_tarefa: [
    ['Primeiro passo de dois minutos', 'Em vez da tarefa inteira, escolha só a parte que cabe em dois minutos — abrir o arquivo, separar a roupa, achar o número. Terminou, decide se continua.'],
    ['Começar pelo meio', 'Se o começo trava, comece por qualquer outra parte. A ordem quase nunca importa tanto quanto parece.'],
  ],
  foco_distracao: [
    ['Uma aba, uma coisa', 'Feche tudo que não é a tarefa. O que sobrar aberto vai puxar a atenção mesmo sem você olhar.'],
    ['Anotar em vez de perseguir', 'Quando vier outra ideia no meio, escreva numa lista e volte. A ideia não some, e a tarefa não se perde.'],
  ],
  gestao_tempo: [
    ['Cronômetro em vez de relógio', 'Marque quanto tempo você quer ficar naquilo, não a hora de parar. É mais fácil sentir 25 minutos correndo do que perceber que já são três da tarde.'],
    ['Dobrar a estimativa', 'Se você acha que leva uma hora, reserve duas. Isso não é preguiça — é o histórico.'],
  ],
  ambiente_sensorial: [
    ['Tirar da mesa, não organizar', 'Antes de arrumar, só retire tudo o que não tem a ver com a tarefa. Organizar é outra tarefa, e ela pode esperar.'],
    ['Uma camada de som', 'Som constante — chuva, ventilador, ruído branco — cobre o barulho variável, que é o que mais atrapalha.'],
  ],
  sono: [
    ['Descarregar a cabeça no papel', 'Antes de deitar, escreva o que ficou pendente. É mais fácil soltar o que já está registrado em algum lugar.'],
    ['Mesma hora de acordar', 'A hora de acordar puxa a de dormir, não o contrário. Fixe uma só e deixe a outra se ajustar.'],
  ],
  energia_fadiga: [
    ['Tarefa do dia ruim', 'Tenha uma versão mínima de cada rotina, para os dias em que a versão normal não acontece. Feito pela metade conta.'],
    ['Pausa antes de precisar', 'Parar dez minutos quando ainda dá para continuar rende mais que parar quando já não dá.'],
  ],
  transicao_atividade: [
    ['Aviso de cinco minutos', 'Programe um alarme cinco minutos antes de precisar trocar de atividade. A troca fica menos abrupta.'],
    ['Deixar o próximo passo à vista', 'Ao parar, deixe visível onde você parou e qual é o próximo passo. Retomar depois custa muito menos.'],
  ],
}

/**
 * Semeia os exemplos. Idempotente por título dentro do tema.
 *
 * @returns {string[]} os títulos criados agora
 */
export function semearExemplos(db = getDb()) {
  const criados = []
  const existe = db.prepare('SELECT 1 FROM tecnicas WHERE tema = ? AND titulo = ?')
  const inserir = db.prepare(
    "INSERT INTO tecnicas (tema, titulo, texto, fonte, status) VALUES (?, ?, ?, ?, 'rascunho')",
  )

  for (const { chave } of TEMAS_SEMENTE) {
    if (!obterTema(chave, db)) continue

    for (const [titulo, texto] of EXEMPLOS[chave] ?? []) {
      if (existe.get(chave, titulo)) continue
      inserir.run(chave, titulo, texto, FONTE_EXEMPLO)
      criados.push(titulo)
    }
  }

  return criados
}

/**
 * Semeia temas e exemplos. Chamada a cada abertura do banco, e idempotente.
 *
 * Idempotência importa aqui mais que o normal: quem editar as palavras-gatilho
 * para casar com o jeito de falar do piloto perderia esse trabalho a cada subida
 * do container se a semente sobrescrevesse.
 *
 * @returns {{temas: string[], exemplos: string[]}} o que foi criado agora
 */
export function semearBase(db = getDb()) {
  const temas = semearTemas(db)
  const exemplos = semearExemplos(db)
  return { temas, exemplos }
}
