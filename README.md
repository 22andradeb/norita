# Norita

App de cuidados para personas mayores: los cuidadores registran cada visita y la familia sigue su
evolución con análisis, avisos y notificaciones. Una sola app de Expo con dos experiencias,
**cuidador/a** y **familiar**, que se elige al crear la cuenta.

## Tecnología

- Expo (React Native) + TypeScript, Expo Router
- Supabase (Postgres, autenticación, seguridad por filas, almacenamiento, funciones edge, pg_cron)
- API de Claude para transcribir documentos médicos
- EAS Build / Submit para App Store y Google Play

## Puesta en marcha

1. Instala Node.js LTS desde https://nodejs.org
2. Instala las dependencias y ajústalas a la versión del SDK de Expo:
   ```bash
   npm install && npx expo install --fix
   ```
3. Crea un proyecto en Supabase, copia `.env.example` a `.env` y rellena la URL y la clave anon.
4. Aplica las migraciones de la base de datos **en orden por nombre de archivo**: pega cada
   `supabase/migrations/*.sql` en el SQL Editor de Supabase, o usa la CLI de Supabase
   (`npx supabase init`, `npx supabase link` y `npx supabase db push`).
5. Arranca la app:
   ```bash
   npx expo start
   ```
   Escanea el código QR con Expo Go en el móvil.

## Organización de la app

`app/_layout.tsx` protege cada zona con `Stack.Protected`: sin sesión se ve `app/(auth)/`; sin haber
aceptado el consentimiento vigente, `app/consent.tsx`; el resto de usuarios accede a las pestañas.
Las pestañas cambian según el rol de la cuenta (`app/home/_layout.tsx`).

**Cuidador/a**

| Pestaña | Contenido |
| --- | --- |
| Hoy (`app/home/index.tsx`) | Semana, visita (botones «He llegado» / «Me voy»), próxima cita, WHO-5 y FRAIL, anillos de medicación / líquidos / comidas, próxima toma, avisos, constantes vitales, rachas y registro del día |
| Medicación (`app/home/meds.tsx`) | Lista de tomas del día (un toque para registrar), medicación «si lo necesita», existencias y avisos de pocas existencias |
| Citas (`app/home/citas.tsx`) | Citas médicas: añadir, editar y cancelar |
| Historial (`app/home/historial.tsx`) | Día a día y exámenes médicos |
| Equipo (`app/home/team.tsx`) | Equipo de cuidados, códigos de invitación, objetivo de líquidos, notificaciones y cuenta |

El análisis completo (`app/home/trends.tsx`) se abre desde los enlaces de Hoy e Historial. El botón
«+» abre la hoja de registro (`app/log/index.tsx`).

**Familiar** (pantallas en `components/family/`, cálculos en `lib/family.ts`)

| Pestaña | Contenido |
| --- | --- |
| Hoy | Persona, estado general, próxima cita, visita del cuidador, WHO-5 y FRAIL, el día de un vistazo, avisos y lo que pasó en el día |
| Salud | Tres apartados: signos vitales (franja de referencia, media / mín. / máx. / % en rango, cambio frente al periodo anterior), medicación (adherencia, puntualidad, días de existencias) y bienestar (WHO-5, FRAIL, ánimo, confusión, líquidos, comidas, sueño) |
| Citas | Igual que para cuidadores: toda la familia puede añadir, editar y cancelar |
| Historial | Calendario de días con cuidados, rachas, historial día a día desplegable y exámenes |
| Equipo | Igual que para cuidadores |

La persona que se está viendo se elige arriba de cada pestaña (`app/people.tsx`) y se recuerda por
usuario (`lib/person.tsx`). Al tocar una constante vital se abre `app/metric/[key].tsx`.

La interfaz está en español de España; fechas y números se formatean en `lib/format.ts`, que también
traduce los mensajes de error del servidor. Los avisos calculados en la app y las rachas están en
`lib/insights.ts`.

Los colores de estado de las constantes vitales usan rangos de referencia generales para adultos
(`lib/vitals.ts`). Debe revisarlos un profesional sanitario y no son un diagnóstico.

## Qué se puede registrar

Revisión de la visita, constantes vitales (tensión, pulso, temperatura, SpO₂, respiración, glucosa,
peso, dolor), comidas y bebidas, medicación (tomas dadas / rechazadas / olvidadas y existencias),
sueño, baño, higiene, actividad, conducta, piel, caídas, citas, notas, llegada y salida del cuidador,
valoraciones WHO-5 y FRAIL y exámenes médicos.

Cada tipo de registro se define una sola vez en `lib/logKinds.ts`, que genera tanto el formulario como
su descripción en el historial. Los registros se guardan primero en el móvil (`lib/outbox.ts`) y se
sincronizan cuando hay conexión; si el servidor rechaza alguno, se puede reintentar.

Las personas se vinculan con códigos de invitación de un solo uso (8 caracteres, válidos 7 días): un
cuidador lo crea en Equipo y lo comparte; el familiar lo introduce en «Unirse con un código».

## Exámenes médicos

