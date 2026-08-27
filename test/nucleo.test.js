import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

import { abrirDb, closeDb } from '../src/db/db.js'
import { migrar } from '../src/db/migracoes.js'
import * as repo from '../src/db/userRepo.js'
import { listarInteracoes } from '../src/db/interactionLog.js'
import { processarMensagem } from '../src/conversa/nucleo.js'
import { ESTADOS } from '../src/anamnese/questions.js'
import { CANAIS, SEM_INFORMACAO, TIPOS_INTERACAO } from '../src/constants.js'

/**
 * O núcleo de conversa exercitado SEM NENHUM CANAL.
 *
 * Nada do Baileys aparece aqui: não há número de WhatsApp no caminho, não há
 * objeto de mensagem de biblioteca nenhuma. Só um participante, um texto, um
 * canal e uma função de envio — que é a definição da fronteira que a extração
 * criou. Se um dia algum destes testes precisar importar algo de
 * `src/whatsapp/`, a fronteira vazou.
 */

let dir, db
const NUMERO = '+5511977776666'

let respostas = []
/** A função de envio que o núcleo recebe: sem endereço, sem transporte. */
const responder = async (texto) => {
  respostas.push(texto)
}

const llmFalso = async () => 'resposta do modelo'

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-nucleo-'))
  db = abrirDb(join(dir, 'nucleo.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM historico_interacoes; DELETE FROM remedios; DELETE FROM usuarios;')
  respostas = []
})

/** Participante em um estado de anamnese qualquer, sem passar por canal nenhum. */
function participante(estado = ESTADOS.CONCLUIDO) {
  const u = repo.findOrCreate(NUMERO, db)
  repo.setAnamneseEstado(u.usuario_id, estado, db)
  return repo.findById(u.usuario_id, db)
}

const processar = (usuario, texto, canal = CANAIS.WEB, deps = {}) =>
  processarMensagem({ usuario, texto, canal, responder }, { db, chamar: llmFalso, ...deps })

// =============================================================================

describe('núcleo: anamnese sem canal', () => {
  test('processa um passo de anamnese e responde pela função recebida', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    const r = await processar(u, 'começar as coisas trava tudo, fico paralisado')

    assert.equal(r.acao, 'anamnese')
    assert.equal(r.estadoAnterior, ESTADOS.O_QUE_TRAVA)
    assert.equal(r.estadoAtual, ESTADOS.ROTINA)
    assert.ok(respostas.length >= 1, 'a resposta saiu pela função injetada')
    assert.equal(
      repo.findById(u.usuario_id, db).o_que_trava,
      'começar as coisas trava tudo, fico paralisado',
    )
  })

  test('a resposta não passa por nenhum endereço', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    await processar(u, 'barulho constante')

    // `responder` recebe só o texto. Um núcleo que ainda soubesse de telefone
    // precisaria de dois argumentos aqui.
    assert.ok(respostas.every((r) => typeof r === 'string'))
  })

  test('grava o canal na interação da anamnese', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    await processar(u, 'não consigo começar')

    const linhas = listarInteracoes(u.usuario_id, db)
    assert.ok(linhas.length >= 1)
    assert.ok(linhas.every((l) => l.canal === CANAIS.WEB))
  })
})

describe('núcleo: conversa livre sem canal', () => {
  test('classifica, chama o LLM e devolve a resposta pela função recebida', async () => {
    const u = participante()

    const r = await processar(u, 'hoje foi corrido, não parei')

    assert.equal(r.acao, TIPOS_INTERACAO.DESPEJO_ESPONTANEO)
    assert.equal(r.respondeu, true)
    assert.deepEqual(respostas, ['resposta do modelo'])
  })

  test('falha do LLM não derruba o processamento nem envia nada', async () => {
    const u = participante()

    const r = await processar(u, 'oi', CANAIS.WEB, {
      chamar: async () => {
        throw new Error('provedor fora')
      },
    })

    assert.equal(r.respondeu, false)
    assert.equal(respostas.length, 0)
  })

  test('o texto do participante chega ao LLM como está', async () => {
    const u = participante()
    let recebido = null

    await processar(u, 'preciso lembrar de ligar pro médico', CANAIS.WEB, {
      chamar: async ({ mensagens }) => {
        recebido = mensagens[0].content
        return 'ok'
      },
    })

    assert.equal(recebido, 'preciso lembrar de ligar pro médico')
  })
})

