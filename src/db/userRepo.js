import { getDb } from './db.js'
import { apagarDoUsuario as apagarSessoesDoUsuario } from './sessaoWebRepo.js'
import { apagarNotasDoUsuario, redigirNotasDoUsuario } from './notasRepo.js'
import { SEM_INFORMACAO, REDIGIDO, TIPOS_GATILHO } from '../constants.js'
import { config } from '../config.js'

/**
 * Campos de anamnese graváveis pelo setter genérico.
 * Whitelist fechada: o nome do campo vira nome de coluna na query, então
 * aceitar qualquer string aqui seria injeção de SQL.
 */
export const CAMPOS_ANAMNESE = Object.freeze([
  'nome',
  'o_que_trava',
  'rotina_boa',
  'rotina_ruim',
  'gatilhos_de_sobrecarga',
  'sinal_de_alerta',
  'pessoas_chave',
  'vocabulario_proprio',
  'nunca_fazer',
])

/**
 * Campos que o aprendizado contínuo pode preencher.
 *
 * DERIVADO de `CAMPOS_ANAMNESE`, nunca redigitado: duas listas independentes
 * divergem no primeiro campo novo.
 *
 * `nome` sai porque é identidade, não traço — o bot "aprender" um nome diferente
 * do que a pessoa pediu para ser chamada seria regressão, não aprendizado.
 *
 * Remédio não está aqui porque não está em CAMPOS_ANAMNESE (vive em tabela
 * própria) — e continua sendo assunto exclusivo de `extrairRemedios`, que tem
 * tratamento de Regra 1b específico para dado de saúde regulado.
 */
export const CAMPOS_APRENDIVEIS = Object.freeze(CAMPOS_ANAMNESE.filter((c) => c !== 'nome'))

const agora = () => new Date().toISOString()

// --- Usuário -----------------------------------------------------------------

export function findByWhatsapp(numero, db = getDb()) {
  return db.prepare('SELECT * FROM usuarios WHERE numero_whatsapp = ?').get(numero) ?? null
}

/** Só os dígitos: `+55 (11) 98888-7777` e `5511988887777` são o mesmo telefone. */
export const soDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')

/**
 * Busca por telefone tolerante a formatação — o que a pessoa digita na entrada
 * pública raramente bate byte a byte com o que o operador cadastrou.
 *
 * Varre a tabela em vez de normalizar em SQL: são cinco participantes no piloto,
 * e uma expressão de REPLACE aninhado no WHERE seria ilegível para economizar um
 * tempo que não existe nesta escala.
 */
export function findByTelefone(telefone, db = getDb()) {
  const alvo = soDigitos(telefone)
  if (!alvo) return null

  return (
    db
      .prepare('SELECT * FROM usuarios')
      .all()
      .find((u) => soDigitos(u.numero_whatsapp) === alvo) ?? null
  )
}

/**
 * Data de nascimento — segundo fator da entrada pelo canal web.
 *
 * Fora de `CAMPOS_ANAMNESE` de propósito: não é resposta de anamnese, é
 * identificação, e o setter genérico daquela whitelist tem outro significado.
 */
export function salvarDataNascimento(usuarioId, valor, db = getDb()) {
  db.prepare('UPDATE usuarios SET data_nascimento = ? WHERE usuario_id = ?').run(
    valor || null,
    usuarioId,
  )
  return findById(usuarioId, db)
}

export function findById(usuarioId, db = getDb()) {
  return db.prepare('SELECT * FROM usuarios WHERE usuario_id = ?').get(usuarioId) ?? null
}

export function createUsuario(numero, db = getDb()) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO usuarios (numero_whatsapp) VALUES (?)')
    .run(numero)
  return findById(lastInsertRowid, db)
}

/** Idempotente: chamar duas vezes com o mesmo número devolve o mesmo usuário. */
export function findOrCreate(numero, db = getDb()) {
  return findByWhatsapp(numero, db) ?? createUsuario(numero, db)
}

export function registrarConsentimento(usuarioId, versao, db = getDb()) {
  db.prepare(
    `UPDATE usuarios
        SET consentimento_aceito = 1,
            consentimento_versao = ?,
            consentimento_timestamp = ?
      WHERE usuario_id = ?`,
  ).run(versao, agora(), usuarioId)
  return findById(usuarioId, db)
}

