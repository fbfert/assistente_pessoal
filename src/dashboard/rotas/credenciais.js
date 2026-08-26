import { Router } from 'express'
import {
  PROVIDERS,
  status,
  statusDeTodos,
  escrever,
  lerAtivo,
  escreverAtivo,
  modelosConhecidos,
  modelosTranscricaoConhecidos,
} from '../../llm/chavesRepo.js'
import { chamarLLM, providerAtivo } from '../../llm/router.js'
import { registrarAcaoAdmin, ACOES } from '../../db/auditoriaAdminRepo.js'
import { config } from '../../config.js'
import { pagina, escapar } from '../html.js'

export const rotasCredenciais = Router()

const ROTULOS = {
  claude: { nome: 'Claude (Anthropic)', variavel: 'ANTHROPIC_API_KEY' },
  openai: { nome: 'OpenAI', variavel: 'OPENAI_API_KEY' },
  deepseek: { nome: 'DeepSeek', variavel: 'DEEPSEEK_API_KEY' },
}

/** Mensagem mínima do teste: uma palavra de resposta, teto de tokens baixo. */
const MENSAGEM_DE_TESTE = "Responda apenas 'ok'."
const MAX_TOKENS_TESTE = 16

/**
 * O campo de texto livre vence o seletor quando preenchido.
 *
 * O projeto não tem JavaScript de cliente, então não existe "outro" revelando um
 * campo: o campo está sempre lá, e a regra de precedência é o que o substitui.
 */
const escolherModelo = (selecionado, livre) => String(livre ?? '').trim() || String(selecionado ?? '').trim()

rotasCredenciais.get('/credenciais', (_req, res) => {
  res.type('html').send(tela())
})

// --- Provedor ativo -----------------------------------------------------------

/**
 * ANTES de `/credenciais/:provider`: o Express casa na ordem de registro, e
 * `ativo` cairia na rota de provedor, que devolveria 404.
 */
rotasCredenciais.post('/credenciais/ativo', (req, res) => {
  const escolhido = String(req.body?.ativo ?? '')
  if (!PROVIDERS.includes(escolhido)) {
    return res.status(400).type('html').send(tela({ erro: 'Provedor desconhecido.' }))
  }

  const anterior = providerAtivo()
  const fixado = lerAtivo()

  // A comparação é contra o que está NO ARQUIVO, não contra o efetivo: escolher
  // o mesmo provedor que hoje vem do ambiente é uma decisão de fixá-lo aqui, e
  // comparar com o efetivo tornaria essa escolha impossível de registrar.
  if (escolhido === fixado) return res.redirect(302, '/credenciais')

  escreverAtivo(escolhido)
  registrarAcaoAdmin({
    autorId: req.adminId,
    acao: ACOES.CONFIGUROU_CREDENCIAL,
    descricao:
      fixado === null && escolhido === anterior
        ? `provedor ativo fixado nesta tela: ${escolhido} (antes vinha do ambiente)`
        : `provedor ativo na conversa: ${anterior} → ${escolhido}`,
  })

  res.redirect(302, '/credenciais')
})

// --- Teste de conectividade ---------------------------------------------------

/**
 * Rota SEPARADA da de salvar, e que NUNCA escreve no arquivo.
 *
 * Usa a chave digitada no formulário quando houver uma; a gravada quando o campo
 * vier vazio. Sem isso não haveria como validar uma credencial ANTES de
 * substituir a atual — que é exatamente o momento em que o erro custa caro, já
 * que sobrescrever é irreversível.
 *
 * Não gera auditoria: nada mudou.
 */