describe('núcleo: o canal é dado, não decisão', () => {
  test('a mesma mensagem no mesmo estado decide igual nos dois canais', async () => {
    const u1 = participante(ESTADOS.SINAL_DE_ALERTA)
    const pelaWeb = await processar(u1, 'começo a roer a unha e a perna balança')
    const respostasWeb = [...respostas]

    db.exec('DELETE FROM historico_interacoes; DELETE FROM usuarios;')
    respostas = []

    const u2 = participante(ESTADOS.SINAL_DE_ALERTA)
    const peloWhatsapp = await processar(u2, 'começo a roer a unha e a perna balança', CANAIS.WHATSAPP)

    assert.equal(pelaWeb.acao, peloWhatsapp.acao)
    assert.equal(pelaWeb.estadoAtual, peloWhatsapp.estadoAtual)
    assert.deepEqual(respostasWeb, respostas)
  })

  test('anamnese começada num canal continua no outro, de onde parou', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    await processar(u, 'transição entre tarefas', CANAIS.WHATSAPP)
    const meio = repo.findById(u.usuario_id, db)
    const r = await processar(meio, 'de manhã rende, à noite não', CANAIS.WEB)

    assert.equal(r.estadoAnterior, ESTADOS.ROTINA, 'continuou de onde parou')
    assert.equal(r.estadoAtual, ESTADOS.GATILHOS_DE_SOBRECARGA)

    const canais = listarInteracoes(u.usuario_id, db).map((l) => l.canal)
    assert.ok(canais.includes(CANAIS.WHATSAPP) && canais.includes(CANAIS.WEB))
  })

  test('canal desconhecido é recusado antes do banco', async () => {
    const u = participante()

    await assert.rejects(
      () => processarMensagem({ usuario: u, texto: 'oi', canal: 'telegram', responder }, { db }),
      /Canal desconhecido/,
    )
    assert.equal(listarInteracoes(u.usuario_id, db).length, 0, 'nada foi gravado')
  })
})

describe('núcleo: fronteira com os canais', () => {
  test('não importa nada de um canal específico', () => {
    const fonte = readFileSync(new URL('../src/conversa/nucleo.js', import.meta.url), 'utf8')

    const imports = [...fonte.matchAll(/^import .*? from '(.+?)'$/gm)].map((m) => m[1])

    for (const alvo of imports) {
      assert.ok(!alvo.includes('/whatsapp/'), `o núcleo importou um canal: ${alvo}`)
      assert.ok(!alvo.includes('/web/'), `o núcleo importou um canal: ${alvo}`)
      assert.ok(!alvo.includes('baileys'), `o núcleo importou a biblioteca do WhatsApp: ${alvo}`)
    }
  })

  test('o adaptador do WhatsApp não reimplementa decisão do núcleo', () => {
    const fonte = readFileSync(new URL('../src/whatsapp/handler.js', import.meta.url), 'utf8')

    assert.match(fonte, /processarMensagem/, 'o adaptador precisa delegar ao núcleo')
    assert.ok(!fonte.includes('classificarMensagem'), 'classificação é do núcleo')
    assert.ok(!fonte.includes('montarSystemPrompt'), 'montagem de prompt é do núcleo')
    assert.ok(!fonte.includes('processarResposta'), 'máquina de estados é do núcleo')
  })
})

