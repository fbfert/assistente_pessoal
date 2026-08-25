/**
 * Estados da anamnese. Enum congelado: nenhum módulo deve comparar contra o
 * número literal.
 */
export const ESTADOS = Object.freeze({
  CONSENTIMENTO: 0,
  NOME: 1,
  O_QUE_TRAVA: 2,
  ROTINA: 3,
  GATILHOS_DE_SOBRECARGA: 4,
  SINAL_DE_ALERTA: 5,
  REMEDIO: 6,
  PESSOAS_CHAVE: 7,
  VOCABULARIO_PROPRIO: 8,
  NUNCA_FAZER: 9,
  PERSONALIDADE: 10,
  RESUMO: 11,
  CONCLUIDO: 12,
})

export const VERSAO_CONSENTIMENTO = 'v1'

export const TEXTO_CONSENTIMENTO = `Oi. Eu sou o TARS.

Eu sou um assistente de rotina por WhatsApp — remédio, tarefa, sono. Você me contratou pra ser um empurrão no momento certo, não pra ser mais um app cobrando você.

Antes de qualquer coisa, preciso ser honesto sobre três coisas:

1. Isto é um PILOTO DE TESTE, com 5 pessoas. Não é um produto pronto. Pode ter falha, pode sair do ar.

2. Eu vou guardar o que você me contar, incluindo DADO DE SAÚDE (nome de remédio, horário). Isso é dado sensível. Fica em um banco no servidor de quem te convidou, não é vendido, não é compartilhado, não treina modelo nenhum.

3. Eu NÃO sou terapeuta e NÃO dou diagnóstico. Se você estiver em crise de verdade, procure ajuda humana — CVV 188, ligação gratuita, 24h.

Você pode desistir quando quiser, é só dizer, e eu apago o que tenho.

Se estiver tudo bem, responde "sim" que eu começo.`

/**
 * Perguntas dos estados 1 a 9. Estados 0, 10, 11 e 12 têm tratamento próprio.
 * `campo` é a coluna de `usuarios` onde a resposta é gravada.
 */
export const PERGUNTAS = Object.freeze({
  [ESTADOS.NOME]: {
    campo: 'nome',
    pulavel: false,
    texto: 'Boa. Primeiro: como você quer que eu te chame?',
  },
  [ESTADOS.O_QUE_TRAVA]: {
    campo: 'o_que_trava',
    pulavel: false,
    texto: 'O que mais te atrapalha no dia a dia? Aquilo que trava mesmo.',
  },
  [ESTADOS.ROTINA]: {
    campo: 'rotina_boa',
    pulavel: false,
    texto:
      'Me conta da tua rotina: qual é o teu horário bom do dia, aquele em que as coisas fluem, e qual é o ruim? Pode responder tudo numa mensagem só.',
  },
  [ESTADOS.GATILHOS_DE_SOBRECARGA]: {
    campo: 'gatilhos_de_sobrecarga',
    pulavel: true,
    texto: 'O que costuma te jogar em sobrecarga? Barulho, gente demais, prazo, o que for.',
  },
  [ESTADOS.SINAL_DE_ALERTA]: {
    campo: 'sinal_de_alerta',
    pulavel: true,
    texto:
      'E como você percebe que tá entrando em sobrecarga? Tem algum sinal que você já reconhece em você?',
  },
  [ESTADOS.REMEDIO]: {
    campo: null, // tratamento próprio: extração via LLM
    pulavel: true,
    texto:
      'Você toma algum remédio com horário? Se sim, me diz o nome e a hora. Se não toma, é só dizer "não tenho".',
  },
  [ESTADOS.PESSOAS_CHAVE]: {
    campo: 'pessoas_chave',
    pulavel: true,
    texto: 'Tem alguém que é referência pra você no dia a dia? Quem?',
  },
  [ESTADOS.VOCABULARIO_PROPRIO]: {
    campo: 'vocabulario_proprio',
    pulavel: true,
    texto:
      'Você tem nome próprio pras coisas? Apelido pra alguma tarefa, gíria que você usa. Eu falo do teu jeito se você me ensinar.',
  },
  [ESTADOS.NUNCA_FAZER]: {
    campo: 'nunca_fazer',
    pulavel: true,
    texto: 'O que eu NUNCA devo fazer ou dizer com você? Isso eu respeito sem discutir.',
  },
})

/** Pedido de exemplo concreto — usado UMA vez por estado quando a resposta vem vaga. */
export const PEDIDO_DE_EXEMPLO =
  'Me dá um exemplo concreto? Uma coisa específica que aconteceu, ajuda mais que uma resposta geral.'

export const TEXTO_RECUSA_CONSENTIMENTO =
  'Tudo bem, sem problema nenhum. Não vou guardar nada nem te mandar mensagem. Se mudar de ideia, é só escrever aqui.'

export const TEXTO_CONCLUSAO =
  'Pronto, é isso. A partir de amanhã eu te mando um check-in de manhã. Você pode me ignorar sem problema — eu não cobro, não insisto e não fico chateado. Até mais.'