rotasCredenciais.post('/credenciais/:provider/testar', async (req, res) => {
  const provider = req.params.provider
  if (!PROVIDERS.includes(provider)) return res.status(404).send('provedor desconhecido')

  const apiKey = String(req.body?.apiKey ?? '').trim()
  const model = escolherModelo(req.body?.model, req.body?.modelLivre)
  const rascunho = apiKey || model ? { apiKey, model } : null

  const inicio = Date.now()
  try {
    const resposta = await chamarLLM({
      systemPrompt: 'Você é um teste de conectividade. Responda com uma palavra.',
      mensagens: [{ role: 'user', content: MENSAGEM_DE_TESTE }],
      provider,
      maxTokens: MAX_TOKENS_TESTE,
      credencial: rascunho,
    })

    return res.type('html').send(
      tela({
        teste: {
          provider,
          ok: true,
          ms: Date.now() - inicio,
          detalhe: String(resposta).slice(0, 120),
          rascunho: Boolean(apiKey),
        },
      }),
    )
  } catch (e) {
    // A mensagem do router não carrega o corpo da resposta do provedor, e a
    // credencial nunca entra nela. Este log é o do Docker.
    console.error(`[credenciais] falha ao testar ${provider}: ${e?.message ?? 'erro'}`)

    return res.type('html').send(
      tela({
        teste: {
          provider,
          ok: false,
          ms: Date.now() - inicio,
          detalhe: e?.message ?? 'falha desconhecida',
          rascunho: Boolean(apiKey),
        },
      }),
    )
  }
})

// --- Gravação -----------------------------------------------------------------

/**
 * Etapa intermediária ao SOBRESCREVER uma chave já configurada.
 *
 * Só existe aqui: esta é a única configuração do admin sem histórico e sem
 * reversão — guardar a chave anterior significaria manter uma credencial
 * provavelmente revogada num lugar consultável. Sobrescrever é, portanto,
 * irreversível.
 *
 * A chave nova viaja pelo formulário desta página até o POST final. Não é
 * gravada em lugar nenhum nesse meio-tempo.
 */
rotasCredenciais.post('/credenciais/:provider/confirmar', (req, res) => {
  const provider = req.params.provider
  if (!PROVIDERS.includes(provider)) return res.status(404).send('provedor desconhecido')

  const apiKey = String(req.body?.apiKey ?? '')
  const model = escolherModelo(req.body?.model, req.body?.modelLivre)
  const transcriptionModel = escolherModelo(
    req.body?.transcriptionModel,
    req.body?.transcriptionModelLivre,
  )

  // Sem chave nova, ou provedor ainda sem chave: nada a perder, grava direto.
  if (!apiKey.trim() || !status(provider).configurado) {
    return gravar(req, res, provider, apiKey, model, transcriptionModel)
  }

  const atual = status(provider)
  res.type('html').send(
    pagina(
      'Substituir credencial',
      `<h1>Substituir a chave de ${escapar(ROTULOS[provider].nome)}</h1>
       <div class="aviso">
         <p><strong>Isto é irreversível.</strong> Ao contrário das outras configurações
         do admin, credencial não tem histórico nem reversão — guardar a chave antiga
         significaria manter, num lugar consultável, uma credencial provavelmente
         revogada.</p>
         <p>A chave atual termina em <code>…${escapar(atual.ultimosCaracteres)}</code>
         e será perdida. Se você ainda vai precisar dela, salve-a antes de continuar.</p>
         <p class="nota">Se quiser conferir a chave nova antes de perder a atual, cancele
         e use <strong>Testar</strong> — ele valida o que está digitado sem gravar nada.</p>
       </div>
       <form method="post" action="/credenciais/${provider}">
         <input type="hidden" name="apiKey" value="${escapar(apiKey)}">
         <input type="hidden" name="model" value="${escapar(model)}">
         <input type="hidden" name="transcriptionModel" value="${escapar(transcriptionModel)}">
         <p>
           <button type="submit" class="perigo">Substituir a chave</button>
           <a href="/credenciais">cancelar</a>
         </p>
       </form>`,
    ),
  )
})

rotasCredenciais.post('/credenciais/:provider', (req, res) => {
  const provider = req.params.provider
  if (!PROVIDERS.includes(provider)) return res.status(404).send('provedor desconhecido')

  gravar(
    req,
    res,
    provider,
    String(req.body?.apiKey ?? ''),
    escolherModelo(req.body?.model, req.body?.modelLivre),
    escolherModelo(req.body?.transcriptionModel, req.body?.transcriptionModelLivre),
  )
})