/**
 * Troca o estado da anamnese. Zera `anamnese_exemplo_pedido` porque o flag de
 * "já dei uma segunda chance" é por estado, não por usuário.
 */
export function setAnamneseEstado(usuarioId, estado, db = getDb()) {
  db.prepare(
    `UPDATE usuarios
        SET anamnese_estado = ?,
            anamnese_exemplo_pedido = 0,
            anamnese_ultima_mensagem_em = ?
      WHERE usuario_id = ?`,
  ).run(estado, agora(), usuarioId)
  return findById(usuarioId, db)
}

/** Marca que a segunda chance do estado corrente já foi usada (exemplo pedido / repergunta). */
export function marcarExemploPedido(usuarioId, db = getDb()) {
  db.prepare('UPDATE usuarios SET anamnese_exemplo_pedido = 1 WHERE usuario_id = ?').run(usuarioId)
  return findById(usuarioId, db)
}

export function salvarCampoAnamnese(usuarioId, campo, valor, db = getDb()) {
  if (!CAMPOS_ANAMNESE.includes(campo)) {
    throw new Error(`Campo de anamnese desconhecido: ${campo}`)
  }
  db.prepare(`UPDATE usuarios SET ${campo} = ? WHERE usuario_id = ?`).run(valor, usuarioId)
  return findById(usuarioId, db)
}

export function salvarVocabularioProprio(usuarioId, valor, db = getDb()) {
  return salvarCampoAnamnese(usuarioId, 'vocabulario_proprio', valor, db)
}

export function setPersonalidade(usuarioId, personalidade, db = getDb()) {
  db.prepare('UPDATE usuarios SET personalidade = ? WHERE usuario_id = ?').run(
    personalidade,
    usuarioId,
  )
  return findById(usuarioId, db)
}

export function listarUsuariosAtivos(db = getDb()) {
  return db.prepare('SELECT * FROM usuarios WHERE anamnese_estado = 12').all()
}

// --- Remédios ----------------------------------------------------------------

export function adicionarRemedio(usuarioId, nome, horario, db = getDb()) {
  // Regra 1b: campo ausente vira o sentinela, nunca um chute.
  const { lastInsertRowid } = db
    .prepare('INSERT INTO remedios (usuario_id, nome, horario) VALUES (?, ?, ?)')
    .run(usuarioId, nome || SEM_INFORMACAO, horario || SEM_INFORMACAO)
  return db.prepare('SELECT * FROM remedios WHERE remedio_id = ?').get(lastInsertRowid)
}

/**
 * Grava o horário de um remédio dito na conversa livre.
 *
 * Nome que já existe tem o HORÁRIO ATUALIZADO; nome novo cria um remédio. Nos
 * dois casos o gatilho é reconciliado: sem isso, a pessoa informaria o horário e
 * continuaria sem lembrete — que é exatamente o defeito que abriu esta mudança.
 *
 * Comparação de nome por texto normalizado: "Bup" e "bup" são o mesmo remédio, e
 * criar o segundo deixaria dois gatilhos disparando para a mesma coisa.
 *
 * @returns {{acao: 'atualizado'|'criado', remedio: object}}
 */
export function registrarHorarioDeRemedio(usuarioId, nome, horario, db = getDb()) {
  const alvo = normalizarNome(nome)
  const existente = listarRemedios(usuarioId, db).find((r) => normalizarNome(r.nome) === alvo)

  if (existente) {
    db.prepare('UPDATE remedios SET horario = ? WHERE remedio_id = ?').run(horario, existente.remedio_id)
    reconciliarGatilhoDeRemedio(usuarioId, existente.remedio_id, horario, db)
    return { acao: 'atualizado', remedio: buscarRemedio(existente.remedio_id, db) }
  }

  const novo = adicionarRemedio(usuarioId, nome, horario, db)
  reconciliarGatilhoDeRemedio(usuarioId, novo.remedio_id, horario, db)
  return { acao: 'criado', remedio: novo }
}

const normalizarNome = (v) =>
  String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Um gatilho por remédio: cria se não houver, ajusta o horário se houver. */
function reconciliarGatilhoDeRemedio(usuarioId, remedioId, horario, db = getDb()) {
  const atual = db
    .prepare('SELECT * FROM gatilhos_configurados WHERE usuario_id = ? AND remedio_id = ?')
    .get(usuarioId, remedioId)

  if (atual) {
    db.prepare('UPDATE gatilhos_configurados SET horario = ?, ativo = 1 WHERE gatilho_id = ?')
      .run(horario, atual.gatilho_id)
    return
  }

  configurarGatilho(usuarioId, TIPOS_GATILHO.REMEDIO, horario, 1, remedioId, db)
}

