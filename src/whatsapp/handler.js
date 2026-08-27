import { CANAIS } from '../constants.js'
import * as repo from '../db/userRepo.js'
import { ESTADOS, TEXTO_CONSENTIMENTO } from '../anamnese/questions.js'
import { extrairRemedios } from '../anamnese/extrairRemedios.js'
import { processarMensagem } from '../conversa/nucleo.js'
import { agrupar } from './debounce.js'
import { chamarLLM } from '../llm/router.js'
import { transcreverAudio } from '../transcription/transcribe.js'

/**
 * ADAPTADOR DO WHATSAPP.
 *
 * Faz o que é do transporte e nada além: transcreve o áudio, identifica a pessoa
 * pelo número, cobre o remetente desconhecido e entrega uma função de envio ao
 * núcleo (`src/conversa/nucleo.js`), que é quem decide o que responder.
 *
 * Este arquivo NÃO decide entre anamnese e conversa livre, não classifica
 * mensagem, não monta prompt e não chama o LLM. Isso é do núcleo, e é único —
 * a web usa exatamente o mesmo caminho.
 *
 * A rede de segurança do remetente desconhecido fica AQUI, e não sobe: na web
 * não existe mensagem de desconhecido — quem não tem sessão válida é recusado
 * antes de qualquer processamento, e criar participante ali seria autocadastro
 * num sistema que guarda dado de saúde.
 *
 * @param {{numero: string, texto?: string, audio?: {buffer: Buffer, mimeType: string}}} msg
 * @param {(numero: string, texto: string) => Promise<void>} enviarMensagem
 * @param {object} deps dependências injetáveis (transcrever, chamar, extrair) — para teste
 */
export async function tratarMensagemRecebida(msg, enviarMensagem, deps = {}) {
  const transcrever = deps.transcrever ?? transcreverAudio
  const chamar = deps.chamar ?? chamarLLM
  const extrair = deps.extrair ?? extrairRemedios
  const db = deps.db

  let texto = msg.texto ?? ''

  // Áudio é transcrito ANTES de qualquer roteamento — e antes do núcleo, que não
  // sabe que áudio existe.
  if (msg.audio?.buffer?.length) {
    const r = await transcrever(msg.audio.buffer, msg.audio.mimeType)
    if (!r.ok) {
      console.error('[handler] transcrição falhou:', r.erro)
      await enviarMensagem(
        msg.numero,
        'Não consegui ouvir esse áudio. Pode escrever, se der?',
      )
      return { acao: 'transcricao_falhou' }
    }
    texto = r.texto
  }

  const usuario = repo.findByWhatsapp(msg.numero, db)

  // Rede de segurança: mensagem de quem nunca foi convidado.
  // O fluxo PENSADO é sempre o convite proativo (src/admin/convidarPiloto.js);
  // este ramo existe só para mensagem fora de fluxo.
  if (!usuario || usuario.anamnese_estado === null) {
    const criado = repo.findOrCreate(msg.numero, db)
    await enviarMensagem(msg.numero, TEXTO_CONSENTIMENTO)
    return { acao: 'consentimento_enviado', usuarioId: criado.usuario_id }
  }

  // O núcleo recebe uma função de envio sem endereço: quem sabe para onde
  // mandar é o adaptador.
  const responder = (resposta) => enviarMensagem(usuario.numero_whatsapp, resposta)

  const processar = (textoFinal) =>
    processarMensagem(
      // O usuário é relido no momento do processamento: numa janela de
      // agrupamento de segundos, o estado dele pode ter mudado.
      { usuario: repo.findById(usuario.usuario_id, db) ?? usuario, texto: textoFinal, canal: CANAIS.WHATSAPP, responder },
      { chamar, extrair, db },
    )

  // Agrupamento só no chat livre. Durante a anamnese, cada mensagem é processada
  // na hora: ela é pergunta-resposta de um passo por vez, e juntar duas faria a
  // máquina de estados pular um estado ou gravar duas respostas no mesmo campo.
  if (usuario.anamnese_estado === ESTADOS.CONCLUIDO) {
    const { agrupou, resultado } = agrupar(usuario.usuario_id, texto, processar, deps.debounce)
    // Quando não agrupa, o retorno é o do núcleo, idêntico ao de antes desta
    // mudança — o comportamento com o agrupamento desligado não muda em nada.
    return agrupou ? { acao: 'agrupando' } : resultado
  }

  return processar(texto)
}
