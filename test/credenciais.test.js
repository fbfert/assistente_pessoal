import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  statSync,
  readFileSync,
  readdirSync,
  utimesSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Chaves de teste que NÃO se parecem com credenciais reais, e um marcador único
// para varrer respostas e logs atrás de vazamento.
const CHAVE = 'sk-test-NUNCA-DEVE-VAZAR-0001'
const CHAVE2 = 'sk-test-NUNCA-DEVE-VAZAR-0002'
const SENHA = 'senha-de-teste-do-admin'
const EMAIL = 'operador@xiax.com.br'

let dir, arquivo, db, servidor, base, cookie
let repo, admins, auditoria, router, config_

process.env.ADMIN_PASSWORD = SENHA
process.env.ADMIN_BOOTSTRAP_EMAIL = EMAIL

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tars-cred-'))
  arquivo = join(dir, 'llm-chaves.json')
  process.env.LLM_CHAVES_PATH = arquivo

  const { abrirDb } = await import('../src/db/db.js')
  db = abrirDb(join(dir, 'cred.sqlite'))

  repo = await import('../src/llm/chavesRepo.js')
  router = await import('../src/llm/router.js')
  config_ = (await import('../src/config.js')).config
  admins = await import('../src/db/adminRepo.js')
  auditoria = await import('../src/db/auditoriaAdminRepo.js')
  await admins.bootstrap({ email: EMAIL, senha: SENHA })

  const { app } = await import('../src/dashboard/server.js')
  servidor = app.listen(0)
  await new Promise((r) => servidor.once('listening', r))
  base = `http://127.0.0.1:${servidor.address().port}`

  const r = await fetch(base + '/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: EMAIL, senha: SENHA }),
  })
  cookie = r.headers.get('set-cookie').split(';')[0]
})

after(async () => {
  const { closeDb } = await import('../src/db/db.js')
  await new Promise((r) => servidor.close(r))
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  rmSync(arquivo, { force: true })
  repo._limparCache()
  db.exec('DELETE FROM auditoria_admin;')
})

const get = (c) => fetch(base + c, { headers: { cookie }, redirect: 'manual' })
const post = (c, d) =>
  fetch(base + c, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(d),
  })

// =============================================================================

describe('repositório de credenciais', () => {
  test('sem arquivo, nada está configurado', () => {
    const s = repo.status('claude')

    assert.equal(s.configurado, false)
    assert.equal(s.ultimosCaracteres, null)
    assert.equal(repo.ler('claude'), null)
  })

  test('status devolve só o mascarado — nunca a chave inteira', () => {
    repo.escrever('openai', { apiKey: CHAVE, model: 'gpt-4o' })
    const s = repo.status('openai')

    assert.equal(s.configurado, true)
    assert.equal(s.ultimosCaracteres, '0001')
    assert.equal(s.model, 'gpt-4o')

    // A chave completa NÃO pode aparecer em nenhum campo do status.
    assert.ok(!JSON.stringify(s).includes(CHAVE))
    assert.ok(!JSON.stringify(repo.statusDeTodos()).includes(CHAVE))
  })

  test('ler() é o único caminho para a chave completa', () => {
    repo.escrever('openai', { apiKey: CHAVE, model: 'gpt-4o' })

    assert.equal(repo.ler('openai').apiKey, CHAVE)
  })

  test('chave vazia preserva a atual — permite editar só o modelo', () => {
    repo.escrever('claude', { apiKey: CHAVE, model: 'claude-sonnet-5' })
    repo.escrever('claude', { apiKey: '', model: 'claude-opus-5' })

    assert.equal(repo.ler('claude').apiKey, CHAVE, 'a chave não pode ser apagada por campo vazio')
    assert.equal(repo.status('claude').model, 'claude-opus-5')
  })

  test('o arquivo é gravado com permissão restrita', () => {
    repo.escrever('claude', { apiKey: CHAVE })

    assert.equal(statSync(arquivo).mode & 0o777, 0o600)
  })

  test('provedor desconhecido é recusado', () => {
    assert.throws(() => repo.escrever('gemini', { apiKey: CHAVE }), /desconhecido/)
  })

  test('nenhum temporário fica para trás', () => {
    repo.escrever('claude', { apiKey: CHAVE })
    assert.ok(!readdirSync(dir).some((f) => f.includes('.tmp')))
  })
})