describe('migração de banco existente', () => {
  /** Cria um banco com o schema ANTERIOR a esta mudança, direto do git. */
  function bancoAntigo(nome) {
    const caminho = join(dir, nome)
    const antigo = new Database(caminho)
    antigo.exec(`
      CREATE TABLE usuarios (
        usuario_id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_whatsapp TEXT NOT NULL UNIQUE,
        anamnese_estado INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE historico_interacoes (
        interacao_id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        texto TEXT,
        gatilho_relacionado TEXT
      );
      INSERT INTO usuarios (numero_whatsapp) VALUES ('+5511900000000');
      INSERT INTO historico_interacoes (usuario_id, tipo, timestamp, texto)
        VALUES (1, 'anamnese', '2026-01-01T00:00:00Z', 'resposta antiga');
    `)
    return { caminho, antigo }
  }

  test('banco antigo ganha as colunas com os dados preservados', () => {
    const { caminho, antigo } = bancoAntigo('antigo.sqlite')

    const aplicadas = migrar(antigo)

    // O rótulo da migração de CHECK muda a cada valor novo na lista de tipos;
    // o que precisa ser estável é o CONJUNTO de alterações aplicadas.
    assert.deepEqual(aplicadas.slice(0, 2), [
      'usuarios.data_nascimento',
      'historico_interacoes.canal',
    ])
    assert.equal(aplicadas.length, 3)
    assert.match(aplicadas[2], /^historico_interacoes\.tipo /)
    assert.equal(antigo.prepare('SELECT COUNT(*) n FROM historico_interacoes').get().n, 1)

    const linha = antigo.prepare('SELECT * FROM historico_interacoes').get()
    assert.equal(linha.texto, 'resposta antiga', 'o dado anterior continua lá')
    assert.equal(linha.canal, CANAIS.WHATSAPP, 'linha antiga vale como WhatsApp')
    assert.equal(antigo.prepare('SELECT data_nascimento FROM usuarios').get().data_nascimento, null)

    antigo.close()
    rmSync(caminho, { force: true })
  })

  test('rodar de novo não faz nada', () => {
    const { caminho, antigo } = bancoAntigo('idempotente.sqlite')

    migrar(antigo)
    assert.deepEqual(migrar(antigo), [], 'a segunda passada não altera nada')

    antigo.close()
    rmSync(caminho, { force: true })
  })

  test('o CHECK do canal vale depois da migração', () => {
    const { caminho, antigo } = bancoAntigo('check.sqlite')
    migrar(antigo)

    assert.throws(() =>
      antigo
        .prepare(
          `INSERT INTO historico_interacoes (usuario_id, tipo, timestamp, canal)
                VALUES (1, 'anamnese', '2026-01-01T00:00:00Z', 'telegram')`,
        )
        .run(),
    )

    antigo.close()
    rmSync(caminho, { force: true })
  })
})

// =============================================================================
// Os quatro defeitos da primeira sessão real do piloto (26/08).
// =============================================================================

describe('o histórico guarda os dois lados', () => {
  test('a resposta do sistema fica registrada, com canal', async () => {
    const u = participante()

    await processar(u, 'oi')

    const enviadas = listarInteracoes(u.usuario_id, db).filter(
      (l) => l.tipo === TIPOS_INTERACAO.MENSAGEM_ENVIADA,
    )
    assert.equal(enviadas.length, 1)
    assert.equal(enviadas[0].texto, 'resposta do modelo')
    assert.equal(enviadas[0].canal, CANAIS.WEB)
  })

  test('a pergunta da anamnese também fica registrada', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    await processar(u, 'começar as coisas')

    const enviadas = listarInteracoes(u.usuario_id, db)
      .filter((l) => l.tipo === TIPOS_INTERACAO.MENSAGEM_ENVIADA)
      .map((l) => l.texto)
    assert.equal(enviadas.length, 1)
    assert.match(enviadas[0], /rotina/i, 'a pergunta seguinte foi registrada')
  })

  test('envio que falha não deixa registro', async () => {
    const u = participante()
    const responderQuebrado = async () => {
      throw new Error('conexão caiu')
    }

    await assert.rejects(() =>
      processarMensagem(
        { usuario: u, texto: 'oi', canal: CANAIS.WHATSAPP, responder: responderQuebrado },
        { db, chamar: llmFalso },
      ),
    )

    const enviadas = listarInteracoes(u.usuario_id, db).filter(
      (l) => l.tipo === TIPOS_INTERACAO.MENSAGEM_ENVIADA,
    )
    assert.equal(enviadas.length, 0, 'mensagem que não chegou não vira histórico')
  })

  test('os dois lados ficam na ordem', async () => {
    const u = participante()

    await processar(u, 'hoje foi pesado')

    const tipos = listarInteracoes(u.usuario_id, db).map((l) => l.tipo)
    assert.deepEqual(tipos, [TIPOS_INTERACAO.DESPEJO_ESPONTANEO, TIPOS_INTERACAO.MENSAGEM_ENVIADA])
  })
})

