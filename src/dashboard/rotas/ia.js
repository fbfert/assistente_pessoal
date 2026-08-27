import { Router } from 'express'
import * as conteudo from '../../db/conteudoRepo.js'
import { config } from '../../config.js'
import { chamarLLM, providerAtivo } from '../../llm/router.js'
import { montarContextoAnamnese, PERSONALIDADES } from '../../llm/prompts.js'
import { instruiSobreMedicacao } from '../../conversa/seguranca.js'
import { pagina, escapar } from '../html.js'

export const rotasIa = Router()

/**
 * A tela de persona: núcleo fixo, variantes de tom, e um jeito de testar antes
 * de publicar.
 *
 * O teste é o motivo de a tela existir. Sem ele, calibrar o núcleo significa
 * publicar para todos e esperar alguém em sobrecarga servir de ambiente de
 * validação — que é exatamente o que este produto não pode fazer.
 */

/** As chaves que esta tela edita. Núcleo primeiro, por ser o que mais pesa. */
const CHAVES_DA_TELA = [
  'nucleo_fixo',
  ...PERSONALIDADES.map((p) => `variante_${p.valor}`),
]

/**
 * Contexto de anamnese FICTÍCIO, definido aqui no código.
 *
 * Nunca o de um participante real: o teste viraria uma forma de ler dado de
 * saúde de alguém sem abrir a página dele, fora do rastro de auditoria.
 */
const PESSOA_DE_EXEMPLO = Object.freeze({
  nome: 'Sofia (exemplo)',
  o_que_trava: 'começar tarefa que não tem primeiro passo óbvio',
  rotina_boa: 'rende de manhã; depois das 15h desanda',
  gatilhos_de_sobrecarga: 'barulho e reunião marcada em cima da hora',
  sinal_de_alerta: 'começa a roer a unha e a perna não para',
  pessoas_chave: 'a irmã, Bia',
  vocabulario_proprio: 'chama a lista de tarefas de "o monstro"',
  nunca_fazer: 'cobrar de manhã cedo, falar em força de vontade',
})

const REMEDIOS_DE_EXEMPLO = Object.freeze([{ nome: 'Venvanse', horario: '08:00' }])

// --- Limite de uso do teste --------------------------------------------------------
//
// Cada teste é uma chamada real e paga. O teto existe para o caso ACIDENTAL —
// formulário reenviado em laço, aba esquecida recarregando —, não para desconfiar
// de quem opera. Por isso é configurável, e zero desliga.
//
// Memória do processo: o admin é um processo só, e perder a contagem num reinício
// é irrelevante para o que isto protege.
/** adminId -> timestamps das chamadas na última hora */
const usos = new Map()

function registrarUso(adminId) {
  const agora = Date.now()
  const recentes = (usos.get(adminId) ?? []).filter((t) => agora - t < 60 * 60 * 1000)
  recentes.push(agora)
  usos.set(adminId, recentes)
  return recentes.length
}

function excedeuLimite(adminId) {
  const limite = config.testeIaLimiteHora
  if (!limite) return false // zero = sem limite

  const agora = Date.now()
  const recentes = (usos.get(adminId) ?? []).filter((t) => agora - t < 60 * 60 * 1000)
  usos.set(adminId, recentes)

  return recentes.length >= limite
}

/** Só para teste. */
export function _limparUsos() {
  usos.clear()
}

// --- Tela --------------------------------------------------------------------------

rotasIa.get('/ia', (_req, res) => {
  res.type('html').send(tela())
})

// --- Edição ------------------------------------------------------------------------

