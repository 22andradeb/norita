import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { errorText } from './format';
import { newId } from './outbox';
import { supabase } from './supabase';

// Medical documents: photo or PDF → private storage → transcribed by the
// `transcribe-document` edge function (see supabase/functions).

const BUCKET = 'medical-documents';

export type DocType = 'lab' | 'imaging' | 'report' | 'prescription' | 'other';
export type ResultFlag = 'normal' | 'high' | 'low' | 'abnormal' | 'unknown';

export type LabResult = {
  name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  flag: ResultFlag;
  section: string | null;
};

export type MedicalDocument = {
  id: string;
  older_adult_id: string;
  uploaded_by: string | null;
  storage_path: string;
  mime_type: 'image/jpeg' | 'image/png' | 'application/pdf';
  title: string | null;
  doc_type: DocType;
  exam_date: string | null;
  lab_name: string | null;
  professional: string | null;
  status: 'processing' | 'ready' | 'failed';
  summary: string | null;
  transcript: string | null;
  results: LabResult[];
  error: string | null;
  created_at: string;
  processed_at: string | null;
};

export const DOC_TYPES: Record<DocType, string> = {
  lab: 'Análisis',
  imaging: 'Imagen (radiografía, ecografía…)',
  report: 'Informe médico',
  prescription: 'Receta',
  other: 'Otro',
};

export type PickedFile = { uri: string; mimeType: MedicalDocument['mime_type']; name: string };

function mimeFor(uri: string, given?: string | null): PickedFile['mimeType'] | null {
  const type = given?.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'image/jpeg';
  if (type === 'image/png' || type === 'application/pdf') return type;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return null;
}

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.85,
  // Ask iOS for JPEG rather than HEIC so the file can be stored and transcribed.
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/** Returns the picked file, null if cancelled, or throws a readable error. */
export async function pickDocument(source: 'camera' | 'library' | 'pdf'): Promise<PickedFile | null> {
  if (source === 'pdf') {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled) return null;
    const asset = res.assets[0];
    return { uri: asset.uri, mimeType: 'application/pdf', name: asset.name };
  }

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Necesitamos permiso para usar la cámara. Actívalo en los Ajustes del teléfono.');
  }
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(IMAGE_OPTIONS) : await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS);
  if (res.canceled) return null;
  const asset = res.assets[0];
  const mimeType = mimeFor(asset.uri, asset.mimeType);
  if (!mimeType) throw new Error('Formato de imagen no compatible. Usa una foto JPG o PNG.');
  return { uri: asset.uri, mimeType, name: asset.fileName ?? 'foto.jpg' };
}

/** Uploads the file, creates the document row and starts transcription. Needs a connection. */
export async function uploadDocument(input: {
  olderAdultId: string;
  userId: string;
  file: PickedFile;
  title?: string;
  docType: DocType;
}) {
  const id = newId();
  const ext = input.file.mimeType === 'application/pdf' ? 'pdf' : input.file.mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${input.olderAdultId}/${id}.${ext}`;

  const body = await new File(input.file.uri).arrayBuffer();
  if (body.byteLength > 20 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máximo 20 MB).');

  const upload = await supabase.storage.from(BUCKET).upload(path, body, { contentType: input.file.mimeType, upsert: false });
  if (upload.error) throw new Error(errorText(upload.error));

  const insert = await supabase.from('medical_documents').insert({
    id,
    older_adult_id: input.olderAdultId,
    uploaded_by: input.userId,
    storage_path: path,
    mime_type: input.file.mimeType,
    title: input.title?.trim() || null,
    doc_type: input.docType,
  });
  if (insert.error) throw new Error(errorText(insert.error));

  // Transcription takes a little while; the list shows "Transcribiendo…" until it's done.
  void transcribe(id);
  return id;
}

export async function transcribe(documentId: string) {
  const { error } = await supabase.functions.invoke('transcribe-document', { body: { document_id: documentId } });
  if (error) console.warn('Transcription request failed', error.message);
}

export async function listDocuments(olderAdultId: string) {
  const { data, error } = await supabase
    .from('medical_documents')
    .select('*')
    .eq('older_adult_id', olderAdultId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as MedicalDocument[];
}

export async function getDocument(id: string) {
  const { data, error } = await supabase.from('medical_documents').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as MedicalDocument;
}

/** Short-lived link to view the original file. */
export async function originalUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(errorText(error));
  return data.signedUrl;
}

/** A document stuck in "processing" for this long probably never reached the transcriber. */
export const isStuck = (d: MedicalDocument) => d.status === 'processing' && Date.now() - Date.parse(d.created_at) > 3 * 60_000;

export const outOfRange = (d: MedicalDocument) => d.results.filter((r) => r.flag === 'high' || r.flag === 'low' || r.flag === 'abnormal');
