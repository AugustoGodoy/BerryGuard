# Demonstração: Cache Redis em Ação

> Teste executado em **02/06/2026 às 20:27** no ambiente local Docker.

---

## Objetivo

Demonstrar que o BerryGuard utiliza o Redis como camada de cache entre o backend e a API Open-Meteo, evitando chamadas desnecessárias à API externa e respondendo com muito mais velocidade na segunda requisição.

---

## Pré-requisitos

Todos os containers rodando:

```bash
docker compose up -d
docker compose ps   # todos devem estar "healthy"
```

---

## Passo 1 — Limpar o cache

Remove qualquer dado em cache para garantir que a próxima chamada vá à API:

```bash
docker exec berryguard-redis redis-cli DEL "weather:-23.5505:-46.6333"
```

**Saída esperada:**
```
1
```
> O número `1` indica que a chave foi deletada com sucesso.

---

## Passo 2 — 1ª chamada (sem cache)

```bash
curl -s "http://localhost:8000/v1/weather?lat=-23.5505&lon=-46.6333&force=false"
```

**Resposta da API:**
```json
{
  "temperature": 16.4,
  "humidity": 73.0,
  "from_cache": false,
  "fallback": false
}
```

**Logs do backend (`docker logs berryguard-backend`):**
```
[QUERY INITIATED] lat=-23.5505 lon=-46.6333 force=False
[CACHE MISS] key=weather:-23.5505:-46.6333
[API FETCHED] lat=-23.5505 lon=-46.6333 temp=16.4°C hum=73.0% precip=0.0mm sun=8.0h
[CACHE SET] key=weather:-23.5505:-46.6333 ttl=900s
[CACHE STALE SET] key=stale:weather:-23.5505:-46.6333 ttl=86400s
[QUERY COMPLETED] source=api lat=-23.5505 lon=-46.6333
```

**Tempo de resposta:** ~1089ms

**O que aconteceu:**
- Cache estava vazio → backend consultou a Open-Meteo
- Dados retornados foram salvos no Redis com TTL de **15 minutos** (900s)
- Uma cópia "stale" foi salva com TTL de **24 horas** (86400s) para uso como fallback

---

## Passo 3 — 2ª chamada (com cache)

Mesma chamada, sem alterar nada:

```bash
curl -s "http://localhost:8000/v1/weather?lat=-23.5505&lon=-46.6333&force=false"
```

**Resposta da API:**
```json
{
  "temperature": 16.4,
  "humidity": 73.0,
  "from_cache": true,
  "fallback": false
}
```

**Logs do backend:**
```
[QUERY INITIATED] lat=-23.5505 lon=-46.6333 force=False
[CACHE HIT] key=weather:-23.5505:-46.6333
[QUERY COMPLETED] source=cache lat=-23.5505 lon=-46.6333
```

**Tempo de resposta:** ~129ms

**O que aconteceu:**
- Cache estava populado → backend retornou direto do Redis
- Open-Meteo **não foi consultada**
- Campo `from_cache: true` confirma a origem do dado

---

## Resumo dos resultados

| Chamada | Fonte       | Tempo    | `from_cache` |
|---------|-------------|----------|--------------|
| 1ª      | Open-Meteo  | ~1089ms  | `false`      |
| 2ª      | Redis       | ~129ms   | `true`       |

> A segunda chamada foi **~8x mais rápida** por vir do cache local em vez de fazer uma requisição HTTP à API externa.

---

## Estratégia de cache do BerryGuard

| Tipo        | Chave Redis                        | TTL         | Uso                                              |
|-------------|------------------------------------|-------------|--------------------------------------------------|
| Cache normal | `weather:{lat}:{lon}`             | 15 minutos  | Resposta rápida para chamadas repetidas          |
| Cache stale  | `stale:weather:{lat}:{lon}`       | 24 horas    | Fallback quando a Open-Meteo estiver indisponível |

### Fluxo completo

```
Requisição GET /v1/weather?force=false
        │
        ▼
   Redis possui cache?
     ├── SIM → retorna em ~130ms (from_cache: true)
     └── NÃO → consulta Open-Meteo (~1s)
                    │
                    ▼
             Salva no Redis (15 min)
             Salva stale no Redis (24 h)
             Publica no RabbitMQ → Worker analisa → Alerta gerado
```

### Parâmetro `force`

| Valor   | Comportamento                                      |
|---------|----------------------------------------------------|
| `false` | Verifica Redis primeiro (padrão, eficiente)        |
| `true`  | Ignora cache, sempre consulta Open-Meteo diretamente |

> O botão **"Atualizar Dados"** do dashboard usa `force=true` intencionalmente para garantir dados em tempo real ao clicar manualmente. O auto-refresh automático (60s) usa `force=false` e aproveita o cache.
