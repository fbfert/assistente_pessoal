import { normalizar } from '../text.js'
import { SEM_INFORMACAO, TIPOS_INTERACAO } from '../constants.js'
import {
  ESTADOS,
  PERGUNTAS,
  FRASES_DE_DUVIDA,
  PEDIDO_DE_EXEMPLO,
  TEXTO_CONSENTIMENTO,
  TEXTO_RECUSA_CONSENTIMENTO,
  TEXTO_CONCLUSAO,
  VERSAO_CONSENTIMENTO,
  MARCAS_INTERNAS_DE_ANAMNESE,
} from './questions.js'
import {
  perguntaEscolhaPersonalidade,
  mapearRespostaPersonalidade,
  PERSONALIDADE_PADRAO,
} from '../llm/prompts.js'

// =============================================================================
// Reconhecimento de resposta
//
// ATENÇÃO — estas funções comparam por IGUALDADE EXATA contra um Set fechado.
// NUNCA use regex de prefixo aqui.
//
// Bug real já pago: uma implementação `/^(sim|s|ok|pode)\b/` fez a resposta
// livre "pode me chamar de Ana" — destinada à pergunta de NOME — ser lida como
// afirmativo de CONSENTIMENTO. O efeito não foi uma resposta errada isolada:
// descolou o estado da conversa, e cada pergunta seguinte passou a gravar no
// campo errado. Existe teste dedicado a essa frase; não o remova.
// =============================================================================

const AFIRMATIVOS = new Set([
  'sim', 's', 'ss', 'sim aceito', 'aceito', 'sim quero', 'quero', 'topo', 'ok', 'okay',
  'blz', 'beleza', 'claro', 'pode', 'pode sim', 'isso', 'certo', 'concordo', 'confirmo',
  'bora', 'vamos', 'positivo', 'uhum', 'aham', 'ta', 'ta bom', 'ta certo', 'tudo certo',
  'de acordo', 'aceito sim', 'yes', 'y', '1',
])

const NEGATIVOS = new Set([
  'nao', 'n', 'nao aceito', 'nao quero', 'nao concordo', 'negativo', 'nunca', 'jamais',
  'nop', 'no', 'recuso', 'prefiro nao', 'nao obrigado', 'nao obrigada', '0',
])

const PULAR = new Set([
  'pular', 'pula', 'skip', 'passo', 'passar', 'proxima', 'proximo',
  'nao tenho', 'nao uso', 'nao tomo', 'nao faco uso', 'nenhum', 'nenhuma',
  'nada', 'nao se aplica', 'sem remedio', 'nao tenho nao', 'nao uso nada',
])

const VAGOS = new Set([
  'sei la', 'sla', 'nao sei', 'ns', 'normal', 'tanto faz', 'qualquer coisa',
  'depende', 'mais ou menos', 'talvez', 'hmm', 'hm', 'sei nao', 'nao sei dizer',
  'varias coisas', 'muita coisa', 'tudo', 'de tudo', 'coisas', 'nada demais',
  '-', '...', 'x',
])

/**
 * A pessoa perguntou de volta em vez de responder.
 *
 * Igualdade exata contra conjunto fechado, como todo o resto deste módulo.
 * Gravar a dúvida como resposta põe a pergunta dela dentro do perfil — e o
 * perfil vira system prompt de toda conversa seguinte.
 */
export const isDuvida = (texto) => FRASES_DE_DUVIDA.has(normalizar(texto))

export const isAfirmativo = (texto) => AFIRMATIVOS.has(normalizar(texto))
export const isNegativo = (texto) => NEGATIVOS.has(normalizar(texto))
export const isPular = (texto) => PULAR.has(normalizar(texto))

/** Vago = frase canônica de fuga, ou resposta vazia. */
export function isVago(texto) {
  const t = normalizar(texto)
  return t === '' || VAGOS.has(t)
}

// =============================================================================
// Plano de ação
//
// A máquina de estados é PURA: não importa a camada de banco. Ela devolve um
// plano que o chamador aplica. Isso é proposital — permite testar a transição
// inteira sem SQLite, e é o que torna barato o teste de regressão acima.
// =============================================================================

const plano = (mensagens = [], acoes = []) => ({
  mensagens: Array.isArray(mensagens) ? mensagens : [mensagens],
  acoes,
})

