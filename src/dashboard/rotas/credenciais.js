import { Router } from 'express'
import { PROVIDERS, status, statusDeTodos, escrever } from '../../llm/chavesRepo.js'
import { registrarAcaoAdmin, ACOES } from '../../db/auditoriaAdminRepo.js'
import { config } from '../../config.js'
import { pagina, escapar } from '../html.js'

export const rotasCredenciais = Router()

const ROTULOS = {
  claude: { nome: 'Claude (Anthropic)', variavel: 'ANTHROPIC_API_KEY', exemplo: 'claude-sonnet-5' },
  openai: { nome: 'OpenAI', variavel: 'OPENAI_API_KEY', exemplo: 'gpt-4o' },
  deepseek: { nome: 'DeepSeek', variavel: 'DEEPSEEK_API_KEY', exemplo: 'deepseek-chat' },
}

rotasCredenciais.get('/credenciais', (_req, res) => {
  res.type('html').send(tela())
})

/**
 * Etapa intermediária ao SOBRESCREVER uma chave já configurada.
 *
 * Só existe aqui: esta é a única configuração do admin sem histórico e sem
 * reversão — guardar a chave anterior significaria manter uma credencial
 * provavelmente revogada num lugar consultável. Sobrescrever é, portanto,
 * irreversível.
 *
 * A senha nova viaja pelo formulário desta página até o POST final. Não é
 * gravada em lugar nenhum nesse meio-tempo.
 */
rotasCredenciais.post('/credenciais/:provider/confirmar', (req, res) => {
  const provider = req.params.provider
  if (!PROVIDERS.includes(provider)) return res.status(404).send('provedor desconhecido')

  const apiKey = String(req.body?.apiKey ?? '')
  const model = String(req.body?.model ?? '')

  // Sem chave nova, ou provedor ainda sem chave: nada a perder, grava direto.
  if (!apiKey.trim() || !status(provider).configurado) {
    return gravar(req, res, provider, apiKey, model)
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
       </div>
       <form method="post" action="/credenciais/${provider}">
         <input type="hidden" name="apiKey" value="${escapar(apiKey)}">
         <input type="hidden" name="model" value="${escapar(model)}">
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

  gravar(req, res, provider, String(req.body?.apiKey ?? ''), String(req.body?.model ?? ''))
})

function gravar(req, res, provider, apiKey, model) {
  const antes = status(provider)

  try {
    escrever(provider, { apiKey, model })
  } catch (e) {
    // A mensagem de erro NÃO carrega o valor tentado.
    console.error(`[credenciais] falha ao gravar ${provider}: ${e?.code ?? e?.name ?? 'erro'}`)
    return res.status(500).type('html').send(tela({ erro: `Não foi possível gravar: ${escapar(e?.code ?? 'erro de escrita')}` }))
  }

  const depois = status(provider)
  const mudou = []
  if (apiKey.trim()) mudou.push('chave substituída')
  if (model.trim() && model.trim() !== antes.model) {
    mudou.push(`modelo "${antes.model ?? '—'}" → "${depois.model}"`)
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

function tela({ erro = null } = {}) {
  const todos = statusDeTodos()
  const ativo = config.llm.defaultProvider

  const secoes = PROVIDERS.map((p) => {
    const s = todos[p]
    const r = ROTULOS[p]
    const doAmbiente = Boolean(config.llm[p].apiKey)

    const situacao = s.configurado
      ? `configurada aqui · termina em <code>…${escapar(s.ultimosCaracteres)}</code>`
      : doAmbiente
        ? `vindo do ambiente (<code>${r.variavel}</code>)`
        : '<strong>não configurada</strong>'

    return `<fieldset>
  <legend>${escapar(r.nome)}${p === ativo ? ' — <strong>ativo na conversa</strong>' : ''}</legend>
  <p class="nota">Chave: ${situacao} · Modelo: <code>${escapar(s.model || config.llm[p].model)}</code></p>

  <form method="post" action="/credenciais/${p}/confirmar">
    <label for="chave-${p}">Chave de API nova</label>
    <input type="password" id="chave-${p}" name="apiKey" autocomplete="off"
           placeholder="${s.configurado || doAmbiente ? 'deixe vazio para manter a atual' : 'cole a chave aqui'}">

    <label for="modelo-${p}">Modelo</label>
    <input type="text" id="modelo-${p}" name="model"
           value="${escapar(s.model || '')}" placeholder="${escapar(r.exemplo)}">

    <p><button type="submit">Salvar ${escapar(r.nome)}</button></p>
  </form>
</fieldset>`
  }).join('')

  return pagina(
    'Credenciais de LLM',
    `<h1>Credenciais de LLM</h1>
<p class="nota">Provedor ativo na conversa: <strong>${escapar(ativo)}</strong>.
A transcrição de áudio usa sempre a OpenAI, independentemente desta escolha.</p>

${erro ? `<div class="aviso">${escapar(erro)}</div>` : ''}

<div class="aviso">
  <p><strong>A chave nunca é exibida de volta.</strong> O campo abre vazio mesmo
  quando já existe uma configurada — só os últimos caracteres aparecem, para você
  identificar qual está lá. Não há "ver histórico" de credencial, de propósito.</p>
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
