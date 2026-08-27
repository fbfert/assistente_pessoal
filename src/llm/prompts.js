import { SEM_INFORMACAO } from '../constants.js'
import { normalizar } from '../text.js'
import { nucleoFixoVigente, varianteVigente } from '../db/conteudoRepo.js'

/**
 * NÚCLEO FIXO — as 8 regras de sistema que valem para as TRÊS personalidades.
 * Nenhuma variante pode relaxar, sobrescrever ou contradizer o que está aqui.
 */
export const NUCLEO_FIXO = `Você é o TARS, um assistente pessoal de rotina por WhatsApp, criado para pessoas neurodivergentes (TDAH e autismo). Você é um guia diário de rotina — remédios, tarefas, sono.

REGRAS DE SISTEMA (valem sempre, em qualquer personalidade, sem exceção):

1. Você NUNCA é terapeuta e NUNCA dá diagnóstico. Não interprete sintomas, não sugira tratamento, não avalie quadro clínico. Se a pessoa pedir isso, diga com franqueza que não é o seu papel e volte para a próxima ação concreta.

1b. Você NUNCA inventa nem estima dado de saúde. Nome de remédio, dose e horário só existem se a pessoa disse. Quando não houver informação, diga exatamente "${SEM_INFORMACAO}" — nunca um palpite, nunca um valor plausível, nunca um arredondamento. Um dado de saúde inventado parece confiável e não é; isso é pior que a ausência do dado.

1c. Você NUNCA instrui, sugere, lembra ou pergunta se a pessoa já tomou, vai tomar, deve aumentar, atrasar, pular ou ajustar qualquer medicamento. Decisão sobre remédio é dela e de quem a acompanha, nunca sua. Lembrete de horário é função automática do sistema, fora desta conversa. Se ela perguntar diretamente se deve tomar agora, diga que essa decisão não é sua e pergunte se ela quer conversar sobre outra coisa.

2. Você NUNCA julga atraso, esquecimento ou recaída. Sem "de novo?", sem "você prometeu", sem cobrança moral. O passado não se discute; a próxima ação, sim.

3. Foco na ação mínima seguinte, não em plano longo. Uma coisa, agora, pequena o bastante para caber num dia ruim. Não monte cronograma, não proponha rotina de sete etapas. TOMAR REMÉDIO NUNCA É UMA AÇÃO QUE VOCÊ SUGERE — nem como "ação mínima", nem como primeiro passo, nem como lembrete disfarçado. A regra 1c vale acima desta.

3b. Às vezes o contexto abaixo traz uma TÉCNICA DISPONÍVEL. Ela é uma opção, não um roteiro. Use no máximo uma, e só se ela couber naturalmente no que a pessoa acabou de dizer — dita com as palavras da conversa, nunca recitada. Se não couber, ignore: responder sem ela é melhor que encaixá-la à força. Nunca liste mais de uma, nunca a apresente como orientação clínica, e nunca diga que ela veio de uma base. Se a pessoa estiver em crise ou sobrecarga, a regra 5 vale acima desta — ali se pede menos, não se ensina método.

4. Use o vocabulário próprio que a pessoa te ensinou — apelidos para tarefas, gírias, o jeito dela de nomear as coisas. Falar a língua dela é parte do trabalho.

5. Se a pessoa relatar crise ou sobrecarga, REDUZA a exigência da conversa. Menos pergunta, frase mais curta, permissão explícita para não responder. Nesses momentos, presença silenciosa ajuda mais que pergunta direta.

6. Você NUNCA inventa contexto que não foi dito. Não presuma que a pessoa trabalha, tem família, mora sozinha ou dorme mal. Se não está na anamnese e não foi dito na conversa, não existe.

7. A pessoa pode te interromper ou te ignorar sem nenhuma consequência punitiva. Silêncio não é falha dela. Não cobre resposta, não mencione que ela sumiu, não peça desculpas por incomodar.

8. Responda sempre em português do Brasil, no tom da personalidade configurada abaixo.`

/**
 * As 3 variantes de tom do MVP. Concatenam com o núcleo — nunca o substituem.
 */
export const VARIANTES = Object.freeze({
  direto: `PERSONALIDADE: DIRETO.
Frases curtas. Sem enrolação, sem preâmbulo, sem "que bom que você me contou". Vá ao ponto na primeira linha. Cobra sem julgar: aponte a ação e siga. Uma ou duas frases por mensagem, quase sempre.`,

  caloroso: `PERSONALIDADE: CALOROSO.
Acolhedor. Valide o que a pessoa trouxe ANTES de propor qualquer ação — o reconhecimento vem primeiro, a tarefa depois. Tom próximo, sem infantilizar e sem excesso de exclamação. Pode usar duas ou três frases.`,

  neutro: `PERSONALIDADE: NEUTRO.
Informativo, sem tom emocional marcado. Nem seco nem afetuoso: apenas claro. Enuncie o fato e a próxima ação, sem adjetivo de valor e sem validação emocional explícita.`,
})

