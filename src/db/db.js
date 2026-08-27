import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { migrar } from './migracoes.js'
import { semearBase } from '../conhecimento/tecnicasRepo.js'
import { atualizarSeedsNaoEditados } from './conteudoRepo.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(AQUI, 'schema.sql')

let instancia = null
let caminhoAberto = null

/**
 * Conexão singleton com o SQLite.
 *
 * Se já houver conexão aberta, devolve ELA — nunca reabre em outro caminho.
 * O default de `config.db.path` só vale para a primeira abertura.
 *
 * Isso não é detalhe: uma versão anterior aceitava `getDb(caminho = config.db.path)`
 * e reabria quando o caminho divergia. Qualquer módulo que chamasse `getDb()`
 * sem argumento fechava, por baixo dos panos, o banco que outro módulo estava
 * usando. Para abrir explicitamente em outro arquivo (testes), use `abrirDb`.
 */
export function getDb() {
  return instancia ?? abrirDb(config.db.path)
}

/**
 * Abre (ou reabre) a conexão em um caminho específico.
 *
 * WAL porque o bot e o dashboard leem o mesmo arquivo ao mesmo tempo.
 * foreign_keys=on porque o SQLite deixa desligado por padrão, e sem isso as
 * FKs do schema seriam decorativas.
 */
export function abrirDb(caminho = config.db.path) {
  if (instancia && caminhoAberto === caminho) return instancia
  if (instancia) closeDb()

  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true })

  const db = new Database(caminho)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Dois processos escrevem neste arquivo: o bot e o admin. O WAL suporta o
  // caso, mas sem tempo de espera uma colisao vira SQLITE_BUSY imediato em vez
  // de uma pausa de milissegundos.
  db.pragma('busy_timeout = 5000')
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'))

  // O schema cria o que falta; a migração ajusta o que já existe. Coluna nova em
  // tabela existente só entra por aqui — ver migracoes.js.
  migrar(db)

  // Semente da base de técnicas: os sete temas e os exemplos em rascunho.
  // Idempotente e sem sobrescrever — quem editar as palavras-gatilho não perde
  // o trabalho na próxima subida do container. Nada aqui entra publicado.
  semearBase(db)

  // A instância é publicada ANTES do próximo passo: ele lê conteúdo versionado,
  // e um `getDb()` re-entrante aqui reabriria o banco no meio da abertura.
  instancia = db
  caminhoAberto = caminho

  // Conteúdo de fábrica que mudou no código alcança o banco JÁ SEMEADO — mas só
  // onde o operador nunca escreveu. Sem isto, uma regra nova do núcleo fixo
  // ficaria no repositório e nunca na conversa.
  atualizarSeedsNaoEditados(db)

  return db
}

export function closeDb() {
  if (!instancia) return
  instancia.close()
  instancia = null
  caminhoAberto = null
}
