# Monitoramento Waze Recife

Histórico de alertas e trânsito da camada institucional móvel de 24 horas. A coleta percorre os IDs retornados pelo ArcGIS em lotes, grava no Turso e atualiza a última coleta concluída somente após processar as duas camadas. Uma falha interrompe o job e as linhas já gravadas são reaproveitadas na próxima execução. Um ID pode desaparecer entre a listagem e a consulta por causa da janela móvel.

## Ativar

1. Publique esta versão na branch padrão do GitHub. Crie o ambiente `coleta` e cadastre `ARCGIS_USERNAME` e `ARCGIS_PASSWORD` como secrets de uma conta com leitura nas duas camadas. A variável `ARCGIS_TOKEN_URL` pode ser ajustada para o endpoint que funcionou no R, no mesmo domínio institucional. O padrão é `/portal/sharing/rest/generateToken`. Se a configuração exigir troca por um token do ArcGIS Server ou restringir a rede de origem, confirme o fluxo com a equipe do Portal.
2. Em **Actions → Coleta Waze Recife → Run workflow**, mantenha **Apenas verificar acesso ao ArcGIS** marcado. Confira se o runner autentica, confirma o esquema, lista IDs e lê uma amostra de cada camada. O teste só imprime totais e códigos de erro. Essa etapa pode ser feita antes de configurar o Turso.
3. Configure `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no mesmo ambiente do GitHub, com permissão de escrita. Rode manualmente com a opção de verificação desmarcada e confirme a execução integral. O cron roda a cada seis horas, às 03h17, 09h17, 15h17 e 21h17 no Recife, sujeito à fila do GitHub.
4. Conecte o repositório ao Netlify. Configure `TURSO_DATABASE_URL`, um `TURSO_AUTH_TOKEN` somente leitura e uma `DASHBOARD_KEY` aleatória com pelo menos 24 caracteres no ambiente da função. Distribua a chave apenas ao público autorizado. Ela fica em memória no navegador durante a sessão. O Netlify não precisa de credenciais do ArcGIS.

## Dados e painel

- A camada 0 tem pontos de alerta e a camada 1 tem linhas de trânsito. Na verificação autenticada pelo R foram 4.859 e 22.094 registros, respectivamente, com limite de 2.000 por resposta.
- A publicação usa `PUBMILLIS`. A chave de deduplicação usa camada, identificador e publicação. O identificador prioriza `UUID`, seguido por `GLOBALID` quando disponível e por `OBJECTID` como último recurso. Valide a cobertura e estabilidade desses identificadores na primeira execução e em coletas consecutivas.
- O banco preserva a geometria, os campos usados pelo painel e as datas da primeira e última observação. Campos de auditoria com usuários, descrições livres, links de imagem e nomes de vias ficam fora da coleta. O histórico não tem expiração automática.
- Os gráficos e cards representam todo o período filtrado. O mapa usa os 500 registros georreferenciados mais recentes da seleção. O painel trata os valores de `TYPE` como categorias da fonte.
- Inspecione falhas na aba Actions. Como a fonte é móvel, uma interrupção maior que sua janela pode deixar lacunas permanentes.
