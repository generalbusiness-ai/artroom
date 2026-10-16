/** Receiver labels are transient. Retention always keeps the authenticated
 * producer's original alias, even when another receiver uses these bytes. */
const PRODUCER_NAME: unique symbol = Symbol("producer-name");
type Named = { under: string; [PRODUCER_NAME]?: string };
export const producerName = (read: Named): string => read[PRODUCER_NAME] ?? read.under;
export const receiverName = <T extends Named>(read: T, under: string): T => ({ ...read, under, [PRODUCER_NAME]: producerName(read) });
export const carryProducerName = <T extends Named>(read: T, source: Named): T => ({ ...read, [PRODUCER_NAME]: producerName(source) });