const salvarCampo = (campo, valor) => ({ tipo: 'salvarCampo', campo, valor })
const irPara = (estado) => ({ tipo: 'setEstado', estado })
const marcarExemploPedido = () => ({ tipo: 'marcarExemploPedido' })
const registrarInteracao = (tipoInteracao, texto) => ({
  tipo: 'registrarInteracao',
  tipoInteracao,
  texto,
})

/** Texto da pergunta de um estado, já com o pedido de exemplo quando for o caso. */
export function perguntaDoEstado(estado) {
  if (estado === ESTADOS.PERSONALIDADE) return perguntaEscolhaPersonalidade()
  return PERGUNTAS[estado]?.texto ?? null
}

/**
 * Processa uma resposta do usuário e devolve o plano de ação.
 *
 * @param {object} usuario linha de `usuarios`
 * @param {string} texto resposta recebida
 * @param {{extrairRemedios?: Function}} deps dependências injetadas (mockáveis em teste)
 * @returns {Promise<{mensagens: string[], acoes: object[]}>}
 */
export async function processarResposta(usuario, texto, deps = {}) {
  const estado = usuario?.anamnese_estado ?? ESTADOS.CONSENTIMENTO

  switch (estado) {
    case ESTADOS.CONSENTIMENTO:
      return processarConsentimento(texto)

    case ESTADOS.REMEDIO:
      return processarRemedio(usuario, texto, deps)

    case ESTADOS.PERSONALIDADE:
      return processarPersonalidade(usuario, texto)

    case ESTADOS.RESUMO:
      return processarResumo(texto)

    case ESTADOS.CONCLUIDO:
      return plano([]) // fora da anamnese: quem trata é o fluxo de conversa normal

    default:
      return processarPerguntaSimples(usuario, texto, estado)
  }
}

function processarConsentimento(texto) {
  if (isAfirmativo(texto)) {
    return plano([perguntaDoEstado(ESTADOS.NOME)], [
      { tipo: 'registrarConsentimento', versao: VERSAO_CONSENTIMENTO },
      registrarInteracao(
        TIPOS_INTERACAO.ANAMNESE,
        MARCAS_INTERNAS_DE_ANAMNESE.CONSENTIMENTO_ACEITO(VERSAO_CONSENTIMENTO),
      ),
      irPara(ESTADOS.NOME),
    ])
  }

  if (isNegativo(texto)) {
    // Não avança e não coleta nada. O estado continua 0.
    return plano([TEXTO_RECUSA_CONSENTIMENTO], [
      registrarInteracao(
        TIPOS_INTERACAO.ANAMNESE,
        MARCAS_INTERNAS_DE_ANAMNESE.CONSENTIMENTO_RECUSADO,
      ),
    ])
  }

  // Qualquer outra coisa: repete o pedido. Não interpreta, não deduz.
  return plano([
    'Só preciso de um "sim" ou "não" pra essa parte — é o registro do teu consentimento.',
    TEXTO_CONSENTIMENTO,
  ])
}

/** Estados 1–5 e 7–9: pergunta simples com campo direto. */
function processarPerguntaSimples(usuario, texto, estado) {
  const pergunta = PERGUNTAS[estado]
  if (!pergunta) return plano([])

  const proximo = estado + 1
  const jaPediuExemplo = Boolean(usuario?.anamnese_exemplo_pedido)

  if (pergunta.pulavel && isPular(texto)) {
    return plano([perguntaDoEstado(proximo)], [
      salvarCampo(pergunta.campo, SEM_INFORMACAO),
      irPara(proximo),
    ])
  }

  // Pergunta de volta: reformula em vez de gravar. Gasta a MESMA segunda chance
  // da resposta vaga — duas dúvidas seguidas seguem em frente, porque travar a
  // pessoa tentando arrancar qualidade perde a pessoa.
  if (isDuvida(texto) && !jaPediuExemplo && pergunta.reformulacao) {
    return plano([pergunta.reformulacao], [marcarExemploPedido()])
  }

  if (isVago(texto) && !jaPediuExemplo) {
    // Uma única segunda chance. Não avança o estado.
    return plano([PEDIDO_DE_EXEMPLO], [marcarExemploPedido()])
  }

  // Segunda resposta vaga: aceita como está e segue.
  // Zero-disciplina é premissa do produto — travar aqui perde o usuário.
  return plano([perguntaDoEstado(proximo)], [
    salvarCampo(pergunta.campo, texto),
    irPara(proximo),
  ])
}

