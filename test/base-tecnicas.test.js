import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import * as temas from '../src/conhecimento/temasRepo.js'
import * as tec from '../src/conhecimento/tecnicasRepo.js'
import { identificarTema } from '../src/conhecimento/classificarTema.js'
import { listarAuditoriaAdmin } from '../src/db/auditoriaAdminRepo.js'
import { blocoDaTecnica, NUCLEO_FIXO } from '../src/llm/prompts.js'

/**
 * Base de técnicas práticas.
 *
 * O que esta suíte protege, acima de tudo: rascunho não circula, e a base sobe
 * INERTE — sem técnica publicada, a conversa se comporta exatamente como antes
 * desta mudança existir.
 */

let dir, db, ADMIN

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-tecnicas-'))
  db = abrirDb(join(dir, 'tecnicas.sqlite'))

  // Conta real: `aprovado_por` e `autoria` são chaves estrangeiras de verdade, e
  // um id inventado no teste esconderia que elas existem.
  ADMIN = db
    .prepare("INSERT INTO admin_usuarios (nome, email, senha_hash) VALUES ('Curadora', 'cura@x.br', 'x')")
    .run().lastInsertRowid
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM tecnicas; DELETE FROM temas_tecnicas; DELETE FROM auditoria_admin;')
  // admin_usuarios NÃO é limpo: a conta da curadora sobrevive aos casos.
  tec.semearBase(db)
})

const umTema = (chave = 'iniciar_tarefa') => temas.obterTema(chave, db)

function tecnica(dados = {}, adminId = null) {
  return tec.criar(
    {
      tema: 'iniciar_tarefa',
      titulo: 'Título',
      texto: 'Um texto qualquer.',
      fonte: 'livro tal',
      ...dados,
    },
    adminId,
    db,
  )
}

// --- Semente -------------------------------------------------------------------

describe('semente', () => {
  test('os sete temas existem na primeira subida', () => {
    const chaves = temas.listarTemas(db).map((t) => t.chave).sort()
    assert.deepEqual(chaves, [
      'ambiente_sensorial',
      'energia_fadiga',
      'foco_distracao',
      'gestao_tempo',
      'iniciar_tarefa',
      'sono',
      'transicao_atividade',
    ])
  })

  test('nenhuma técnica de exemplo nasce publicada', () => {
    const publicadas = tec.listar({ status: 'publicada' }, db)
    assert.equal(publicadas.length, 0, 'a base tem de subir inerte')
  })

  test('todos os exemplos ficam marcados na fonte', () => {
    for (const t of tec.listar({}, db)) assert.equal(t.fonte, tec.FONTE_EXEMPLO)
  })

  test('semear de novo não cria nada nem sobrescreve', () => {
    temas.atualizarTema('sono', { palavras: 'minha expressao' }, null, db)
    const r = tec.semearBase(db)

    assert.deepEqual(r, { temas: [], exemplos: [] })
    assert.equal(umTema('sono').palavras_gatilho, 'minha expressao')
  })
})

// --- Classificação --------------------------------------------------------------

