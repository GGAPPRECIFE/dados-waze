# Dicionário de variáveis do Waze Recife

O Turso guarda alertas e observações de trânsito na tabela `events`. Cada linha representa um registro publicado de uma das duas camadas. A mesma ocorrência ou trecho pode aparecer em horários diferentes.

## Tabela `events`

| Variável | Tipo no Turso | Camada | Origem | Definição |
|---|---|---|---|---|
| `id` | Texto | Ambas | Coletor | Chave de deduplicação calculada a partir da camada, do identificador da fonte e do horário de publicação. O identificador prioriza `UUID`, depois `GLOBALID` quando disponível e, por fim, `OBJECTID`. |
| `layer` | Inteiro | Ambas | Camada ArcGIS | `0` = alertas. `1` = trânsito. |
| `published` | Inteiro | Ambas | `PUBMILLIS` | Data e hora de publicação na fonte, em milissegundos desde 01/01/1970 UTC. Use para análises por data e hora. |
| `type` | Texto | Ambas | `TYPE` | Categoria da fonte. Exemplos observados no painel incluem `JAM` (congestionamento), `HAZARD` (perigo), `ACCIDENT` (acidente) e `ROAD_CLOSED` (via interditada). O coletor grava `Sem tipo` quando o campo vem vazio ou nulo. |
| `subtype` | Texto ou nulo | Alertas | `SUBTYPE` | Detalhamento da categoria do alerta, quando informado. |
| `neighborhood` | Texto ou nulo | Alertas | `NMBAIRRO` | Nome do bairro informado pela camada de alertas. |
| `level` | Inteiro ou nulo | Trânsito | `LEVEL` | Código de nível informado pela fonte. O coletor conserva o valor original. A correspondência entre códigos e graus de severidade não foi validada. |
| `speed` | Inteiro ou nulo | Trânsito | `SPEEDKMH` | Velocidade registrada em quilômetros por hora (km/h). |
| `geometry` | Texto JSON ou nulo | Ambas | Geometria ArcGIS | GeoJSON sem atributos. Alertas são `Point`. Trânsito é `MultiLineString`. As coordenadas estão em WGS 84 (EPSG:4326), na ordem longitude, latitude. |
| `first_seen` | Inteiro | Ambas | Coletor | Horário de início da primeira coleta que gravou o registro. |
| `last_seen` | Inteiro | Ambas | Coletor | Horário de início da coleta mais recente em que o registro foi encontrado. Atualiza quando a mesma chave reaparece. |

## Tabela `runs`

| Variável | Tipo no Turso | Definição |
|---|---|---|
| `finished` | Inteiro | Data e hora da conclusão de uma coleta das duas camadas, em milissegundos desde 01/01/1970 UTC. |

## Uso no R

- O script de download importa os campos como texto. Converta `layer`, `level` e `speed` com `as.integer()` antes de operar com eles como números.
- O campo `publicacao` é derivado de `published` no R. A mesma conversão se aplica a `first_seen`, `last_seen` e `finished`.

```r
as.POSIXct(as.numeric(waze$published) / 1000,
           origin = "1970-01-01", tz = "America/Recife")
```

- `subtype` e `neighborhood` ficam nulos nas linhas de trânsito. `level` e `speed` ficam nulos nas linhas de alerta. O script representa nulos como `NA`.
- Para contar registros por categoria, filtre ou agrupe também por `layer`. Um alerta de congestionamento e uma observação de trânsito podem descrever o mesmo trecho.
- O arquivo `waze_historico.rds` gerado pelo script reúne os registros de `events`. A tabela `runs` pode ser consultada separadamente para verificar os horários das coletas concluídas.