/** Estado 6: extração de remédio via LLM, sob a Regra 1b. */
async function processarRemedio(usuario, texto, deps) {
  const proximo = ESTADOS.PESSOAS_CHAVE

  if (isDuvida(texto) && !usuario?.anamnese_exemplo_pedido) {
    return plano([PERGUNTAS[ESTADOS.REMEDIO].reformulacao], [marcarExemploPedido()])
  }

  if (isPular(texto) || isNegativo(texto)) {
    return plano([perguntaDoEstado(proximo)], [irPara(proximo)])
  }

  const extrair = deps.extrairRemedios
  // Sem extrator injetado não há como ler o texto — e inventar é proibido.
  const remedios = typeof extrair === 'function' ? await extrair(texto) : []

  const acoes = remedios
    .filter((r) => r && (r.nome || r.horario))
    .map((r) => ({
      tipo: 'adicionarRemedio',
      // Regra 1b: campo ausente vira o sentinela, nunca um chute.
      nome: r.nome || SEM_INFORMACAO,
      horario: r.horario || SEM_INFORMACAO,
    }))

  acoes.push(irPara(proximo))

  return plano([perguntaDoEstado(proximo)], acoes)
}

/** Estado 10: escolha de personalidade, com fallback para `neutro` na segunda tentativa. */
function processarPersonalidade(usuario, texto) {
  const escolhida = mapearRespostaPersonalidade(texto)

  if (escolhida) {
    return plano([], [
      { tipo: 'setPersonalidade', valor: escolhida },
      irPara(ESTADOS.RESUMO),
      { tipo: 'montarResumo' },
    ])
  }

  if (!usuario?.anamnese_exemplo_pedido) {
    return plano(
      ['Não peguei essa. Responde só o número: 1 pra direto, 2 pra caloroso, 3 pra neutro.'],
      [marcarExemploPedido()],
    )
  }

  // Segunda tentativa também não reconhecida: assume o padrão em vez de travar
  // o onboarding num loop de repergunta.
  return plano([], [
    { tipo: 'setPersonalidade', valor: PERSONALIDADE_PADRAO },
    irPara(ESTADOS.RESUMO),
    { tipo: 'montarResumo' },
  ])
}

/**
 * Estado 11: confirmação do resumo.
 *
 * Quando a pessoa aponta erro, o pedido é apenas REGISTRADO no histórico.
 * Não se tenta parsear qual campo mudar: na escala de 5 pessoas, correção
 * manual no banco é mais confiável e mais barata que parse automático.
 */
function processarResumo(texto) {
  const acoes = []

  if (!isAfirmativo(texto)) {
    acoes.push(registrarInteracao(TIPOS_INTERACAO.CORRECAO_REPORTADA, texto))
  }

  acoes.push({ tipo: 'concluirAnamnese' })

  const aviso = isAfirmativo(texto)
    ? []
    : ['Anotei a correção. Quem te convidou ajusta isso no cadastro.']

  return plano([...aviso, TEXTO_CONCLUSAO], acoes)
}

/** Texto do estado 11: o que o bot entendeu, para a pessoa confirmar. */
export function montarResumoAnamnese(usuario, remedios = []) {
  const campo = (v) => (v && String(v).trim() ? String(v).trim() : SEM_INFORMACAO)

  const linhaRemedios = remedios.length
    ? remedios.map((r) => `${r.nome} às ${r.horario}`).join('; ')
    : SEM_INFORMACAO

  return `Deixa eu ver se entendi:

- Te chamo de: ${campo(usuario?.nome)}
- O que mais trava teu dia: ${campo(usuario?.o_que_trava)}
- Tua rotina: ${campo(usuario?.rotina_boa)}
- Te joga em sobrecarga: ${campo(usuario?.gatilhos_de_sobrecarga)}
- Teu sinal de alerta: ${campo(usuario?.sinal_de_alerta)}
- Remédio: ${linhaRemedios}
- Pessoas-chave: ${campo(usuario?.pessoas_chave)}
- Teu vocabulário: ${campo(usuario?.vocabulario_proprio)}
- Eu nunca devo: ${campo(usuario?.nunca_fazer)}
- Vou falar contigo no modo: ${campo(usuario?.personalidade)}

Tá certo? Se tiver algo errado, me diz o que é — eu anoto e quem te convidou
ajusta no cadastro. Eu mesmo não consigo corrigir isso daqui.`
}
