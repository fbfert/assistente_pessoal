import { getDb } from './db.js'

/**
 * Estado da conexão com o WhatsApp — o canal entre o bot e o admin.
 *
 * `tars` e `dashboard` são containers separados que compartilham APENAS o
 * volume do banco: não há memória, socket nem evento em comum. O bot escreve
 * aqui; o admin lê.
 *
 * Tabela, não arquivo solto: arquivo avulso seria mais fácil de escrever e pior
 * de operar — sem tipo, sem transação, sem escrita atômica, e com o leitor
 * podendo pegar um JSON pela metade. O projeto já escolheu armazenamento
 * estruturado em todos os outros pontos.
 */

const ID = 1

/** Validade do QR do WhatsApp. Ele expira em segundos; 60s já é folgado. */
export const VALIDADE_QR_MS = 60_000

export function lerEstadoConexao(db = getDb()) {
  return (
    db.prepare('SELECT * FROM estado_conexao WHERE id = ?').get(ID) ?? {
      id: ID,
      conectado: 0,
      qr_atual: null,
      motivo_desconexao: null,
      atualizado_em: null,
    }
  )
}

function gravar({ conectado, qrAtual = null, motivo = null }, db = getDb()) {
  db.prepare(
    `INSERT INTO estado_conexao (id, conectado, qr_atual, motivo_desconexao, atualizado_em)
          VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
          conectado = excluded.conectado,
          qr_atual = excluded.qr_atual,
          motivo_desconexao = excluded.motivo_desconexao,
          atualizado_em = excluded.atualizado_em`,
  ).run(ID, conectado ? 1 : 0, qrAtual, motivo, new Date().toISOString())

  return lerEstadoConexao(db)
}

/** QR recebido: ainda não conectado, com QR pendente para escanear. */
export function registrarQr(qrBruto, db = getDb()) {
  return gravar({ conectado: 0, qrAtual: qrBruto }, db)
}

/** Conexão aberta: sem QR pendente, sem motivo de queda. */
export function registrarConectado(db = getDb()) {
  return gravar({ conectado: 1 }, db)
}

/** Conexão fechada: o motivo distingue logout (exige novo pareamento) de queda comum. */
export function registrarDesconectado(motivo, db = getDb()) {
  return gravar({ conectado: 0, motivo: motivo ?? 'desconhecido' }, db)
}

/**
 * O QR só é exibível enquanto for fresco. Mostrar um QR morto como se fosse
 * válido faz o operador tentar escanear repetidamente sem entender a falha.
 */
export function qrEstaValido(estado, agora = Date.now()) {
  if (!estado?.qr_atual || !estado.atualizado_em) return false
  const idade = agora - new Date(estado.atualizado_em).getTime()
  return Number.isFinite(idade) && idade >= 0 && idade < VALIDADE_QR_MS
}
