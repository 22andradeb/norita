# Referencias clínicas de Norita

> **Estado: pendiente de revisión clínica.** Este documento recoge todos los umbrales, escalas y reglas
> que usa la app para mostrar estados y generar avisos, para que un profesional sanitario pueda
> revisarlos. Nada de lo descrito es un diagnóstico: son herramientas de cribado y de seguimiento para
> cuidadores y familias.
>
> Dónde está cada cosa en el código: rangos y colores en `lib/vitals.ts` (app) y
> `public.vital_reference` en `supabase/migrations/20261008000000_alerts.sql` (avisos del servidor); las
> escalas en `lib/assessments.ts` y `supabase/migrations/20261009000000_assessments.sql`. **Si se cambia
> un umbral, hay que cambiarlo en los dos sitios.**

## 1. Constantes vitales: rangos de referencia generales

Rangos generales para personas adultas. No están personalizados por patología (por ejemplo, objetivos
de glucosa o de tensión distintos en una persona con diabetes o insuficiencia cardiaca).

| Constante | En rango | A vigilar | Importante | Referencia orientativa a verificar |
| --- | --- | --- | --- | --- |
| Tensión arterial (mmHg) | Sistólica 90–139 y diastólica < 90 | Sistólica ≥ 140 o diastólica ≥ 90 | Sistólica ≥ 180 o diastólica ≥ 120; sistólica < 90 | Umbral de hipertensión en consulta de las guías ESC/ESH; ≥ 180/120 como hipertensión grave |
| Pulso (lpm) | 50–100 | < 50 o > 100 | < 40 o > 130 | Rango convencional en reposo; contrastar con NEWS2 |
| Saturación de oxígeno (%) | ≥ 95 | 90–94 | < 90 | Contrastar con NEWS2 y recomendaciones de oxigenoterapia (objetivos distintos en EPOC) |
| Glucosa capilar (mg/dL) | 70–180 | > 180 | < 70 o > 250 | Rango objetivo 70–180 del consenso internacional sobre *time in range* (Battelino et al., *Diabetes Care* 2019) |
| Temperatura (°C) | 36,0–37,7 | ≥ 37,8 (fiebre) o < 36,0 | ≥ 39,0 o < 35,0 | Criterio de fiebre ≥ 37,8 °C en personas mayores (guía IDSA sobre fiebre en residencias, High et al., 2009) |
| Frecuencia respiratoria (rpm) | 12–20 | < 12 o > 20 | < 8 o > 25 | Contrastar con NEWS2 |
| Dolor (0–10) | 0–3 | 4–6 | 7–10 | Escala numérica de dolor (EVN) |
| Peso | — | Cambio ≥ 3 % en 30 días (solo en la app) | Cambio ≥ 5 % en 30 días (solo en la app) | Pérdida de peso involuntaria > 5 % como criterio de riesgo nutricional |

Revisión sugerida: valorar si alinear los umbrales con **NEWS2** (Royal College of Physicians, 2017) y
si permitir objetivos personalizados por persona (por ejemplo, glucosa o saturación).

## 2. Valores fuera de lo habitual en cada persona

Además de los rangos generales, el servidor compara cada lectura que está **dentro** del rango general
con las de esa misma persona en los **30 días anteriores**:

- Solo si hay **5 o más lecturas** previas de esa constante.
- Aviso «a vigilar» si la diferencia con su media supera **el mayor de**: 2 desviaciones típicas o un
  mínimo fijo por constante.

| Constante | Diferencia mínima |
| --- | --- |
| Tensión sistólica | 15 mmHg |
| Pulso | 15 lpm |
| Saturación | 3 puntos |
| Glucosa | 40 mg/dL |
| Temperatura | 0,8 °C |
| Frecuencia respiratoria | 4 rpm |
| Peso | 2 kg |
| Dolor | 3 puntos |

Regla heurística propia, no validada: los mínimos evitan avisos por variaciones pequeñas en personas
con valores muy estables.

## 3. Escalas validadas

### Índice de Bienestar OMS-5 (WHO-5)

- **Qué mide:** bienestar psicológico en las últimas 2 semanas. Lo responde la propia persona.
- **Texto:** versión oficial en español de 1998 (Psychiatric Research Unit, WHO Collaborating Centre in
  Mental Health). De uso libre.
- **Puntuación:** 5 ítems de 0 a 5; la suma × 4 da **0–100**.
- **Interpretación en la app:** > 50 adecuado; **≤ 50 bajo** (aviso «a vigilar»); **≤ 28 muy bajo**
  (aviso «importante», posible cribado de depresión); **bajada ≥ 10 puntos** respecto a la valoración
  anterior (aviso «a vigilar»).
