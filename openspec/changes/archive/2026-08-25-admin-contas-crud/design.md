## Context

O login por pessoa está de pé: `admin_usuarios`, hash `scrypt`, sessão com autor
e troca da própria senha. Falta o que permite a equipe existir de fato — criar
contas — e o que impede alguém de ficar de fora para sempre.

Restrição incontornável: não há servidor de e-mail transacional. Qualquer
mecanismo que dependa de mandar link ou código está fora.

## Goals / Non-Goals

**Goals:**

- Cada pessoa da equipe com conta própria, para a auditoria continuar nomeando
  quem agiu.
- Um caminho de recuperação que não dependa de e-mail.
- Impossibilitar que o último administrador se tranque para fora.

**Non-Goals:**

- Papéis e permissões. Todo administrador vê e edita tudo — decisão registrada.
- Autoatendimento de recuperação. Depende sempre de outro administrador ativo.
- Convite por link ou e-mail.

## Decisions

**Senha temporária exibida uma vez, com troca obrigatória.** Sem e-mail, a senha
precisa chegar à pessoa por um canal que já existe entre a equipe. O sistema a
gera aleatoriamente, mostra **uma única vez** na tela de quem criou, e nunca mais.
A conta nasce com pendência de troca: enquanto ela existir, a sessão só alcança a
tela de troca de senha.

Alternativa descartada: deixar quem cria escolher a senha do outro. Isso produz
senha fraca e conhecida por duas pessoas, e a segunda nunca troca.

**Reset é o caminho de recuperação.** Outro administrador ativo gera nova senha
temporária. Mesma mecânica da criação: exibida uma vez, troca obrigatória. Isso
transfere a confiança para "existe outra pessoa na equipe com acesso", o que é
verdade por construção depois da primeira conta criada.

**Sessão com senha pendente é restrita.** Autenticar com senha temporária cria
sessão válida, mas o middleware desvia todas as rotas para a troca de senha. Se
a sessão desse acesso pleno, a "obrigação" viraria sugestão — e uma senha gerada
por terceiro, possivelmente trafegada por chat, ficaria valendo indefinidamente.

**Guardas contra auto-trancamento**, ambas verificadas no servidor:

1. Ninguém desativa a própria conta. Perder o próprio acesso por um clique é
   irrecuperável sem outra pessoa.
2. A última conta ativa não pode ser desativada. Sem administrador ativo, não há
   quem crie o próximo — e a única saída seria recriar o banco.

**Auditoria de equipe em tabela própria (`auditoria_admin`).** Ações sobre
participantes continuam em `historico_interacoes`; ações sobre a equipe vão para
o log novo.

`historico_interacoes.usuario_id` é `NOT NULL` com FK para `usuarios`. Criar um
administrador não tem participante associado. As alternativas eram:

- Tornar `usuario_id` anulável: enfraquece a FK e quebra a premissa de **toda**
  consulta existente, que assume linha do tempo de um participante. As agregações
  do painel passariam a precisar filtrar linhas órfãs.
- Inventar um participante-sistema: dado falso na tabela de participantes, que
  aparece na contagem do painel e na esteira.

A tabela separada mantém as duas coisas íntegras: a linha do tempo do participante
continua sendo só dele, e o log da equipe existe sem contaminar métrica alguma.
A divisão é semântica, não técnica — quem lê a página de um participante quer o
que aconteceu com ele, não que alguém da equipe trocou de senha.

## Risks / Trade-offs

**A senha temporária trafega por fora do sistema.** Vai por chat, mensagem ou voz
— canais que o piloto não controla. Mitigado por ser de uso único: a troca
obrigatória no primeiro acesso limita a janela em que ela vale.

**Dois lugares para procurar auditoria.** Ação sobre participante está na página
dele; ação sobre a equipe, na tela de administradores. É o custo de manter a
linha do tempo do participante limpa, e a alternativa era misturar tudo.

**Sem papéis, toda conta criada tem poder total** — inclusive o de desativar quem
a criou. É a decisão registrada de não ter RBAC; vale reler se a equipe crescer
além de quem se conhece.

**Reset depende de outro administrador ativo.** Com uma conta só e a senha
perdida, o caminho continua sendo mexer no ambiente e recriar o banco. Some assim
que a segunda conta existir.