describe('cache por horário de modificação', () => {
  test('mudança externa no arquivo é vista sem reiniciar o processo', () => {
    repo.escrever('deepseek', { apiKey: CHAVE, model: 'deepseek-chat' })
    assert.equal(repo.ler('deepseek').apiKey, CHAVE)

    // Simula o OUTRO container gravando: escreve direto no arquivo e adianta o
    // mtime. Sem a validação por stat, a leitura seguinte devolveria o cache.
    writeFileSync(
      arquivo,
      JSON.stringify({ deepseek: { apiKey: CHAVE2, model: 'deepseek-chat' } }),
      { mode: 0o600 },
    )
    const futuro = new Date(Date.now() + 2000)
    utimesSync(arquivo, futuro, futuro)

    assert.equal(
      repo.ler('deepseek').apiKey,
      CHAVE2,
      'a leitura precisa pegar o valor novo sem reiniciar',
    )
  })

  test('arquivo inalterado não é relido', () => {
    repo.escrever('claude', { apiKey: CHAVE })
    const primeira = repo.ler('claude')
    const segunda = repo.ler('claude')

    assert.equal(primeira.apiKey, segunda.apiKey)
  })

  test('JSON corrompido não derruba o processo', () => {
    writeFileSync(arquivo, '{ isto não é json', { mode: 0o600 })
    repo._limparCache()

    assert.equal(repo.ler('claude'), null)
    assert.equal(repo.status('claude').configurado, false)
  })
})

describe('resolução no router: arquivo primeiro, ambiente depois', () => {
  test('sem arquivo, cai para o ambiente', async () => {
    const { config } = await import('../src/config.js')
    const antes = config.llm.openai.apiKey
    config.llm.openai.apiKey = 'chave-do-ambiente'

    // A chamada falha na rede, não por falta de credencial — é o que prova que
    // o fallback resolveu.
    await assert.rejects(
      () => router.chamarLLM({ systemPrompt: 'x', mensagens: [], provider: 'openai' }),
      (e) => !/Nenhuma credencial/.test(e.message),
    )

    config.llm.openai.apiKey = antes
  })

  test('sem arquivo e sem ambiente, erro nomeia provedor e onde configurar', async () => {
    const { config } = await import('../src/config.js')
    const antes = config.llm.deepseek.apiKey
    config.llm.deepseek.apiKey = ''

    await assert.rejects(
      () => router.chamarLLM({ systemPrompt: 'x', mensagens: [], provider: 'deepseek' }),
      (e) => {
        assert.match(e.message, /deepseek/)
        assert.match(e.message, /DEEPSEEK_API_KEY/)
        assert.match(e.message, /credenciais/)
        return true
      },
    )

    config.llm.deepseek.apiKey = antes
  })

  test('o erro de provedor NÃO carrega o corpo da resposta', () => {
    // O corpo do 401 de alguns provedores ecoa a credencial enviada.
    const fonte = readFileSync(new URL('../src/llm/router.js', import.meta.url), 'utf8')

    assert.ok(!fonte.includes('resposta.text()'), 'o corpo do erro não pode entrar na exceção')
    assert.match(fonte, /erroDeProvedor/)
  })
})

describe('tela de credenciais', () => {
  test('exige sessão', async () => {
    const r = await fetch(base + '/credenciais', { redirect: 'manual' })

    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), '/login')
  })

  test('a chave nunca volta na resposta — nem depois de salvar', async () => {
    await post('/credenciais/openai', { apiKey: CHAVE, model: 'gpt-4o' })

    const corpo = await (await get('/credenciais')).text()

    assert.ok(!corpo.includes(CHAVE), 'a chave completa não pode aparecer na página')
    assert.match(corpo, /…0001/, 'só os últimos caracteres')
  })

  test('o campo de chave abre vazio mesmo com uma configurada', async () => {
    await post('/credenciais/claude', { apiKey: CHAVE, model: 'claude-sonnet-5' })
    const corpo = await (await get('/credenciais')).text()

    const campo = corpo.match(/<input type="password" id="chave-claude"[^>]*>/)[0]
    assert.ok(!/value=/.test(campo), 'o campo de chave é write-only')
  })

  test('primeira configuração grava direto, sem etapa extra', async () => {
    const r = await post('/credenciais/openai/confirmar', { apiKey: CHAVE, model: 'gpt-4o' })

    assert.equal(r.status, 302)
    assert.equal(repo.status('openai').configurado, true)
  })

  test('sobrescrever passa por confirmação antes de gravar', async () => {
    await post('/credenciais/openai', { apiKey: CHAVE, model: 'gpt-4o' })

    const r = await post('/credenciais/openai/confirmar', { apiKey: CHAVE2, model: 'gpt-4o' })

    assert.equal(r.status, 200, 'devolve a tela de confirmação, não um redirect')
    const corpo = await r.text()
    assert.match(corpo, /irreversível/i)
    assert.equal(repo.ler('openai').apiKey, CHAVE, 'a chave antiga ainda vale até confirmar')
  })

  test('editar só o modelo não exige confirmação', async () => {
    await post('/credenciais/claude', { apiKey: CHAVE, model: 'claude-sonnet-5' })

    const r = await post('/credenciais/claude/confirmar', { apiKey: '', model: 'claude-opus-5' })

    assert.equal(r.status, 302)
    assert.equal(repo.status('claude').model, 'claude-opus-5')
    assert.equal(repo.ler('claude').apiKey, CHAVE)
  })

  test('provedor desconhecido devolve 404', async () => {
    assert.equal((await post('/credenciais/gemini', { apiKey: CHAVE })).status, 404)
  })
})

