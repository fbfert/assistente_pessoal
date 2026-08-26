import { config } from '../config.js'
import { pistaDeStatus } from '../llm/router.js'

/**
 * Transcreve áudio recebido no WhatsApp via API da OpenAI.
 *
 * Usa sempre a OpenAI, independente do provedor ativo na conversa — a
 * transcrição não é trocável por provedor no MVP. O modelo, sim: vem do arquivo
 * de credenciais e cai no ambiente, resolvido por `config.transcription.model`.
 *
 * Erro de rede ou de API NÃO lança: devolve `{ ok: false, erro }` para que o
 * handler registre em log e siga. Derrubar a conversa por causa de um áudio
 * ilegível seria pior que perder o áudio.
 *
 * @param {Buffer|Uint8Array} audioBuffer
 * @param {string} mimeType
 * @returns {Promise<{ok: true, texto: string} | {ok: false, erro: string}>}
 */
export async function transcreverAudio(audioBuffer, mimeType = 'audio/ogg') {
  const { apiKey, model, language, baseUrl } = config.transcription

  if (!apiKey) return { ok: false, erro: 'OPENAI_API_KEY não configurada' }
  if (!audioBuffer?.length) return { ok: false, erro: 'áudio vazio' }

  try {
    const form = new FormData()
    form.append('file', new Blob([audioBuffer], { type: mimeType }), nomeDeArquivo(mimeType))
    form.append('model', model)
    form.append('language', language)

    const resposta = await fetch(baseUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    })

    if (!resposta.ok) {
      // O corpo é DESCARTADO, não filtrado: alguns provedores ecoam a credencial
      // recebida no 401, e este texto vai para o console.error do handler, que é
      // o log do Docker. Mesma decisão do router — errar uma vez basta para vazar.
      return { ok: false, erro: `OpenAI respondeu ${resposta.status}${pistaDeStatus(resposta.status)}` }
    }

    const corpo = await resposta.json()
    const texto = (corpo?.text ?? '').trim()

    return texto ? { ok: true, texto } : { ok: false, erro: 'transcrição vazia' }
  } catch (e) {
    return { ok: false, erro: e?.message ?? String(e) }
  }
}

/** A API decide o formato pela extensão do arquivo enviado. */
export function nomeDeArquivo(mimeType) {
  const extensoes = {
    'audio/ogg': 'audio.ogg',
    'audio/ogg; codecs=opus': 'audio.ogg',
    'audio/mpeg': 'audio.mp3',
    'audio/mp4': 'audio.m4a',
    'audio/wav': 'audio.wav',
    'audio/webm': 'audio.webm',
  }
  return extensoes[mimeType] ?? extensoes[String(mimeType).split(';')[0].trim()] ?? 'audio.ogg'
}
