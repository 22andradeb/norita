// Transcribes a medical document (photo or PDF) with Claude and stores structured results.
//
// Called by the app right after upload: POST { document_id } with the user's session token.
// The user's token is used to check they can see the document (row-level security); the
// service role is then used to read the file and save the results.
//
// Secrets: ANTHROPIC_API_KEY (set with `supabase secrets set`). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { encodeBase64 } from '@std/encoding/base64';

const BUCKET = 'medical-documents';
const MAX_BYTES = 20 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

// The shape Claude must return (structured outputs guarantee it validates).
const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    legible: { type: 'boolean', description: 'False if the document is unreadable or is not a medical document.' },
    document_type: { type: 'string', enum: ['lab', 'imaging', 'report', 'prescription', 'other'] },
    title: { type: 'string', description: 'Short Spanish title, e.g. "Análisis de sangre" or "Radiografía de tórax".' },
    exam_date: { ...nullableString, description: 'Date the sample/exam was taken, YYYY-MM-DD, or null if not stated.' },
    lab_name: { ...nullableString, description: 'Laboratory, hospital or clinic name.' },
    professional: { ...nullableString, description: 'Requesting or reporting professional, as written.' },
    summary: {
      type: 'string',
      description:
        'Two to four plain-Spanish sentences for a family member: what the document is and which values are outside the reference range shown on the document. No diagnosis or treatment advice.',
    },
    transcript: { type: 'string', description: 'Full text of the document in reading order, with patient identifiers replaced by [omitido].' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Test name as written, in Spanish if the document is in Spanish.' },
          value: { type: 'string', description: 'Result exactly as written (keep "<", ">", decimal commas).' },
          unit: nullableString,
          reference_range: { ...nullableString, description: 'Reference range exactly as printed on the document.' },
          flag: {
            type: 'string',
            enum: ['normal', 'high', 'low', 'abnormal', 'unknown'],
            description: 'Based only on the document: its reference range or its own markers (*, H, L, ↑, ↓). Use unknown when neither is present.',
          },
          section: { ...nullableString, description: 'Group heading such as "Hemograma" or "Bioquímica".' },
        },
        required: ['name', 'value', 'unit', 'reference_range', 'flag', 'section'],
        additionalProperties: false,
      },
    },
  },
  required: ['legible', 'document_type', 'title', 'exam_date', 'lab_name', 'professional', 'summary', 'transcript', 'results'],
  additionalProperties: false,
} as const;

type Extraction = {
  legible: boolean;
  document_type: 'lab' | 'imaging' | 'report' | 'prescription' | 'other';
  title: string;
  exam_date: string | null;
  lab_name: string | null;
  professional: string | null;
  summary: string;
  transcript: string;
  results: { name: string; value: string; unit: string | null; reference_range: string | null; flag: string; section: string | null }[];
};

const SYSTEM_PROMPT = `You transcribe medical documents (lab results, imaging reports, clinical reports, prescriptions) for a family caregiving app in Spain.

Rules:
- Transcribe faithfully. Never invent, round or "correct" values; copy numbers, units and reference ranges exactly as printed.
- Flag a result as high/low/abnormal only when the document's own reference range or markers show it. Otherwise use "normal" when it is inside the printed range, or "unknown" when there is no range.
- Data minimisation: in the transcript, replace the patient's name, ID/DNI/NIE, health card or record numbers, address and phone with [omitido]. Keep the professional's and the lab's names.
- The summary is for a non-medical family member, in Spanish (Spain): neutral, factual, no diagnosis, no treatment advice. If values are out of range, say which ones and suggest discussing them with the doctor.
- If the image is unreadable, cut off, or not a medical document, set legible to false and explain why in the summary.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { document_id: documentId } = await req.json().catch(() => ({}));
  if (typeof documentId !== 'string') return json({ error: 'document_id is required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Row-level security: this only returns the row if the caller is on the person's care team.
  const { data: doc, error: docError } = await asUser
    .from('medical_documents')
    .select('id, storage_path, mime_type, title')
    .eq('id', documentId)
    .single();
  if (docError || !doc) return json({ error: 'Document not found' }, 404);

  const fail = async (message: string) => {
    await admin.from('medical_documents').update({ status: 'failed', error: message, processed_at: new Date().toISOString() }).eq('id', doc.id);
    return json({ error: message }, 422);
  };

  await admin.from('medical_documents').update({ status: 'processing', error: null }).eq('id', doc.id);

  const { data: file, error: fileError } = await admin.storage.from(BUCKET).download(doc.storage_path);
  if (fileError || !file) return fail('No se pudo leer el archivo subido.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return fail('El archivo es demasiado grande (máximo 20 MB).');
  const data = encodeBase64(bytes);

  const source =
    doc.mime_type === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: doc.mime_type as 'image/jpeg' | 'image/png', data } } as const);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fail('Falta configurar la clave de la API de Anthropic (secreto ANTHROPIC_API_KEY).');
  const anthropic = new Anthropic({ apiKey });

  let extraction: Extraction;
  try {
    // Server-side fallback: if a safety classifier declines, the API retries on the
    // recommended fallback model inside the same call instead of returning a refusal.
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      messages: [{ role: 'user', content: [source, { type: 'text', text: 'Transcribe this medical document.' }] }],
    });

    if (response.stop_reason === 'refusal') return fail('No se pudo procesar este documento.');
    if (response.stop_reason === 'max_tokens') return fail('El documento es demasiado largo para transcribirlo de una vez.');
    // Structured output arrives as text; join in case it was split across blocks.
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    if (!text) {
      console.error('No text in response', response.stop_reason, JSON.stringify(response.content.map((b) => b.type)));
      return fail('No se obtuvo ninguna transcripción.');
    }
    extraction = JSON.parse(text) as Extraction;
  } catch (e) {
    // Full details go to the function logs (Supabase → Edge Functions → Logs); a short
    // technical hint is saved with the document to make problems easy to report.
    console.error('Transcription failed', e);
    const hint = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : String(e).slice(0, 200);
    if (e instanceof Anthropic.RateLimitError) return fail('Servicio ocupado. Vuelve a intentarlo en unos minutos.');
    if (e instanceof Anthropic.AuthenticationError) return fail('La clave de la API de Anthropic no es válida.');
    if (e instanceof Anthropic.APIError) return fail(`Error del servicio de transcripción (${e.status ?? 'sin conexión'}). [${hint}]`);
    return fail(`Error inesperado al transcribir. [${hint}]`);
  }

  if (!extraction.legible) return fail(extraction.summary || 'No se pudo leer el documento.');

  const examDate = extraction.exam_date && /^\d{4}-\d{2}-\d{2}$/.test(extraction.exam_date) ? extraction.exam_date : null;
  const { error: saveError } = await admin
    .from('medical_documents')
    .update({
      status: 'ready',
      title: doc.title || extraction.title.slice(0, 120),
      doc_type: extraction.document_type,
      exam_date: examDate,
      lab_name: extraction.lab_name?.slice(0, 200) ?? null,
      professional: extraction.professional?.slice(0, 200) ?? null,
      summary: extraction.summary,
      transcript: extraction.transcript,
      results: extraction.results,
      error: null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', doc.id);
  if (saveError) return fail('No se pudo guardar la transcripción.');

  return json({ ok: true });
});
