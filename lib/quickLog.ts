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
