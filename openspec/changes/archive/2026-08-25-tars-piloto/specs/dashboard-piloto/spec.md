## Purpose

Dar ao operador do piloto uma visão de quem está engajando e quem está sumindo, com destaque
para quem cruzou o limiar de silêncio. Ferramenta interna de 5 linhas, não produto.

## ADDED Requirements

### Requirement: Agregações de acompanhamento

O dashboard SHALL agregar, por usuário: despejos espontâneos da semana, silêncios por tipo de
gatilho, correções reportadas e o funil de check-in.

O dashboard SHALL marcar um usuário com alerta de sobrecarga quando qualquer contador de
silêncios consecutivos dele atingir o limite configurado.

#### Scenario: Alerta de sobrecarga
- **WHEN** um usuário tem silêncio consecutivo igual ao limite configurado em qualquer tipo de
  gatilho
- **THEN** ele aparece marcado com alerta de sobrecarga

### Requirement: Renderização HTML simples

O dashboard SHALL renderizar uma tabela HTML sem biblioteca de gráfico, destacando visualmente
a linha de quem está com alerta de sobrecarga.

Motivo registrado: são 5 pessoas. Biblioteca de gráfico é complexidade sem retorno nessa escala.

#### Scenario: Linha em alerta se destaca
- **WHEN** a página é renderizada com um usuário em alerta
- **THEN** a linha desse usuário é destacada em relação às demais

### Requirement: Exposição apenas em loopback

O dashboard SHALL ser alcançável apenas pelo loopback do host, e SHALL NOT ser exposto em
interface pública.

Onde a restrição é aplicada depende de como o processo roda:

- Executado diretamente no host, o processo SHALL escutar em `127.0.0.1`.
- Executado em container, o processo SHALL escutar em `0.0.0.0` e a restrição SHALL ser feita
  pelo bind `127.0.0.1:<porta>` da publicação de porta.

A interface de escuta SHALL ser configurável por variável de ambiente (`DASHBOARD_HOST`), com
padrão `127.0.0.1`.

O acesso remoto SHALL ser feito por túnel SSH.

Motivo registrado: o dashboard mostra dado de saúde de 5 pessoas identificadas e não tem
autenticação. É decisão de segurança, não detalhe de configuração.

Dentro de um container, `127.0.0.1` é o loopback **do container** — o mapeamento de porta do
Docker não o alcança, e o dashboard fica inacessível. Escutar em `0.0.0.0` ali não afrouxa a
garantia: ela apenas muda de lugar, do processo para a publicação de porta. A verificação
correta é a porta observada no host, não a interface que o processo pediu.

#### Scenario: Porta não escuta em interface pública
- **WHEN** a composição de containers sobe
- **THEN** a porta do dashboard está publicada apenas em `127.0.0.1`

#### Scenario: Verificação no host
- **WHEN** as portas em escuta do host são inspecionadas
- **THEN** a porta do dashboard aparece ligada a `127.0.0.1` e não a `0.0.0.0`

#### Scenario: Execução direta no host
- **WHEN** o processo roda fora de container, sem `DASHBOARD_HOST` definido
- **THEN** ele escuta em `127.0.0.1`