export function listarRemedios(usuarioId, db = getDb()) {
  return db.prepare('SELECT * FROM remedios WHERE usuario_id = ? ORDER BY remedio_id').all(usuarioId)
}

// --- Gatilhos ----------------------------------------------------------------

export function configurarGatilho(usuarioId, tipo, horario, ativo = 1, remedioId = null, db = getDb()) {
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO gatilhos_configurados (usuario_id, tipo, horario, ativo, remedio_id) VALUES (?, ?, ?, ?, ?)',
    )
    .run(usuarioId, tipo, horario, ativo ? 1 : 0, remedioId)
  return db.prepare('SELECT * FROM gatilhos_configurados WHERE gatilho_id = ?').get(lastInsertRowid)
}

export function listarGatilhosUsuario(usuarioId, db = getDb()) {
  return db
    .prepare('SELECT * FROM gatilhos_configurados WHERE usuario_id = ? ORDER BY gatilho_id')
    .all(usuarioId)
}

/**
 * Só gatilhos ativos de usuário com anamnese concluída e não pausado.
 *
 * A pausa é FILTRO aqui, não desativação individual dos gatilhos: desativar um
 * a um perderia a informação de quais estavam ativos por decisão do operador, e
 * despausar restauraria o estado errado. Filtro é reversível por construção.
 */
export function listarGatilhosAtivos(db = getDb()) {
  return db
    .prepare(
      `SELECT g.*, u.numero_whatsapp, u.personalidade, u.nome AS usuario_nome, r.nome AS remedio_nome
         FROM gatilhos_configurados g
         JOIN usuarios u ON u.usuario_id = g.usuario_id
    LEFT JOIN remedios r ON r.remedio_id = g.remedio_id
        WHERE g.ativo = 1
          AND u.anamnese_estado = 12
          AND u.pausado = 0
     ORDER BY g.usuario_id, g.horario`,
    )
    .all()
}

/**
 * Gatilhos padrão do MVP, criados ao concluir a anamnese.
 *
 * Remédio sem nome OU sem horário NÃO vira gatilho — não há o que lembrar.
 * A comparação é contra a constante SEM_INFORMACAO; ver src/constants.js
 * para o porquê de ela não ser um literal repetido.
 */
export function ativarGatilhosPadrao(usuarioId, db = getDb()) {
  const criados = []

  criados.push(
    // Horário lido da configuração viva NO MOMENTO da conclusão: mudar o padrão
    // depois não retroage sobre quem já foi configurado, e é assim de propósito.
    configurarGatilho(usuarioId, TIPOS_GATILHO.CHECKIN_MANHA, config.horarioPadraoCheckin, 1, null, db),
  )

  for (const remedio of listarRemedios(usuarioId, db)) {
    if (remedio.nome === SEM_INFORMACAO || remedio.horario === SEM_INFORMACAO) continue
    criados.push(
      configurarGatilho(usuarioId, TIPOS_GATILHO.REMEDIO, remedio.horario, 1, remedio.remedio_id, db),
    )
  }

  // Terceiro gatilho da esteira, mas nasce DESLIGADO no piloto (ativo = 0).
  // Ativação é decisão manual, não automática.
  criados.push(
    configurarGatilho(
      usuarioId,
      TIPOS_GATILHO.CHECKLIST_FIM_DIA,
      config.horarioPadraoChecklist,
      0,
      null,
      db,
    ),
  )

  return criados
}

export function concluirAnamnese(usuarioId, db = getDb()) {
  const usuario = setAnamneseEstado(usuarioId, 12, db)
  ativarGatilhosPadrao(usuarioId, db)
  return usuario
}

// --- Contadores de silêncio --------------------------------------------------

export function getSilencioConsecutivo(usuarioId, gatilhoTipo, db = getDb()) {
  const linha = db
    .prepare('SELECT silencio_consecutivo FROM contadores WHERE usuario_id = ? AND gatilho_tipo = ?')
    .get(usuarioId, gatilhoTipo)
  return linha?.silencio_consecutivo ?? 0
}