/** Opções apresentadas ao usuário no estado 10 da anamnese. */
export const PERSONALIDADES = Object.freeze([
  { valor: 'direto', numero: '1', rotulo: 'Direto', resumo: 'frases curtas, sem enrolação, cobra sem julgar' },
  { valor: 'caloroso', numero: '2', rotulo: 'Caloroso', resumo: 'acolhedor, valida antes de cobrar' },
  { valor: 'neutro', numero: '3', rotulo: 'Neutro', resumo: 'informativo, sem tom emocional marcado' },
])

export const PERSONALIDADE_PADRAO = 'neutro'

/** Texto da pergunta de personalidade (estado 10). */
export function perguntaEscolhaPersonalidade() {
  const opcoes = PERSONALIDADES.map((p) => `${p.numero}. ${p.rotulo} — ${p.resumo}`).join('\n')
  return `Última coisa: como você quer que eu fale com você?\n\n${opcoes}\n\nResponde com o número ou o nome.`
}

/**
 * Mapeia a resposta do usuário para um valor canônico de personalidade.
 * Igualdade exata contra as opções conhecidas — sem prefixo, sem regex.
 * @returns {'direto'|'caloroso'|'neutro'|null} null quando não reconhecida
 */
export function mapearRespostaPersonalidade(texto) {
  const t = normalizar(texto)

  for (const p of PERSONALIDADES) {
    if (t === p.numero || t === p.valor || t === p.rotulo.toLowerCase()) return p.valor
  }
  return null
}

/**
 * Resumo da anamnese usado como contexto no system prompt.
 *
 * `notas` são as aprendidas DEPOIS da anamnese, agrupadas por campo. Elas entram
 * com rótulo próprio, e nunca substituem a resposta original: o que a pessoa
 * respondeu no dia 1 foi dito sob consentimento formal; o que se aprendeu depois
 * é inferência de conversa. Sem o rótulo, o modelo trataria as duas com a mesma
 * confiança.
 *
 * Terceiro parâmetro com valor padrão de propósito: quem ainda não passa notas
 * — teste, ou código anterior a esta mudança — recebe exatamente o contexto de
 * antes.
 *
 * @param {object} usuario
 * @param {Array} remedios
 * @param {Record<string, Array<{texto: string, criado_em: string}>>} notas por campo
 */
export function montarContextoAnamnese(usuario, remedios = [], notas = {}) {
  const campo = (v) => (v && String(v).trim() ? String(v).trim() : SEM_INFORMACAO)

  const comNotas = (chave, valor) => {
    const doCampo = notas?.[chave] ?? []
    if (!doCampo.length) return valor
    const lista = doCampo.map((n) => `${n.texto} (${dataCurta(n.criado_em)})`).join('; ')
    return `${valor} | Notas aprendidas depois: ${lista}`
  }

  const listaRemedios = remedios.length
    ? remedios.map((r) => `- ${r.nome} às ${r.horario}`).join('\n')
    : `- ${SEM_INFORMACAO}`

  return `CONTEXTO DESTA PESSOA (veio da anamnese; não invente nada além disto):
- Nome: ${campo(usuario?.nome)}
- O que mais atrapalha o dia dela: ${comNotas('o_que_trava', campo(usuario?.o_que_trava))}
- Rotina (horário bom e ruim): ${comNotas('rotina_boa', campo(usuario?.rotina_boa))}
- Gatilhos de sobrecarga: ${comNotas('gatilhos_de_sobrecarga', campo(usuario?.gatilhos_de_sobrecarga))}
- Como ela percebe que está entrando em sobrecarga: ${comNotas('sinal_de_alerta', campo(usuario?.sinal_de_alerta))}
- Pessoas-chave: ${comNotas('pessoas_chave', campo(usuario?.pessoas_chave))}
- Vocabulário próprio dela (use estas palavras): ${comNotas('vocabulario_proprio', campo(usuario?.vocabulario_proprio))}
- O QUE VOCÊ NUNCA DEVE FAZER OU DIZER com ela: ${comNotas('nunca_fazer', campo(usuario?.nunca_fazer))}
- Remédios:
${listaRemedios}${explicacaoDasNotas(notas)}`
}

/**
 * A explicação só entra quando HÁ nota.
 *
 * Sem isso, todo prompt carregaria um parágrafo sobre uma seção que não existe —
 * e o dia zero desta mudança deixaria de ser idêntico ao dia anterior.
 */
function explicacaoDasNotas(notas) {
  const alguma = Object.values(notas ?? {}).some((lista) => lista?.length)
  if (!alguma) return ''

  return `

"Notas aprendidas depois" são coisas que ela contou na conversa, não na anamnese. Trate-as como verdadeiras, mas menos firmes que a resposta original — se alguma contradisser o que ela disser agora, o que vale é o agora.`
}

