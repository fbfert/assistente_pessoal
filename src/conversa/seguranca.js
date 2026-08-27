/**
 * Rede de segurança determinística: o assistente não instrui sobre medicação.
 *
 * A primeira camada é a Regra 1c do núcleo fixo. Esta é a segunda, e existe
 * porque a primeira falha: modelo de linguagem não obedece regra todas as vezes
 * — muda de versão, muda de provedor, e uma instrução compete com o resto do
 * contexto. Apostar a segurança de dado de saúde regulado só no prompt é
 * construir a proteção no ponto mais frágil que existe.
 *
 * Aqui NÃO se usa modelo para julgar se a resposta é segura: vigiar modelo com
 * modelo herda exatamente a falha que esta camada existe para cobrir.
 *
 * A assimetria é intencional. Falso positivo custa uma resposta boa perdida.
 * Falso negativo custa uma instrução de medicação entregue a alguém que pode
 * tomar dose dupla por causa dela. Na dúvida, bloqueia.
 */

/**
 * Verbos de instrução. Lista fechada, e vai estar incompleta — paráfrase
 * criativa passa. Ela reduz a superfície, não a fecha; por isso a regra no
 * prompt continua sendo a primeira camada, e não a única.
 */
const VERBOS_DE_INSTRUCAO = Object.freeze([
  'tome', 'tomar', 'tomou', 'tomasse',
  // `toma` e `tomando` saíram: sozinhos são DESCRIÇÃO, não instrução. Custaram um
  // falso positivo real — "Você está tomando Vortex e Bup, mas não sei os
  // horários" era resposta legítima a "o que já sabe sobre mim?" e teria sido
  // bloqueada. As formas instrutivas do gerúndio entram nomeadas.
  'continue tomando', 'volte a tomar', 'siga tomando', 'passe a tomar',
  'comece', 'comeca', 'comecar', 'iniciar', 'inicie',
  'pode tomar', 'ja tomou', 'nao tomou', 'tomou hoje',
  'hora do', 'hora da', 'horario do', 'horario da',
  'esqueca', 'esquece', 'esquecer', 'esqueceu',
  'lembre', 'lembra de', 'lembrar de',
  'aumente', 'aumentar', 'diminua', 'diminuir', 'reduza', 'reduzir',
  'atrase', 'atrasar', 'adie', 'adiar', 'antecipe', 'antecipar',
  'pule', 'pular', 'suspenda', 'suspender', 'pare de', 'parar de',
  'dobre', 'dobrar', 'ajuste', 'ajustar', 'troque', 'trocar',
])

const SEM_INFORMACAO_NORMALIZADO = 'sem informacao'

const normalizar = (v) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const escaparRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const contemPalavra = (texto, termo) =>
  new RegExp(`(^|[^a-z0-9])${escaparRegex(termo)}([^a-z0-9]|$)`).test(texto)

/**
 * A resposta instrui sobre um remédio DESTA pessoa?
 *
 * Exige as duas coisas na MESMA FRASE: o nome de um remédio já cadastrado dela e
 * um verbo de instrução. É o que separa "comece pelo Vortex agora" de "o Vortex
 * está no teu cadastro sem horário. Comece pela tarefa mais fácil."
 *
 * O nome vem do cadastro dela, e não de uma lista genérica de medicamentos: o
 * alvo é o remédio real que o modelo vê no contexto da anamnese. Quem não tem
 * remédio cadastrado não é coberto por esta camada — para essa pessoa, só o
 * prompt vale.
 *
 * @param {string} texto resposta gerada pelo modelo
 * @param {Array<{nome: string}>} remedios os cadastrados do participante
 * @returns {{bloqueia: boolean, remedio?: string, verbo?: string}}
 */
export function instruiSobreMedicacao(texto, remedios = []) {
  const nomes = remedios
    .map((r) => normalizar(r?.nome).trim())
    .filter((n) => n && n !== SEM_INFORMACAO_NORMALIZADO && n.length >= 3)

  if (!nomes.length) return { bloqueia: false }

  for (const frase of normalizar(texto).split(/[.!?\n;]+/)) {
    const remedio = nomes.find((n) => contemPalavra(frase, n))
    if (!remedio) continue

    const verbo = VERBOS_DE_INSTRUCAO.find((v) =>
      v.includes(' ') ? frase.includes(v) : contemPalavra(frase, v),
    )
    if (verbo) return { bloqueia: true, remedio, verbo }
  }

  return { bloqueia: false }
}

export const _VERBOS_DE_INSTRUCAO = VERBOS_DE_INSTRUCAO
