# Casa em Dia

Dashboard gratuito e leve para organizar as finanças da casa. Acompanhe entradas, despesas e saldo por mês, veja gráficos e registre ganhos de trabalho e quilometragem. A interface usa HTML, CSS e JavaScript sem bibliotecas externas; o servidor e o banco de dados usam apenas Python e SQLite.

## Recursos

- Dashboard mensal com seleção separada de mês e ano, totais, gráficos por categoria, movimento diário e comparativo semanal.
- Histórico dos oito lançamentos mais recentes, sem limitar os dados usados nos totais mensais.
- Registro e filtro de entradas e despesas, com categorias comuns e valores no formato brasileiro.
- Registro de ganhos por trabalho, serviços extras, horas trabalhadas e despesas do veículo.
- Taxas horárias padrão de R$ 38/h de segunda a quinta e R$ 50/h de sexta a domingo (ajustáveis), preço efetivo do combustível em R$/L, consumo do carro em km/L, custo-base em R$/km e margem configuráveis.
- Atualização automática entre dispositivos conectados ao servidor local.
- Banco pessoal criado automaticamente em `data/household.sqlite3`. O repositório não contém dados financeiros de exemplo ou dados de usuários.

## Requisitos

- Python 3.9 ou superior.
- Um navegador moderno.

## Instalação e execução

Clone o repositório e inicie o servidor:

```powershell
git clone https://github.com/brenolrocha22/CASA-EM-DIA.git
cd CASA-EM-DIA
python server.py
```

Abra <http://127.0.0.1:8765>. O servidor, por padrão, aceita conexões somente do próprio computador.

### Acessar em outros dispositivos da casa

Em uma rede Wi-Fi privada e confiável, inicie o servidor aceitando conexões locais:

```powershell
python server.py --host 0.0.0.0 --port 8765
```

Descubra o endereço IPv4 do computador servidor (`ipconfig` no Windows) e acesse `http://IP-DO-COMPUTADOR:8765` no outro dispositivo. Se necessário, permita a conexão no Firewall do Windows **somente em redes privadas confiáveis**.

O servidor não tem autenticação nem HTTPS. Não o exponha à internet nem use redes públicas ou compartilhadas. Cada instalação mantém seus próprios dados localmente; faça cópia de segurança do arquivo `data/household.sqlite3`.

## Privacidade e licença

O banco SQLite, os ambientes virtuais e caches locais são excluídos pelo `.gitignore`. Não envie seu arquivo de banco, cópias de segurança, senhas nem outros dados pessoais ao repositório. Para usar o projeto em sua casa, clone o código e execute-o localmente: um banco vazio será criado no seu computador.

Este projeto é distribuído gratuitamente sob a licença MIT. Consulte [LICENSE](./LICENSE).

## Referências técnicas

- [Python `http.server`](https://docs.python.org/3/library/http.server.html)
- [Python `sqlite3`](https://docs.python.org/3/library/sqlite3.html)
- [MDN: Canvas API](https://developer.mozilla.org/docs/Web/API/Canvas_API)
- [MDN: `<dialog>`](https://developer.mozilla.org/docs/Web/HTML/Element/dialog)
