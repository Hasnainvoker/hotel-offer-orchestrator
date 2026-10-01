import { Router } from 'express';
import { HttpError } from '../http/errors';
import { supplierInventory } from '../suppliers/data';
import { isSupplierId, isSupplierUp, setSupplierUp, supplierAvailability } from '../suppliers/supplierState';
import { SUPPLIER_IDS, SUPPLIERS } from '../types/hotel';

/** Mock supplier APIs: GET /supplierA/hotels, GET /supplierB/hotels (optional ?city=). */
export const supplierRouter = Router();

for (const id of SUPPLIER_IDS) {
  supplierRouter.get(`/${id}/hotels`, (req, res) => {
    if (!isSupplierUp(id)) {
      res.status(503).json({ error: `${SUPPLIERS[id]} is unavailable (simulated outage)` });
      return;
    }
    const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : undefined;
    const hotels = supplierInventory[id].filter((h) => !city || h.city === city);
    res.json(hotels);
  });
}

/** Test helpers to simulate a supplier outage. */
export const adminRouter = Router();

adminRouter.get('/suppliers', (_req, res) => {
  res.json(supplierAvailability());
});

// PUT /admin/suppliers/supplierB  { "up": false }
adminRouter.put('/suppliers/:supplierId', (req, res) => {
  const { supplierId } = req.params;
  if (!isSupplierId(supplierId)) {
    throw new HttpError(404, `Unknown supplier "${supplierId}". Expected one of: ${SUPPLIER_IDS.join(', ')}`);
  }
  if (typeof req.body?.up !== 'boolean') {
    throw new HttpError(400, 'Body must be JSON like { "up": false }');
  }
  setSupplierUp(supplierId, req.body.up);
  res.json(supplierAvailability());
});