describe('auditoria', () => {
  test('a troca é registrada, e a chave NÃO entra no registro', async () => {
    await post('/credenciais/openai', { apiKey: CHAVE, model: 'gpt-4o' })

    const linhas = auditoria.listarAuditoriaAdmin(10, db)
    const linha = linhas.find((l) => l.acao === 'configurou_credencial')

    assert.ok(linha, 'a ação precisa ser registrável — exige o valor no CHECK')
    assert.equal(linha.autor_email, EMAIL)
    assert.match(linha.descricao, /openai/)

    for (const l of linhas) {
      assert.ok(!l.descricao.includes(CHAVE), 'a chave vazou na auditoria')
      assert.ok(!l.descricao.includes('0001'), 'nem os últimos caracteres entram no log')
    }
  })

  test('salvar sem mudar nada não gera auditoria', async () => {
    await post('/credenciais/claude', { apiKey: CHAVE, model: 'claude-sonnet-5' })
    db.exec('DELETE FROM auditoria_admin;')

    await post('/credenciais/claude', { apiKey: '', model: 'claude-sonnet-5' })

    assert.equal(auditoria.listarAuditoriaAdmin(10, db).length, 0)
  })
})

describe('varredura final de vazamento', () => {
  test('nenhuma página do admin devolve a chave', async () => {
    await post('/credenciais/openai', { apiKey: CHAVE, model: 'gpt-4o' })
    await post('/credenciais/claude', { apiKey: CHAVE2, model: 'claude-sonnet-5' })

    for (const rota of ['/', '/credenciais', '/admins', '/conta', '/conexao']) {
      const corpo = await (await get(rota)).text()
      assert.ok(!corpo.includes(CHAVE), `chave vazou em ${rota}`)
      assert.ok(!corpo.includes(CHAVE2), `chave vazou em ${rota}`)
    }
  })

  test('a tela de confirmação carrega a chave em campo oculto, e só ela', async () => {
    // A chave precisa atravessar a confirmação para chegar ao POST final. Isso é
    // uma exceção consciente: é a chave que o operador ACABOU de digitar, ainda
    // não gravada, no formulário dele — não uma leitura do que está armazenado.
    await post('/credenciais/openai', { apiKey: CHAVE, model: 'gpt-4o' })
    const corpo = await (await post('/credenciais/openai/confirmar', {
      apiKey: CHAVE2,
      model: 'gpt-4o',
    })).text()

    assert.ok(corpo.includes(CHAVE2), 'a chave nova atravessa a confirmação')
    assert.ok(!corpo.includes(CHAVE), 'a chave ARMAZENADA nunca é exibida')
  })
})

// =============================================================================
// Itens acrescentados depois da proposta original: lista curada de modelos,
// botão de testar, provedor ativo pela tela e modelo de transcrição.
// =============================================================================

/**
 * Troca o `fetch` global pela duração de uma chamada.
 *
 * O router usa o fetch da plataforma; interceptá-lo é o que permite afirmar QUAL
 * credencial saiu na requisição sem nenhuma chamada de rede real.
 */
