# Histórico de versões

Todas as mudanças relevantes do Casa em Dia ficam registradas aqui: novidades, bugs encontrados e o que foi corrigido.

## 2026-11-04 · Filtros de busca e visual em degradê

### Novidades

- **Filtros de busca em Lançamentos:** texto livre na descrição e na categoria (ignora acentos), categoria, período de/até em qualquer mês, valor mínimo e máximo.
- **Totais do resultado:** entradas, despesas e saldo do que está filtrado.
- **Exportar CSV** do resultado (separador `;` e vírgula decimal, abre direto no Excel em português).
- **Limpar filtros** com um clique; sem datas preenchidas, a lista volta ao mês escolhido no topo.
- **Visual em degradê** no cartão de saldo, nos botões principais, na barra lateral, na linha do topo, na barra de progresso e no aviso flutuante. O degradê acompanha a paleta escolhida (vermelho, azul, verde ou amarelo).
- **Ícone na aba do navegador** usando o `casa_em_dia.ico` que já existia no projeto.

### Bugs encontrados e corrigidos

| Bug | Causa | Correção |
| --- | --- | --- |
| Gráficos do dashboard apareciam como blocos lisos por até 5 s ao voltar de outra aba. | A atualização automática (a cada 5 s) redesenhava os gráficos com a aba Dashboard escondida, quando eles têm tamanho zero. | Os gráficos são redesenhados ao abrir a aba Dashboard. |
| No celular, a página de Lançamentos rolava para o lado. | O texto oculto "Ações" no cabeçalho da tabela usa posição absoluta e escapava da área de rolagem da tabela. | A área da tabela passou a conter esse elemento (`position: relative`). |
| Erro 404 no console a cada carregamento. | O navegador pedia `/favicon.ico`, mas o HTML não apontava para o ícone do projeto. | Link para `casa_em_dia.ico` no `<head>`. |
| Texto pequeno do cartão de saldo ficava apagado sobre o degradê. | A cor clara do texto se confundia com o começo claro do degradê. | Texto usa a cor de contraste da paleta. |
| Risco de o navegador manter o CSS e o JavaScript antigos depois da atualização. | Os arquivos estáticos podem ficar em cache e as versões (`?v=`) não tinham mudado. | Versões atualizadas para `styles.css?v=22` e `app.js?v=24`. |

### Como foi testado

- Banco separado com dados fictícios; o banco pessoal não foi usado.
- Busca "mercado" de 01/10 a 30/11: 3 lançamentos, R$ 1.359,20 (conferido à mão).
- Valor inválido no filtro é ignorado e avisado na tela.
- Telas de 1296 px e 390 px de largura, sem rolagem lateral, nas paletas vermelha, azul e verde.

### Limitações conhecidas

- O servidor não tem login nem HTTPS: use só neste computador ou em rede privada confiável.

## 2026-10-31 · Execução com Docker

- `Dockerfile` e `compose.yaml` para rodar com `docker compose up`, com o banco salvo em volume.

## 2026-10-30 · Prints no README

- Prints das telas no README, com valores e descrições borrados.

## 2026-10-27 a 2026-10-28 · Primeira versão publicada

- Código publicado sem dados pessoais.
- Paletas de cores selecionáveis, aplicadas ao saldo e à navegação; logotipo da casa.
- Percentuais na legenda do gráfico de despesas; datas no formato brasileiro; melhorias na lista de lançamentos.
- **Correção:** unidades do custo de combustível e das taxas de trabalho.
- **Segurança:** acesso restrito ao próprio computador por padrão.
