/**
 * uuid.js — UUID generation wrapper.
 *
 * All primary keys in this application are UUIDs (v4).
 * Centralizing here makes it trivial to swap the strategy if needed.
 */

import { v4 as uuidv4 } from 'uuid';

export const generateId = () => uuidv4();
