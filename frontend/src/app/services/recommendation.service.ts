import { Injectable } from '@angular/core';
import { WeatherData } from '../models/weather.model';
import { AppConfig } from '../models/config.model';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'safe';
export type RecommendationCategory =
  | 'Geada' | 'Temperatura' | 'Umidade' | 'Chuva' | 'Vento' | 'Luminosidade' | 'Manejo Preventivo';

export interface Recommendation {
  icon: string;
  title: string;
  text: string;
  priority: RecommendationPriority;
  category: RecommendationCategory;
}

// ── Limiares agronômicos — morango ────────────────────────────────────────────
const TEMP_IDEAL_MIN = 15;
const TEMP_IDEAL_MAX = 28;
const TEMP_GEADA_MIN = 10;
const TEMP_CONGEL    = 0;
const TEMP_CALOR_MAX = 30;
const TEMP_FRIO_OBS  = 7;   // observação informativa (sem contador)
const HUM_IDEAL_MIN  = 60;
const HUM_IDEAL_MAX  = 80;
const WIND_MAX       = 25;
const PRECIP_MAX     = 10;  // mm
const SUNSHINE_MIN   = 4;   // h/dia

@Injectable({ providedIn: 'root' })
export class RecommendationService {

  generate(weather: WeatherData, _config: AppConfig): Recommendation[] {
    const recs: Recommendation[] = [];
    const t = weather.temperature;
    const h = weather.humidity;
    const w = weather.wind_speed;
    const p = weather.precipitation ?? 0;
    const s = weather.sunshine_hours ?? 0;

    // ── Congelamento Crítico (≤ 0°C) ─────────────────────────────────────────
    if (t <= TEMP_CONGEL) {
      recs.push({
        icon: 'ac_unit', category: 'Geada', priority: 'critical',
        title: 'Proteção Térmica Imediata',
        text: `Temperatura ${t.toFixed(1)}°C. Acione protocolos emergenciais e aplique cobertura térmica nas plantas.`,
      });
      recs.push({
        icon: 'water', category: 'Geada', priority: 'critical',
        title: 'Irrigação Antigeada',
        text: 'Ative irrigação por aspersão para criar barreira de calor latente nas folhas e frutos.',
      });
      recs.push({
        icon: 'search', category: 'Geada', priority: 'high',
        title: 'Inspeção Pós-Evento',
        text: 'Após a geada, inspecione coroas, flores e frutos em busca de danos por congelamento.',
      });
    }
    // ── Risco de Geada (0°C < temp < 10°C) ───────────────────────────────────
    else if (t < TEMP_GEADA_MIN) {
      recs.push({
        icon: 'thermostat', category: 'Geada', priority: 'high',
        title: 'Risco de Geada',
        text: `Temperatura ${t.toFixed(1)}°C na faixa crítica (0°C–10°C). Prepare proteção térmica e monitore à madrugada.`,
      });
      recs.push({
        icon: 'nights_stay', category: 'Geada', priority: 'high',
        title: 'Monitoramento Noturno',
        text: 'Programe verificações entre 2h e 6h. As temperaturas mínimas ocorrem nesse período.',
      });
    }
    // ── Temperatura Baixa (10°C ≤ temp < 15°C) ───────────────────────────────
    else if (t < TEMP_IDEAL_MIN) {
      // Observação informativa quando temp < 7°C (dentro dessa faixa)
      if (t < TEMP_FRIO_OBS) {
        recs.push({
          icon: 'info', category: 'Temperatura', priority: 'medium',
          title: 'Condição de Frio Detectada',
          text: `Temperatura ${t.toFixed(1)}°C. Condição favorável para o acúmulo de horas de frio necessárias ao desenvolvimento do morangueiro.`,
        });
      } else {
        recs.push({
          icon: 'device_thermostat', category: 'Temperatura', priority: 'medium',
          title: 'Temperatura Abaixo do Ideal',
          text: `Temperatura ${t.toFixed(1)}°C abaixo da faixa ideal (15°C–28°C). Pode comprometer o desenvolvimento vegetativo.`,
        });
      }
    }
    // ── Calor Excessivo (> 30°C) ──────────────────────────────────────────────
    else if (t > TEMP_CALOR_MAX) {
      recs.push({
        icon: 'wb_sunny', category: 'Temperatura', priority: 'high',
        title: 'Calor Excessivo',
        text: `Temperatura ${t.toFixed(1)}°C acima do limite (30°C). Risco de estresse hídrico e queima foliar.`,
      });
      recs.push({
        icon: 'water_drop', category: 'Manejo Preventivo', priority: 'high',
        title: 'Reforçar Irrigação',
        text: 'Aumente a frequência de irrigação. Faça irrigações nas horas mais frescas (manhã e fim de tarde).',
      });
      recs.push({
        icon: 'filter_drama', category: 'Manejo Preventivo', priority: 'medium',
        title: 'Avaliar Sombreamento',
        text: 'Telas de sombreamento (30–50%) reduzem a temperatura nas plantas e protegem os frutos.',
      });
    }

    // ── Umidade Baixa (< 60%) ─────────────────────────────────────────────────
    if (h < HUM_IDEAL_MIN) {
      recs.push({
        icon: 'opacity', category: 'Umidade', priority: 'medium',
        title: 'Umidade Abaixo do Ideal',
        text: `Umidade ${h.toFixed(0)}% abaixo da faixa ideal (60%–80%). Pode comprometer o desenvolvimento dos frutos.`,
      });
      recs.push({
        icon: 'shower', category: 'Manejo Preventivo', priority: 'medium',
        title: 'Revisar Irrigação',
        text: 'Verifique o sistema de irrigação. Considere nebulização para elevar a umidade relativa.',
      });
    }
    // ── Umidade Elevada (> 80%) ───────────────────────────────────────────────
    else if (h > HUM_IDEAL_MAX) {
      recs.push({
        icon: 'coronavirus', category: 'Umidade', priority: h >= 95 ? 'critical' : 'high',
        title: h >= 95 ? 'Risco Crítico de Doenças Fúngicas' : 'Umidade Elevada — Risco de Fungos',
        text: `Umidade ${h.toFixed(0)}% acima de 80% favorece Botrytis e Oídio. Inspecione folhas e frutos.`,
      });
      recs.push({
        icon: 'air', category: 'Manejo Preventivo', priority: 'high',
        title: 'Melhorar Ventilação',
        text: 'Abra túneis e estufas. Boa circulação de ar reduz a incidência de doenças fúngicas.',
      });
      recs.push({
        icon: 'water_damage', category: 'Manejo Preventivo', priority: 'medium',
        title: 'Revisar Drenagem',
        text: 'Verifique se o solo não está encharcado. Excesso de água nas raízes causa podridão.',
      });
    }

    // ── Excesso de Chuva (> 10 mm) ────────────────────────────────────────────
    if (p > PRECIP_MAX) {
      recs.push({
        icon: 'umbrella', category: 'Chuva', priority: 'high',
        title: 'Excesso de Chuva',
        text: `Precipitação de ${p.toFixed(1)} mm acima do limite seguro (10 mm). Risco de encharcamento e podridão.`,
      });
      recs.push({
        icon: 'water_damage', category: 'Manejo Preventivo', priority: 'medium',
        title: 'Verificar Drenagem',
        text: 'Inspecione canais de escoamento e canteiros. Evite o acúmulo de água no solo.',
      });
    }

    // ── Vento Forte (> 25 km/h) ───────────────────────────────────────────────
    if (w > WIND_MAX) {
      recs.push({
        icon: 'air', category: 'Vento', priority: 'medium',
        title: 'Vento Forte',
        text: `Velocidade do vento ${w.toFixed(1)} km/h acima do limite seguro (25 km/h). Pode causar danos às flores.`,
      });
    }

    // ── Baixa Luminosidade (< 4 h e > 0 h) ───────────────────────────────────
    if (s > 0 && s < SUNSHINE_MIN) {
      recs.push({
        icon: 'wb_cloudy', category: 'Luminosidade', priority: 'medium',
        title: 'Baixa Luminosidade',
        text: `Apenas ${s.toFixed(1)}h de luz hoje, abaixo do ideal (≥ 4h). Pode reduzir a fotossíntese e o desenvolvimento dos frutos.`,
      });
    }

    // ── Condições Ideais ──────────────────────────────────────────────────────
    if (recs.length === 0) {
      recs.push({
        icon: 'check_circle', category: 'Manejo Preventivo', priority: 'safe',
        title: 'Plantação em Condições Ideais',
        text: `Temperatura ${t.toFixed(1)}°C e umidade ${h.toFixed(0)}% dentro da faixa ideal para o morango.`,
      });
      recs.push({
        icon: 'eco', category: 'Manejo Preventivo', priority: 'safe',
        title: 'Aproveitar Boas Condições',
        text: 'Momento ideal para adubação, controle preventivo de pragas e inspeção de qualidade dos frutos.',
      });
    }

    return recs;
  }