export function incrementarSilencio(usuarioId, gatilhoTipo, db = getDb()) {
  db.prepare(
    `INSERT INTO contadores (usuario_id, gatilho_tipo, silencio_consecutivo)
          VALUES (?, ?, 1)
     ON CONFLICT (usuario_id, gatilho_tipo)
     DO UPDATE SET silencio_consecutivo = silencio_consecutivo + 1`,
  ).run(usuarioId, gatilhoTipo)
  return getSilencioConsecutivo(usuarioId, gatilhoTipo, db)
}

export function zerarSilencio(usuarioId, gatilhoTipo, db = getDb()) {
  db.prepare(
    `INSERT INTO contadores (usuario_id, gatilho_tipo, silencio_consecutivo)
          VALUES (?, ?, 0)
     ON CONFLICT (usuario_id, gatilho_tipo)
     DO UPDATE SET silencio_consecutivo = 0`,
  ).run(usuarioId, gatilhoTipo)
  return 0
}

// --- Despejos por semana -----------------------------------------------------

/** Segunda-feira que abre a semana da data informada, em YYYY-MM-DD. */
export function inicioDaSemana(data = new Date()) {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
  const diaDaSemana = d.getUTCDay() // 0 = domingo
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1
  d.setUTCDate(d.getUTCDate() - recuo)
  return d.toISOString().slice(0, 10)
}

export function incrementarDespejoEspontaneo(usuarioId, data = new Date(), db = getDb()) {
  const semana = inicioDaSemana(data)
  const atual = db.prepare('SELECT * FROM despejos_semana WHERE usuario_id = ?').get(usuarioId)

  if (!atual) {
    db.prepare(
      'INSERT INTO despejos_semana (usuario_id, semana_inicio, contagem) VALUES (?, ?, 1)',
    ).run(usuarioId, semana)
    return 1
  }

  if (atual.semana_inicio !== semana) {
    // Virou a semana: reinicia em 1 em vez de somar sobre a semana passada.
    db.prepare(
      'UPDATE despejos_semana SET semana_inicio = ?, contagem = 1 WHERE usuario_id = ?',
    ).run(semana, usuarioId)
    return 1
  }

  db.prepare('UPDATE despejos_semana SET contagem = contagem + 1 WHERE usuario_id = ?').run(usuarioId)
  return atual.contagem + 1
}

export function getDespejosSemana(usuarioId, db = getDb()) {
  const linha = db.prepare('SELECT * FROM despejos_semana WHERE usuario_id = ?').get(usuarioId)
  return linha ?? { usuario_id: usuarioId, semana_inicio: inicioDaSemana(), contagem: 0 }
}

// --- Pausa --------------------------------------------------------------------

export function setPausado(usuarioId, pausado, db = getDb()) {
  db.prepare('UPDATE usuarios SET pausado = ? WHERE usuario_id = ?').run(pausado ? 1 : 0, usuarioId)
  return findById(usuarioId, db)
}

// --- Remédios: edição -----------------------------------------------------------

/** Campo vazio grava o sentinela (Regra 1b), nunca string vazia nem chute. */
export function atualizarRemedio(remedioId, nome, horario, db = getDb()) {
  db.prepare('UPDATE remedios SET nome = ?, horario = ? WHERE remedio_id = ?').run(
    nome?.trim() || SEM_INFORMACAO,
    horario?.trim() || SEM_INFORMACAO,
    remedioId,
  )
  return db.prepare('SELECT * FROM remedios WHERE remedio_id = ?').get(remedioId) ?? null
}

export function buscarRemedio(remedioId, db = getDb()) {
  return db.prepare('SELECT * FROM remedios WHERE remedio_id = ?').get(remedioId) ?? null
}

export function removerRemedio(remedioId, db = getDb()) {
  db.prepare('DELETE FROM remedios WHERE remedio_id = ?').run(remedioId)
}

// --- Gatilhos: edição -----------------------------------------------------------

export function buscarGatilho(gatilhoId, db = getDb()) {
  return db.prepare('SELECT * FROM gatilhos_configurados WHERE gatilho_id = ?').get(gatilhoId) ?? null
}

