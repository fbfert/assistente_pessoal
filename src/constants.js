/**
 * Constantes compartilhadas por todo o app.
 *
 * REGRA 1b — dado de saúde nunca é inventado nem estimado.
 *
 * `SEM_INFORMACAO` é o sentinela para campo de saúde que o usuário não informou.
 * Ele vive AQUI e só aqui: nenhum outro arquivo deve repetir o literal.
 *
 * Motivo: o filtro que decide se um remédio vira gatilho compara com `!==`.
 * Um typo na acentuação ('sem informacao', 'sem informaçao') não gera erro —
 * gera um gatilho fantasma lembrando de um remédio que não existe, silenciosamente.
 * Importar a constante transforma esse bug silencioso em erro de import.
 *
 * Contexto: Stone et al. 2002 (BMJ) mediu ~90% de adesão a medicação por
 * autorrelato contra ~11% de adesão realmente medida. Um assistente que estima
 * horário ou nome de remédio alarga essa distância produzindo dado que parece
 * confiável e não é.
 */
export const SEM_INFORMACAO = 'sem informação'

/**
 * Marcador de anonimização, usado quando um participante sai do piloto.
 *
 * É DELIBERADAMENTE distinto de SEM_INFORMACAO. Os dois significam coisas
 * opostas: o sentinela diz "a pessoa não informou"; este diz "a pessoa
 * informou, e nós apagamos". Usar o sentinela na anonimização falsearia o
 * dado — afirmaria que alguém nunca respondeu algo que respondeu.
 */
export const REDIGIDO = '[redigido]'

/** Tipos de gatilho do MVP. Novos tipos entram por necessidade relatada, não por calendário. */
export const TIPOS_GATILHO = Object.freeze({
  CHECKIN_MANHA: 'checkin_manha',
  REMEDIO: 'remedio',
  CHECKLIST_FIM_DIA: 'checklist_fim_dia',
})

/** Tipos de interação registráveis no histórico append-only. */
export const TIPOS_INTERACAO = Object.freeze({
  GATILHO_DISPARADO: 'gatilho_disparado',
  RESPOSTA_GATILHO: 'resposta_gatilho',
  DESPEJO_ESPONTANEO: 'despejo_espontaneo',
  SILENCIO: 'silencio',
  CORRECAO_REPORTADA: 'correcao_reportada',
  ANAMNESE: 'anamnese',
  /** Escrita feita pelo operador no backend admin. Rastro de auditoria. */
  ACAO_ADMIN: 'acao_admin',
})

/** Horários padrão dos gatilhos criados ao concluir a anamnese. */
export const HORARIO_PADRAO_CHECKIN = '08:00'
export const HORARIO_PADRAO_CHECKLIST = '20:00'
