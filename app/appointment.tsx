import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { APPOINTMENT_KINDS } from '@/components/appointments';
import { DateTimeField } from '@/components/DateTimeField';
import { Button, Chip, ErrorText, Field, Loading, Row, Screen } from '@/components/ui';
import { api, type AppointmentKind } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { usePerson } from '@/lib/person';
import { useTheme } from '@/lib/theme';

/** New appointment, or edit an existing one when `id` is given. */
export default function AppointmentForm() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { person } = usePerson();

  const [loading, setLoading] = useState(!!id);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AppointmentKind>('consultation');
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date(Date.now() + 86_400_000);
    d.setHours(10, 0, 0, 0);
    return d;
  });
  const [place, setPlace] = useState('');
  const [professional, setProfessional] = useState('');
  const [needsCompanion, setNeedsCompanion] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .appointment(id)
      .then((a) => {
        setTitle(a.title);
        setKind(a.kind);
        setStartsAt(new Date(a.starts_at));
        setPlace(a.place ?? '');
        setProfessional(a.professional ?? '');
        setNeedsCompanion(a.needs_companion);
        setNotes(a.notes ?? '');
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    if (!session || !person) return;
    if (!title.trim()) return setError('Escribe un título, por ejemplo «Control de tensión».');
    setError(null);
    setSaving(true);
    const input = {
      title: title.trim(),
      kind,
      starts_at: startsAt.toISOString(),
      place: place.trim() || null,
      professional: professional.trim() || null,
      needs_companion: needsCompanion,
      notes: notes.trim() || null,
    };
    try {
      if (id) await api.updateAppointment(id, input);
      else await api.addAppointment(person.id, session.user.id, input);
      router.back();
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? 'Editar cita' : 'Nueva cita' }} />
      <Field label="Título *" value={title} onChangeText={setTitle} maxLength={120} placeholder="Control de tensión" />
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.text }}>Tipo</Text>
        <Row>
          {(Object.keys(APPOINTMENT_KINDS) as AppointmentKind[]).map((k) => (
            <Chip key={k} label={APPOINTMENT_KINDS[k].label} icon={APPOINTMENT_KINDS[k].icon} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </Row>
      </View>
      <DateTimeField label="Fecha y hora" value={startsAt} onChange={setStartsAt} />
      <Field label="Lugar" value={place} onChangeText={setPlace} maxLength={200} placeholder="Centro de salud, hospital…" />
      <Field label="Profesional" value={professional} onChangeText={setProfessional} maxLength={120} placeholder="Dra. García" />
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.text }}>¿Necesita que alguien le acompañe?</Text>
        <Row>
          <Chip label="Sí" selected={needsCompanion} onPress={() => setNeedsCompanion(true)} />
          <Chip label="No" selected={!needsCompanion} onPress={() => setNeedsCompanion(false)} />
        </Row>
      </View>
      <Field
        label="Notas"
        value={notes}
        onChangeText={setNotes}
        maxLength={1000}
        multiline
        style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
        placeholder="Ir en ayunas, llevar informes…"
      />
      <ErrorText>{error}</ErrorText>
      <Button title={id ? 'Guardar cambios' : 'Añadir cita'} onPress={save} loading={saving} />
    </Screen>
  );
}
