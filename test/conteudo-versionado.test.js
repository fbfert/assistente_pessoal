import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import * as conteudo from '../src/db/conteudoRepo.js'
import { NUCLEO_FIXO, VARIANTES, montarSystemPrompt } from '../src/llm/prompts.js'
import { montarMensagemGatilho, TEXTO_CHECKIN_MANHA } from '../src/triggers/messages.js'
import { perguntaDoEstado, textoDeConsentimento } from '../src/anamnese/stateMachine.js'
import { ESTADOS, PERGUNTAS, TEXTO_CONSENTIMENTO } from '../src/anamnese/questions.js'
import { TIPOS_GATILHO } from '../src/constants.js'

/**
 * Conteúdo versionado: o texto do produto sai do código e vira editável, sem que
 * o dia zero mude nada.
 */

let dir, db
const REFORCADA = { confirmacao: conteudo.PALAVRA_DE_CONFIRMACAO }

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-conteudo-'))
  db = abrirDb(join(dir, 'conteudo.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM prompts_versionados; DELETE FROM prompts_historico;')
  conteudo.invalidar()
})

describe('o dia zero não muda nada', () => {
  test('a semente é idêntica ao que já está no código', () => {
    assert.equal(conteudo.ler('nucleo_fixo', db), NUCLEO_FIXO)
    assert.equal(conteudo.ler('variante_direto', db), VARIANTES.direto)
    assert.equal(conteudo.ler('texto_consentimento', db), TEXTO_CONSENTIMENTO)
    assert.equal(conteudo.ler('mensagem_checkin_manha', db), TEXTO_CHECKIN_MANHA)
    assert.equal(conteudo.ler('pergunta_nome', db), PERGUNTAS[ESTADOS.NOME].texto)
  })

  test('o system prompt montado é o mesmo de antes', () => {
    const prompt = montarSystemPrompt({ personalidade: 'direto' }, [])

    assert.ok(prompt.includes(NUCLEO_FIXO))
    assert.ok(prompt.includes(VARIANTES.direto))
  })

  test('a mensagem de gatilho é a mesma de antes', () => {
    assert.equal(montarMensagemGatilho(TIPOS_GATILHO.CHECKIN_MANHA), TEXTO_CHECKIN_MANHA)
    assert.equal(
      montarMensagemGatilho(TIPOS_GATILHO.REMEDIO, { nomeRemedio: 'Ritalina' }),
      'Hora do Ritalina.',
    )
  })

  test('a pergunta da anamnese é a mesma de antes', () => {
    assert.equal(perguntaDoEstado(ESTADOS.O_QUE_TRAVA), PERGUNTAS[ESTADOS.O_QUE_TRAVA].texto)
  })

  test('a primeira leitura semeia a chave no banco', () => {
    assert.equal(db.prepare('SELECT COUNT(*) n FROM prompts_versionados').get().n, 0)

    conteudo.ler('variante_neutro', db)

    assert.equal(
      db.prepare("SELECT conteudo FROM prompts_versionados WHERE chave='variante_neutro'").get()
        .conteudo,
      VARIANTES.neutro,
    )
  })
})

describe('a edição alcança o bot', () => {
  test('trocar a variante muda o system prompt', () => {
    conteudo.escrever('variante_direto', 'PERSONALIDADE: DIRETO. Texto novo de teste.', {}, db)

    const prompt = montarSystemPrompt({ personalidade: 'direto' }, [])

    assert.ok(prompt.includes('Texto novo de teste'))
    assert.ok(!prompt.includes(VARIANTES.direto))
  })

  test('trocar a mensagem do gatilho muda o disparo', () => {
    conteudo.escrever('mensagem_checkin_manha', 'Oi. Como foi a noite?', {}, db)

    assert.equal(montarMensagemGatilho(TIPOS_GATILHO.CHECKIN_MANHA), 'Oi. Como foi a noite?')
  })

  test('a forma REDUZIDA é uma chave própria', () => {
    conteudo.escrever('mensagem_checkin_manha_reduzido', 'Bom dia.', {}, db)

    assert.equal(montarMensagemGatilho(TIPOS_GATILHO.CHECKIN_MANHA, { reduzido: true }), 'Bom dia.')
    assert.equal(montarMensagemGatilho(TIPOS_GATILHO.CHECKIN_MANHA), TEXTO_CHECKIN_MANHA)
  })

  test('trocar a pergunta alcança a anamnese', () => {
    conteudo.escrever('pergunta_pessoas_chave', 'Quem é tua referência?', {}, db)

    assert.equal(perguntaDoEstado(ESTADOS.PESSOAS_CHAVE), 'Quem é tua referência?')
  })

  test('trocar o consentimento alcança o texto enviado', () => {
    conteudo.escrever('texto_consentimento', 'Texto novo de consentimento, bem curto.', {}, db)

    assert.equal(textoDeConsentimento(), 'Texto novo de consentimento, bem curto.')
  })
})

