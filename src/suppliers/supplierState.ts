import { SUPPLIER_IDS, type SupplierId } from '../types/hotel';

/**
 * In-memory availability switch for the mock suppliers, used to simulate an
 * outage (the mock endpoint then responds 503). Lives in the API process;
 * the Temporal worker reaches the suppliers over HTTP so it observes it too.
 */
const availability = new Map<SupplierId, boolean>(SUPPLIER_IDS.map((id) => [id, true]));

export function isSupplierUp(id: SupplierId): boolean {
  return availability.get(id) ?? true;
}

export function setSupplierUp(id: SupplierId, up: boolean): void {
  availability.set(id, up);
}

export function supplierAvailability(): Record<SupplierId, boolean> {
  return Object.fromEntries(availability) as Record<SupplierId, boolean>;
}

export function isSupplierId(value: string): value is SupplierId {
  return (SUPPLIER_IDS as string[]).includes(value);
}