async function comFetchFalso(resposta, corpo) {
  const original = globalThis.fetch
  const chamadas = []

  globalThis.fetch = async (url, opcoes = {}) => {
    // O próprio teste fala com o servidor local por fetch. Só as chamadas que
    // SAEM para um provedor são capturadas; o resto passa direto, senão o mock
    // interceptaria a requisição HTTP que está sendo testada.
    if (String(url).startsWith('http://127.0.0.1')) return original(url, opcoes)

    chamadas.push({
      url,
      opcoes,
      corpo: typeof opcoes.body === 'string' ? JSON.parse(opcoes.body) : opcoes.body,
    })
    return resposta
  }

  try {
    return { resultado: await corpo(), chamadas }
  } finally {
    globalThis.fetch = original
  }
}

const respostaOk = (texto) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: texto } }] }),
})

const resposta401ComChave = (chave) => ({
  ok: false,
  status: 401,
  // Alguns provedores ecoam a credencial recebida no corpo do 401. Este é o
  // cenário que a decisão de descartar o corpo existe para cobrir.
  text: async () => `{"error":"invalid api key: ${chave}"}`,
  json: async () => ({ error: `invalid api key: ${chave}` }),
})

describe('modelo: lista curada com campo livre', () => {
  test('o campo livre prevalece sobre a opção selecionada', async () => {
    await post('/credenciais/deepseek', {
      apiKey: CHAVE,
      model: 'deepseek-chat',
      modelLivre: 'deepseek-reasoner',
    })

    assert.equal(repo.status('deepseek').model, 'deepseek-reasoner')
  })

  test('campo livre vazio deixa a opção da lista valer', async () => {
    await post('/credenciais/deepseek', { apiKey: CHAVE, model: 'deepseek-chat', modelLivre: '  ' })

    assert.equal(repo.status('deepseek').model, 'deepseek-chat')
  })

  test('modelo gravado fora da lista aparece como vigente na tela', async () => {
    repo.escrever('claude', { apiKey: CHAVE, model: 'claude-de-outro-mundo-9' })

    const corpo = await (await get('/credenciais')).text()

    assert.match(corpo, /<option value="claude-de-outro-mundo-9" selected>/)
    assert.match(corpo, /Modelo em uso: <code>claude-de-outro-mundo-9<\/code>/)
  })

  test('a lista é derivada, não redigitada no HTML', async () => {
    const fonte = readFileSync(new URL('../src/dashboard/rotas/credenciais.js', import.meta.url), 'utf8')

    // Nenhum nome de modelo pode estar escrito na camada de apresentação.
    for (const proibido of ['gpt-4o', 'claude-sonnet', 'deepseek-chat']) {
      assert.ok(!fonte.includes(proibido), `"${proibido}" não pode estar fixo no HTML`)
    }
    assert.match(fonte, /modelosConhecidos/)
  })

  test('sem JavaScript de cliente na tela', async () => {
    const corpo = await (await get('/credenciais')).text()

    assert.ok(!/<script/i.test(corpo), 'a tela não pode depender de JavaScript')
    assert.ok(!/onclick|onchange|onsubmit/i.test(corpo), 'nem de manipulador inline')
  })
})

