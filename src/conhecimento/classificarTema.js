import { normalizar } from '../text.js'

/**
 * Identifica o tema de uma mensagem de conversa livre.
 *
 * Função PURA: sem LLM e sem banco. Recebe o texto e a taxonomia já lida, e
 * devolve a chave do tema ou null. É a mesma escolha de `classify/heuristic.js`,
 * e pelo mesmo motivo — uma chamada de modelo por mensagem só para rotular a
 * mensagem seria custo recorrente sem retorno de produto. A diferença em relação
 * ao aprendizado de perfil é real: lá a chamada extra compra algo que heurística
 * não consegue (extrair um fato novo de texto livre); aqui, casar "não consigo
 * começar" com `iniciar_tarefa` é exatamente o que palavra-chave faz bem.
 *
 * COMPARAÇÃO POR SUBSTRING, e não igualdade exata contra Set fechado. É exceção
 * consciente à regra do AGENTS §4, e a diferença é de natureza: aquela regra
 * existe para RESPOSTA A PERGUNTA FECHADA, onde "pode me chamar de Ana" não pode
 * contar como "pode" e descolar a máquina de estados. Aqui não há pergunta e não
 * há estado a descolar — é texto livre, e o pior caso de um falso positivo é uma
 * sugestão fora de hora que a pessoa ignora. O melhor caso de exigir igualdade
 * exata seria nunca casar nada.
 *
 * @param {string} texto a mensagem, crua
 * @param {Array<{chave: string, expressoes: string[]}>} temas já normalizados
 * @returns {string|null} a chave do tema, ou null quando nada casa
 */
export function identificarTema(texto, temas = []) {
  const t = normalizar(texto)
  if (!t) return null

  let vencedor = null
  let maisCasadas = 0

  // A ordem da lista é o critério de desempate final. Por isso o `>` estrito:
  // o primeiro tema a atingir uma contagem a mantém contra empates posteriores.
  for (const tema of temas) {
    const casadas = (tema?.expressoes ?? []).filter((e) => e && t.includes(e)).length
    if (casadas > maisCasadas) {
      maisCasadas = casadas
      vencedor = tema.chave
    }
  }

  return vencedor
}