/** Atualiza horário e/ou situação. Campo omitido preserva o valor atual. */
export function atualizarGatilho(gatilhoId, { horario, ativo } = {}, db = getDb()) {
  const atual = buscarGatilho(gatilhoId, db)
  if (!atual) return null

  db.prepare('UPDATE gatilhos_configurados SET horario = ?, ativo = ? WHERE gatilho_id = ?').run(
    horario ?? atual.horario,
    ativo === undefined ? atual.ativo : ativo ? 1 : 0,
    gatilhoId,
  )
  return buscarGatilho(gatilhoId, db)
}

// --- Reinício de anamnese --------------------------------------------------------

/**
 * Zera a anamnese POR COMPLETO.
 *
 * Não reaproveita `convidarPiloto`: ele só reseta o estado, deixando resposta
 * antiga em campo que a nova anamnese talvez não regrave — um registro
 * meio-antigo meio-novo, pior que qualquer um dos dois. Aqui os campos, os
 * remédios e os gatilhos vão junto.
 *
 * O histórico NÃO é tocado: é append-only e é o que prova o que aconteceu antes.
 */
export function reiniciarAnamnese(usuarioId, db = getDb()) {
  const limpar = CAMPOS_ANAMNESE.map((c) => `${c} = NULL`).join(', ')

  db.transaction(() => {
    db.prepare('DELETE FROM gatilhos_configurados WHERE usuario_id = ?').run(usuarioId)
    db.prepare('DELETE FROM remedios WHERE usuario_id = ?').run(usuarioId)
    db.prepare('DELETE FROM contadores WHERE usuario_id = ?').run(usuarioId)
    // Notas construídas sobre o perfil velho contaminariam o novo.
    apagarNotasDoUsuario(usuarioId, db)
    db.prepare(
      `UPDATE usuarios
          SET ${limpar},
              personalidade = NULL,
              anamnese_estado = 0,
              anamnese_exemplo_pedido = 0,
              anamnese_lembrete_enviado = 0
        WHERE usuario_id = ?`,
    ).run(usuarioId)
  })()

  return findById(usuarioId, db)
}

// --- Anonimização ----------------------------------------------------------------

/**
 * Saída do piloto SEM perder o rastro de auditoria.
 *
 * `historico_interacoes` tem ON DELETE CASCADE a partir de `usuarios`: apagar o
 * participante levaria junto o registro de que ele consentiu — com timestamp e
 * versão — e todas as ações do operador sobre o dado dele. É exatamente a prova
 * que uma fiscalização pede.
 *
 * O campo `texto` do histórico TAMBÉM é redigido: é lá que estão as respostas da
 * anamnese e as conversas, escritas pela própria pessoa, quase sempre com nome e
 * detalhes de saúde. Redigir só o número seria fachada. A data de nascimento
 * entra pelo mesmo motivo: é identificação direta.
 *
 * Esta é a única exceção ao append-only do histórico, e é deliberada: um UPDATE
 * que apaga conteúdo identificável preserva mais que um DELETE que apaga a linha.
 */
export function anonimizarParticipante(usuarioId, db = getDb()) {
  const redigirCampos = CAMPOS_ANAMNESE.map((c) => `${c} = '${REDIGIDO}'`).join(', ')

  db.transaction(() => {
    db.prepare(
      `UPDATE usuarios
          SET numero_whatsapp = ?, data_nascimento = ?, ${redigirCampos}, pausado = 1
        WHERE usuario_id = ?`,
    ).run(`redigido:${usuarioId}`, REDIGIDO, usuarioId)

    // A sessão web é APAGADA, não redigida: uma credencial viva depois da saída
    // do piloto seria acesso a um dado que a pessoa pediu para encerrar.
    apagarSessoesDoUsuario(usuarioId, db)

    // O texto das notas é conteúdo escrito pela própria pessoa, recortado da
    // conversa. Redigir tudo menos as notas seria fachada.
    redigirNotasDoUsuario(usuarioId, REDIGIDO, db)

    db.prepare('UPDATE remedios SET nome = ?, horario = ? WHERE usuario_id = ?').run(
      REDIGIDO,
      REDIGIDO,
      usuarioId,
    )

    db.prepare('UPDATE gatilhos_configurados SET ativo = 0 WHERE usuario_id = ?').run(usuarioId)

    // Tipo, timestamp e gatilho_relacionado permanecem — é o que sustenta a
    // auditoria sem identificar ninguém.
    db.prepare('UPDATE historico_interacoes SET texto = ? WHERE usuario_id = ?').run(
      REDIGIDO,
      usuarioId,
    )
  })()

  return findById(usuarioId, db)
}
