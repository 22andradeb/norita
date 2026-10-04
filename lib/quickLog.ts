import { LOG_KINDS } from './logKinds';
import { enqueue, newId } from './outbox';
import type { DoseSlot } from './stats';

/** One-tap dose logging from the checklist: no form, saved offline-first like any other entry. */
export async function recordDose(
  userId: string,
  olderAdultId: string,
  slot: DoseSlot,
  status: 'given' | 'refused' | 'missed' | 'held',
) {
  const writes = LOG_KINDS.dose.build(
    { status, quantity: 1 },
    {
      olderAdultId,
      userId,
      medicationId: slot.medication.id,
      scheduledTime: slot.time,
      now: new Date().toISOString(),
      newId,
    },
  );
  await enqueue(userId, writes);
}

/** "He llegado" / "Me voy" — the caregiver's visit, shown to family on their Today screen. */
export async function recordVisit(userId: string, olderAdultId: string, kind: 'arrival' | 'departure') {
  await enqueue(userId, [
    {
      table: 'visit_events',
      row: { id: newId(), older_adult_id: olderAdultId, recorded_by: userId, recorded_at: new Date().toISOString(), kind },
    },
  ]);
}
