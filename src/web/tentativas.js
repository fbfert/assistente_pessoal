import { config } from '../config.js'

/**
 * Limite de tentativas da entrada pública.
 *
 * O par telefone + data de nascimento é fraco por construção: o telefone não é
 * segredo e a data tem alguns milhares de valores plausíveis para um adulto.
 * Este módulo é a única coisa entre esse par e a força bruta.
 *
 * DUAS contagens, e qualquer uma bloqueia:
 *
 * 1. Por ORIGEM — pega o script que varre datas de um IP só. Depende do endereço
 *    que chega pelo proxy, que um atacante determinado forja no cabeçalho.
 * 2. Por TELEFONE — pega o ataque distribuído, de muitos IPs contra um alvo. O
 *    telefone é o alvo real e não se forja.
 *
 * Mais o ATRASO FIXO a cada falha, que não depende de identificar ninguém e por
 * isso não se contorna de jeito nenhum.
 *
 * Mesmos números do login do admin (`src/dashboard/auth.js`), por decisão
 * registrada no design: 5 falhas, 15 minutos de bloqueio, 1 segundo por falha.
 */

/** chave -> { falhas, bloqueadoAte } */
const contagens = new Map()

const bloqueioMs = () => config.web.bloqueioMinutos * 60 * 1000
const limite = () => config.web.maxTentativas

const chaveOrigem = (origem) => `origem:${origem}`
const chaveTelefone = (telefone) => `telefone:${telefone}`

function bloqueada(chave, agora) {
  const c = contagens.get(chave)
  if (!c?.bloqueadoAte) return false

  if (agora >= c.bloqueadoAte) {
    contagens.delete(chave)
    return false
  }
  return true
}

/**
 * @returns {false|number} false, ou os minutos que faltam para desbloquear
 */
export function bloqueado({ origem, telefone }, agora = Date.now()) {
  for (const chave of [chaveOrigem(origem), chaveTelefone(telefone)]) {
    if (bloqueada(chave, agora)) {
      return Math.ceil((contagens.get(chave).bloqueadoAte - agora) / 60000)
    }
  }
  return false
}

/**
 * Contabiliza a falha nas duas contagens e SEGURA a resposta.
 *
 * O atraso vem depois de contabilizar, para que a resposta já saia freada — e é
 * aplicado mesmo quando o bloqueio já disparou.
 */
export async function registrarFalha({ origem, telefone }, agora = Date.now()) {
  for (const chave of [chaveOrigem(origem), chaveTelefone(telefone)]) {
    const c = contagens.get(chave) ?? { falhas: 0, bloqueadoAte: null }
    c.falhas += 1
    if (c.falhas >= limite()) c.bloqueadoAte = agora + bloqueioMs()
    contagens.set(chave, c)
  }

  // NUNCA loga o telefone nem a data tentada: seriam dado de saúde no log do
  // Docker (participar deste piloto é, por si só, informação de saúde).
  console.warn(`[web] tentativa de entrada malsucedida de ${origem}`)

  await new Promise((r) => setTimeout(r, config.web.atrasoFalhaMs))
}

/** Entrada bem-sucedida limpa as duas contagens. */
export function limpar({ origem, telefone }) {
  contagens.delete(chaveOrigem(origem))
  contagens.delete(chaveTelefone(telefone))
}

/** Só para teste. */
export function _limparTudo() {
  contagens.clear()
}
