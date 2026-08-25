# admin-contas Specification

## Purpose

Permitir que a equipe que opera o piloto exista como contas nominais — criar,
desativar, reativar e recuperar acesso — sem depender de servidor de e-mail e sem
que ninguém consiga se trancar para fora.

## Requirements

### Requirement: Listar administradores

O admin SHALL oferecer uma tela listando todas as contas, distinguindo ativas de
inativas, e exibindo e-mail, nome e último login.

A tela SHALL NOT exibir hash de senha nem qualquer forma da senha.

#### Scenario: Inativos aparecem identificados
- **WHEN** existe conta desativada
- **THEN** ela aparece na listagem marcada como inativa, e não some da tela

### Requirement: Criar administrador com senha temporária

O admin SHALL permitir criar conta informando nome e e-mail, sem que o criador
escolha a senha.

O sistema SHALL gerar uma senha aleatória, exibi-la **uma única vez** ao criador,
e SHALL NOT torná-la recuperável depois.

A conta criada SHALL nascer com pendência de troca de senha.

Motivo registrado: deixar o criador escolher a senha do outro produz senha fraca,
conhecida por duas pessoas, que a segunda nunca troca. Não há servidor de e-mail,
então a senha precisa chegar por um canal que já existe entre a equipe — e é por
isso que ela é de uso único.

#### Scenario: Senha temporária é mostrada uma vez
- **WHEN** um administrador cria uma conta
- **THEN** a senha gerada aparece na resposta daquela ação e não é exibida em
  nenhuma tela posterior

#### Scenario: E-mail já usado é recusado
- **WHEN** a criação usa um e-mail que já pertence a outra conta
- **THEN** a criação é recusada e nenhuma conta é criada

### Requirement: Troca obrigatória da senha temporária

Enquanto houver pendência de troca, a sessão daquela conta SHALL alcançar apenas
a tela de troca de senha e a saída.

Concluída a troca, a pendência SHALL ser removida e o acesso liberado.

Motivo registrado: sem a restrição, a obrigação vira sugestão, e uma senha gerada
por terceiro — possivelmente trafegada por chat — continuaria valendo
indefinidamente.

#### Scenario: Conta com pendência é desviada
- **WHEN** uma conta com senha temporária pendente acessa qualquer página
- **THEN** é levada à tela de troca de senha, sem ver dado de participante

#### Scenario: Após trocar, o acesso é liberado
- **WHEN** a conta troca a senha temporária com sucesso
- **THEN** passa a acessar normalmente as demais páginas

### Requirement: Desativar e reativar conta

O admin SHALL permitir desativar e reativar contas.

Desativar SHALL NOT remover a linha da conta.

#### Scenario: Conta desativada perde o acesso
- **WHEN** uma conta ativa é desativada
- **THEN** ela deixa de autenticar, mesmo com a senha correta

#### Scenario: Reativar devolve o acesso
- **WHEN** uma conta inativa é reativada
- **THEN** volta a autenticar com a mesma senha

### Requirement: Guardas contra auto-trancamento

O sistema SHALL recusar a desativação da própria conta de quem executa a ação.

O sistema SHALL recusar a desativação da última conta ativa.

Ambas as guardas SHALL ser aplicadas no servidor, e SHALL NOT depender de a
interface esconder o botão.

Motivo registrado: sem administrador ativo não há quem crie o próximo, e a única
saída seria recriar o banco.

#### Scenario: Não é possível desativar a si mesmo
- **WHEN** um administrador tenta desativar a própria conta
- **THEN** a ação é recusada e a conta continua ativa

#### Scenario: A última conta ativa é protegida
- **WHEN** existe apenas uma conta ativa e se tenta desativá-la
- **THEN** a ação é recusada

### Requirement: Reset de senha como recuperação de acesso

O admin SHALL permitir que um administrador ativo gere nova senha temporária para
outra conta.

A senha gerada SHALL seguir as mesmas regras da criação: exibida uma única vez e
com troca obrigatória.

O reset SHALL encerrar as sessões abertas daquela conta.

Motivo registrado: não há e-mail transacional, então a recuperação depende de
outra pessoa com acesso — o que é verdade por construção depois da primeira conta
criada.

#### Scenario: Recuperação sem e-mail
- **WHEN** alguém perde a senha e outro administrador ativo faz o reset
- **THEN** a nova senha temporária é exibida uma vez e permite entrar, exigindo
  troca imediata

#### Scenario: Reset derruba sessões antigas
- **WHEN** a senha de uma conta é resetada
- **THEN** as sessões abertas daquela conta deixam de valer

### Requirement: Auditoria das ações sobre a equipe

Toda criação, desativação, reativação e reset SHALL ser registrada em log próprio,
com autor, alvo, ação e momento.

O log SHALL NOT registrar a senha gerada.

O log SHALL ser append-only.

#### Scenario: Ação sobre a equipe é registrada
- **WHEN** um administrador cria ou desativa outra conta
- **THEN** uma linha de auditoria registra quem, o quê e quando

#### Scenario: A senha gerada não vai para o log
- **WHEN** uma conta é criada ou tem a senha resetada
- **THEN** a senha gerada não aparece no registro de auditoria