  /**
   * Índice Geral de Risco (0–100).
   * Pesos: temperatura 40% | umidade 40% | vento 20%
   */
  calcRiskScore(weather: WeatherData): number {
    const t = weather.temperature;
    const h = weather.humidity;
    const w = weather.wind_speed;

    let tempScore: number;
    if (t <= TEMP_CONGEL)         tempScore = 100;
    else if (t < TEMP_GEADA_MIN)  tempScore = 75;
    else if (t < TEMP_IDEAL_MIN)  tempScore = 30;
    else if (t <= TEMP_IDEAL_MAX) tempScore = 0;
    else if (t <= TEMP_CALOR_MAX) tempScore = 15;
    else                          tempScore = 75;

    let humScore: number;
    if (h < HUM_IDEAL_MIN)        humScore = Math.min(100, (HUM_IDEAL_MIN - h) * 2.5);
    else if (h <= HUM_IDEAL_MAX)  humScore = 0;
    else                          humScore = Math.min(100, (h - HUM_IDEAL_MAX) * 5);

    const windScore = w > WIND_MAX ? Math.min(100, (w - WIND_MAX) * 3) : 0;

    return Math.round(tempScore * 0.4 + humScore * 0.4 + windScore * 0.2);
  }

  riskScoreLabel(score: number): { label: string; css: string } {
    if (score <= 25) return { label: 'BAIXO RISCO',  css: 'score-low'      };
    if (score <= 50) return { label: 'ATENÇÃO',       css: 'score-medium'   };
    if (score <= 75) return { label: 'ALTO RISCO',    css: 'score-high'     };
    return             { label: 'RISCO CRÍTICO',  css: 'score-critical' };
  }
}
