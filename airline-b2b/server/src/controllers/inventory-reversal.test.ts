import { describe, expect, it } from 'vitest';
import { reversalInventoryDocumentType, reverseInventoryMovementType } from './inventory.controller';

describe('inventory reversal mapping', () => {
  it('uses existing opposite movement types for cancellable documents', () => {
    expect(reverseInventoryMovementType('PURCHASE_IN')).toBe('SUPPLIER_RETURN_OUT');
    expect(reverseInventoryMovementType('SALE_OUT')).toBe('CUSTOMER_RETURN_IN');
    expect(reverseInventoryMovementType('TRANSFER_OUT')).toBe('TRANSFER_IN');
    expect(reverseInventoryMovementType('TRANSFER_IN')).toBe('TRANSFER_OUT');
  });

  it('labels reversal documents with the closest business operation', () => {
    expect(reversalInventoryDocumentType('PURCHASE')).toBe('SUPPLIER_RETURN');
    expect(reversalInventoryDocumentType('SALE')).toBe('CUSTOMER_RETURN');
    expect(reversalInventoryDocumentType('INVENTORY_SURPLUS')).toBe('INVENTORY_SHORTAGE');
    expect(reversalInventoryDocumentType('INVENTORY_SHORTAGE')).toBe('INVENTORY_SURPLUS');
  });
});
