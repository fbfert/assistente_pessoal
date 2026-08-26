import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  ESTADOS,
  PERGUNTAS,
  TEXTO_CONSENTIMENTO,
  VERSAO_CONSENTIMENTO,
} from '../src/anamnese/questions.js'
import {
  processarResposta,
  montarResumoAnamnese,
  isVago,
  isDuvida,
  isAfirmativo,
  isNegativo,
  isPular,
} from '../src/anamnese/stateMachine.js'
import { extrairRemedios, parsearRemedios } from '../src/anamnese/extrairRemedios.js'
import { SEM_INFORMACAO } from '../src/constants.js'
import {
  montarSystemPrompt,
  mapearRespostaPersonalidade,
  NUCLEO_FIXO,
  VARIANTES,
} from '../src/llm/prompts.js'
import { extrairTextoClaude, extrairTextoOpenAI, PROVIDERS_DISPONIVEIS } from '../src/llm/router.js'

const usuario = (over = {}) => ({
  usuario_id: 1,
  anamnese_estado: ESTADOS.CONSENTIMENTO,
  anamnese_exemplo_pedido: 0,
  personalidade: null,
  ...over,
})

const acoesDoTipo = (p, tipo) => p.acoes.filter((a) => a.tipo === tipo)
const primeiraAcao = (p, tipo) => acoesDoTipo(p, tipo)[0] ?? null
const estadoFinal = (p) => primeiraAcao(p, 'setEstado')?.estado ?? null

describe('reconhecimento de resposta — igualdade exata, nunca prefixo', () => {
  test('REGRESSÃO: "pode me chamar de Ana" NÃO é afirmativo', () => {
    // Este é o bug mais sério que o projeto já pagou. Uma regex de prefixo
    // (/^(sim|s|ok|pode)\b/) fazia esta frase — resposta legítima da pergunta
    // de NOME — casar como afirmativo de CONSENTIMENTO, descolando o estado da
    // conversa inteira. Se este teste voltar a falhar, a implementação
    // regrediu para casamento de prefixo.
    assert.equal(isAfirmativo('pode me chamar de Ana'), false)
  })

  test('outras frases livres que começam com token afirmativo também não passam', () => {
    for (const frase of [
      'sim senhor eu tomo remédio de manhã',
      'ok mas eu prefiro outro horário',
      'claro que não',
      'certo, mas antes deixa eu explicar',
      'não sei se pode',
    ]) {
      assert.equal(isAfirmativo(frase), false, `"${frase}" não deveria ser afirmativo`)
    }
  })

  test('frases canônicas afirmativas são reconhecidas', () => {
    for (const frase of ['sim', 'Sim.', ' SIM ', 'ok', 'blz', 'aceito', 'claro', 'pode']) {
      assert.equal(isAfirmativo(frase), true, `"${frase}" deveria ser afirmativo`)
    }
  })

  test('negativos reconhecidos com e sem acento', () => {
    for (const frase of ['não', 'nao', 'N', 'não quero', 'negativo']) {
      assert.equal(isNegativo(frase), true, `"${frase}" deveria ser negativo`)
    }
    assert.equal(isNegativo('não sei bem o que responder'), false)
  })

  test('pular reconhece as formas de "não tenho"', () => {
    for (const frase of ['não tenho', 'nao uso', 'pular', 'nenhum']) {
      assert.equal(isPular(frase), true, `"${frase}" deveria pular`)
    }
    assert.equal(isPular('não tenho horário fixo mas tomo Ritalina'), false)
  })

  test('vago cobre as fugas comuns e a resposta vazia', () => {
    for (const frase of ['sei lá', 'normal', 'tanto faz', '', '   ']) {
      assert.equal(isVago(frase), true, `"${frase}" deveria ser vago`)
    }
    assert.equal(isVago('barulho de obra e reunião sem pauta'), false)
  })
})