Cualquier miembro del equipo puede subir una foto o un PDF de un documento médico (Historial →
Exámenes, o «Examen médico» en el «+» del cuidador). Los archivos se guardan en el almacenamiento
privado `medical-documents`; la función `transcribe-document` los envía a Claude (`claude-opus-5-5`,
salida estructurada, reintento automático con otro modelo si hay un rechazo) y guarda el resumen, la
transcripción y cada resultado con su rango de referencia y si está fuera de rango. Los datos
identificativos del paciente se sustituyen por `[omitido]` en la transcripción.

Despliegue de la función (una vez, con la CLI de Supabase):

```bash
npx supabase init            # solo si aún no existe supabase/config.toml
npx supabase link --project-ref <ref-del-proyecto>
npx supabase secrets set ANTHROPIC_API_KEY=<tu-clave>
npx supabase functions deploy transcribe-document
```

Esto envía documentos de salud a la API de Anthropic: antes de usar documentos reales de pacientes
hace falta un acuerdo de tratamiento de datos y la autorización correspondiente.

## Escalas validadas (WHO-5 y FRAIL)

El bienestar y la fragilidad se miden con instrumentos validados, no con una puntuación inventada por
la app (`lib/assessments.ts`, `supabase/migrations/*_assessments.sql`):

- **Índice de Bienestar OMS-5 (WHO-5)**: texto oficial en español (versión de 1998), de uso libre;
  versión española validada en personas mayores. 5 preguntas de 0 a 5; la suma × 4 da 0–100.
  50 o menos es bienestar bajo y 28 o menos, muy bajo; un cambio de 10 puntos es relevante.
  Recomendado cada 2 semanas.
- **Escala FRAIL** (Morley 2012), redacción en español habitual en atención primaria: debe confirmar
  un profesional que coincide con la versión de su servicio de salud. 0 robusto/a, 1–2 prefrágil,
  3–5 frágil; el consenso del Ministerio de Sanidad sobre prevención de la fragilidad (2026)
  considera 1 punto o más como cribado positivo. Recomendada cada mes.

Cualquier miembro del equipo puede hacerlas con la persona (Hoy, Salud → Bienestar o «+»). La base de
datos recalcula siempre la puntuación, genera avisos cuando el WHO-5 es bajo o baja y cuando el
cribado FRAIL es positivo o empeora, y recuerda al equipo cuándo toca repetirlas. Las dos son
herramientas de cribado, no un diagnóstico.

## Avisos y notificaciones

Los avisos se crean en la base de datos (`supabase/migrations/*_alerts.sql`):

- **Al registrar algo**: caídas, avisos urgentes, tomas olvidadas, constantes fuera del rango de
  referencia o fuera de lo habitual en esa persona (comparando con sus últimos 30 días), confusión,
  poco sueño, exámenes alterados y resultados de WHO-5 y FRAIL.
- **Cada 10 minutos**: sin registros a las 12:00 / 20:00, tomas sin registrar, pocas existencias,
  citas del día siguiente, repaso por la mañana del día anterior (líquidos, comidas, revisión,
  deposiciones) y recordatorios de WHO-5 y FRAIL.

Cada aviso aparece una sola vez por situación, se muestra en Hoy y en Avisos y se puede marcar como
visto («Lo he visto», «Me encargo»…).

La función `send-alerts` envía los avisos pendientes como notificaciones push al equipo (excepto a
quien hizo el registro), según la preferencia de cada usuario (Equipo → Notificaciones). pg_cron la
llama cada minuto y la app también la llama justo después de sincronizar registros que pueden generar
avisos.

Configuración (una vez):

```bash
npx eas-cli init                                   # vincula un proyecto de Expo (añade extra.eas.projectId)
openssl rand -hex 32                               # genera un secreto aleatorio; úsalo dos veces abajo
npx supabase secrets set CRON_SECRET=<secreto>
npx supabase functions deploy send-alerts --no-verify-jwt
```

Después, en el SQL Editor de Supabase:

```sql
select vault.create_secret('https://<ref-del-proyecto>.supabase.co', 'norita_project_url');
select vault.create_secret('<secreto>', 'norita_cron_secret');
```

Las notificaciones funcionan en Expo Go en iPhone; en Android hace falta una versión de desarrollo.

## Pruebas de la base de datos

```bash
npm run test:db
```

Aplica todas las migraciones a un Postgres en memoria y comprueba quién puede leer y escribir qué,
cómo se calculan las puntuaciones y qué avisos se generan.

## Plan

1. ~~Base del proyecto, autenticación y navegación por roles~~
2. ~~Modelo de datos: personas, equipos de cuidados, invitaciones y todos los registros~~
3. ~~Registro del cuidador (sin conexión) y rachas~~
4. ~~Rediseño: pestañas, anillos, constantes vitales, análisis, parte de familiar~~
5. ~~Avisos automáticos y notificaciones (rangos de referencia y valores habituales de cada persona)~~
6. Pruebas internas (TestFlight / prueba interna de Google Play): borrar cuenta, política de
   privacidad, icono, configuración de EAS
7. Publicación en las tiendas

## Antes de un piloto real

La app trata datos de salud de personas mayores. El texto de consentimiento de `app/consent.tsx` es un
borrador: debe revisarse para cumplir el RGPD antes de recoger datos reales. También deben revisar un
profesional sanitario los rangos de los avisos y la redacción de la escala FRAIL.
