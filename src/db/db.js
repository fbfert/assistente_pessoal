import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

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
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'))

  instancia = db
  caminhoAberto = caminho
  return db
}

export function closeDb() {
  if (!instancia) return
  instancia.close()
  instancia = null
  caminhoAberto = null
}