describe('consentimento (estado 0)', () => {
  test('aceite registra consentimento com versão e avança para NOME', async () => {
    const p = await processarResposta(usuario(), 'sim')

    const registro = primeiraAcao(p, 'registrarConsentimento')
    assert.equal(registro.versao, VERSAO_CONSENTIMENTO)
    assert.equal(estadoFinal(p), ESTADOS.NOME)
    assert.equal(p.mensagens[0], PERGUNTAS[ESTADOS.NOME].texto)
  })

  test('recusa não avança e não coleta nada', async () => {
    const p = await processarResposta(usuario(), 'não')

    assert.equal(estadoFinal(p), null, 'não deve haver transição de estado')
    assert.equal(primeiraAcao(p, 'registrarConsentimento'), null)
  })

  test('resposta não reconhecida repete o pedido em vez de deduzir', async () => {
    const p = await processarResposta(usuario(), 'pode me chamar de Ana')

    assert.equal(estadoFinal(p), null)
    assert.equal(primeiraAcao(p, 'registrarConsentimento'), null)
    assert.ok(p.mensagens.includes(TEXTO_CONSENTIMENTO))
  })
})

describe('pergunta simples e resposta vaga', () => {
  test('resposta concreta grava o campo e avança', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.O_QUE_TRAVA })
    const p = await processarResposta(u, 'começar tarefa longa')

    assert.deepEqual(primeiraAcao(p, 'salvarCampo'), {
      tipo: 'salvarCampo',
      campo: 'o_que_trava',
      valor: 'começar tarefa longa',
    })
    assert.equal(estadoFinal(p), ESTADOS.ROTINA)
  })

  test('primeira resposta vaga pede exemplo UMA vez e não avança', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.O_QUE_TRAVA, anamnese_exemplo_pedido: 0 })
    const p = await processarResposta(u, 'sei lá')

    assert.equal(estadoFinal(p), null)
    assert.ok(primeiraAcao(p, 'marcarExemploPedido'))
    assert.equal(primeiraAcao(p, 'salvarCampo'), null)
  })

  test('segunda resposta vaga é aceita como está e avança', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.O_QUE_TRAVA, anamnese_exemplo_pedido: 1 })
    const p = await processarResposta(u, 'sei lá')

    assert.equal(primeiraAcao(p, 'salvarCampo').valor, 'sei lá')
    assert.equal(estadoFinal(p), ESTADOS.ROTINA)
  })

  test('estado pulável aceita pulo e grava o sentinela', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.PESSOAS_CHAVE })
    const p = await processarResposta(u, 'nenhum')

    assert.equal(primeiraAcao(p, 'salvarCampo').valor, SEM_INFORMACAO)
    assert.equal(estadoFinal(p), ESTADOS.VOCABULARIO_PROPRIO)
  })

  test('estado NÃO pulável ignora o pulo e trata como resposta', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.NOME, anamnese_exemplo_pedido: 1 })
    const p = await processarResposta(u, 'pular')

    assert.equal(primeiraAcao(p, 'salvarCampo').valor, 'pular')
    assert.equal(estadoFinal(p), ESTADOS.O_QUE_TRAVA)
  })
})

