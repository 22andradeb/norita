# Política de privacidad de Norita

> **BORRADOR — no publicar sin revisión.** Debe revisarlo un delegado de protección de datos o un
> abogado antes de usarse con usuarios reales o enviarse a App Store / Google Play. Los textos entre
> corchetes `[…]` hay que completarlos. Si la app se presenta bajo una marca o institución, su equipo de
> comunicación también debe revisarlo antes de publicarlo.
>
> Lista de comprobación para la revisión:
> - [ ] Responsable del tratamiento y datos de contacto
> - [ ] Base jurídica para datos de salud (art. 9 RGPD) y cómo se recoge el consentimiento de la persona cuidada
> - [ ] Evaluación de impacto (EIPD/DPIA)
> - [ ] Contratos de encargado del tratamiento (DPA) con Supabase, Anthropic y Expo
> - [ ] Transferencias internacionales (cláusulas contractuales tipo u otro mecanismo)
> - [ ] Plazos de conservación
> - [ ] Coherencia con el texto de consentimiento de la app (`app/consent.tsx`)

**Última actualización:** [fecha]

## 1. Quién es el responsable

[Nombre de la persona o entidad responsable], con domicilio en [dirección] y correo de contacto
[correo]. [Si existe: Delegado de Protección de Datos: correo.]

## 2. Qué es Norita

Norita es una app para que cuidadores y familiares coordinen los cuidados de una persona mayor: los
cuidadores registran las visitas y la familia consulta su evolución, recibe avisos y gestiona citas.

## 3. Qué datos tratamos

**De quien usa la app (cuidadores y familiares)**
- Nombre, correo electrónico y contraseña (la contraseña se guarda cifrada; no tenemos acceso a ella).
- Rol (cuidador/a o familiar) y equipos de cuidados a los que pertenece.
- Preferencias de notificaciones y un identificador del móvil para enviar notificaciones.
- Fecha de aceptación del consentimiento.

**De la persona cuidada**
- Nombre o apodo, año de nacimiento y género (opcionales salvo el nombre o apodo). No pedimos nombre
  completo, dirección ni números de identificación.
- **Datos de salud** (categoría especial de datos): revisiones de las visitas (apetito, movilidad,
  ánimo, confusión), constantes vitales, medicación y tomas, comidas y bebidas, sueño, baño e higiene,
  caídas y otros incidentes, citas médicas, valoraciones de bienestar (WHO-5) y fragilidad (FRAIL), y
  documentos médicos que se suban (fotos o PDF de análisis e informes) con su transcripción.
- Hora de llegada y salida de los cuidadores.

## 4. Para qué los usamos

- Permitir que el equipo de cuidados registre y consulte los cuidados de la persona.
- Mostrar resúmenes, gráficas y tendencias.
- Generar avisos (por ejemplo, una caída o un valor fuera de rango) y enviar notificaciones al equipo.
- Transcribir automáticamente los documentos médicos que se suben.

No usamos los datos para publicidad, no los vendemos y no tomamos decisiones automatizadas con efectos
jurídicos. Los avisos son orientativos y no son un diagnóstico médico.

## 5. Base jurídica

[A definir con el asesor. Propuesta: consentimiento explícito de la persona cuidada o de su
representante legal para los datos de salud (art. 6.1.a y 9.2.a RGPD), y ejecución del servicio para
los datos de cuenta de los usuarios (art. 6.1.b).]

## 6. Quién puede ver los datos

- **El equipo de cuidados de cada persona:** solo los cuidadores y familiares que se han unido con un
  código de invitación. Nadie más puede ver los datos de esa persona.
- **Proveedores que tratan datos por nuestra cuenta (encargados del tratamiento):**

| Proveedor | Para qué | Ubicación de los datos |
| --- | --- | --- |
| Supabase | Base de datos, cuentas, almacenamiento de archivos y funciones del servidor | [Región del proyecto, p. ej. UE (Fráncfort)] |
| Anthropic | Transcripción automática de documentos médicos | [EE. UU.; mecanismo de transferencia] |
| Expo (650 Industries) | Envío de notificaciones push | [EE. UU.; mecanismo de transferencia] |
| Apple / Google | Entrega de notificaciones en el móvil | [Según sus condiciones] |

Las notificaciones muestran el nombre de la persona y el tipo de aviso, pero no valores de salud, para
que no se vean en la pantalla bloqueada.

## 7. Cuánto tiempo los guardamos

[A definir. Propuesta: mientras la cuenta o el equipo de cuidados esté activo; tras su eliminación, se
borran en un plazo de [30] días, salvo obligación legal de conservarlos.]

## 8. Seguridad

- Comunicación cifrada (HTTPS) y almacenamiento en servidores con cifrado.
- Control de acceso en la base de datos: cada usuario solo puede ver a las personas de su equipo.
- Documentos médicos en almacenamiento privado, accesibles solo mediante enlaces temporales.
- Los registros de cuidados no se pueden modificar ni borrar desde la app, para conservar un historial
  fiable.

## 9. Tus derechos

Puedes solicitar el acceso, la rectificación, la supresión, la limitación del tratamiento, la
portabilidad de tus datos y oponerte al tratamiento, así como retirar tu consentimiento en cualquier
momento, escribiendo a [correo]. [Cuando exista: también puedes borrar tu cuenta desde la app, en
Equipo → Tu cuenta.]

Si consideras que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia Española de
Protección de Datos (www.aepd.es).

## 10. Menores de edad

La app no está dirigida a menores de [14] años.

## 11. Cambios en esta política

Si cambiamos esta política, lo indicaremos en la app y pediremos de nuevo el consentimiento cuando sea
necesario.
