import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import * as repo from '../src/db/userRepo.js'
import { listarInteracoes, ultimoGatilhoDisparado } from '../src/db/interactionLog.js'
import { convidarPiloto } from '../src/admin/convidarPiloto.js'
import { tratarMensagemRecebida } from '../src/whatsapp/handler.js'
import { ESTADOS, TEXTO_CONSENTIMENTO } from '../src/anamnese/questions.js'
import {
  SEM_INFORMACAO,
  TIPOS_GATILHO,
  TIPOS_INTERACAO,
  HORARIO_PADRAO_CHECKIN,
} from '../src/constants.js'

// Integração real: SQLite de verdade, handler de verdade, máquina de estados de
// verdade. Só o WhatsApp e o LLM são substituídos — não há número nem chave.
let dir
let db
const NUMERO = '+5511988887777'

let enviadas = []
const enviarMensagem = async (numero, texto) => {
  enviadas.push({ numero, texto })
}

/** Manda uma mensagem do usuário para o handler, com o banco de teste injetado. */
const receber = (texto, deps = {}) =>
  tratarMensagemRecebida({ numero: NUMERO, texto }, enviarMensagem, { db, ...deps })

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-integ-'))
  db = abrirDb(join(dir, 'integ.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM historico_interacoes; DELETE FROM contadores; DELETE FROM despejos_semana;')
  db.exec('DELETE FROM gatilhos_configurados; DELETE FROM remedios; DELETE FROM usuarios;')
  enviadas = []
})

const usuarioAtual = () => repo.findByWhatsapp(NUMERO, db)