describe('remédio (estado 6) — Regra 1b', () => {
  const noEstadoRemedio = usuario({ anamnese_estado: ESTADOS.REMEDIO })

  test('"não tenho" pula sem cadastrar remédio', async () => {
    const p = await processarResposta(noEstadoRemedio, 'não tenho', {
      extrairRemedios: async () => {
        throw new Error('não deveria chamar o LLM quando a pessoa disse que não toma')
      },
    })

    assert.equal(acoesDoTipo(p, 'adicionarRemedio').length, 0)
    assert.equal(estadoFinal(p), ESTADOS.PESSOAS_CHAVE)
  })

  test('LLM sem horário NÃO gera horário estimado', async () => {
    const p = await processarResposta(noEstadoRemedio, 'tomo Ritalina', {
      extrairRemedios: async () => [{ nome: 'Ritalina', horario: SEM_INFORMACAO }],
    })

    const remedio = primeiraAcao(p, 'adicionarRemedio')
    assert.equal(remedio.nome, 'Ritalina')
    assert.equal(remedio.horario, SEM_INFORMACAO)
  })

  test('campo vazio vindo do LLM vira o sentinela, não string vazia', async () => {
    const p = await processarResposta(noEstadoRemedio, 'tomo um negócio de manhã', {
      extrairRemedios: async () => [{ nome: '', horario: '08:00' }],
    })

    assert.equal(primeiraAcao(p, 'adicionarRemedio').nome, SEM_INFORMACAO)
  })

  test('sem extrator injetado, nada é inventado', async () => {
    const p = await processarResposta(noEstadoRemedio, 'tomo Ritalina às 9', {})

    assert.equal(acoesDoTipo(p, 'adicionarRemedio').length, 0)
    assert.equal(estadoFinal(p), ESTADOS.PESSOAS_CHAVE)
  })
})

describe('parse defensivo da extração de remédio', () => {
  test('resposta ilegível vira lista vazia, não exceção', () => {
    assert.deepEqual(parsearRemedios('desculpe, não entendi'), [])
    assert.deepEqual(parsearRemedios(''), [])
    assert.deepEqual(parsearRemedios(null), [])
  })

  test('JSON dentro de cerca de código ainda é lido', () => {
    const bruto = '```json\n{"remedios":[{"nome":"Venvanse","horario":"07:00"}]}\n```'
    assert.deepEqual(parsearRemedios(bruto), [{ nome: 'Venvanse', horario: '07:00' }])
  })

  test('campo ausente vira o sentinela', () => {
    const bruto = '{"remedios":[{"nome":"Ritalina"}]}'
    assert.deepEqual(parsearRemedios(bruto), [{ nome: 'Ritalina', horario: SEM_INFORMACAO }])
  })

  test('item totalmente vazio é descartado', () => {
    assert.deepEqual(parsearRemedios('{"remedios":[{"nome":"","horario":""}]}'), [])
  })

  test('falha da chamada de LLM não derruba o fluxo', async () => {
    const r = await extrairRemedios('tomo algo', {
      chamar: async () => {
        throw new Error('rede fora')
      },
    })
    assert.deepEqual(r, [])
  })
})

describe('personalidade (estado 10)', () => {
  test('reconhece número e nome', () => {
    assert.equal(mapearRespostaPersonalidade('1'), 'direto')
    assert.equal(mapearRespostaPersonalidade('caloroso'), 'caloroso')
    assert.equal(mapearRespostaPersonalidade('NEUTRO'), 'neutro')
    assert.equal(mapearRespostaPersonalidade('sei lá'), null)
  })

  test('primeira resposta não reconhecida repergunta uma vez', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.PERSONALIDADE, anamnese_exemplo_pedido: 0 })
    const p = await processarResposta(u, 'qualquer um')

    assert.equal(primeiraAcao(p, 'setPersonalidade'), null)
    assert.equal(estadoFinal(p), null)
    assert.ok(primeiraAcao(p, 'marcarExemploPedido'))
  })

  test('segunda resposta não reconhecida assume "neutro" em vez de travar', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.PERSONALIDADE, anamnese_exemplo_pedido: 1 })
    const p = await processarResposta(u, 'qualquer um')

    assert.equal(primeiraAcao(p, 'setPersonalidade').valor, 'neutro')
    assert.equal(estadoFinal(p), ESTADOS.RESUMO)
  })
})

