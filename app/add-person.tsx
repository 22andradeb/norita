import { router } from 'expo-router';

import { LogForm } from '@/components/LogForm';
import { Body, Screen } from '@/components/ui';
import { api, type Gender } from '@/lib/api';
import type { Field } from '@/lib/logKinds';
import { usePerson } from '@/lib/person';

const thisYear = new Date().getFullYear();

const fields: Field[] = [
  { key: 'nickname', label: 'Nombre o apodo', type: 'text', required: true, maxLength: 60 },
  { key: 'birth_year', label: 'Año de nacimiento', type: 'number', min: 1900, max: thisYear },
  {
    key: 'gender',
    label: 'Género',
    type: 'choice',
    options: [
      { value: 'female', label: 'Mujer' },
      { value: 'male', label: 'Hombre' },
      { value: 'non_binary', label: 'No binario' },
      { value: 'prefer_not_to_say', label: 'Prefiero no decirlo' },
    ],
  },
];

export default function AddPerson() {
  const { reload, select } = usePerson();
  return (
    <Screen edges={['bottom']}>
      <Body muted>Añade solo lo necesario para reconocerle. No uses el nombre completo, la dirección ni el DNI.</Body>
      <LogForm
        fields={fields}
        submitLabel="Añadir persona"
        onSubmit={async (v) => {
          // Needs a connection: the person must exist on the server before anything can be logged.
          const id = await api.createPerson({
            nickname: v.nickname as string,
            birthYear: v.birth_year as number | undefined,
            gender: v.gender as Gender | undefined,
          });
          await reload();
          select(id);
          router.back();
        }}
      />
    </Screen>
  );
}
