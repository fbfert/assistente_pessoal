import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import { config } from '../src/config.js'
import * as repo from '../src/db/userRepo.js'
import { listarInteracoes } from '../src/db/interactionLog.js'
import { processarMensagem } from '../src/conversa/nucleo.js'
import { instruiSobreMedicacao } from '../src/conversa/seguranca.js'
import { tratarMensagemRecebida } from '../src/whatsapp/handler.js'
import { criarAppWeb } from '../src/web/servidor.js'
import { convidarPiloto } from '../src/admin/convidarPiloto.js'
import { montarSystemPrompt, NUCLEO_FIXO, VARIANTES } from '../src/llm/prompts.js'
import { ESTADOS } from '../src/anamnese/questions.js'
import { CANAIS, RESPOSTA_SEGURA_MEDICACAO, SEM_INFORMACAO, TIPOS_INTERACAO } from '../src/constants.js'

/**
 * O assistente não instrui sobre medicação.
 *
 * O cenário destes testes é o do piloto real: remédio cadastrado com nome e SEM
 * horário, mensagem neutra no chat livre, e o modelo devolvendo uma instrução de
 * tomar. Antes desta mudança, o texto chegava íntegro na pessoa.
 */

let dir, db, servidor, base
const NUMERO = '+5511900001234'
const NASCIMENTO = '1990-04-23'

let respostas = []
const responder = async (t) => {
  respostas.push(t)
}

/** A resposta que o modelo devolveu na reprodução do defeito. */
const RESPOSTA_PERIGOSA =
  'Comece pelo Vortex agora, se ainda não tomou hoje. Depois é só seguir o resto do dia.'
const RESPOSTA_SEGURA = 'Que tal escolher uma coisa pequena e começar por ela?'

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tars-seg-'))
  db = abrirDb(join(dir, 'seg.sqlite'))
  config.web.atrasoFalhaMs = 0

  servidor = criarAppWeb(db).listen(0)
  await new Promise((r) => servidor.once('listening', r))
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(async () => {
  await new Promise((r) => servidor.close(r))
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM sessoes_web; DELETE FROM historico_interacoes; DELETE FROM remedios; DELETE FROM usuarios;')
  respostas = []
})

/** O caso real: nome cadastrado, horário não. */
async function comRemedioCadastrado(nome = 'Vortex') {
  const u = await convidarPiloto(NUMERO, async () => {}, db, NASCIMENTO)
  repo.setAnamneseEstado(u.usuario_id, ESTADOS.CONCLUIDO, db)
  repo.adicionarRemedio(u.usuario_id, nome, SEM_INFORMACAO, db)
  return repo.findById(u.usuario_id, db)
}

const bloqueios = (usuarioId) =>
  listarInteracoes(usuarioId, db).filter(
    (l) => l.tipo === TIPOS_INTERACAO.RESPOSTA_BLOQUEADA_SEGURANCA,
  )

// =============================================================================

describe('Regra 1c no núcleo fixo', () => {
  test('está no prompt das três personalidades', () => {
    for (const personalidade of Object.keys(VARIANTES)) {
      const prompt = montarSystemPrompt({ personalidade }, [])
      assert.match(prompt, /1c\. Você NUNCA instrui/, personalidade)
      assert.match(prompt, /Decisão sobre remédio é dela e de quem a acompanha/, personalidade)
      assert.match(prompt, /essa decisão não é sua/, personalidade)
    }
  })

  test('a Regra 3 exclui medicação da "ação mínima"', () => {
    // É a combinação da 3 com o contexto da anamnese que produziu o defeito.
    assert.match(NUCLEO_FIXO, /TOMAR REMÉDIO NUNCA É UMA AÇÃO QUE VOCÊ SUGERE/)
  })
})

describe('detecção determinística', () => {
  const remedios = [{ nome: 'Vortex' }, { nome: 'Bup' }]

  test('nome cadastrado mais verbo de instrução, na mesma frase', () => {
    for (const texto of [
      RESPOSTA_PERIGOSA,
      'Não esqueça do Bup às 23h.',
      'Você já tomou o Vortex hoje?',
      'Talvez valha atrasar o Bup.',
      'Pode tomar o vortex agora.',
      'Continue tomando o Bup como está.',
      'Volte a tomar o Vortex à noite.',
    ]) {
      assert.equal(instruiSobreMedicacao(texto, remedios).bloqueia, true, texto)
    }
  })

  test('nome sem verbo, ou verbo em outra frase, passa', () => {
    for (const texto of [
      'Vejo que você tem Vortex cadastrado, sem horário.',
      // Caso REAL de produção: resposta a "o que já sabe sobre mim?". É descrição
      // do cadastro, não instrução — bloqueá-la quebrava um fluxo legítimo.
      'Você está tomando Vortex e Bup, mas não sei os horários ou doses.',
      'Você toma Vortex e Bup, pelo que me contou.',
      'O Vortex está no teu cadastro sem horário. Comece pela tarefa mais fácil.',
      RESPOSTA_SEGURA,
      'Hoje foi puxado mesmo. Quer me contar o que pesou?',
    ]) {
      assert.equal(instruiSobreMedicacao(texto, remedios).bloqueia, false, texto)
    }
  })

  test('quem não tem remédio cadastrado não é varrido', () => {
    assert.equal(instruiSobreMedicacao(RESPOSTA_PERIGOSA, []).bloqueia, false)
  })

  test('o sentinela de ausência não conta como nome de remédio', () => {
    const so_sentinela = [{ nome: SEM_INFORMACAO }]
    assert.equal(instruiSobreMedicacao('tome o sem informação agora', so_sentinela).bloqueia, false)
  })
})