describe('resumo (estado 11)', () => {
  test('confirmação conclui sem registrar correção', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.RESUMO })
    const p = await processarResposta(u, 'sim')

    assert.equal(acoesDoTipo(p, 'registrarInteracao').length, 0)
    assert.ok(primeiraAcao(p, 'concluirAnamnese'))
  })

  test('erro apontado é apenas REGISTRADO, sem parsear o campo', async () => {
    const u = usuario({ anamnese_estado: ESTADOS.RESUMO })
    const p = await processarResposta(u, 'meu remédio é às 9, não às 8')

    const correcao = primeiraAcao(p, 'registrarInteracao')
    assert.equal(correcao.tipoInteracao, 'correcao_reportada')
    assert.equal(correcao.texto, 'meu remédio é às 9, não às 8')
    // Nenhuma tentativa de descobrir sozinho qual campo mudar:
    assert.equal(primeiraAcao(p, 'salvarCampo'), null)
    assert.equal(primeiraAcao(p, 'adicionarRemedio'), null)
    assert.ok(primeiraAcao(p, 'concluirAnamnese'))
  })
})

describe('montarResumoAnamnese', () => {
  test('mostra o que foi coletado e o sentinela onde faltou', () => {
    const texto = montarResumoAnamnese(
      usuario({ nome: 'Ana', o_que_trava: 'começar tarefa', personalidade: 'direto' }),
      [{ nome: 'Ritalina', horario: '09:00' }],
    )

    assert.match(texto, /Ana/)
    assert.match(texto, /começar tarefa/)
    assert.match(texto, /Ritalina às 09:00/)
    assert.match(texto, /direto/)
    assert.match(texto, new RegExp(SEM_INFORMACAO), 'campos não preenchidos usam o sentinela')
  })

  test('sem remédio cadastrado mostra o sentinela, não "nenhum"', () => {
    const texto = montarResumoAnamnese(usuario({ nome: 'Ana' }), [])
    assert.match(texto, new RegExp(`Remédio: ${SEM_INFORMACAO}`))
  })
})

describe('montagem de system prompt (sem rede)', () => {
  test('núcleo fixo está presente em todas as personalidades', () => {
    for (const personalidade of ['direto', 'caloroso', 'neutro']) {
      const p = montarSystemPrompt(usuario({ personalidade }))
      assert.ok(p.includes(NUCLEO_FIXO), `núcleo ausente em ${personalidade}`)
      assert.ok(p.includes(VARIANTES[personalidade]))
    }
  })

  test('a variante escolhida exclui as outras duas', () => {
    const p = montarSystemPrompt(usuario({ personalidade: 'direto' }))

    assert.ok(p.includes(VARIANTES.direto))
    assert.ok(!p.includes(VARIANTES.caloroso))
    assert.ok(!p.includes(VARIANTES.neutro))
  })

  test('personalidade ausente cai no padrão em vez de quebrar', () => {
    const p = montarSystemPrompt(usuario({ personalidade: null }))
    assert.ok(p.includes(VARIANTES.neutro))
  })

  test('a Regra 1b e o sentinela aparecem no núcleo', () => {
    assert.ok(NUCLEO_FIXO.includes('1b.'))
    assert.ok(NUCLEO_FIXO.includes(SEM_INFORMACAO))
  })

  test('o que a pessoa mandou nunca fazer chega ao prompt', () => {
    const p = montarSystemPrompt(usuario({ nunca_fazer: 'nunca me mande áudio' }))
    assert.match(p, /nunca me mande áudio/)
  })
})

describe('router de LLM (parsing puro)', () => {
  test('provedores disponíveis são os três do MVP', () => {
    assert.deepEqual([...PROVIDERS_DISPONIVEIS], ['claude', 'openai', 'deepseek'])
  })

  test('extrai texto do formato Anthropic, ignorando blocos não-texto', () => {
    const corpo = {
      content: [
        { type: 'thinking', thinking: 'ignorar' },
        { type: 'text', text: 'bom dia' },
        { type: 'text', text: ', tudo bem?' },
      ],
    }
    assert.equal(extrairTextoClaude(corpo), 'bom dia, tudo bem?')
  })

  test('extrai texto do formato OpenAI', () => {
    const corpo = { choices: [{ message: { content: '  oi  ' } }] }
    assert.equal(extrairTextoOpenAI(corpo), 'oi')
  })

  test('resposta malformada vira string vazia, não exceção', () => {
    assert.equal(extrairTextoClaude({}), '')
    assert.equal(extrairTextoOpenAI({}), '')
  })
})