describe('onboarding proativo + anamnese completa (ponta a ponta)', () => {
  test('do convite até CONCLUIDO, com gatilhos ativados', async () => {
    // ---- Passo 0: o BOT fala primeiro. Não pular este passo é o ponto do teste:
    // é o que garante que ele reflita o fluxo real, e não o reativo.
    const convidado = await convidarPiloto(NUMERO, enviarMensagem, db)

    assert.equal(convidado.anamnese_estado, ESTADOS.CONSENTIMENTO)
    assert.equal(enviadas.length, 1)
    assert.equal(enviadas[0].texto, TEXTO_CONSENTIMENTO)

    // ---- A primeira mensagem da pessoa JÁ é a resposta ao consentimento.
    await receber('sim')
    assert.equal(usuarioAtual().consentimento_aceito, 1)
    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.NOME)

    await receber('Ana')
    assert.equal(usuarioAtual().nome, 'Ana')
    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.O_QUE_TRAVA)

    await receber('começar tarefa longa, principalmente as chatas')
    await receber('rendo bem das 14h às 18h; de manhã é péssimo')
    await receber('barulho e reunião sem pauta')
    await receber('começo a reler a mesma frase várias vezes')

    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.REMEDIO)

    // Sem chave de API: a pessoa diz que não toma, e o LLM nem é chamado.
    await receber('não tenho', {
      extrair: async () => {
        throw new Error('LLM não deveria ser chamado quando a pessoa diz que não toma')
      },
    })
    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.PESSOAS_CHAVE)

    await receber('minha irmã Bea')
    await receber('chamo tarefa chata de "monstro"')
    await receber('nunca me mande áudio, e nunca use emoji')

    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.PERSONALIDADE)

    await receber('1')
    assert.equal(usuarioAtual().personalidade, 'direto')
    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.RESUMO)

    // O resumo foi enviado e cita o que foi coletado.
    const resumo = enviadas.at(-1).texto
    assert.match(resumo, /Ana/)
    assert.match(resumo, /monstro/)
    assert.match(resumo, new RegExp(`Remédio: ${SEM_INFORMACAO}`))

    await receber('sim')

    // ---- Verificações finais
    const u = usuarioAtual()
    assert.equal(u.anamnese_estado, ESTADOS.CONCLUIDO, 'anamnese precisa terminar em CONCLUIDO')

    const gatilhos = repo.listarGatilhosUsuario(u.usuario_id, db)
    const checkin = gatilhos.find((g) => g.tipo === TIPOS_GATILHO.CHECKIN_MANHA)
    assert.ok(checkin, 'checkin_manha precisa existir')
    assert.equal(checkin.horario, HORARIO_PADRAO_CHECKIN)
    assert.equal(checkin.ativo, 1)

    const checklist = gatilhos.find((g) => g.tipo === TIPOS_GATILHO.CHECKLIST_FIM_DIA)
    assert.equal(checklist.ativo, 0, 'checklist_fim_dia nasce desligado')

    assert.equal(
      gatilhos.filter((g) => g.tipo === TIPOS_GATILHO.REMEDIO).length,
      0,
      'quem disse "não tenho" não ganha gatilho de remédio',
    )

    // Contagem de mensagens trocadas:
    // 1 convite + 11 respostas do bot (uma por resposta da pessoa) + 1 resumo.
    // A pessoa mandou 12 mensagens; o estado 10 responde com o resumo, não com
    // uma pergunta, por isso o total de envios é 13.
    assert.equal(enviadas.length, 13, `esperava 13 envios, veio ${enviadas.length}`)

    // Nenhuma correção reportada nesse caminho feliz.
    const correcoes = listarInteracoes(u.usuario_id, db).filter(
      (i) => i.tipo === TIPOS_INTERACAO.CORRECAO_REPORTADA,
    )
    assert.equal(correcoes.length, 0)
  })

  test('remédio completo vira gatilho no horário informado', async () => {
    await convidarPiloto(NUMERO, enviarMensagem, db)
    await receber('sim')
    await receber('Bruno')
    await receber('esquecer o que fui fazer no meio do caminho')
    await receber('de noite eu rendo')
    await receber('gente demais')
    await receber('fico irritado com som')

    await receber('tomo Ritalina às 9', {
      extrair: async () => [{ nome: 'Ritalina', horario: '09:00' }],
    })

    await receber('meu pai')
    await receber('nada')
    await receber('não me cobre duas vezes')
    await receber('2')
    await receber('sim')

    const u = usuarioAtual()
    const deRemedio = repo
      .listarGatilhosUsuario(u.usuario_id, db)
      .filter((g) => g.tipo === TIPOS_GATILHO.REMEDIO)

    assert.equal(deRemedio.length, 1)
    assert.equal(deRemedio[0].horario, '09:00')
    assert.equal(u.personalidade, 'caloroso')
  })

  test('remédio SEM horário não vira gatilho (Regra 1b ponta a ponta)', async () => {
    await convidarPiloto(NUMERO, enviarMensagem, db)
    await receber('sim')
    await receber('Caio')
    await receber('procrastinar')
    await receber('manhã boa')
    await receber('prazo curto')
    await receber('roer unha')

    await receber('tomo um remédio pra dormir', {
      // O LLM foi honesto: não sabe o horário, e NÃO chutou.
      extrair: async () => [{ nome: 'remédio pra dormir', horario: SEM_INFORMACAO }],
    })

    await receber('ninguém')
    await receber('nada')
    await receber('nada')
    await receber('3')
    await receber('sim')

    const u = usuarioAtual()
    const remedios = repo.listarRemedios(u.usuario_id, db)

    assert.equal(remedios.length, 1, 'o remédio é registrado')
    assert.equal(remedios[0].horario, SEM_INFORMACAO)
    assert.equal(
      repo.listarGatilhosUsuario(u.usuario_id, db).filter((g) => g.tipo === TIPOS_GATILHO.REMEDIO)
        .length,
      0,
      'mas NÃO vira gatilho — não há o que lembrar',
    )
  })

  test('correção no resumo é registrada, não parseada', async () => {
    await convidarPiloto(NUMERO, enviarMensagem, db)
    await receber('sim')
    await receber('Dani')
    await receber('barulho')
    await receber('tarde')
    await receber('reunião')
    await receber('suor frio')
    await receber('não tenho')
    await receber('minha mãe')
    await receber('nada')
    await receber('nada')
    await receber('3')

    const antes = { ...usuarioAtual() }
    await receber('errado, meu nome é Daniela')

    const u = usuarioAtual()
    const correcoes = listarInteracoes(u.usuario_id, db).filter(
      (i) => i.tipo === TIPOS_INTERACAO.CORRECAO_REPORTADA,
    )

    assert.equal(correcoes.length, 1)
    assert.equal(correcoes[0].texto, 'errado, meu nome é Daniela')
    assert.equal(u.nome, antes.nome, 'o campo NÃO é alterado automaticamente')
    assert.equal(u.anamnese_estado, ESTADOS.CONCLUIDO, 'mesmo assim a anamnese conclui')
  })
})

