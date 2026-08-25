import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derivar = promisify(scrypt)

/**
 * Hash de senha com `scrypt` do `node:crypto`.
 *
 * Não usa `bcrypt` de propósito: seria uma segunda dependência NATIVA num
 * projeto que já paga o custo de compilar `better-sqlite3`, e duas costumam
 * transformar o build em problema. `scrypt` é resistente a hardware dedicado,
 * vem embutido no Node e não acrescenta nada ao package.json.
 *
 * O formato guardado é autodescritivo — `scrypt$N$r$p$salt$hash` — para que
 * aumentar os parâmetros no futuro não invalide os hashes já existentes.
 */

const N = 16384
const R = 8
const P = 1
const TAMANHO = 32

export async function gerarHash(senha) {
  const salt = randomBytes(16)
  const hash = await derivar(String(senha), salt, TAMANHO, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function conferirHash(senha, guardado) {
  if (typeof guardado !== 'string') return false

  const [algoritmo, n, r, p, saltHex, hashHex] = guardado.split('$')
  if (algoritmo !== 'scrypt' || !saltHex || !hashHex) return false

  const esperado = Buffer.from(hashHex, 'hex')

  let derivado
  try {
    derivado = await derivar(String(senha), Buffer.from(saltHex, 'hex'), esperado.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
  } catch {
    return false
  }

  // timingSafeEqual lança com tamanhos diferentes; o próprio lançamento vazaria
  // informação, então o tamanho é conferido antes, fora da comparação.
  if (derivado.length !== esperado.length) return false
  return timingSafeEqual(derivado, esperado)
}

/**
 * Trabalho descartável para e-mail inexistente.
 *
 * Sem isto, o tempo de resposta separa "e-mail não existe" de "senha errada", e
 * a tela de login vira um enumerador de contas. O custo aqui é o mesmo de uma
 * verificação real.
 */
export async function queimarTempo(senha) {
  await derivar(String(senha ?? ''), randomBytes(16), TAMANHO, { N, r: R, p: P })
  return false
}
