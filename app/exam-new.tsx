import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { Body, Button, Caption, Card, Chip, ErrorText, Field, IconBadge, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { DOC_TYPES, pickDocument, uploadDocument, type DocType, type PickedFile } from '@/lib/documents';
import { errorText } from '@/lib/format';
import { usePerson } from '@/lib/person';
import { useTheme } from '@/lib/theme';

/** Upload a medical document: take a photo, pick one, or choose a PDF. Caregivers and family alike. */
export default function NewExam() {
  const t = useTheme();
  const { session } = useAuth();
  const { person } = usePerson();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocType>('lab');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pick(source: 'camera' | 'library' | 'pdf') {
    setError(null);
    try {
      const picked = await pickDocument(source);
      if (picked) setFile(picked);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function upload() {
    if (!file || !session || !person) return;
    setError(null);
    setUploading(true);
    try {
      await uploadDocument({ olderAdultId: person.id, userId: session.user.id, file, title, docType });
      router.back();
    } catch (e) {
      setError(errorText(e));
      setUploading(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Body muted>Para {person?.nickname}. Asegúrate de que se lean bien todos los valores: buena luz, sin sombras y la hoja entera.</Body>

      {file ? (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          {file.mimeType === 'application/pdf' ? (
            <>
              <IconBadge name="file-pdf-box" color={t.danger} size={64} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }} numberOfLines={2}>
                {file.name}
              </Text>
            </>
          ) : (
            <Image
              source={{ uri: file.uri }}
              style={{ width: '100%', height: 280, borderRadius: 12 }}
              resizeMode="contain"
              accessibilityLabel="Vista previa de la foto"
            />
          )}
          <Button title="Cambiar archivo" variant="ghost" compact onPress={() => setFile(null)} />
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          <Button title="Hacer una foto" icon="camera-outline" onPress={() => pick('camera')} />
          <Button title="Elegir de la galería" icon="image-outline" variant="secondary" onPress={() => pick('library')} />
          <Button title="Subir un PDF" icon="file-pdf-box" variant="secondary" onPress={() => pick('pdf')} />
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.text }}>Tipo de documento</Text>
        <Row>
          {(Object.keys(DOC_TYPES) as DocType[]).map((k) => (
            <Chip key={k} label={DOC_TYPES[k]} selected={docType === k} onPress={() => setDocType(k)} />
          ))}
        </Row>
      </View>
      <Field label="Título (opcional)" value={title} onChangeText={setTitle} maxLength={120} placeholder="Se rellena solo si lo dejas vacío" />
      <Caption>
        El documento se guarda de forma privada y se transcribe automáticamente con inteligencia artificial. Revisa siempre los valores con el original.
      </Caption>
      <ErrorText>{error}</ErrorText>
      {file ? <Button title={uploading ? 'Subiendo…' : 'Guardar y transcribir'} icon="cloud-upload-outline" onPress={upload} loading={uploading} /> : null}
    </Screen>
  );
}