describe('o cenário reproduzido, agora bloqueado', () => {
  test('a instrução NÃO chega na pessoa, e o texto recusado é registrado', async () => {
    const u = await comRemedioCadastrado()

    const r = await processarMensagem(
      { usuario: u, texto: 'to sem energia hoje', canal: CANAIS.WEB, responder },
      { db, chamar: async () => RESPOSTA_PERIGOSA },
    )

    assert.ok(!respostas.includes(RESPOSTA_PERIGOSA), 'a instrução vazou para a pessoa')
    assert.deepEqual(respostas, [RESPOSTA_SEGURA_MEDICACAO])
    assert.equal(r.bloqueada, true)

    const registradas = bloqueios(u.usuario_id)
    assert.equal(registradas.length, 1)
    assert.equal(registradas[0].texto, RESPOSTA_PERIGOSA, 'o texto recusado precisa ficar')
    assert.equal(registradas[0].canal, CANAIS.WEB)
  })

  test('resposta sem instrução passa normal, sem bloqueio', async () => {
    const u = await comRemedioCadastrado()

    await processarMensagem(
      { usuario: u, texto: 'to sem energia hoje', canal: CANAIS.WEB, responder },
      { db, chamar: async () => RESPOSTA_SEGURA },
    )

    assert.deepEqual(respostas, [RESPOSTA_SEGURA])
    assert.equal(bloqueios(u.usuario_id).length, 0)
  })

  test('a mensagem que a pessoa recebe não explica o bloqueio', async () => {
    const u = await comRemedioCadastrado()

    await processarMensagem(
      { usuario: u, texto: 'oi', canal: CANAIS.WEB, responder },
      { db, chamar: async () => RESPOSTA_PERIGOSA },
    )

    assert.ok(!/bloque/i.test(respostas[0]), 'não convida a insistir até passar')
    assert.ok(!respostas[0].includes('Vortex'))
  })
})

describe('o bloqueio vale nos dois adaptadores', () => {
  test('pelo WhatsApp', async () => {
    const u = await comRemedioCadastrado()
    const enviadas = []

    await tratarMensagemRecebida(
      { numero: NUMERO, texto: 'to sem energia' },
      async (_numero, texto) => enviadas.push(texto),
      { db, chamar: async () => RESPOSTA_PERIGOSA },
    )

    assert.deepEqual(enviadas, [RESPOSTA_SEGURA_MEDICACAO])
    assert.equal(bloqueios(u.usuario_id).length, 1)
    assert.equal(bloqueios(u.usuario_id)[0].canal, CANAIS.WHATSAPP)
  })

  test('pelo canal web, pela rota HTTP de verdade', async () => {
    const u = await comRemedioCadastrado()

    // A rota não injeta `chamar`: quem responde é o router. Interceptar o fetch
    // é o que permite exercitar o caminho HTTP inteiro sem rede.
    const provedor = config.llm.defaultProvider
    const chaveAntes = config.llm[provedor].apiKey
    config.llm[provedor].apiKey = 'chave-de-teste'
    const fetchOriginal = globalThis.fetch

    globalThis.fetch = async (url, opcoes) => {
      if (String(url).startsWith(base)) return fetchOriginal(url, opcoes)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: RESPOSTA_PERIGOSA } }],
          content: [{ type: 'text', text: RESPOSTA_PERIGOSA }],
        }),
      }
    }

    try {
      const entrada = await fetch(`${base}/web/entrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ telefone: NUMERO, dataNascimento: NASCIMENTO }),
      })
      const { token } = await entrada.json()

      const r = await fetch(`${base}/web/mensagem`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ texto: 'to sem energia' }),
      })
      const { respostas: devolvidas } = await r.json()

      assert.deepEqual(devolvidas, [RESPOSTA_SEGURA_MEDICACAO], 'a instrução vazou pela web')
      assert.equal(bloqueios(u.usuario_id).length, 1)
      assert.equal(bloqueios(u.usuario_id)[0].canal, CANAIS.WEB)
    } finally {
      globalThis.fetch = fetchOriginal
      config.llm[provedor].apiKey = chaveAntes
    }
  })

  test('nenhum adaptador reimplementa a verificação', () => {
    for (const caminho of ['../src/whatsapp/handler.js', '../src/web/servidor.js']) {
      const fonte = readFileSync(new URL(caminho, import.meta.url), 'utf8')
      assert.ok(
        !fonte.includes('instruiSobreMedicacao'),
        `${caminho} duplicou a verificação — ela é do núcleo`,
      )
    }
  })
})

describe('a anamnese não passa pela varredura', () => {
  test('texto constante do código não é bloqueado', async () => {
    const u = await convidarPiloto(NUMERO, async () => {}, db, NASCIMENTO)
    repo.setAnamneseEstado(u.usuario_id, ESTADOS.REMEDIO, db)
    repo.adicionarRemedio(u.usuario_id, 'Vortex', SEM_INFORMACAO, db)

    await processarMensagem(
      { usuario: repo.findById(u.usuario_id, db), texto: 'não tomo nada', canal: CANAIS.WEB, responder },
      { db, extrair: async () => [] },
    )

    assert.equal(bloqueios(u.usuario_id).length, 0)
    assert.ok(respostas.length >= 1, 'a anamnese seguiu normalmente')
  })
})
