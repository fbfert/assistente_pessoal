/**
 * Normalização de texto de entrada do usuário.
 *
 * Isto NÃO é casamento difuso: é só o pré-processo que permite comparar por
 * IGUALDADE EXATA contra um conjunto fechado de frases canônicas. A remoção de
 * acento existe porque a pessoa digita "não" e "nao" indiferentemente no
 * celular, não para aproximar palavras diferentes.
 *
 * Ver src/anamnese/stateMachine.js para o bug que motivou essa abordagem.
 */
export function normalizar(texto) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas diacríticas combinantes
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:…]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}