// =============================================================================
// Pergunta de volta não é resposta.
//
// Caso real: na primeira sessão do piloto, "Como assim?" virou o valor de
// pessoas-chave e passou a entrar no system prompt daquela pessoa como fato.
// =============================================================================

describe('dúvida é pergunta, não resposta', () => {
  const emEstado = (estado, extra = {}) => ({
    anamnese_estado: estado,
    anamnese_exemplo_pedido: 0,
    ...extra,
  })

  test('reconhece a dúvida por igualdade exata, e só ela', () => {
    for (const frase of ['como assim', 'Como assim?', 'NÃO ENTENDI', 'explica melhor']) {
      assert.equal(isDuvida(frase), true, frase)
    }
    // Frase que CONTÉM uma dúvida não é dúvida: é resposta com texto de verdade.
    for (const frase of ['como assim eu travo em tudo', 'não entendi bem a rotina, mas de manhã rendo']) {
      assert.equal(isDuvida(frase), false, frase)
    }
  })

  test('o caso real: "Como assim?" não vira pessoas-chave', async () => {
    const plano = await processarResposta(emEstado(ESTADOS.PESSOAS_CHAVE), 'Como assim?')

    assert.ok(
      !plano.acoes.some((a) => a.tipo === 'salvarCampo'),
      'a dúvida não pode ser gravada como resposta',
    )
    assert.ok(!plano.acoes.some((a) => a.tipo === 'setEstado'), 'e o estado não avança')
    assert.equal(plano.mensagens.length, 1)
    assert.equal(plano.mensagens[0], PERGUNTAS[ESTADOS.PESSOAS_CHAVE].reformulacao)
    assert.ok(plano.acoes.some((a) => a.tipo === 'marcarExemploPedido'))
  })

  test('a reformulação explica a pergunta de outro jeito', () => {
    for (const [estado, pergunta] of Object.entries(PERGUNTAS)) {
      assert.ok(pergunta.reformulacao, `estado ${estado} sem reformulação`)
      assert.notEqual(pergunta.reformulacao, pergunta.texto, `estado ${estado} só repete`)
      assert.ok(pergunta.reformulacao.length > 40, `estado ${estado} explica pouco`)
    }
  })

  test('segunda dúvida seguida não trava a pessoa', async () => {
    const plano = await processarResposta(
      emEstado(ESTADOS.PESSOAS_CHAVE, { anamnese_exemplo_pedido: 1 }),
      'como assim',
    )

    assert.ok(plano.acoes.some((a) => a.tipo === 'salvarCampo'), 'aceita como está')
    assert.ok(plano.acoes.some((a) => a.tipo === 'setEstado'))
  })

  test('vale também no estado de remédio, que tem caminho próprio', async () => {
    const plano = await processarResposta(emEstado(ESTADOS.REMEDIO), 'não entendi')

    assert.deepEqual(plano.mensagens, [PERGUNTAS[ESTADOS.REMEDIO].reformulacao])
    assert.ok(!plano.acoes.some((a) => a.tipo === 'setEstado'))
  })

  test('resposta de verdade continua sendo gravada', async () => {
    const plano = await processarResposta(emEstado(ESTADOS.PESSOAS_CHAVE), 'minha irmã Bia')

    const salvar = plano.acoes.find((a) => a.tipo === 'salvarCampo')
    assert.equal(salvar.valor, 'minha irmã Bia')
  })
})

describe('o resumo não promete conserto', () => {
  test('a pergunta do resumo diz o que acontece com a correção', () => {
    const texto = montarResumoAnamnese({ nome: 'Ana' }, [])

    assert.match(texto, /anoto/i)
    assert.match(texto, /não consigo corrigir/i)
  })
})
