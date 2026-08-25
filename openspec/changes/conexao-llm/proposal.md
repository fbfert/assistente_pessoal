## Why

Trocar a chave de API de um provedor hoje exige editar o `.env` por SSH e
reiniciar dois containers. Isso é ruim em três momentos previsíveis: quando uma
chave vaza e precisa ser rotacionada com urgência, quando a cota de um provedor
acaba no meio de um dia de piloto, e quando se quer experimentar outro modelo sem
uma janela de manutenção.

O seletor de provedor ativo que a Fase 2 introduz fica pela metade sem isso:
escolher `deepseek` numa tela não adianta se a chave da DeepSeek só entra por
`.env` e reinício.

Há também um vazamento em potencial já no código: `src/llm/router.js` inclui o
**corpo bruto** da resposta de erro na exceção que lança. Alguns provedores
devolvem a credencial enviada dentro do erro 401 — o que colocaria a chave no log
do Docker sem que ninguém tivesse pedido isso.

## What Changes

- Uma tela no admin para configurar, **por provedor**, a chave de API e o nome do
  modelo, e para ver qual está ativo na conversa.
- As credenciais passam a viver num arquivo dentro do volume compartilhado, lido
  ao vivo pelos dois processos, sem reinício.
- A chave nunca é devolvida: a tela mostra apenas se está configurada e os últimos
  caracteres.
- O router deixa de ecoar o corpo da resposta de erro.

## Capabilities

### New Capabilities

- `credenciais-llm`: guarda, mascara, resolve e audita a chave e o modelo de cada
  provedor, e a tela que os edita.

### Modified Capabilities

- `llm-provider`: a resolução de chave e modelo passa a consultar as credenciais
  configuradas antes do ambiente, e o erro de provedor deixa de carregar o corpo
  bruto da resposta.
- `dashboard-piloto`: a tela entra na navegação.

## Impact

- **Código:** `src/llm/chavesRepo.js` (novo), `src/llm/router.js`,
  `src/config.js`, `src/dashboard/rotas/credenciais.js` (novo), `test/`.
- **Dependências:** nenhuma.
- **Schema:** as credenciais em si não tocam o banco — isso é arquivo, de
  propósito. Mas a **auditoria** precisa de um valor novo no CHECK de
  `auditoria_admin.acao`, porque a lista é fechada. É uma mudança pequena e
  aplicada por **script de migração**, não por recriação do volume: o banco já
  contém a conta de administrador com a senha que o operador definiu, e recriar
  faria o bootstrap restaurá-la a partir do `.env`, desfazendo a troca em
  silêncio.
- **Infraestrutura:** um arquivo novo em `/data`, dentro do volume `tars_data`.
  **Recriar o volume apaga as credenciais junto com o banco e o pareamento**, e
  elas precisam ser refeitas pela tela.
- **Backup:** quem copiar o volume passa a copiar credenciais de terceiros junto.
  Isso não era verdade antes.
- **Compatibilidade:** o `.env` continua funcionando. Ninguém é obrigado a migrar.
- **Fora de escopo:** rotação automática, validação da chave contra o provedor no
  momento de salvar, e a chave de transcrição — que continua sendo a da OpenAI,
  independentemente do provedor de conversa.
