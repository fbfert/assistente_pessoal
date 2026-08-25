import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { buscarPorId } from '../db/adminRepo.js'

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

/** token -> { criadaEm, adminId } */
const sessoes = new Map()

const assinar = (token) => createHmac('sha256', SEGREDO).update(token).digest('hex')

export function criarSessao(adminId) {
  const token = randomBytes(24).toString('hex')
  sessoes.set(token, { criadaEm: Date.now(), adminId })
  return `${token}.${assinar(token)}`
}

/** Encerra todas as sessões de uma conta — usado após troca de senha. */
export function encerrarSessoesDe(adminId) {
  for (const [token, s] of sessoes) if (s.adminId === adminId) sessoes.delete(token)
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

  const sessao = sessoes.get(token)
  if (!sessao) return false

  if (Date.now() - sessao.criadaEm > VALIDADE_MS) {
    sessoes.delete(token)
    return false
  }

  return true
}

/** Conta que originou a sessão, ou null. É o que permite a auditoria nomear o autor. */
export function adminDaSessao(valorCookie) {
  if (!sessaoValida(valorCookie)) return null
  const token = String(valorCookie).split('.')[0]
  return sessoes.get(token)?.adminId ?? null
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

/** Alcançáveis com senha temporária pendente: só trocar a senha e sair. */
const COM_PENDENCIA = new Set(['/conta', '/conta/senha', '/logout'])

export function exigirSessao(req, res, next) {
  if (LIVRES.has(req.path)) return next()

  const cookie = lerCookie(req)
  if (!sessaoValida(cookie)) {
    // Nenhum dado do piloto no corpo nem nos cabeçalhos desta resposta.
    return res.redirect(302, '/login')
  }

  req.adminId = adminDaSessao(cookie)

  // Senha temporária pendente: a sessão existe, mas só alcança a troca. Sem
  // isso a obrigação vira sugestão, e uma senha gerada por terceiro —
  // possivelmente trafegada por chat — continuaria valendo indefinidamente.
  const conta = req.adminId ? buscarPorId(req.adminId) : null
  if (conta?.precisa_trocar_senha && !COM_PENDENCIA.has(req.path)) {
    return res.redirect(302, '/conta')
  }

  next()
}

// =============================================================================
// Limite de tentativas de login
//
// Existe desde que o Basic Auth do Apache foi removido: antes, o formulário só
// era alcançável por quem já tinha passado por uma camada; hoje ele está aberto
// na internet, e a única barreira é a senha.
//
// Duas defesas, de propósito:
//
// 1. ATRASO FIXO a cada falha. Não depende de identificar a origem, então não
//    é contornável de jeito nenhum. Sozinho, derruba a taxa de tentativa de
//    milhares por minuto para dezenas.
// 2. BLOQUEIO POR ORIGEM depois de N falhas. Mais eficaz, porém dependente do
//    IP que chega via proxy — que um atacante determinado pode forjar no
//    cabeçalho. É defesa em profundidade, não garantia.
//
// Nenhuma das duas substitui uma senha forte.
// =============================================================================

const MAX_FALHAS = 5
const BLOQUEIO_MS = 15 * 60 * 1000
const ATRASO_POR_FALHA_MS = 1000

/** origem -> { falhas, bloqueadoAte } */
const tentativas = new Map()

const origemDe = (req) => req.ip ?? req.socket?.remoteAddress ?? 'desconhecida'

export function loginBloqueado(req) {
  const t = tentativas.get(origemDe(req))
  if (!t?.bloqueadoAte) return false

  if (Date.now() >= t.bloqueadoAte) {
    tentativas.delete(origemDe(req))
    return false
  }
  return Math.ceil((t.bloqueadoAte - Date.now()) / 60000)
}

/** Log de falha SEM a senha tentada, nem em claro nem em forma reversível. */
export async function registrarFalhaDeLogin(req, email) {
  const origem = origemDe(req)
  const t = tentativas.get(origem) ?? { falhas: 0, bloqueadoAte: null }
  t.falhas += 1

  if (t.falhas >= MAX_FALHAS) {
    t.bloqueadoAte = Date.now() + BLOQUEIO_MS
    console.warn(`[admin] origem ${origem} bloqueada por ${MAX_FALHAS} falhas de login`)
  }
  tentativas.set(origem, t)

  console.warn(`[admin] login malsucedido para "${email ?? '(sem e-mail)'}" de ${origem}`)

  // O atraso vem DEPOIS de contabilizar, para que a resposta já saia freada.
  await new Promise((r) => setTimeout(r, ATRASO_POR_FALHA_MS))
}

export function limparTentativas(req) {
  tentativas.delete(origemDe(req))
}

/** Só para teste. */
export function _limparBloqueios() {
  tentativas.clear()
}

/** Só para teste: limpa o estado de sessão entre casos. */
export function _limparSessoes() {
  sessoes.clear()
}
