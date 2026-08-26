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
    reformulacao:
      'Quero dizer: como você prefere que eu te chame nas mensagens? Pode ser seu nome, um apelido, o que você quiser.',
  },
  [ESTADOS.O_QUE_TRAVA]: {
    campo: 'o_que_trava',
    pulavel: false,
    texto: 'O que mais te atrapalha no dia a dia? Aquilo que trava mesmo.',
    reformulacao:
      'Pensa num dia ruim: o que costuma te impedir de fazer o que você queria? Começar uma tarefa, sair da cama, responder mensagem — o que for.',
  },
  [ESTADOS.ROTINA]: {
    campo: 'rotina_boa',
    pulavel: false,
    texto:
      'Me conta da tua rotina: qual é o teu horário bom do dia, aquele em que as coisas fluem, e qual é o ruim? Pode responder tudo numa mensagem só.',
    reformulacao:
      'Em que parte do dia você costuma render melhor, e em que parte fica mais difícil? Se não souber, pode dizer que não sabe.',
  },
  [ESTADOS.GATILHOS_DE_SOBRECARGA]: {
    campo: 'gatilhos_de_sobrecarga',
    pulavel: true,
    texto: 'O que costuma te jogar em sobrecarga? Barulho, gente demais, prazo, o que for.',
    reformulacao:
      'Quero saber o que te deixa no limite: barulho, pressa, gente demais, muita coisa ao mesmo tempo. O que te tira do sério primeiro?',
  },
  [ESTADOS.SINAL_DE_ALERTA]: {
    campo: 'sinal_de_alerta',
    pulavel: true,
    texto:
      'E como você percebe que tá entrando em sobrecarga? Tem algum sinal que você já reconhece em você?',
    reformulacao:
      'Quando você está ficando no limite, seu corpo ou sua cabeça dão algum aviso? Apertar o maxilar, perder a paciência, querer sumir. Se nunca reparou, tudo bem dizer isso.',
  },
  [ESTADOS.REMEDIO]: {
    campo: null, // tratamento próprio: extração via LLM
    pulavel: true,
    texto:
      'Você toma algum remédio com horário? Se sim, me diz o nome e a hora. Se não toma, é só dizer "não tenho".',
    reformulacao:
      'É sobre remédio de horário: se você toma algum, me diz o nome e a hora, tipo “ritalina às 8”. Se não toma nenhum, é só dizer que não toma.',
  },
  [ESTADOS.PESSOAS_CHAVE]: {
    campo: 'pessoas_chave',
    pulavel: true,
    texto: 'Tem alguém que é referência pra você no dia a dia? Quem?',
    reformulacao:
      'É sobre gente próxima: tem alguém com quem você fala quase todo dia, ou que você procura quando precisa de ajuda? Família, amigo, alguém do trabalho — ou ninguém.',
  },
  [ESTADOS.VOCABULARIO_PROPRIO]: {
    campo: 'vocabulario_proprio',
    pulavel: true,
    texto:
      'Você tem nome próprio pras coisas? Apelido pra alguma tarefa, gíria que você usa. Eu falo do teu jeito se você me ensinar.',
    reformulacao:
      'É sobre as palavras que VOCÊ usa. Se você chama a lista de tarefas de alguma coisa, ou tem apelido pra alguma parte do dia, me ensina que eu falo assim também.',
  },
  [ESTADOS.NUNCA_FAZER]: {
    campo: 'nunca_fazer',
    pulavel: true,
    texto: 'O que eu NUNCA devo fazer ou dizer com você? Isso eu respeito sem discutir.',
    reformulacao:
      'É pra eu saber o que te irrita ou te machuca. Por exemplo: cobrar, mandar mensagem cedo demais, falar em força de vontade. Tem algo assim?',
  },
})

/**
 * Frases de DÚVIDA: a pessoa perguntou de volta, não respondeu.
 *
 * Conjunto FECHADO, comparado por igualdade exata sobre o texto normalizado —
 * nunca prefixo, pela mesma razão registrada no AGENTS §4: prefixo solto já
 * descolou esta máquina de estados uma vez.
 *
 * Existe por um caso real: na primeira sessão do piloto, "Como assim?" foi
 * gravado como o valor de pessoas-chave e passou a entrar no system prompt
 * daquela pessoa como se fosse fato sobre ela.
 *
 * A lista vai estar incompleta — alguém vai escrever a dúvida de um jeito que
 * não está aqui. Ampliar é barato; abrir para heurística é que não.
 */
export const FRASES_DE_DUVIDA = Object.freeze(
  new Set([
    'como assim', 'como assim mesmo', 'que', 'que quer dizer', 'quer dizer o que',
    'nao entendi', 'nao entendi nada', 'nao entendi a pergunta', 'nao entendi essa',
    'entendi nao', 'nao compreendi', 'como', 'oi', 'hein', 'ha', 'han',
    'explica', 'explica melhor', 'pode explicar', 'pode repetir', 'repete',
    'o que voce quer dizer', 'nao sei o que responder', 'qual a pergunta', 'de novo',
  ]),
)

/** Pedido de exemplo concreto — usado UMA vez por estado quando a resposta vem vaga. */
export const PEDIDO_DE_EXEMPLO =
  'Me dá um exemplo concreto? Uma coisa específica que aconteceu, ajuda mais que uma resposta geral.'

export const TEXTO_RECUSA_CONSENTIMENTO =
  'Tudo bem, sem problema nenhum. Não vou guardar nada nem te mandar mensagem. Se mudar de ideia, é só escrever aqui.'

export const TEXTO_CONCLUSAO =
  'Pronto, é isso. A partir de amanhã eu te mando um check-in de manhã. Você pode me ignorar sem problema — eu não cobro, não insisto e não fico chateado. Até mais.'