describe('classificação determinística', () => {
  const tax = () => temas.taxonomia(db)

  test('expressão do tema é reconhecida', () => {
    assert.equal(identificarTema('não consigo começar isso', tax()), 'iniciar_tarefa')
  })

  test('acento e caixa não impedem o casamento', () => {
    assert.equal(identificarTema('NÃO CONSIGO DORMIR direito', tax()), 'sono')
  })

  test('nada casa devolve null', () => {
    assert.equal(identificarTema('bom dia, tudo certo por aqui', tax()), null)
  })

  test('texto vazio ou nulo devolve null sem quebrar', () => {
    assert.equal(identificarTema('', tax()), null)
    assert.equal(identificarTema(null, tax()), null)
    assert.equal(identificarTema(undefined, tax()), null)
  })

  test('taxonomia vazia devolve null', () => {
    assert.equal(identificarTema('não consigo começar', []), null)
  })

  test('vence o tema com mais expressões casadas', () => {
    const taxonomia = [
      { chave: 'a', expressoes: ['travei'] },
      { chave: 'b', expressoes: ['travei', 'cansado'] },
    ]
    assert.equal(identificarTema('travei e estou cansado', taxonomia), 'b')
  })

  test('empate é resolvido pela ordem da lista, sempre igual', () => {
    const taxonomia = [
      { chave: 'primeiro', expressoes: ['travei'] },
      { chave: 'segundo', expressoes: ['travei'] },
    ]
    for (let i = 0; i < 5; i++) {
      assert.equal(identificarTema('travei', taxonomia), 'primeiro')
    }
  })

  test('expressão nova cadastrada passa a valer, sem deploy', () => {
    assert.equal(identificarTema('to de saco cheio', tax()), null)

    temas.atualizarTema(
      'energia_fadiga',
      { palavras: `${umTema('energia_fadiga').palavras_gatilho}\nsaco cheio` },
      null,
      db,
    )

    assert.equal(identificarTema('to de saco cheio', tax()), 'energia_fadiga')
  })

  test('o classificador não importa banco nem LLM', () => {
    const fonte = readFileSync(new URL('../src/conhecimento/classificarTema.js', import.meta.url), 'utf8')
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

    assert.ok(!/from '.*db\//.test(semComentarios), 'não pode importar banco')
    assert.ok(!/from '.*llm\//.test(semComentarios), 'não pode importar LLM')
  })
})

// --- Ciclo de vida --------------------------------------------------------------

describe('ciclo de vida da técnica', () => {
  test('nasce em rascunho, sem aprovador', () => {
    const t = tecnica()
    assert.equal(t.status, 'rascunho')
    assert.equal(t.aprovado_em, null)
    assert.equal(t.aprovado_por, null)
  })

  test('rascunho não aparece em publicadasPorTema', () => {
    tecnica()
    assert.equal(tec.publicadasPorTema('iniciar_tarefa', db).length, 0)
  })

  test('publicar muda o status e registra quem e quando', () => {
    const t = tec.publicar(tecnica().tecnica_id, ADMIN, db)

    assert.equal(t.status, 'publicada')
    assert.equal(t.aprovado_por, ADMIN)
    assert.ok(t.aprovado_em, 'tem de gravar o instante')
    assert.equal(tec.publicadasPorTema('iniciar_tarefa', db).length, 1)
  })

  test('arquivada some da busca ativa e continua no banco', () => {
    const t = tec.publicar(tecnica().tecnica_id, null, db)
    tec.arquivar(t.tecnica_id, null, db)

    assert.equal(tec.publicadasPorTema('iniciar_tarefa', db).length, 0)
    assert.equal(tec.obter(t.tecnica_id, db).status, 'arquivada')
  })

  test('voltar a rascunho limpa a aprovação', () => {
    const t = tec.publicar(tecnica().tecnica_id, ADMIN, db)
    const v = tec.voltarParaRascunho(t.tecnica_id, null, db)

    assert.equal(v.status, 'rascunho')
    assert.equal(v.aprovado_por, null)
    assert.equal(v.aprovado_em, null)
  })

  test('publicar duas vezes não reescreve a aprovação', () => {
    const t = tec.publicar(tecnica().tecnica_id, ADMIN, db)
    const outra = tec.publicar(t.tecnica_id, ADMIN, db)

    assert.equal(outra.aprovado_por, ADMIN)
    assert.equal(outra.aprovado_em, t.aprovado_em, 'o instante original não é reescrito')
  })
})

// --- Validação ------------------------------------------------------------------

describe('validação no repositório, não na tela', () => {
  test('tema inexistente é recusado', () => {
    assert.throws(() => tecnica({ tema: 'inventado' }), /Tema desconhecido/)
  })

  test('fonte vazia é recusada', () => {
    assert.throws(() => tecnica({ fonte: '   ' }), /fonte é obrigatória/)
  })

  test('texto vazio é recusado', () => {
    assert.throws(() => tecnica({ texto: '' }), /texto da técnica é obrigatório/)
  })

  test('título vazio é recusado', () => {
    assert.throws(() => tecnica({ titulo: '' }), /título é obrigatório/)
  })

  test('editar para tema inexistente é recusado', () => {
    const t = tecnica()
    assert.throws(() => tec.atualizar(t.tecnica_id, { tema: 'nada' }, null, db), /Tema desconhecido/)
  })
})

// --- Rodízio ---------------------------------------------------------------------

describe('rodízio pela menos sugerida recentemente', () => {
  const publicar = (titulo) => tec.publicar(tecnica({ titulo }).tecnica_id, null, db)

  test('sem técnica publicada, devolve null', () => {
    tecnica()
    assert.equal(tec.escolherParaTema('iniciar_tarefa', db), null)
  })

  test('a nunca sugerida vem antes da já sugerida', () => {
    const a = publicar('A')
    const b = publicar('B')

    db.prepare('UPDATE tecnicas SET ultima_sugerida_em = ? WHERE tecnica_id = ?').run(
      '2020-01-01T00:00:00.000Z',
      a.tecnica_id,
    )

    assert.equal(tec.escolherParaTema('iniciar_tarefa', db).tecnica_id, b.tecnica_id)
  })

  test('duas sugestões seguidas não repetem', () => {
    publicar('A')
    publicar('B')

    const primeira = tec.escolherParaTema('iniciar_tarefa', db)
    const segunda = tec.escolherParaTema('iniciar_tarefa', db)

    assert.notEqual(primeira.tecnica_id, segunda.tecnica_id)
  })

  test('com todas já sugeridas, sai a mais antiga', () => {
    const a = publicar('A')
    const b = publicar('B')

    db.prepare('UPDATE tecnicas SET ultima_sugerida_em = ? WHERE tecnica_id = ?').run('2024-01-01', a.tecnica_id)
    db.prepare('UPDATE tecnicas SET ultima_sugerida_em = ? WHERE tecnica_id = ?').run('2025-01-01', b.tecnica_id)

    assert.equal(tec.escolherParaTema('iniciar_tarefa', db).tecnica_id, a.tecnica_id)
  })

  test('escolher marca o instante da sugestão', () => {
    const a = publicar('A')
    assert.equal(tec.obter(a.tecnica_id, db).ultima_sugerida_em, null)

    tec.escolherParaTema('iniciar_tarefa', db)
    assert.ok(tec.obter(a.tecnica_id, db).ultima_sugerida_em)
  })

  test('arquivada nunca é escolhida', () => {
    const a = publicar('A')
    tec.arquivar(a.tecnica_id, null, db)
    assert.equal(tec.escolherParaTema('iniciar_tarefa', db), null)
  })
})

// --- Temas -----------------------------------------------------------------------

describe('CRUD de tema', () => {
  test('criar tema exige chave em formato de identificador', () => {
    assert.throws(() => temas.criarTema({ chave: 'Tema Novo!', rotulo: 'x' }, null, db), /chave usa/)
  })

  test('chave duplicada é recusada', () => {
    assert.throws(() => temas.criarTema({ chave: 'sono', rotulo: 'Sono' }, null, db), /Já existe/)
  })

  test('rótulo é obrigatório', () => {
    assert.throws(() => temas.criarTema({ chave: 'novo_tema', rotulo: '' }, null, db), /rótulo é obrigatório/)
  })

  test('tema com técnica não pode ser removido', () => {
    tecnica()
    assert.throws(() => temas.removerTema('iniciar_tarefa', null, db), /técnica\(s\)/)
  })

  test('tema vazio pode ser removido', () => {
    temas.criarTema({ chave: 'vazio_teste', rotulo: 'Vazio' }, null, db)
    assert.equal(temas.removerTema('vazio_teste', null, db), true)
    assert.equal(temas.obterTema('vazio_teste', db), null)
  })

  test('a expressão é guardada como digitada e normalizada só na leitura', () => {
    temas.atualizarTema('sono', { palavras: 'Não Durmo\n' }, null, db)

    assert.equal(umTema('sono').palavras_gatilho, 'Não Durmo\n')
    assert.deepEqual(temas.expressoesDoTema(umTema('sono')), ['nao durmo'])
  })

  test('tema sem palavra-gatilho existe e nunca é identificado', () => {
    temas.criarTema({ chave: 'mudo_teste', rotulo: 'Mudo', palavras: '' }, null, db)
    assert.ok(temas.obterTema('mudo_teste', db))
    assert.notEqual(identificarTema('qualquer coisa', temas.taxonomia(db)), 'mudo_teste')
  })
})

// --- Auditoria ---------------------------------------------------------------------

describe('auditoria', () => {
  test('criar, publicar e arquivar nomeiam o autor', () => {
    const t = tecnica({}, ADMIN)
    tec.publicar(t.tecnica_id, ADMIN, db)
    tec.arquivar(t.tecnica_id, ADMIN, db)

    const linhas = listarAuditoriaAdmin(50, db).filter((l) => l.autor_id === ADMIN)
    assert.equal(linhas.length, 3)
    assert.ok(linhas.every((l) => l.acao === 'configurou_sistema'))
  })

  test('a semente não gera auditoria — não é ação de ninguém', () => {
    assert.equal(listarAuditoriaAdmin(50, db).length, 0)
  })
})

// --- Aviso clínico -------------------------------------------------------------------

describe('aviso de termo clínico', () => {
  test('detecta termo da lista', () => {
    assert.deepEqual(tec.termosClinicosEm('isso trata o sintoma'), ['sintoma'])
  })

  test('texto prático não dispara nada', () => {
    assert.deepEqual(tec.termosClinicosEm('divida a tarefa em partes menores'), [])
  })

  test('o aviso NÃO impede gravar — quem decide é quem cura', () => {
    const t = tecnica({ texto: 'converse com seu psiquiatra sobre o tratamento' })
    assert.ok(t.tecnica_id, 'a gravação tem de passar')
    assert.ok(tec.termosClinicosEm(t.texto).length, 'e ainda assim avisar')
  })
})

// --- O bloco de prompt ------------------------------------------------------------------

describe('a técnica no system prompt', () => {
  test('sem técnica, o bloco é vazio', () => {
    assert.equal(blocoDaTecnica(null), '')
    assert.equal(blocoDaTecnica({ texto: '' }), '')
  })

  test('com técnica, o bloco diz que é opcional e que é uma só', () => {
    const bloco = blocoDaTecnica({ titulo: 'Dois minutos', texto: 'Faça só o começo.' })

    assert.match(bloco, /opcional/i)
    assert.match(bloco, /uma/i)
    assert.match(bloco, /Faça só o começo\./)
  })

  test('a regra 3b existe no núcleo fixo e não afrouxa as outras', () => {
    assert.match(NUCLEO_FIXO, /3b\./)
    assert.match(NUCLEO_FIXO, /1c\. Você NUNCA instrui/)
    assert.match(NUCLEO_FIXO, /regra 5 vale acima desta/)
  })
})
