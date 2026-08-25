import { getDb } from './db.js'
import { gerarHash, conferirHash, queimarTempo } from '../dashboard/senha.js'

/** Contas do backend administrativo. Não confundir com participantes do piloto. */

const agora = () => new Date().toISOString()

export function contarContas(db = getDb()) {
  return db.prepare('SELECT COUNT(*) AS n FROM admin_usuarios').get().n
}

export function buscarPorEmail(email, db = getDb()) {
  return (
    db
      .prepare('SELECT * FROM admin_usuarios WHERE email = ? COLLATE NOCASE')
      .get(String(email ?? '').trim()) ?? null
  )
}

export function buscarPorId(adminId, db = getDb()) {
  return db.prepare('SELECT * FROM admin_usuarios WHERE admin_id = ?').get(adminId) ?? null
}

export function listarContas(db = getDb()) {
  return db.prepare('SELECT * FROM admin_usuarios ORDER BY admin_id').all()
}

export async function criarConta({ nome, email, senha }, db = getDb()) {
  const hash = await gerarHash(senha)
  const { lastInsertRowid } = db
    .prepare('INSERT INTO admin_usuarios (nome, email, senha_hash) VALUES (?, ?, ?)')
    .run(nome, String(email).trim(), hash)
  return buscarPorId(lastInsertRowid, db)
}

/**
 * Autentica por e-mail e senha.
 *
 * Quando o e-mail não existe — ou a conta está inativa — o custo é queimado
 * mesmo assim antes de responder. Sem isso, a diferença de tempo entre
 * "não existe" e "senha errada" transforma a tela num enumerador de contas.
 */
export async function autenticar(email, senha, db = getDb()) {
  const conta = buscarPorEmail(email, db)

  if (!conta || !conta.ativo) {
    await queimarTempo(senha)
    return null
  }

  if (!(await conferirHash(senha, conta.senha_hash))) return null

  db.prepare('UPDATE admin_usuarios SET ultimo_login_em = ? WHERE admin_id = ?').run(
    agora(),
    conta.admin_id,
  )
  return buscarPorId(conta.admin_id, db)
}

export async function trocarSenha(adminId, senhaAtual, senhaNova, db = getDb()) {
  const conta = buscarPorId(adminId, db)
  if (!conta) return { ok: false, erro: 'conta não encontrada' }

  if (!(await conferirHash(senhaAtual, conta.senha_hash))) {
    return { ok: false, erro: 'A senha atual está incorreta.' }
  }

  if (String(senhaNova ?? '').length < 8) {
    return { ok: false, erro: 'A senha nova precisa ter pelo menos 8 caracteres.' }
  }

  db.prepare('UPDATE admin_usuarios SET senha_hash = ? WHERE admin_id = ?').run(
    await gerarHash(senhaNova),
    adminId,
  )
  return { ok: true }
}

export function desativarConta(adminId, db = getDb()) {
  // Desativa, não apaga: a auditoria precisa continuar podendo nomear o autor
  // de ações passadas.
  db.prepare('UPDATE admin_usuarios SET ativo = 0 WHERE admin_id = ?').run(adminId)
  return buscarPorId(adminId, db)
}

/**
 * Cria a conta inicial a partir do ambiente, uma única vez.
 *
 * Existe para que um deploy limpo não deixe o operador trancado para fora. Se já
 * houver qualquer conta, não faz nada — nem cria outra, nem mexe na senha da
 * existente.
 */
export async function bootstrap({ email, senha, nome }, db = getDb()) {
  if (contarContas(db) > 0) return { criada: false }
  if (!email || !senha) return { criada: false, faltando: true }

  const conta = await criarConta({ nome: nome || email.split('@')[0], email, senha }, db)
  return { criada: true, conta }
}