describe('confirmação reforçada do núcleo fixo', () => {
  test('sem a palavra, a gravação é recusada e o núcleo não muda', () => {
    assert.throws(() => conteudo.escrever('nucleo_fixo', 'qualquer coisa', {}, db), /reforçada/)
    assert.throws(
      () => conteudo.escrever('nucleo_fixo', 'qualquer coisa', { confirmacao: 'sim' }, db),
      /reforçada/,
    )

    assert.equal(conteudo.ler('nucleo_fixo', db), NUCLEO_FIXO)
  })

  test('com a palavra, grava', () => {
    conteudo.escrever('nucleo_fixo', 'Núcleo de teste com regras.', REFORCADA, db)

    assert.equal(conteudo.ler('nucleo_fixo', db), 'Núcleo de teste com regras.')
  })

  test('a exigência vive no repositório, não na tela', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(new URL('../src/db/conteudoRepo.js', import.meta.url), 'utf8')

    // Guarda só de interface é contornável por qualquer caminho novo.
    assert.match(fonte, /reforcada/)
    assert.match(fonte, /PALAVRA_DE_CONFIRMACAO/)
  })

  test('as outras chaves NÃO exigem a palavra', () => {
    conteudo.escrever('variante_neutro', 'Texto neutro novo.', {}, db)
    assert.equal(conteudo.ler('variante_neutro', db), 'Texto neutro novo.')
  })

  test('núcleo vazio é recusado mesmo com a palavra certa', () => {
    assert.throws(() => conteudo.escrever('nucleo_fixo', '   ', REFORCADA, db), /vazio/)
    assert.equal(conteudo.ler('nucleo_fixo', db), NUCLEO_FIXO)
  })
})

describe('validação de conteúdo', () => {
  test('a mensagem de remédio não pode perder o marcador', () => {
    assert.throws(
      () => conteudo.escrever('mensagem_remedio', 'Está na hora do seu remédio.', {}, db),
      /\{remedio\}/,
    )

    // Sem o marcador, o lembrete deixaria de dizer QUAL remédio é.
    assert.equal(
      montarMensagemGatilho(TIPOS_GATILHO.REMEDIO, { nomeRemedio: 'Bup' }),
      'Hora do Bup.',
    )
  })

  test('com o marcador, grava e interpola', () => {
    conteudo.escrever('mensagem_remedio', 'Ei — {remedio} agora.', {}, db)

    assert.equal(
      montarMensagemGatilho(TIPOS_GATILHO.REMEDIO, { nomeRemedio: 'Bup' }),
      'Ei — Bup agora.',
    )
  })

  test('chave desconhecida é recusada', () => {
    assert.throws(() => conteudo.escrever('inventada', 'x', {}, db), /desconhecida/)
    assert.throws(() => conteudo.ler('inventada', db), /desconhecida/)
  })
})

describe('histórico, reversão e padrão de fábrica', () => {
  test('a edição guarda o conteúdo anterior', () => {
    conteudo.escrever('variante_neutro', 'Primeira edição.', {}, db)

    const h = conteudo.historico('variante_neutro', 10, db)
    assert.equal(h.length, 1)
    assert.equal(h[0].conteudo_antigo, VARIANTES.neutro)
  })

  test('reverter restaura e acrescenta ao histórico', () => {
    conteudo.escrever('variante_neutro', 'Primeira.', {}, db)
    conteudo.escrever('variante_neutro', 'Segunda.', {}, db)

    const h = conteudo.historico('variante_neutro', 10, db)
    conteudo.reverter(h[0].historico_id, {}, db)

    assert.equal(conteudo.ler('variante_neutro', db), 'Primeira.')
    assert.equal(conteudo.historico('variante_neutro', 10, db).length, 3)
  })

  test('reverter o núcleo fixo também exige a palavra', () => {
    conteudo.escrever('nucleo_fixo', 'Núcleo A.', REFORCADA, db)
    const h = conteudo.historico('nucleo_fixo', 10, db)

    assert.throws(() => conteudo.reverter(h[0].historico_id, {}, db), /reforçada/)
  })

  test('restaurar padrão volta à CONSTANTE, não à linha mais antiga', () => {
    conteudo.escrever('variante_neutro', 'Editada uma vez.', {}, db)
    conteudo.escrever('variante_neutro', 'Editada duas vezes.', {}, db)

    conteudo.restaurarPadrao('variante_neutro', {}, db)

    assert.equal(conteudo.ler('variante_neutro', db), VARIANTES.neutro)
  })

  test('listarTudo mostra o que foi editado', () => {
    conteudo.escrever('variante_caloroso', 'Outro texto.', {}, db)
    const tudo = conteudo.listarTudo(db)

    assert.equal(tudo.find((c) => c.chave === 'variante_caloroso').editado, true)
    assert.equal(tudo.find((c) => c.chave === 'variante_neutro').editado, false)
    assert.equal(tudo.find((c) => c.chave === 'nucleo_fixo').reforcada, true)
  })
})

describe('a segunda camada de segurança não é conteúdo editável', () => {
  test('nenhuma chave versionada aponta para a verificação determinística', () => {
    const chaves = Object.keys(conteudo.catalogo()).join(' ')

    for (const proibida of ['seguranca', 'bloqueio', 'verbos']) {
      assert.ok(!chaves.includes(proibida), `${proibida} não pode virar chave editável`)
    }
  })

  test('esvaziar a regra do núcleo NÃO derruba o bloqueio determinístico', async () => {
    const { instruiSobreMedicacao } = await import('../src/conversa/seguranca.js')

    // Núcleo sem qualquer menção a medicação — a primeira camada, apagada.
    conteudo.escrever('nucleo_fixo', 'Você é um assistente. Seja gentil.', REFORCADA, db)
    assert.ok(!montarSystemPrompt({ personalidade: 'neutro' }, []).includes('1c.'))

    // A segunda camada continua de pé, e ela não passa por prompts_versionados.
    assert.equal(
      instruiSobreMedicacao('Comece pelo Vortex agora, se ainda não tomou hoje.', [
        { nome: 'Vortex' },
      ]).bloqueia,
      true,
    )
  })
})
