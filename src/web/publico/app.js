/*
 * Cliente do canal web.
 *
 * O limite deste arquivo é deliberado e está na spec: ele ENVIA texto e DESENHA
 * o que voltou. Nenhuma regra de negócio mora aqui — a página não sabe o que é
 * anamnese, não conhece estado, não decide nada sobre a conversa. Se um dia
 * precisar saber, a decisão está no lugar errado.
 *
 * Sem framework, sem build, sem nada vindo de fora: a CSP do servidor recusaria.
 */

const CHAVE_TOKEN = 'tars.token'

/**
 * Endereços RELATIVOS à pasta da página, nunca absolutos.
 *
 * É o que permite montar isto sob qualquer prefixo — em produção a página vive
 * em /chat/ e o Apache tira o prefixo antes de repassar ao container. Com
 * `/web/entrar` fixo, a chamada sairia da raiz do domínio e cairia no admin.
 *
 * Depende de a URL terminar em barra: `/chat/` resolve para `/chat/web/entrar`,
 * enquanto `/chat` resolveria para `/web/entrar`. Quem garante a barra é o
 * redirecionamento no proxy.
 */
const rota = (caminho) => new URL(caminho, document.baseURI).toString()

const el = (id) => document.getElementById(id)

const telas = {
  entrada: el('tela-entrada'),
  conversa: el('tela-conversa'),
}

let enviando = false

// --- Apresentação -------------------------------------------------------------

function mostrar(qual) {
  telas.entrada.hidden = qual !== 'entrada'
  telas.conversa.hidden = qual !== 'conversa'
}

function avisar(onde, texto) {
  const caixa = el(onde === 'entrada' ? 'aviso-entrada' : 'aviso-conversa')
  caixa.textContent = texto ?? ''
  caixa.hidden = !texto
}

/**
 * `textContent`, nunca `innerHTML`: o que a pessoa escreve e o que o modelo
 * devolve entram como TEXTO. Isso não é estilo — é o que impede que um texto
 * parecido com marcação vire marcação.
 */
function bolha(quem, texto) {
  const div = document.createElement('div')
  div.className = `bolha ${quem}`
  div.textContent = texto
  el('conversa').append(div)
  div.scrollIntoView({ block: 'nearest' })
  return div
}

// --- Sessão -------------------------------------------------------------------

const lerToken = () => {
  try {
    return localStorage.getItem(CHAVE_TOKEN)
  } catch {
    // Navegador com armazenamento bloqueado: a sessão vale só enquanto a aba
    // estiver aberta. Melhor que uma tela de erro.
    return null
  }
}

const guardarToken = (token) => {
  try {
    localStorage.setItem(CHAVE_TOKEN, token)
  } catch {
    /* sem armazenamento: segue em memória */
  }
}

const esquecerToken = () => {
  try {
    localStorage.removeItem(CHAVE_TOKEN)
  } catch {
    /* nada a fazer */
  }
}

let token = lerToken()

/**
 * Sessão vencida. A frase importa: a pessoa precisa saber que NÃO perdeu a
 * conversa — só a chave da porta. Sem isso, sumir com o histórico da tela
 * parece perda de dado.
 */
function exigirNovaEntrada() {
  token = null
  esquecerToken()
  el('conversa').replaceChildren()
  mostrar('entrada')
  avisar(
    'entrada',
    'Sua sessão expirou por inatividade. Entre de novo com telefone e data de ' +
      'nascimento — sua conversa continua guardada, nada foi perdido.',
  )
  el('telefone').focus()
}

// --- Entrada ------------------------------------------------------------------

el('form-entrada').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  avisar('entrada', null)

  const botao = el('botao-entrar')
  botao.disabled = true
  botao.textContent = 'Entrando...'

  try {
    const resposta = await fetch(rota('web/entrar'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        telefone: el('telefone').value,
        dataNascimento: el('nascimento').value,
      }),
    })

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}))
      // Mensagem GENÉRICA: a página não sabe (e o servidor não conta) se errou o
      // telefone ou a data. Dizer qual dos dois facilitaria tentativa e erro.
      avisar(
        'entrada',
        corpo.erro ?? 'Não consegui te encontrar com esses dados. Confira e tente de novo.',
      )
      return
    }

    const { token: novo, mensagemInicial } = await resposta.json()
    token = novo
    guardarToken(novo)

    el('form-entrada').reset()
    avisar('conversa', null)
    el('conversa').replaceChildren()
    if (mensagemInicial) bolha('tars', mensagemInicial)

    mostrar('conversa')
    el('mensagem').focus()
  } catch {
    avisar('entrada', 'Não consegui falar com o servidor. Tente de novo em instantes.')
  } finally {
    botao.disabled = false
    botao.textContent = 'Entrar'
  }
})

// --- Conversa -----------------------------------------------------------------

el('form-mensagem').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  if (enviando) return

  const campo = el('mensagem')
  const texto = campo.value.trim()
  if (!texto) return

  enviando = true
  el('botao-enviar').disabled = true
  campo.value = ''
  bolha('pessoa', texto)

  // A chamada ao modelo leva alguns segundos. Sem este aviso a tela fica parada
  // e a pessoa reenvia — que é o pior desfecho possível aqui.
  const pensando = bolha('pensando', 'digitando...')

  try {
    const resposta = await fetch(rota('web/mensagem'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ texto }),
    })

    pensando.remove()

    if (resposta.status === 401) return exigirNovaEntrada()

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}))
      avisar('conversa', corpo.erro ?? 'Não consegui enviar. Tente de novo.')
      return
    }

    avisar('conversa', null)
    const { respostas } = await resposta.json()
    for (const r of respostas ?? []) bolha('tars', r)
  } catch {
    pensando.remove()
    avisar('conversa', 'Não consegui falar com o servidor. Sua mensagem não foi enviada.')
  } finally {
    enviando = false
    el('botao-enviar').disabled = false
    campo.focus()
  }
})

el('botao-sair').addEventListener('click', () => {
  esquecerToken()
  token = null
  el('conversa').replaceChildren()
  mostrar('entrada')
  avisar('entrada', 'Você saiu. Sua conversa continua guardada.')
})

// --- Abertura -----------------------------------------------------------------

if (token) {
  // Token guardado de uma aba anterior. A conversa continua do ponto em que
  // parou — o que a tela não tem é o texto do que já foi dito, que vive no
  // servidor e não é devolvido a esta página.
  mostrar('conversa')
  bolha('tars', 'Você voltou. Pode continuar de onde parou — eu lembro do que a gente já conversou.')
  el('mensagem').focus()
} else {
  mostrar('entrada')
  el('telefone').focus()
}