describe('botão de testar', () => {
  test('usa o rascunho digitado quando o campo de chave vem preenchido', async () => {
    repo.escrever('deepseek', { apiKey: CHAVE, model: 'deepseek-chat' })

    const { chamadas } = await comFetchFalso(respostaOk('ok'), () =>
      post('/credenciais/deepseek/testar', { apiKey: CHAVE2, model: 'deepseek-chat' }),
    )

    assert.equal(chamadas.length, 1)
    assert.equal(
      chamadas[0].opcoes.headers.authorization,
      `Bearer ${CHAVE2}`,
      'o teste precisa usar a chave que está no formulário, não a gravada',
    )
  })

  test('usa a chave já salva quando o campo vem vazio', async () => {
    repo.escrever('deepseek', { apiKey: CHAVE, model: 'deepseek-chat' })

    const { chamadas } = await comFetchFalso(respostaOk('ok'), () =>
      post('/credenciais/deepseek/testar', { apiKey: '', model: 'deepseek-chat' }),
    )

    assert.equal(chamadas[0].opcoes.headers.authorization, `Bearer ${CHAVE}`)
  })

  test('o modelo do formulário também vale no teste, sem ser gravado', async () => {
    repo.escrever('deepseek', { apiKey: CHAVE, model: 'deepseek-chat' })

    const { chamadas } = await comFetchFalso(respostaOk('ok'), () =>
      post('/credenciais/deepseek/testar', { apiKey: '', model: '', modelLivre: 'modelo-so-do-teste' }),
    )

    assert.equal(chamadas[0].corpo.model, 'modelo-so-do-teste')
    assert.equal(repo.status('deepseek').model, 'deepseek-chat', 'o teste não pode gravar')
  })

  test('NUNCA escreve no arquivo', async () => {
    repo.escrever('openai', { apiKey: CHAVE, model: 'gpt-4o' })
    const antes = readFileSync(arquivo, 'utf8')

    await comFetchFalso(respostaOk('ok'), () =>
      post('/credenciais/openai/testar', { apiKey: CHAVE2, modelLivre: 'outro-modelo' }),
    )

    assert.equal(readFileSync(arquivo, 'utf8'), antes, 'o arquivo de credenciais foi alterado')
  })

  test('sucesso mostra a latência e diz que nada foi gravado', async () => {
    repo.escrever('deepseek', { apiKey: CHAVE, model: 'deepseek-chat' })

    const { resultado } = await comFetchFalso(respostaOk('ok'), () =>
      post('/credenciais/deepseek/testar', { apiKey: '' }),
    )
    const corpo = await resultado.text()

    assert.match(corpo, /Teste OK/)
    assert.match(corpo, /ms/)
    assert.match(corpo, /Nada foi gravado/)
  })

  test('falha não expõe a chave nem o corpo da resposta do provedor', async () => {
    const registrados = []
    const erroOriginal = console.error
    console.error = (...args) => registrados.push(args.join(' '))

    try {
      const { resultado } = await comFetchFalso(resposta401ComChave(CHAVE2), () =>
        post('/credenciais/openai/testar', { apiKey: CHAVE2, model: 'gpt-4o' }),
      )
      const corpo = await resultado.text()

      assert.match(corpo, /Teste falhou/)
      assert.match(corpo, /401/)
      assert.ok(!corpo.includes(CHAVE2), 'a chave apareceu na resposta HTTP')
      assert.ok(!corpo.includes('invalid api key'), 'o corpo do provedor vazou para a tela')

      for (const linha of registrados) {
        assert.ok(!linha.includes(CHAVE2), 'a chave apareceu no log')
        assert.ok(!linha.includes('invalid api key'), 'o corpo do provedor vazou para o log')
      }
    } finally {
      console.error = erroOriginal
    }
  })

  test('não gera auditoria: nada mudou', async () => {
    repo.escrever('deepseek', { apiKey: CHAVE, model: 'deepseek-chat' })
    db.exec('DELETE FROM auditoria_admin;')

    await comFetchFalso(respostaOk('ok'), () => post('/credenciais/deepseek/testar', { apiKey: '' }))

    assert.equal(auditoria.listarAuditoriaAdmin(10, db).length, 0)
  })

  test('exige sessão, como o resto da tela', async () => {
    const r = await fetch(base + '/credenciais/openai/testar', { method: 'POST', redirect: 'manual' })

    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), '/login')
  })
})

