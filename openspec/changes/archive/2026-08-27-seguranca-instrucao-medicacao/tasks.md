## 1. Reproduzir

- [x] 1.1 Teste que reproduz o cenário real e confirma que hoje a instrução passa
      direto — rodado ANTES de qualquer alteração

## 2. Prompt

- [x] 2.1 Regra 1c no `NUCLEO_FIXO`, logo depois da 1b
- [x] 2.2 Regra 3 passa a excluir medicação explicitamente
- [x] 2.3 Teste de que as duas estão no prompt das três personalidades

## 3. Rede de segurança determinística

- [x] 3.1 `TIPOS_INTERACAO.RESPOSTA_BLOQUEADA_SEGURANCA` e a mensagem fixa de recusa
- [x] 3.2 `schema.sql` e `migracoes.js`: o valor entra no CHECK, com o sentinela
      apontando para ele
- [x] 3.3 Função pura de detecção: nome cadastrado **mais** verbo de instrução
- [x] 3.4 `conversaLivre` bloqueia antes de enviar, registra o texto recusado e manda a
      mensagem fixa
- [x] 3.5 Vive só no núcleo — nada em `whatsapp/handler.js` nem em `web/servidor.js`
- [x] 3.6 Anamnese não passa pela verificação

## 4. Testes

- [x] 4.1 O cenário reproduzido agora é bloqueado e gera o tipo novo
- [x] 4.2 Resposta sem instrução passa sem bloqueio
- [x] 4.3 O bloqueio é idêntico pelos dois adaptadores
- [x] 4.4 Menção ao remédio sem verbo de instrução não bloqueia
- [x] 4.5 Quem não tem remédio cadastrado não é afetado pela varredura
- [x] 4.6 Nenhum adaptador reimplementa a verificação

## 5. Fechamento

- [x] 5.1 Consulta retroativa: quantas linhas do histórico, de qualquer usuário e
      canal, combinam nome de remédio conhecido com verbo de instrução
- [x] 5.2 `openspec validate --all` e suíte inteira
- [x] 5.3 Verificar rodando
- [x] 5.4 Sync, archive e commit local