describe('remédio dito na conversa livre', () => {
  /** Extrator falso: devolve o que o teste mandar, sem rede. */
  const extratorQueDevolve = (...itens) => async () => itens

  test('horário explícito é gravado, com gatilho, e confirmado na resposta', async () => {
    const u = participante()
    repo.adicionarRemedio(u.usuario_id, 'Bup', SEM_INFORMACAO, db)

    await processar(u, 'considere 23 horas pro bup', CANAIS.WEB, {
      extrair: extratorQueDevolve({ nome: 'Bup', horario: '23:00' }),
    })

    const remedios = repo.listarRemedios(u.usuario_id, db)
    assert.equal(remedios.length, 1, 'atualizou, não duplicou')
    assert.equal(remedios[0].horario, '23:00')

    const gatilho = repo
      .listarGatilhosUsuario(u.usuario_id, db)
      .find((g) => g.remedio_id === remedios[0].remedio_id)
    assert.ok(gatilho, 'o lembrete que ela pediu passou a existir')
    assert.equal(gatilho.horario, '23:00')
    assert.equal(gatilho.ativo, 1)

    const confirmacao = respostas.at(-1)
    assert.match(confirmacao, /Anotei/)
    assert.match(confirmacao, /Bup/)
    assert.match(confirmacao, /23:00/)
  })

  test('a confirmação também entra no histórico', async () => {
    const u = participante()

    await processar(u, 'tomo rivotril às 22:00', CANAIS.WEB, {
      extrair: extratorQueDevolve({ nome: 'Rivotril', horario: '22:00' }),
    })

    const enviadas = listarInteracoes(u.usuario_id, db)
      .filter((l) => l.tipo === TIPOS_INTERACAO.MENSAGEM_ENVIADA)
      .map((l) => l.texto)
    assert.ok(enviadas.some((t) => /Anotei/.test(t) && /22:00/.test(t)))
  })

  test('menção sem horário não grava nada', async () => {
    const u = participante()

    await processar(u, 'tomei o remédio hoje de manhã', CANAIS.WEB, {
      extrair: extratorQueDevolve({ nome: 'Bup', horario: SEM_INFORMACAO }),
    })

    assert.equal(repo.listarRemedios(u.usuario_id, db).length, 0)
    assert.ok(!respostas.some((r) => /Anotei/.test(r)), 'e não promete o que não fez')
  })

  test('texto sem indício de remédio não chama o extrator', async () => {
    const u = participante()
    let chamou = false

    await processar(u, 'me conte algo', CANAIS.WEB, {
      extrair: async () => {
        chamou = true
        return []
      },
    })

    assert.equal(chamou, false, 'não gasta chamada de LLM à toa')
  })

  test('falha do extrator não impede a resposta', async () => {
    const u = participante()

    const r = await processar(u, 'tomo bup às 8:00', CANAIS.WEB, {
      extrair: async () => {
        throw new Error('provedor fora')
      },
    })

    assert.equal(r.respondeu, true)
    assert.deepEqual(respostas, ['resposta do modelo'])
    assert.equal(repo.listarRemedios(u.usuario_id, db).length, 0)
  })

  test('nome com grafia diferente atualiza o mesmo remédio', async () => {
    const u = participante()
    repo.adicionarRemedio(u.usuario_id, 'Bup', '08:00', db)

    await processar(u, 'na verdade o BUP é às 23:00', CANAIS.WEB, {
      extrair: extratorQueDevolve({ nome: 'BUP', horario: '23:00' }),
    })

    const remedios = repo.listarRemedios(u.usuario_id, db)
    assert.equal(remedios.length, 1)
    assert.equal(remedios[0].horario, '23:00')
  })

  test('durante a anamnese este caminho não roda', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)
    let chamou = false

    await processar(u, 'tomo bup às 23:00', CANAIS.WEB, {
      extrair: async () => {
        chamou = true
        return [{ nome: 'Bup', horario: '23:00' }]
      },
    })

    assert.equal(chamou, false, 'no estado 2 isso é resposta de anamnese, não remédio')
    assert.equal(repo.listarRemedios(u.usuario_id, db).length, 0)
  })
})
