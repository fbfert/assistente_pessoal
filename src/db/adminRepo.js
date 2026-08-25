import { randomBytes } from 'node:crypto'
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

export async function criarConta({ nome, email, senha, precisaTrocar = false }, db = getDb()) {
  const hash = await gerarHash(senha)
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO admin_usuarios (nome, email, senha_hash, precisa_trocar_senha) VALUES (?, ?, ?, ?)',
    )
    .run(nome, String(email).trim(), hash, precisaTrocar ? 1 : 0)
  return buscarPorId(lastInsertRowid, db)
}

/**
 * Senha temporária, gerada pelo sistema.
 *
 * Quem cria a conta NÃO escolhe a senha do outro: isso produziria senha fraca,
 * conhecida por duas pessoas, que a segunda nunca troca. Ela é exibida uma única
 * vez e a conta nasce obrigada a trocá-la.
 */
export function gerarSenhaTemporaria() {
  return randomBytes(12).toString('base64url')
}

/** Cria com senha temporária. Devolve a conta E a senha em claro, uma única vez. */
export async function criarComSenhaTemporaria({ nome, email }, db = getDb()) {
  if (buscarPorEmail(email, db)) {
    return { ok: false, erro: 'Já existe uma conta com esse e-mail.' }
  }

  const senha = gerarSenhaTemporaria()
  const conta = await criarConta({ nome, email, senha, precisaTrocar: true }, db)
  return { ok: true, conta, senhaTemporaria: senha }
}

/**
 * Reset: o caminho de recuperação, no lugar do e-mail que não existe.
 * Mesma mecânica da criação — temporária, exibida uma vez, troca obrigatória.
 */
export async function resetarSenha(adminId, db = getDb()) {
  const conta = buscarPorId(adminId, db)
  if (!conta) return { ok: false, erro: 'conta não encontrada' }

  const senha = gerarSenhaTemporaria()
  db.prepare(
    'UPDATE admin_usuarios SET senha_hash = ?, precisa_trocar_senha = 1 WHERE admin_id = ?',
  ).run(await gerarHash(senha), adminId)

  return { ok: true, senhaTemporaria: senha }
}

export function contarAtivos(db = getDb()) {
  return db.prepare('SELECT COUNT(*) AS n FROM admin_usuarios WHERE ativo = 1').get().n
}

export function reativarConta(adminId, db = getDb()) {
  db.prepare('UPDATE admin_usuarios SET ativo = 1 WHERE admin_id = ?').run(adminId)
  return buscarPorId(adminId, db)
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

  db.prepare(
    'UPDATE admin_usuarios SET senha_hash = ?, precisa_trocar_senha = 0 WHERE admin_id = ?',
  ).run(await gerarHash(senhaNova), adminId)
  return { ok: true }
}

/**
 * Desativa, não apaga: a auditoria precisa continuar podendo nomear o autor de
 * ações passadas.
 *
 * As duas guardas são de SERVIDOR, não de interface. Esconder o botão não basta:
 * sem administrador ativo não há quem crie o próximo, e a única saída seria
 * recriar o banco.
 */
export function desativarConta(adminId, { porAdminId = null } = {}, db = getDb()) {
  const conta = buscarPorId(adminId, db)
  if (!conta) return { ok: false, erro: 'conta não encontrada' }

  if (porAdminId !== null && Number(porAdminId) === Number(adminId)) {
    return { ok: false, erro: 'Você não pode desativar a própria conta.' }
  }

  if (conta.ativo && contarAtivos(db) <= 1) {
    return { ok: false, erro: 'Esta é a última conta ativa. Desativá-la trancaria todo mundo para fora.' }
  }

  db.prepare('UPDATE admin_usuarios SET ativo = 0 WHERE admin_id = ?').run(adminId)
  return { ok: true, conta: buscarPorId(adminId, db) }
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