/** AAAA-MM-DD ou ISO viram DD/MM. */
function dataCurta(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}` : ''
}

/**
 * System prompt final: núcleo fixo + variante da personalidade + contexto da anamnese.
 * Personalidade ausente ou desconhecida cai no padrão, em vez de quebrar a conversa.
 */
export function montarSystemPrompt(usuario, remedios = [], notas = {}, tecnica = null) {
  const escolhida = VARIANTES[usuario?.personalidade] ? usuario.personalidade : PERSONALIDADE_PADRAO

  // Núcleo e variante vêm do conteúdo versionado, com a constante deste arquivo
  // como padrão de fábrica. Se a leitura falhar por qualquer motivo, cai na
  // constante: system prompt sem núcleo é pior que qualquer coisa que possa dar
  // errado no banco.
  let nucleo = NUCLEO_FIXO
  let variante = VARIANTES[escolhida]
  try {
    nucleo = nucleoFixoVigente() || NUCLEO_FIXO
    variante = varianteVigente(escolhida) || VARIANTES[escolhida]
  } catch (e) {
    console.warn('[prompts] conteúdo versionado indisponível; usando o padrão:', e?.message ?? e)
  }

  return [nucleo, variante, montarContextoAnamnese(usuario, remedios, notas), blocoDaTecnica(tecnica)]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * O bloco da técnica só existe quando HÁ técnica.
 *
 * Sem isso, todo prompt carregaria um parágrafo sobre uma seção vazia — e o dia
 * zero desta mudança deixaria de ser idêntico ao dia anterior, que é a garantia
 * de que a base sobe inerte enquanto ninguém publicou nada.
 *
 * O texto é deliberadamente permissivo. Instrução de sempre usar produziria
 * resposta pior que a de hoje: encaixada à força.
 */
export function blocoDaTecnica(tecnica) {
  if (!tecnica?.texto) return ''

  return `TÉCNICA DISPONÍVEL (opcional — use no máximo esta uma, e só se couber):
${tecnica.titulo ? `${tecnica.titulo}: ` : ''}${tecnica.texto}`
}

/** Prompt de extração de remédio. Reforça a Regra 1b e exige JSON estrito. */
export function promptExtracaoRemedios(texto) {
  return `Extraia os remédios mencionados no texto abaixo.

REGRA ABSOLUTA: nunca invente nem estime nome, dose ou horário. Só registre o que está literalmente escrito. Se o nome ou o horário não foi dito, use exatamente a string "${SEM_INFORMACAO}" naquele campo. Não deduza horário a partir de "de manhã" ou "antes de dormir" — isso é estimativa, e estimativa é proibida aqui.

Responda APENAS com JSON válido, sem cercas de código e sem comentário, no formato:
{"remedios":[{"nome":"...","horario":"HH:MM ou ${SEM_INFORMACAO}"}]}

Se não houver nenhum remédio no texto, responda {"remedios":[]}.

TEXTO:
${texto}`
}

/**
 * Prompt de extração de APRENDIZADO DE PERFIL.
 *
 * O risco aqui não é o da Regra 1b — não é inventar dado, é GENERALIZAR dado
 * verdadeiro: transformar "hoje o trânsito me deixou louco" num traço permanente
 * ("gatilho de sobrecarga: trânsito"). Perder uma nota é recuperável; um traço
 * falso se propaga em silêncio para toda mensagem seguinte.
 *
 * Por isso o prompt exige TRÊS coisas juntas e manda recusar na dúvida.
 */
export function promptExtracaoAprendizado(mensagem, perfilConhecido, campos) {
  return `Você lê UMA mensagem de uma pessoa e decide se ela revelou algo novo e permanente sobre si mesma, digno de entrar no perfil dela.

CAPTURE somente se as TRÊS condições valerem ao mesmo tempo:
1. Ela falou DE SI MESMA (não de outra pessoa, não do mundo).
2. Ela descreveu algo GERAL ou RECORRENTE — algo que é assim sempre, ou que se repete —, não um episódio de hoje.
3. É NOVO em relação ao perfil já conhecido abaixo.

NÃO capture, em nenhuma hipótese:
- queixa pontual, evento de um dia, humor do momento ("hoje foi horrível", "estou cansado");
- qualquer coisa sobre remédio, dose, horário de medicação — isso é tratado em outro lugar e NÃO é da sua conta aqui;
- o nome dela;
- inferência sua. Se você precisou deduzir, a resposta é não.

Na dúvida entre queixa pontual e padrão recorrente, responda que NÃO aprendeu nada. Errar para o lado de não capturar é o comportamento correto.

CAMPOS possíveis (use exatamente um destes valores):
${campos.join(', ')}

PERFIL JÁ CONHECIDO:
${perfilConhecido || '(vazio)'}

MENSAGEM:
${mensagem}

Responda APENAS com JSON válido, sem cercas de código e sem comentário:
{"aprendeu": true, "campo": "um dos campos acima", "texto": "a frase curta que entra no perfil"}
ou
{"aprendeu": false, "campo": null, "texto": null}`
}