rotasIa.post('/ia/conteudo/:chave/confirmar', (req, res) => {
  const chave = req.params.chave
  if (!CHAVES_DA_TELA.includes(chave)) return res.status(404).send('chave desconhecida')

  const novo = String(req.body?.conteudo ?? '')

  let validado
  try {
    validado = conteudo.validar(chave, novo)
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  const atual = conteudo.ler(chave)
  if (validado === atual) return res.redirect(302, '/ia')

  const reforcada = conteudo.catalogo()[chave].reforcada

  res.type('html').send(
    pagina(
      'Confirmar mudança de persona',
      `<h1>Confirmar: ${escapar(conteudo.catalogo()[chave].rotulo)}</h1>
       ${
         reforcada
           ? `<div class="aviso">
                <p><strong>Isto é o núcleo fixo.</strong> Ele carrega as regras de segurança
                do produto — entre elas nunca inventar dado de saúde (1b) e nunca instruir
                sobre medicação (1c). Uma edição descuidada muda o comportamento do
                assistente com todos os participantes ao mesmo tempo, e o efeito aparece
                em silêncio.</p>
                <p class="nota">A verificação determinística que bloqueia instrução de
                medicação <strong>não</strong> é editável aqui e continua valendo — mas ela
                é a segunda camada, não a primeira.</p>
              </div>`
           : '<p class="nota">Isto muda o tom de toda mensagem enviada a quem escolheu esta variante.</p>'
       }

       <h2>Como está hoje</h2>
       <pre>${escapar(atual)}</pre>

       <h2>Como vai ficar</h2>
       <pre>${escapar(validado)}</pre>

       <form method="post" action="/ia/conteudo/${escapar(chave)}">
         <input type="hidden" name="conteudo" value="${escapar(validado)}">
         ${
           reforcada
             ? `<label for="palavra">Digite <code>${conteudo.PALAVRA_DE_CONFIRMACAO}</code> para confirmar</label>
                <input type="text" id="palavra" name="confirmacao" autocomplete="off" required>`
             : ''
         }
         <p>
           <button type="submit" ${reforcada ? 'class="perigo"' : ''}>Salvar</button>
           <a href="/ia">cancelar</a>
         </p>
       </form>`,
    ),
  )
})

rotasIa.post('/ia/conteudo/:chave', (req, res) => {
  const chave = req.params.chave
  if (!CHAVES_DA_TELA.includes(chave)) return res.status(404).send('chave desconhecida')

  try {
    conteudo.escrever(chave, req.body?.conteudo, {
      adminId: req.adminId ?? null,
      confirmacao: req.body?.confirmacao,
    })
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/ia')
})

rotasIa.post('/ia/conteudo/:chave/restaurar', (req, res) => {
  const chave = req.params.chave
  if (!CHAVES_DA_TELA.includes(chave)) return res.status(404).send('chave desconhecida')

  try {
    conteudo.restaurarPadrao(chave, {
      adminId: req.adminId ?? null,
      // Restaurar o núcleo também é escrever nele.
      confirmacao: req.body?.confirmacao,
    })
  } catch (e) {
    return res.status(400).type('html').send(tela({ erro: e.message }))
  }

  res.redirect(302, '/ia')
})

// --- Teste de mensagem ---------------------------------------------------------------

/**
 * Testa o RASCUNHO, não só o que está salvo.
 *
 * É o que torna o teste útil: calibrar antes de publicar. Testar apenas a versão
 * salva significaria publicar para todos os participantes para só então descobrir
 * o efeito — exatamente o que esta tela existe para evitar. Mesmo princípio já
 * aplicado no botão "Testar" da tela de credenciais.
 *
 * A chamada NÃO grava em `historico_interacoes`, não referencia participante e
 * não altera contador nenhum. É uma chamada isolada ao router.
 */
rotasIa.post('/ia/testar', async (req, res) => {
  const mensagem = String(req.body?.mensagem ?? '').trim()
  const variante = String(req.body?.variante ?? '')

  if (!mensagem) return res.type('html').send(tela({ erro: 'Escreva uma mensagem de exemplo.' }))
  if (!PERSONALIDADES.some((p) => p.valor === variante)) {
    return res.type('html').send(tela({ erro: 'Variante desconhecida.' }))
  }

  const adminId = req.adminId ?? 0
  if (excedeuLimite(adminId)) {
    return res.type('html').send(
      tela({
        erro: `Limite de ${config.testeIaLimiteHora} testes por hora atingido. O teto está em TESTE_IA_LIMITE_HORA.`,
      }),
    )
  }

  // Rascunho quando veio preenchido; o salvo quando não.
  const nucleo = String(req.body?.nucleo ?? '').trim() || conteudo.ler('nucleo_fixo')
  const textoVariante =
    String(req.body?.conteudoVariante ?? '').trim() || conteudo.ler(`variante_${variante}`)

  const systemPrompt = [
    nucleo,
    textoVariante,
    montarContextoAnamnese(PESSOA_DE_EXEMPLO, REMEDIOS_DE_EXEMPLO),
  ].join('\n\n')

  registrarUso(adminId)

  const inicio = Date.now()
  try {
    const resposta = await chamarLLM({
      systemPrompt,
      mensagens: [{ role: 'user', content: mensagem }],
    })

    res.type('html').send(
      tela({
        teste: {
          mensagem,
          variante,
          resposta,
          ms: Date.now() - inicio,
          rascunho: Boolean(String(req.body?.nucleo ?? '').trim()),
          // Vale ouro ao calibrar o núcleo: mostra que a resposta SERIA barrada
          // antes de chegar em alguém.
          bloquearia: instruiSobreMedicacao(resposta, REMEDIOS_DE_EXEMPLO).bloqueia,
        },
      }),
    )
  } catch (e) {
    // A mensagem do router não carrega o corpo da resposta do provedor.
    console.error('[ia] falha no teste de mensagem:', e?.message ?? e)
    res.type('html').send(tela({ erro: `A chamada falhou: ${e?.message ?? 'erro'}` }))
  }
})

// --- Apresentação ---------------------------------------------------------------------

function blocoTeste(teste) {
  if (!teste) return ''

  return `<div class="${teste.bloquearia ? 'aviso' : ''}">
  <h3>Resposta em ${teste.ms} ms — variante <code>${escapar(teste.variante)}</code>${
    teste.rascunho ? ', com o núcleo do rascunho' : ', com o que está salvo'
  }</h3>
  <pre>${escapar(teste.resposta)}</pre>
  ${
    teste.bloquearia
      ? `<p><strong>Esta resposta seria BLOQUEADA antes de chegar na pessoa.</strong> Ela
         instrui sobre um remédio do cadastro, e a verificação determinística barra isso —
         o participante receberia a mensagem de recusa no lugar. Se você está editando o
         núcleo, é sinal de que a regra 1c ficou fraca.</p>`
      : '<p class="nota">Nada foi gravado: nenhum participante, nenhum histórico, nenhum contador.</p>'
  }
</div>`
}

function tela({ erro = null, teste = null } = {}) {
  const blocos = CHAVES_DA_TELA.map((chave) => {
    const seed = conteudo.catalogo()[chave]
    const atual = conteudo.ler(chave)
    const editado = atual !== seed.conteudo

    return `<fieldset>
  <legend>${escapar(seed.rotulo)}${editado ? ' <span class="nota">(editado)</span>' : ''}</legend>
  <form method="post" action="/ia/conteudo/${chave}/confirmar">
    <textarea name="conteudo" rows="${chave === 'nucleo_fixo' ? 18 : 5}">${escapar(atual)}</textarea>
    <p>
      <button type="submit">Salvar</button>
      ${
        editado
          ? `<button type="submit" class="discreto"
               formaction="/ia/conteudo/${chave}/${
                 seed.reforcada ? 'confirmar' : 'restaurar'
               }">${seed.reforcada ? 'Ver diferença para o padrão' : 'Restaurar padrão'}</button>`
          : ''
      }
    </p>
  </form>
</fieldset>`
  }).join('')

  const opcoes = PERSONALIDADES.map(
    (p) => `<option value="${p.valor}">${escapar(p.rotulo)} — ${escapar(p.resumo)}</option>`,
  ).join('')

  return pagina(
    'IA e persona',
    `<h1>IA e persona</h1>
<p class="nota">Provedor ativo na conversa: <strong>${escapar(providerAtivo())}</strong> —
trocar é em <a href="/credenciais">Credenciais</a>, junto da chave. Aqui não há campo de
chave de API, de propósito.</p>

${erro ? `<div class="aviso">${escapar(erro)}</div>` : ''}
${blocoTeste(teste)}

<h2>Testar antes de publicar</h2>
<p class="nota">Roda o LLM de verdade contra um contexto de anamnese <strong>fictício</strong>,
nunca o de um participante real. Usa o texto que está nos campos abaixo — inclusive o que
você ainda não salvou. Cada teste é uma chamada paga; o teto é de
${config.testeIaLimiteHora || 'sem limite'} por hora.</p>

<form method="post" action="/ia/testar">
  <label for="mensagem">Mensagem de exemplo</label>
  <input type="text" id="mensagem" name="mensagem" placeholder="to sem energia hoje" required>

  <label for="variante">Variante</label>
  <select id="variante" name="variante">${opcoes}</select>

  <p><button type="submit">Testar</button></p>
</form>

${blocos}`,
  )
}