describe('rede de segurança e fluxo normal', () => {
  test('mensagem de quem nunca foi convidado recebe o consentimento', async () => {
    const r = await receber('oi, quem é você?')

    assert.equal(r.acao, 'consentimento_enviado')
    assert.equal(enviadas.at(-1).texto, TEXTO_CONSENTIMENTO)
    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.CONSENTIMENTO)
  })

  test('convite repetido reaproveita o usuário, sem duplicar', async () => {
    const a = await convidarPiloto(NUMERO, enviarMensagem, db)
    const b = await convidarPiloto(NUMERO, enviarMensagem, db)

    assert.equal(a.usuario_id, b.usuario_id)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n, 1)
  })

  test('após concluir, mensagem fora de janela é despejo espontâneo e chama o LLM', async () => {
    const u = repo.findOrCreate(NUMERO, db)
    repo.concluirAnamnese(u.usuario_id, db)
    repo.setPersonalidade(u.usuario_id, 'neutro', db)

    let promptRecebido = null
    const r = await receber('hoje foi um dia horrível', {
      chamar: async ({ systemPrompt }) => {
        promptRecebido = systemPrompt
        return 'Entendi. Qual é a menor coisa que ainda dá pra fazer hoje?'
      },
    })

    assert.equal(r.acao, TIPOS_INTERACAO.DESPEJO_ESPONTANEO)
    assert.equal(repo.getDespejosSemana(u.usuario_id, db).contagem, 1)
    assert.match(promptRecebido, /NUNCA inventa nem estima dado de saúde/)
    assert.equal(enviadas.at(-1).texto, 'Entendi. Qual é a menor coisa que ainda dá pra fazer hoje?')
  })

  test('mensagem dentro da janela do gatilho é resposta e zera o silêncio', async () => {
    const u = repo.findOrCreate(NUMERO, db)
    repo.concluirAnamnese(u.usuario_id, db)
    repo.setPersonalidade(u.usuario_id, 'direto', db)

    repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)
    repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)

    const { registrar } = await import('../src/db/interactionLog.js')
    registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        texto: 'Bom dia.',
        timestamp: new Date().toISOString(),
      },
      db,
    )

    const r = await receber('modo disfunção', { chamar: async () => 'Ok. Uma coisa só hoje.' })

    assert.equal(r.acao, TIPOS_INTERACAO.RESPOSTA_GATILHO)
    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db), 0)
    assert.equal(repo.getDespejosSemana(u.usuario_id, db).contagem, 0)
    assert.ok(ultimoGatilhoDisparado(u.usuario_id, db))
  })

  test('falha do LLM não derruba a conversa', async () => {
    const u = repo.findOrCreate(NUMERO, db)
    repo.concluirAnamnese(u.usuario_id, db)

    const r = await receber('oi', {
      chamar: async () => {
        throw new Error('429 rate limit')
      },
    })

    assert.equal(r.respondeu, false)
    assert.equal(listarInteracoes(u.usuario_id, db).length > 0, true, 'a interação é registrada mesmo assim')
  })

  test('áudio é transcrito ANTES do roteamento da anamnese', async () => {
    await convidarPiloto(NUMERO, enviarMensagem, db)

    await tratarMensagemRecebida(
      { numero: NUMERO, audio: { buffer: Buffer.from('fake'), mimeType: 'audio/ogg' } },
      enviarMensagem,
      { db, transcrever: async () => ({ ok: true, texto: 'sim' }) },
    )

    assert.equal(usuarioAtual().consentimento_aceito, 1)
    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.NOME)
  })

  test('falha de transcrição não derruba a conversa', async () => {
    await convidarPiloto(NUMERO, enviarMensagem, db)

    const r = await tratarMensagemRecebida(
      { numero: NUMERO, audio: { buffer: Buffer.from('fake'), mimeType: 'audio/ogg' } },
      enviarMensagem,
      { db, transcrever: async () => ({ ok: false, erro: 'api fora' }) },
    )

    assert.equal(r.acao, 'transcricao_falhou')
    assert.equal(usuarioAtual().anamnese_estado, ESTADOS.CONSENTIMENTO, 'estado não avança')
    assert.match(enviadas.at(-1).texto, /Pode escrever/)
  })
})