function gravar(req, res, provider, apiKey, model, transcriptionModel) {
  const antes = status(provider)

  try {
    escrever(provider, { apiKey, model, transcriptionModel })
  } catch (e) {
    // A mensagem de erro NÃO carrega o valor tentado.
    console.error(`[credenciais] falha ao gravar ${provider}: ${e?.code ?? e?.name ?? 'erro'}`)
    return res.status(500).type('html').send(tela({ erro: `Não foi possível gravar: ${escapar(e?.code ?? 'erro de escrita')}` }))
  }

  const depois = status(provider)
  const mudou = []
  if (apiKey.trim()) mudou.push('chave substituída')
  if (depois.model !== antes.model) mudou.push(`modelo "${antes.model ?? '—'}" → "${depois.model}"`)
  if (depois.transcriptionModel !== antes.transcriptionModel) {
    mudou.push(
      `modelo de transcrição "${antes.transcriptionModel ?? '—'}" → "${depois.transcriptionModel}"`,
    )
  }

  // A CHAVE NUNCA ENTRA NA AUDITORIA — nem a antiga, nem a nova, nem mascarada.
  if (mudou.length) {
    registrarAcaoAdmin({
      autorId: req.adminId,
      acao: ACOES.CONFIGUROU_CREDENCIAL,
      descricao: `credencial de ${provider}: ${mudou.join('; ')}`,
    })
  }

  res.redirect(302, '/credenciais')
}

// --- Apresentação -------------------------------------------------------------

/**
 * Seletor de modelo: lista curada + campo livre SEMPRE visível.
 *
 * A lista vem de `modelosConhecidos`, derivada do padrão do projeto e do que
 * estiver gravado — nunca redigitada aqui, que envelheceria sozinha. O modelo
 * gravado fora da lista aparece nela, para que a tela nunca mostre um valor
 * diferente do que está valendo.
 */
function seletorDeModelo({ id, nome, opcoes, vigente, rotulo, dica }) {
  const itens = opcoes
    .map((m) => `<option value="${escapar(m)}"${m === vigente ? ' selected' : ''}>${escapar(m)}</option>`)
    .join('')

  return `<label for="${id}">${escapar(rotulo)}</label>
    <select id="${id}" name="${nome}">${itens}</select>
    <label for="${id}-livre" class="nota">ou digite outro (o que estiver aqui vence a lista)</label>
    <input type="text" id="${id}-livre" name="${nome}Livre" autocomplete="off" placeholder="${escapar(dica)}">`
}

function blocoDeTeste(teste) {
  if (!teste) return ''

  const origem = teste.rascunho ? 'a chave digitada agora' : 'a chave já salva'
  return teste.ok
    ? `<p class="nota"><strong>Teste OK</strong> em ${teste.ms} ms, com ${origem}.
       Resposta: <code>${escapar(teste.detalhe)}</code>. Nada foi gravado.</p>`
    : `<div class="aviso"><strong>Teste falhou</strong> em ${teste.ms} ms, com ${origem}:
       ${escapar(teste.detalhe)}. Nada foi gravado.</div>`
}