describe('provedor ativo pela tela', () => {
  test('sem arquivo, vale o ambiente', () => {
    assert.equal(repo.lerAtivo(), null)
    assert.equal(router.providerAtivo(), config_.llm.defaultProvider)
  })

  test('a troca vale sem reiniciar o processo', async () => {
    const r = await post('/credenciais/ativo', { ativo: 'openai' })

    assert.equal(r.status, 302)
    assert.equal(repo.lerAtivo(), 'openai')
    assert.equal(router.providerAtivo(), 'openai', 'a leitura seguinte já pega o valor novo')
  })

  test('valor desconhecido no arquivo é tratado como ausente', () => {
    writeFileSync(arquivo, JSON.stringify({ ativo: 'gemini' }), { mode: 0o600 })
    repo._limparCache()

    assert.equal(repo.lerAtivo(), null)
  })

  test('provedor inválido é recusado sem gravar', async () => {
    const r = await post('/credenciais/ativo', { ativo: 'gemini' })

    assert.equal(r.status, 400)
    assert.equal(repo.lerAtivo(), null)
  })

  test('a troca é auditada, sem chave nenhuma', async () => {
    // Independente do LLM_PROVIDER do ambiente em que a suíte roda.
    const outro = repo.PROVIDERS.find((p) => p !== router.providerAtivo())
    await post('/credenciais/ativo', { ativo: outro })

    const linha = auditoria.listarAuditoriaAdmin(10, db).find((l) => /provedor ativo/.test(l.descricao))

    assert.ok(linha)
    assert.equal(linha.autor_email, EMAIL)
    assert.match(linha.descricao, new RegExp(outro))
    assert.ok(!linha.descricao.includes(CHAVE))
  })

  test('escolher o provedor que vem do ambiente FIXA a escolha aqui', async () => {
    const doAmbiente = router.providerAtivo()
    assert.equal(repo.lerAtivo(), null, 'nada fixado ainda')

    await post('/credenciais/ativo', { ativo: doAmbiente })

    assert.equal(repo.lerAtivo(), doAmbiente, 'a escolha precisa ficar gravada, não virar no-op')
    const linha = auditoria.listarAuditoriaAdmin(10, db).find((l) => /fixado nesta tela/.test(l.descricao))
    assert.ok(linha, 'e precisa ficar registrado que agora vem da tela, não do ambiente')
  })

  test('escolher de novo o que já está fixado não gera linha nova', async () => {
    const p = repo.PROVIDERS.find((x) => x !== router.providerAtivo())
    await post('/credenciais/ativo', { ativo: p })
    db.exec('DELETE FROM auditoria_admin;')

    await post('/credenciais/ativo', { ativo: p })

    assert.equal(auditoria.listarAuditoriaAdmin(10, db).length, 0)
  })

  test('trocar a chave não muda o provedor ativo', async () => {
    const outro = repo.PROVIDERS.find((p) => p !== router.providerAtivo())
    await post('/credenciais/ativo', { ativo: outro })
    await post('/credenciais/claude', { apiKey: CHAVE, model: 'claude-sonnet-5' })

    assert.equal(repo.lerAtivo(), outro)
  })
})

describe('modelo de transcrição', () => {
  test('sem arquivo, vale o padrão do ambiente', () => {
    assert.equal(config_.transcription.model, config_.transcription.modelPadrao)
  })

  test('é lido do registro da OpenAI e vale sem reiniciar', async () => {
    await post('/credenciais/openai', {
      apiKey: CHAVE,
      model: 'gpt-4o',
      transcriptionModel: 'whisper-1',
    })

    assert.equal(repo.status('openai').transcriptionModel, 'whisper-1')
    assert.equal(config_.transcription.model, 'whisper-1')
  })

  test('não se confunde com o modelo de conversa da mesma seção', async () => {
    await post('/credenciais/openai', {
      apiKey: CHAVE,
      model: 'gpt-4o',
      transcriptionModel: 'whisper-1',
    })
    await post('/credenciais/openai', { apiKey: '', modelLivre: 'gpt-5' })

    assert.equal(repo.status('openai').model, 'gpt-5')
    assert.equal(repo.status('openai').transcriptionModel, 'whisper-1', 'o de transcrição ficou intacto')
  })

  test('só existe para a OpenAI', () => {
    repo.escrever('claude', { apiKey: CHAVE, transcriptionModel: 'whisper-1' })

    assert.equal(repo.status('claude').transcriptionModel, null)
    assert.ok(!JSON.parse(readFileSync(arquivo, 'utf8')).claude.transcriptionModel)
  })

  test('o campo aparece só na seção da OpenAI', async () => {
    const corpo = await (await get('/credenciais')).text()

    assert.equal(corpo.match(/name="transcriptionModel"/g).length, 1)
    assert.match(corpo, /mesma chave da OpenAI/)
    assert.match(corpo, /sempre OpenAI/)
  })

  test('o erro de transcrição não carrega o corpo da resposta', async () => {
    const { transcreverAudio } = await import('../src/transcription/transcribe.js')
    const antes = config_.transcription.apiKey
    config_.transcription.apiKey = CHAVE

    try {
      const { resultado } = await comFetchFalso(resposta401ComChave(CHAVE), () =>
        transcreverAudio(Buffer.from([1, 2, 3]), 'audio/ogg'),
      )

      assert.equal(resultado.ok, false)
      assert.match(resultado.erro, /401/)
      assert.ok(!resultado.erro.includes(CHAVE), 'a chave vazou pelo erro de transcrição')
      assert.ok(!resultado.erro.includes('invalid api key'), 'o corpo do provedor vazou')
    } finally {
      config_.transcription.apiKey = antes
    }
  })
})
