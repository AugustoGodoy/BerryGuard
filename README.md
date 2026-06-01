# BerryGuard 🍓

> **Plataforma de Monitoramento Climático e Alertas para Produtores de Morango**
>
> Trabalho Acadêmico — Disciplina de Computação Distribuída

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Tecnologias Utilizadas](#3-tecnologias-utilizadas)
4. [Pré-requisitos](#4-pré-requisitos)
5. [Instalação e Execução](#5-instalação-e-execução)
6. [Endpoints da API](#6-endpoints-da-api)
7. [Fluxo de Dados](#7-fluxo-de-dados)
8. [Regras de Alerta Agronômicas](#8-regras-de-alerta-agronômicas)
9. [Índice Geral de Risco](#9-índice-geral-de-risco)
10. [Cache Redis e Fallback](#10-cache-redis-e-fallback)
11. [Mensageria RabbitMQ](#11-mensageria-rabbitmq)
12. [Estrutura do Projeto](#12-estrutura-do-projeto)
13. [Configuração](#13-configuração)
14. [Interfaces de Administração](#14-interfaces-de-administração)

---

## 1. Visão Geral

O **BerryGuard** é uma plataforma distribuída de monitoramento climático voltada para produtores de morango. O sistema coleta dados em tempo real via **Open-Meteo** (API gratuita, sem cadastro) e analisa automaticamente cinco métricas agronômicas:

| Métrica              | Fonte Open-Meteo            | Faixa Ideal       |
|----------------------|-----------------------------|-------------------|
| Temperatura          | `temperature_2m` (current)  | 15°C – 28°C       |
| Umidade Relativa     | `relative_humidity_2m` (current) | 60% – 80%    |
| Velocidade do Vento  | `wind_speed_10m` (current)  | ≤ 25 km/h         |
| Precipitação         | `precipitation` (current)   | ≤ 10 mm           |
| Horas de Luz         | `sunshine_duration` (daily) | ≥ 4 h/dia         |

Os dados são cacheados no **Redis**, publicados no **RabbitMQ** e analisados por um worker assíncrono que persiste alertas em **SQLite**.

---

## 2. Arquitetura

```
┌─────────────────┐
│  Usuário        │
│  (Browser)      │
└────────┬────────┘
         │ HTTP :4200
┌────────▼────────────────────────────────────────────┐
│  Frontend Angular 20 (nginx)                         │
│  Dashboard · Histórico · Configurações               │
│  Chart.js · Angular Material                         │
└────────┬────────────────────────────────────────────┘
         │ REST /v1/...  → proxy → :8000
┌────────▼────────────────────────────────────────────┐
│  Backend FastAPI (Python 3.12)                        │
│  WeatherService · AlertService · CacheService        │
│  ConfigService · QueueService                        │
└──┬──────────────┬──────────────┬────────────────────┘
   │              │              │
┌──▼──────┐  ┌───▼────┐  ┌──────▼──────────┐
│  Redis  │  │ SQLite │  │  Open-Meteo API │
│  :6379  │  │ (data) │  │  (externa)      │
│ TTL 15m │  │        │  │                 │
└──┬──────┘  └────────┘  └─────────────────┘
   │ Publish
┌──▼────────────────────────────────────────────────┐
│  RabbitMQ  Exchange: berryguard  Queue: climate_events │
│  :5672 · Direct · Durable · Persistent messages   │
└──┬────────────────────────────────────────────────┘
   │ Consume
┌──▼────────────────────────────────────────────────┐
│  Worker Python (climate_worker.py)                 │
│  · Aplica regras agronômicas                       │
│  · Persiste alertas no SQLite                      │
│  · Reconnect automático com backoff progressivo    │
└────────────────────────────────────────────────────┘
```

---

## 3. Tecnologias Utilizadas

| Camada            | Tecnologia                | Versão   |
|-------------------|---------------------------|----------|
| Frontend          | Angular                   | 20.x     |
| UI Components     | Angular Material          | 20.x     |
| Gráficos          | Chart.js                  | 4.x      |
| Backend           | FastAPI + Python          | 3.12     |
| ORM               | SQLAlchemy                | 2.x      |
| Validação         | Pydantic v2               | 2.x      |
| Cache             | Redis                     | 7.x      |
| Mensageria        | RabbitMQ                  | 3.13     |
| Banco de Dados    | SQLite                    | —        |
| HTTP Client       | httpx                     | 0.28     |
| Dados Climáticos  | Open-Meteo API            | gratuita |
| Containerização   | Docker + Compose          | —        |
| Servidor Web      | nginx                     | 1.27     |

---

## 4. Pré-requisitos

- **Docker** ≥ 24.x
- **Docker Compose** ≥ 2.x

Não é necessário instalar Python, Node.js ou qualquer dependência localmente.

---

## 5. Instalação e Execução

### Subir com Docker Compose

```bash
# Clone o repositório
git clone https://github.com/AugustoGodoy/BerryGuard.git
cd BerryGuard

# (Opcional) configure variáveis de ambiente
cp .env.example .env

# Suba todos os containers
docker compose up --build
```

Aguarde todos os serviços ficarem saudáveis (aprox. 2–3 minutos na primeira execução).

| Serviço           | URL                                  |
|-------------------|--------------------------------------|
| Frontend          | http://localhost:4200                |
| API Docs (Swagger)| http://localhost:8000/docs           |
| RabbitMQ Manager  | http://localhost:15672 (guest/guest) |

### Parar os containers

```bash
docker compose down

# Remover volumes (apaga dados persistidos)
docker compose down -v
```

### Ver logs em tempo real

```bash
# Todos os serviços
docker compose logs -f

# Worker (ver alertas sendo gerados)
docker compose logs -f worker

# Backend
docker compose logs -f backend
```

---

## 6. Endpoints da API

Base URL: `http://localhost:8000`

### GET `/v1/weather`

Retorna dados climáticos atuais para a localização informada.

**Query params:**

| Parâmetro | Tipo    | Padrão     | Descrição           |
|-----------|---------|------------|---------------------|
| `lat`     | float   | -23.5505   | Latitude            |
| `lon`     | float   | -46.6333   | Longitude           |
| `force`   | boolean | false      | Ignora cache Redis  |

**Resposta:**
```json
{
  "data": {
    "temperature": 18.5,
    "humidity": 72.0,
    "wind_speed": 12.3,
    "precipitation": 0.2,
    "sunshine_hours": 6.4,
    "latitude": -23.5505,
    "longitude": -46.6333,
    "from_cache": false,
    "fallback": false,
    "timestamp": "2026-06-01T13:30:00+00:00"
  }
}
```

> O campo `fallback: true` indica que a Open-Meteo estava indisponível e os dados vieram do cache de reserva (TTL 24h).

---

### GET `/v1/alerts`

Lista alertas históricos paginados, filtrados por localização.

**Query params:** `page` (0-based), `size` (1–100, padrão: 20), `lat`, `lon`

---

### GET `/v1/stats`

Estatísticas resumidas da localização.

**Query params:** `lat`, `lon`

```json
{
  "total_alerts": 12,
  "critical_alerts": 3,
  "last_alert": { "id": 12, "type": "GEADA", "severity": "HIGH", ... }
}
```

---

### GET / PUT `/v1/config`

Lê ou atualiza as configurações da aplicação (cidade monitorada).

**Body (PUT):**
```json
{
  "location_name": "Passo Fundo, RS",
  "latitude": -28.2617,
  "longitude": -52.4083,
  "min_temperature": 2.0,
  "max_humidity": 90.0
}
```

---

### DELETE `/v1/cache`

Invalida o cache Redis da localização informada (normal + stale).

**Query params:** `lat`, `lon`

---

### GET `/health`

Health check da API.

---

## 7. Fluxo de Dados

```
1. Usuário acessa o Dashboard Angular
2. Frontend chama GET /v1/weather?lat=...&lon=...&force=...
3. Backend verifica cache Redis (TTL 15 min)
   ├── [HIT]  → retorna dados em cache (from_cache: true)
   └── [MISS] → consulta Open-Meteo
               ├── [OK]    → armazena cache normal + stale (24h), publica no RabbitMQ
               └── [FALHA] → verifica cache stale (24h)
                             ├── [HIT]   → retorna com fallback: true
                             └── [MISS]  → erro 503

4. RabbitMQ entrega mensagem ao Worker
5. Worker analisa 10 regras agronômicas sobre as 5 métricas
6. Worker persiste alertas no SQLite com localização (lat/lon)
7. Frontend exibe clima + alertas + índice de risco + recomendações
```

---

## 8. Regras de Alerta Agronômicas

Todos os limiares são baseados nas condições ideais de cultivo do morango.

### Temperatura

| Condição                    | Tipo               | Severidade |
|-----------------------------|--------------------|------------|
| temp ≤ 0°C                  | `GEADA_CRITICA`    | CRITICAL   |
| 0°C < temp < 10°C           | `GEADA`            | HIGH       |
| 10°C ≤ temp < 15°C          | `TEMPERATURA_BAIXA`| MEDIUM     |
| 0°C < temp < 7°C            | `OBS_FRIO`         | LOW (obs.) |
| temp > 30°C                 | `CALOR_EXCESSIVO`  | HIGH       |

### Umidade

| Condição        | Tipo              | Severidade         |
|-----------------|-------------------|--------------------|
| umidade < 60%   | `UMIDADE_BAIXA`   | MEDIUM             |
| umidade > 80%   | `UMIDADE_ELEVADA` | HIGH               |
| umidade ≥ 95%   | `UMIDADE_ELEVADA` | CRITICAL           |

### Vento

| Condição           | Tipo          | Severidade |
|--------------------|---------------|------------|
| vento > 25 km/h    | `VENTO_FORTE` | MEDIUM     |

### Precipitação

| Condição            | Tipo            | Severidade |
|---------------------|-----------------|------------|
| precipitação > 10mm | `EXCESSO_CHUVA` | HIGH       |

### Luminosidade

| Condição              | Tipo                 | Severidade |
|-----------------------|----------------------|------------|
| horas de luz < 4h/dia | `BAIXA_LUMINOSIDADE` | MEDIUM     |

> A observação `OBS_FRIO` é puramente informativa: indica condições favoráveis para o acúmulo de horas de frio necessárias ao desenvolvimento do morangueiro, sem gerar contadores ou metas.

---

## 9. Índice Geral de Risco

O dashboard exibe um **Índice de Risco (0–100)** calculado com pesos agronômicos:

| Fator       | Peso |
|-------------|------|
| Temperatura | 40%  |
| Umidade     | 40%  |
| Vento       | 20%  |

| Faixa   | Classificação  |
|---------|----------------|
| 0–25    | BAIXO RISCO    |
| 26–50   | ATENÇÃO        |
| 51–75   | ALTO RISCO     |
| 76–100  | RISCO CRÍTICO  |

---

## 10. Cache Redis e Fallback

| Tipo           | Chave                             | TTL     | Descrição                               |
|----------------|-----------------------------------|---------|-----------------------------------------|
| Cache normal   | `weather:{lat:.4f}:{lon:.4f}`     | 15 min  | Cache padrão de respostas da Open-Meteo |
| Cache stale    | `weather_stale:{lat:.4f}:{lon:.4f}` | 24 h  | Cache de reserva usado em caso de falha |

- `from_cache: true` → dados vieram do cache Redis normal
- `fallback: true` → Open-Meteo indisponível; dados vieram do cache stale
- O botão "Atualizar Dados" passa `force=true`, ignorando o cache normal e consultando a API diretamente
- Ao trocar de cidade, o cache da cidade anterior é invalidado via `DELETE /v1/cache`

---

## 11. Mensageria RabbitMQ

| Parâmetro     | Valor            |
|---------------|------------------|
| Exchange      | `berryguard`     |
| Tipo          | `direct`         |
| Queue         | `climate_events` |
| Routing key   | `climate.data`   |
| Durabilidade  | Durável          |
| Mensagens     | Persistentes (`delivery_mode: 2`) |
| Reconnect     | Backoff progressivo (2s → 30s max) |

---

## 12. Estrutura do Projeto

```
BerryGuard/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── alerts.py       # GET /v1/alerts (paginado + filtro por lat/lon)
│   │   │   ├── cache.py        # DELETE /v1/cache
│   │   │   ├── config.py       # GET|PUT /v1/config
│   │   │   ├── stats.py        # GET /v1/stats
│   │   │   └── weather.py      # GET /v1/weather
│   │   ├── core/
│   │   │   ├── config.py       # Pydantic-settings (.env)
│   │   │   └── logging.py      # Logger estruturado
│   │   ├── database/
│   │   │   └── connection.py   # SQLAlchemy engine + SessionLocal
│   │   ├── models/
│   │   │   ├── alert.py        # ORM Alert
│   │   │   └── config.py       # ORM AppConfig
│   │   ├── repositories/
│   │   │   ├── alert_repository.py   # CRUD + filtro por localização
│   │   │   └── config_repository.py
│   │   ├── schemas/
│   │   │   ├── alert.py        # Pydantic schemas de alerta
│   │   │   ├── config.py       # Pydantic schema de configuração
│   │   │   ├── stats.py        # Pydantic schema de estatísticas
│   │   │   └── weather.py      # WeatherData + WeatherResponse
│   │   ├── services/
│   │   │   ├── alert_service.py    # Regras de negócio de alertas
│   │   │   ├── cache_service.py    # Redis normal + stale
│   │   │   ├── queue_service.py    # Publicar no RabbitMQ
│   │   │   └── weather_service.py  # Busca Open-Meteo + fallback
│   │   └── workers/
│   │       └── climate_worker.py   # Consumer RabbitMQ + regras agronômicas
│   ├── main.py                     # FastAPI app + lifespan + CORS
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── models/
│   │   │   │   ├── alert.model.ts    # AlertType · AlertSeverity · Alert
│   │   │   │   ├── config.model.ts   # AppConfig
│   │   │   │   └── weather.model.ts  # WeatherData · WeatherResponse
│   │   │   ├── services/
│   │   │   │   ├── alert.service.ts
│   │   │   │   ├── config.service.ts       # BehaviorSubject reativo
│   │   │   │   ├── geocoding.service.ts    # Autocomplete de cidades
│   │   │   │   ├── recommendation.service.ts # Recomendações + Risk Score
│   │   │   │   └── weather.service.ts
│   │   │   ├── pages/
│   │   │   │   ├── dashboard/   # Cards · Gráficos · Recomendações · Alertas
│   │   │   │   ├── history/     # Tabela paginada de alertas
│   │   │   │   └── settings/    # Configuração + autocomplete de cidade
│   │   │   └── shared/
│   │   │       └── components/navbar/
│   │   └── styles.scss
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── angular.json
│   └── proxy.conf.json
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## 13. Configuração

Copie e edite o arquivo de variáveis de ambiente:

```bash
cp .env.example .env
```

| Variável                  | Padrão          | Descrição                        |
|---------------------------|-----------------|----------------------------------|
| `RABBITMQ_USER`           | `guest`         | Usuário RabbitMQ                 |
| `RABBITMQ_PASS`           | `guest`         | Senha RabbitMQ                   |
| `CACHE_TTL_SECONDS`       | `900`           | TTL cache normal Redis (seg.)    |
| `DEFAULT_LATITUDE`        | `-23.5505`      | Latitude padrão (São Paulo)      |
| `DEFAULT_LONGITUDE`       | `-46.6333`      | Longitude padrão (São Paulo)     |
| `DEFAULT_LOCATION_NAME`   | `São Paulo, SP` | Nome da cidade padrão            |
| `DEFAULT_MIN_TEMPERATURE` | `2.0`           | Limiar de temperatura (config)   |
| `DEFAULT_MAX_HUMIDITY`    | `90.0`          | Limiar de umidade (config)       |

> As variáveis `DEFAULT_MIN_TEMPERATURE` e `DEFAULT_MAX_HUMIDITY` são usadas na configuração inicial. As regras agronômicas de alerta utilizam limiares fixos definidos no worker.

---

## 14. Interfaces de Administração

| Interface              | URL                          | Credenciais   |
|------------------------|------------------------------|---------------|
| Swagger UI (API docs)  | http://localhost:8000/docs   | —             |
| ReDoc                  | http://localhost:8000/redoc  | —             |
| RabbitMQ Management    | http://localhost:15672       | guest / guest |

---

*BerryGuard — Computação Distribuída © 2026*