function tela({ erro = null, teste = null } = {}) {
  const todos = statusDeTodos()
  const ativo = providerAtivo()
  const ativoNoArquivo = lerAtivo()

  const secoes = PROVIDERS.map((p) => {
    const s = todos[p]
    const r = ROTULOS[p]
    const doAmbiente = Boolean(config.llm[p].apiKey)

    const situacao = s.configurado
      ? `configurada aqui · termina em <code>…${escapar(s.ultimosCaracteres)}</code>`
      : doAmbiente
        ? `vindo do ambiente (<code>${r.variavel}</code>)`
        : '<strong>não configurada</strong>'

    const vigente = s.model || config.llm[p].model

    return `<fieldset>
  <legend>${escapar(r.nome)}${p === ativo ? ' — <strong>ativo na conversa</strong>' : ''}</legend>
  <p class="nota">Chave: ${situacao} · Modelo em uso: <code>${escapar(vigente)}</code></p>

  ${teste?.provider === p ? blocoDeTeste(teste) : ''}

  <form method="post" action="/credenciais/${p}/confirmar">
    <label for="chave-${p}">Chave de API nova</label>
    <input type="password" id="chave-${p}" name="apiKey" autocomplete="off"
           placeholder="${s.configurado || doAmbiente ? 'deixe vazio para manter a atual' : 'cole a chave aqui'}">

    ${seletorDeModelo({
      id: `modelo-${p}`,
      nome: 'model',
      opcoes: modelosConhecidos(p),
      vigente,
      rotulo: 'Modelo da conversa',
      dica: vigente,
    })}

    ${p === 'openai' ? blocoTranscricao(s) : ''}

    <p>
      <button type="submit">Salvar ${escapar(r.nome)}</button>
      <button type="submit" formaction="/credenciais/${p}/testar">Testar</button>
    </p>
  </form>
</fieldset>`
  }).join('')

  const radios = PROVIDERS.map(
    (p) => `<label class="inline">
      <input type="radio" name="ativo" value="${p}"${p === ativo ? ' checked' : ''}>
      ${escapar(ROTULOS[p].nome)}
    </label>`,
  ).join(' ')

  return pagina(
    'Credenciais de LLM',
    `<h1>Credenciais de LLM</h1>

${erro ? `<div class="aviso">${escapar(erro)}</div>` : ''}

<h2>Provedor ativo na conversa</h2>
<form method="post" action="/credenciais/ativo">
  <p>${radios}</p>
  <p><button type="submit">Trocar provedor ativo</button></p>
</form>
<p class="nota">Vale sem reiniciar container nenhum.
${
  ativoNoArquivo
    ? 'Escolhido por esta tela.'
    : `Ainda vindo de <code>LLM_PROVIDER</code> no ambiente — a primeira troca aqui passa a mandar.`
}
A transcrição de áudio <strong>não</strong> segue esta escolha: é sempre OpenAI.</p>

<div class="aviso">
  <p><strong>A chave nunca é exibida de volta.</strong> O campo abre vazio mesmo
  quando já existe uma configurada — só os últimos caracteres aparecem, para você
  identificar qual está lá. Não há "ver histórico" de credencial, de propósito.</p>
  <p><strong>Testar</strong> não grava nada: usa a chave digitada no formulário,
  ou a que já está salva se o campo estiver vazio. Use antes de substituir uma
  chave que funciona.</p>
</div>

${secoes}

<h2>Onde isto fica</h2>
<p class="nota">Num arquivo dentro do volume compartilhado pelos dois containers,
não no banco e não no <code>.env</code>. Os dois continuam funcionando:
o que estiver aqui tem precedência; faltando, vale a variável de ambiente.
<strong>Recriar o volume apaga estas credenciais</strong> junto com o banco e o
pareamento do WhatsApp, e a única forma de recuperá-las é reconfigurar por aqui.</p>`,
  )
}

/**
 * Transcrição: mesma chave da seção OpenAI, segundo modelo.
 *
 * Fica DENTRO da seção da OpenAI, e não numa própria, exatamente porque
 * compartilha a credencial — uma seção separada sugeriria uma chave separada,
 * que é o mal-entendido a evitar.
 */
function blocoTranscricao(s) {
  const vigente = s.transcriptionModel || config.transcription.modelPadrao

  return `<hr>
  ${seletorDeModelo({
    id: 'modelo-transcricao',
    nome: 'transcriptionModel',
    opcoes: modelosTranscricaoConhecidos(),
    vigente,
    rotulo: 'Modelo de transcrição de áudio',
    dica: vigente,
  })}
  <p class="nota">Usa a <strong>mesma chave da OpenAI acima</strong> — é a mesma conta.
  A transcrição é sempre OpenAI, independentemente do provedor ativo na conversa.</p>`
}
