import { router } from 'expo-router';

import { LogForm } from '@/components/LogForm';
import { Body, Screen } from '@/components/ui';
import { api, type Gender } from '@/lib/api';
import type { Field } from '@/lib/logKinds';

const thisYear = new Date().getFullYear();

const fields: Field[] = [
  { key: 'nickname', label: 'First name or nickname', type: 'text', required: true, maxLength: 60 },
  { key: 'birth_year', label: 'Year of birth', type: 'number', min: 1900, max: thisYear },
  {
    key: 'gender',
    label: 'Gender',
    type: 'choice',
    options: [
      { value: 'female', label: 'Woman' },
      { value: 'male', label: 'Man' },
      { value: 'non_binary', label: 'Non-binary' },
      { value: 'prefer_not_to_say', label: 'Prefer not to say' },
    ],
  },
];

export default function AddPerson() {
  return (
    <Screen>
      <Body muted>
        Only add what’s needed to recognise them. Don’t use a full name, address or ID number.
      </Body>
      <LogForm
        fields={fields}
        submitLabel="Add person"
        onSubmit={async (v) => {
          // Needs a connection: the person must exist on the server before anything can be logged.
          const id = await api.createPerson({
            nickname: v.nickname as string,
            birthYear: v.birth_year as number | undefined,
            gender: v.gender as Gender | undefined,
          });
          router.replace({ pathname: '/caregiver/[id]', params: { id } });
        }}
      />
    </Screen>
  );
}
