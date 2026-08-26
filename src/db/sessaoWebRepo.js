import { createHash, randomBytes } from 'node:crypto'
import { getDb } from './db.js'
import { config } from '../config.js'

/**
 * Sessões do canal web.
 *
 * O banco guarda o HASH do token, nunca o valor: um banco vazado não contém
 * credencial utilizável. O token em claro existe uma única vez — na resposta que
 * o emitiu — e depois só no cliente.
 *
 * O hash é SHA-256, e não o `scrypt` de `src/dashboard/senha.js`. Aquele existe
 * para senha escolhida por gente, onde o custo deliberado é o que inviabiliza
 * ataque de dicionário. Aqui o segredo é aleatório de 192 bits: não há dicionário
 * a fazer, e pagar a derivação lenta em TODA mensagem seria latência inventada.
 *
 * Esta é a única tabela do projeto de onde apagar é o comportamento correto.
 * Credencial vencida não prova nada e, mantida, só aumenta o que vaza junto num
 * backup. O rastro de que a pessoa entrou fica em `historico_interacoes`.
 */

const TAMANHO_TOKEN = 24 // bytes = 192 bits

const hashDe = (token) => createHash('sha256').update(String(token)).digest('hex')

const validadeMs = () => config.web.sessaoHoras * 60 * 60 * 1000

const iso = (ms) => new Date(ms).toISOString()

/**
 * Cria uma sessão e devolve o token em claro — a ÚNICA vez que ele existe fora
 * do cliente.
 */
export function criar(usuarioId, db = getDb(), agora = Date.now()) {
  const token = randomBytes(TAMANHO_TOKEN).toString('hex')
  const expiraEm = iso(agora + validadeMs())

  db.prepare(
    'INSERT INTO sessoes_web (token_hash, usuario_id, criado_em, expira_em) VALUES (?, ?, ?, ?)',
  ).run(hashDe(token), usuarioId, iso(agora), expiraEm)

  return { token, expiraEm }
}

/**
 * Valida o token e RENOVA a expiração — a validade é de inatividade, não de
 * tempo desde a entrada: uma conversa que dura o dia todo não se interrompe no
 * meio, e uma aba esquecida não vale para sempre.
 *
 * Sessão expirada é apagada na hora em que é encontrada: não há razão para
 * manter credencial vencida esperando uma limpeza que talvez não rode.
 *
 * @returns {number|null} usuario_id, ou null para ausente, desconhecida ou vencida
 */
export function validar(token, db = getDb(), agora = Date.now()) {
  if (!token || typeof token !== 'string') return null

  const linha = db.prepare('SELECT * FROM sessoes_web WHERE token_hash = ?').get(hashDe(token))
  if (!linha) return null

  if (new Date(linha.expira_em).getTime() <= agora) {
    db.prepare('DELETE FROM sessoes_web WHERE sessao_id = ?').run(linha.sessao_id)
    return null
  }

  db.prepare('UPDATE sessoes_web SET expira_em = ? WHERE sessao_id = ?').run(
    iso(agora + validadeMs()),
    linha.sessao_id,
  )

  return linha.usuario_id
}

export function encerrar(token, db = getDb()) {
  if (!token) return
  db.prepare('DELETE FROM sessoes_web WHERE token_hash = ?').run(hashDe(token))
}

/** Usada pela anonimização: sair do piloto encerra o acesso na hora. */
export function apagarDoUsuario(usuarioId, db = getDb()) {
  db.prepare('DELETE FROM sessoes_web WHERE usuario_id = ?').run(usuarioId)
}

/** Limpeza oportunista de vencidas. Nenhuma delas prova nada. */
export function apagarExpiradas(db = getDb(), agora = Date.now()) {
  return db.prepare('DELETE FROM sessoes_web WHERE expira_em <= ?').run(iso(agora)).changes
}