- **Frecuencia propuesta:** cada 2 semanas (la app lo recuerda).
- **Fuentes:**
  - Texto en español: [OMS-5, versión española (OMS)](https://cdn.who.int/media/docs/default-source/mental-health/oms-(cinco)-indice-de-bienestar-(oms-5).pdf?sfvrsn=ed43f352_11)
  - Validación en personas mayores: Lucas-Carrasco R. *Psychiatry Clin Neurosci* 2012 ([PubMed 23066768](https://pubmed.ncbi.nlm.nih.gov/23066768/))
  - Uso y puntuación: [CORC — WHO-5](https://www.corc.uk.net/outcome-measures-guidance/directory-of-outcome-measures/the-world-health-organisation-five-well-being-index-who-5/)
- **Limitación:** en personas con deterioro cognitivo importante las respuestas pueden no ser fiables.

### Escala FRAIL

- **Qué mide:** cribado de fragilidad. Cinco dominios: fatigabilidad, resistencia, deambulación,
  comorbilidad (5 o más de 11 enfermedades) y pérdida de peso (> 5 % en el último año).
- **Texto:** redacción en español habitual en atención primaria (Fisterra / PAPPS). **Pendiente de
  confirmar** que coincide con la versión que usa el servicio de salud correspondiente.
- **Puntuación:** 0–5. Categorías clásicas (Morley et al., *J Nutr Health Aging* 2012): 0 robusto/a,
  1–2 prefrágil, 3–5 frágil.
- **Punto de corte de cribado en la app:** **≥ 1 punto = cribado positivo** (aviso «a vigilar»), siguiendo
  la actualización de 2026 del consenso del Ministerio de Sanidad, que adopta este corte porque ≥ 3 tiene
  baja sensibilidad en atención primaria. También avisa si la categoría empeora.
- **Población diana del consenso:** personas de 70 años o más. El consenso prefiere la prueba de
  ejecución **SPPB** y deja FRAIL como alternativa auto-referida.
- **Frecuencia propuesta:** mensual (la app lo recuerda). A revisar: el consenso no fija una frecuencia
  mensual para el cribado.
- **Fuentes:**
  - [Actualización del documento de consenso sobre prevención de la fragilidad y caídas en la persona mayor (Ministerio de Sanidad, 2026)](https://www.sanidad.gob.es/areas/promocionPrevencion/envejecimientoSaludable/fragilidadCaidas/docs/actualizacionDoc_FragilidadyCaidas_personamayor2026.pdf)
  - [Ministerio de Sanidad: Fragilidad y caídas](https://www.sanidad.gob.es/areas/promocionPrevencion/envejecimientoSaludable/fragilidadCaidas/home.htm)

## 4. Revisión diaria de la visita

Apetito, movilidad y ánimo (1 = muy mal … 5 = muy bien) y confusión (0 = ninguna … 3 = grave). Son
**observaciones del cuidador**, no una escala validada: se muestran como tendencias, sin convertirlas
en una puntuación.

- Aviso «a vigilar» si la confusión es **moderada o grave (≥ 2)**.

## 5. Avisos de cuidados (reglas propias, no validadas)

| Situación | Nivel |
| --- | --- |
| Caída o casi caída registrada | Importante |
| Evento marcado como urgente por el cuidador | Importante |
| Evento marcado como «a vigilar» | A vigilar |
| Toma olvidada o rechazada | A vigilar |
| Toma programada sin registrar 90 minutos después de su hora | A vigilar |
| Sin ningún registro a las 12:00 (hora local) | A vigilar |
| Sin ningún registro a las 20:00 | Importante |
| Ayer: líquidos < 60 % del objetivo diario | A vigilar |
| Ayer: 1 o ninguna comida principal registrada | A vigilar |
| Ayer: sin revisión de la visita | A vigilar |
| Sin deposiciones registradas en 3 días (si se registra el baño) | A vigilar |
| Durmió menos de 5 horas | A vigilar |
| Examen con valores fuera del rango indicado en el propio documento | A vigilar |
| Pocas existencias de un medicamento | A vigilar |
| Cita al día siguiente (recordatorio) | Informativo |

Notas para la revisión:

- **Objetivo de líquidos:** 1,5 L/día por defecto, configurable por persona (1–2,5 L). Debe ajustarlo el
  médico en personas con insuficiencia cardiaca o renal.
- Las reglas solo se aplican a personas con algún registro en los últimos 7 días.

## 6. Exámenes médicos transcritos

La transcripción automática (Claude) marca un resultado como alto, bajo o alterado **solo según el rango
de referencia o las marcas que aparecen en el propio documento**; no aplica rangos propios. Puede
contener errores de lectura: la app indica siempre que se compruebe con el original.

## Registro de revisiones

| Fecha | Revisado por | Cambios |
| --- | --- | --- |
| | | |
