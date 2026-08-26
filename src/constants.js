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

/**
 * Canais por onde uma conversa pode acontecer.
 *
 * `whatsapp` é o padrão histórico: toda linha gravada antes desta constante veio
 * de lá, e é por isso que a coluna nasce com esse valor por omissão em vez de
 * anulável — nulo obrigaria toda consulta a tratar o caso, para sempre.
 *
 * A diferença entre os dois não é só de transporte: só o WhatsApp recebe
 * mensagem não solicitada (gatilho, lembrete, cobrança de silêncio). A web é
 * reativa — é onde a pessoa procura o TARS, não onde o TARS procura a pessoa.
 */
export const CANAIS = Object.freeze({
  WHATSAPP: 'whatsapp',
  WEB: 'web',
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
  /**
   * Entrada da própria pessoa pelo canal web.
   *
   * Tipo próprio, e não `acao_admin`: aquele significa "o operador escreveu algo
   * sobre esta pessoa", e usá-lo aqui faria a página do participante exibir o
   * acesso dele como se fosse ação da equipe — justamente a distinção que a
   * auditoria existe para manter.
   */
  ENTRADA_WEB: 'entrada_web',
  /**
   * Mensagem que o SISTEMA enviou numa conversa — pergunta de anamnese ou
   * resposta de chat livre.
   *
   * Sem isto, metade da conversa não existia: só a mensagem recebida era
   * gravada, e não havia como auditar o que o assistente respondeu. Num piloto
   * que existe para avaliar a qualidade do que ele diz, faltava o lado que
   * importa.
   *
   * Disparo de gatilho NÃO entra aqui — `gatilho_disparado` já registra o texto.
   */
  MENSAGEM_ENVIADA: 'mensagem_enviada',
})

/** Horários padrão dos gatilhos criados ao concluir a anamnese. */
export const HORARIO_PADRAO_CHECKIN = '08:00'
export const HORARIO_PADRAO_CHECKLIST = '20:00'
