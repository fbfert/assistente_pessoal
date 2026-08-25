## Context

O backend administrativo subiu com senha única (`ADMIN_PASSWORD`), lida do
ambiente e comparada em tempo constante. Funciona, mas não identifica quem age e
não sobrevive ao encontro com a camada de Basic Auth do Apache, que já pede
e-mail e senha para o mesmo domínio.

Restrições herdadas: sem JavaScript de cliente, sem dependência nativa nova,
sessão em memória do processo, tudo atrás do bind em loopback.

## Goals / Non-Goals

**Goals:**

- Entrar com a credencial que a pessoa já conhece.
- Saber quem fez cada alteração sobre dado de saúde.
- Nunca deixar o operador trancado para fora por configuração.

**Non-Goals:**

- Papéis e permissões. Todo administrador vê e edita tudo.
- Recuperação de senha por e-mail — não há servidor de e-mail transacional.
- CRUD de administradores pela interface (fase seguinte).

## Decisions

**Hash com `scrypt` do `node:crypto`.** `bcrypt` exigiria dependência nativa, e
este projeto já paga o custo de compilar uma (`better-sqlite3`); duas costumam
transformar o build em problema. `scrypt` é resistente a hardware dedicado, vem
embutido no Node e não adiciona nada ao `package.json`. O formato guardado é
autodescritivo — `scrypt$N$r$p$salt$hash` — para que trocar de parâmetros depois
não invalide o que já existe.

**Verificação em tempo constante, sempre com o mesmo custo.** Quando o e-mail não
existe, o sistema **mesmo assim** deriva um hash contra um valor descartável
antes de responder. Sem isso, o tempo de resposta diferencia "e-mail inexistente"
de "senha errada", e a tela vira um enumerador de contas.

**Bootstrap a partir do ambiente, uma única vez.** Se a tabela estiver vazia na
subida, cria a conta com `ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_PASSWORD`. Depois
disso, `ADMIN_PASSWORD` **não é mais caminho de login** — é só semente. Manter os
dois caminhos vivos significaria uma senha compartilhada e eterna convivendo com
contas nominais, que é o pior dos dois mundos: some a identificação, e ninguém
percebe.

**As contas do Apache não são importadas.** `.htpasswd` guarda hashes
`$apr1$`, e hash não se converte. A conta inicial é semeada com a credencial que
o operador já usa, informada pelo ambiente. As duas camadas seguem
independentes: o Apache protege o domínio, a aplicação identifica a pessoa.

**Sessão passa a carregar o `admin_id`.** É o que permite à auditoria dizer quem
agiu. A sessão continua em memória, com o mesmo cookie assinado.

## Risks / Trade-offs

**Duas camadas pedem credencial em sequência.** Pelo domínio público, o Apache
pergunta e depois a aplicação pergunta. É redundante para quem conhece as duas, e
é justamente o que confundiu no primeiro acesso. Mantidas de propósito: a camada
do Apache não existe no repositório e não protege o acesso por túnel SSH; a da
aplicação viaja com o código e identifica a pessoa. Documentar a diferença é mais
barato que remover uma das duas.

**Bootstrap com senha fraca produz conta fraca.** A semente vem do ambiente e não
é validada quanto à força. A troca de senha existe justamente para corrigir isso
depois do primeiro acesso.

**Sem CRUD, uma conta só.** Enquanto a fase seguinte não chega, existe um único
administrador. Perder a senha significa reeditar o ambiente e recriar a conta.
