import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listLeads,
  getOneLead,
  addLead,
  editLead,
  removeLead,
  assignLead,
} from '../controllers/lead.controller';
import {
  csvUpload,
  importLeads,
  exportLeads,
  sampleTemplate,
} from '../controllers/csv.controller';

export const leadRouter = Router();

// CSV — mounted BEFORE /:id so the path segments don't get captured as ids.
leadRouter.get('/sample-template', authenticate, requireRole('ADMIN'), sampleTemplate);
leadRouter.get('/export',          authenticate, exportLeads);
leadRouter.post('/import',         authenticate, requireRole('ADMIN'), csvUpload.single('file'), importLeads);

leadRouter.get('/', authenticate, listLeads);
leadRouter.post('/', authenticate, addLead);
leadRouter.get('/:id', authenticate, getOneLead);
leadRouter.put('/:id', authenticate, editLead);
leadRouter.delete('/:id', authenticate, requireRole('ADMIN'), removeLead);
leadRouter.patch('/:id/assign', authenticate, requireRole('ADMIN'), assignLead);
