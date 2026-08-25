import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { config } from '../config.js'

/**
 * Autenticação do backend administrativo.
 *
 * Implementação própria em vez de `express-session` + `cookie-parser`: são
 * ~60 linhas contra duas dependências novas, para um admin de UM operador com
 * sessão em memória. O que as bibliotecas trazem de valor real — rotação de
 * store, múltiplos backends, TTL configurável — é exatamente o que esta escala
 * não usa.
 *
 * A sessão vive na memória do processo. Reiniciar o container desloga; num
 * login por senha única isso custa segundos, e a alternativa (sessão no SQLite)
 * pediria tabela e limpeza de expirados para resolver um incômodo inexistente.
 */

const NOME_COOKIE = 'tars_admin'
const VALIDADE_MS = 12 * 60 * 60 * 1000 // 12h

// Segredo de assinatura gerado a cada subida do processo. Combina com a sessão
// em memória: reiniciar invalida cookie e sessão ao mesmo tempo, sem estado
// meio-válido.
const SEGREDO = randomBytes(32)

/** token -> criadaEm */
const sessoes = new Map()

/**
 * O processo NÃO sobe sem senha configurada. Um admin que sobe desprotegido por
 * variável faltando é pior que um admin que não sobe: o primeiro expõe dado de
 * saúde sem que ninguém perceba.
 */
export function exigirSenhaConfigurada() {
  if (!config.dashboard.adminPassword) {
    throw new Error(
      'ADMIN_PASSWORD não configurada. O backend administrativo não sobe sem senha — ' +
        'defina a variável no .env antes de iniciar.',
    )
  }
}

/**
 * Comparação em tempo constante.
 *
 * Compara os digests SHA-256, não as senhas cruas: `timingSafeEqual` lança
 * quando os buffers têm tamanhos diferentes, e o próprio lançamento vazaria o
 * tamanho da senha correta. O digest tem sempre 32 bytes.
 *
 * NUNCA use `===` aqui: comparação curto-circuitada revela, por diferença de
 * tempo, o tamanho do prefixo correto.
 */
export function senhaConfere(enviada) {
  const esperada = config.dashboard.adminPassword
  if (!esperada) return false

  const a = createHash('sha256').update(String(enviada ?? ''), 'utf8').digest()
  const b = createHash('sha256').update(esperada, 'utf8').digest()

  return timingSafeEqual(a, b)
}

const assinar = (token) => createHmac('sha256', SEGREDO).update(token).digest('hex')

export function criarSessao() {
  const token = randomBytes(24).toString('hex')
  sessoes.set(token, Date.now())
  return `${token}.${assinar(token)}`
}

export function encerrarSessao(valorCookie) {
  const token = String(valorCookie ?? '').split('.')[0]
  sessoes.delete(token)
}

/** Valida assinatura, existência e validade. Qualquer falha devolve false. */
export function sessaoValida(valorCookie) {
  if (!valorCookie) return false

  const [token, assinatura] = String(valorCookie).split('.')
  if (!token || !assinatura) return false

  const esperada = Buffer.from(assinar(token), 'utf8')
  const recebida = Buffer.from(assinatura, 'utf8')
  if (esperada.length !== recebida.length) return false
  if (!timingSafeEqual(esperada, recebida)) return false

  const criadaEm = sessoes.get(token)
  if (!criadaEm) return false

  if (Date.now() - criadaEm > VALIDADE_MS) {
    sessoes.delete(token)
    return false
  }

  return true
}

/** Parse do header Cookie — evita a dependência `cookie-parser` para uma linha. */
export function lerCookie(req, nome = NOME_COOKIE) {
  const bruto = req.headers?.cookie
  if (!bruto) return null

  for (const parte of bruto.split(';')) {
    const [chave, ...resto] = parte.trim().split('=')
    if (chave === nome) return decodeURIComponent(resto.join('='))
  }
  return null
}

export function definirCookie(req, res, valor) {
  const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https'
  const atributos = [
    `${NOME_COOKIE}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(VALIDADE_MS / 1000)}`,
  ]
  if (seguro) atributos.push('Secure')
  res.setHeader('Set-Cookie', atributos.join('; '))
}

export function limparCookie(res) {
  res.setHeader('Set-Cookie', `${NOME_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`)
}

/** Rotas liberadas: login e health. Todo o resto exige sessão. */
const LIVRES = new Set(['/login', '/health'])

export function exigirSessao(req, res, next) {
  if (LIVRES.has(req.path)) return next()

  if (sessaoValida(lerCookie(req))) return next()

  // Nenhum dado do piloto no corpo nem nos cabeçalhos desta resposta.
  return res.redirect(302, '/login')
}

/** Log de falha SEM a senha tentada, nem em claro nem em forma reversível. */
export function registrarFalhaDeLogin(req) {
  const origem = req.ip ?? req.socket?.remoteAddress ?? 'desconhecida'
  console.warn(`[admin] tentativa de login malsucedida de ${origem}`)
}

/** Só para teste: limpa o estado de sessão entre casos. */
export function _limparSessoes() {
  sessoes.clear()
}
