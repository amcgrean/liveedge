import { AdminFieldDefinition, FormulaDefinition } from '../types/admin';
import { adminFieldCatalog, formulaDefinitions } from '../data/adminBlueprint';

// Mock in-memory state initialized from the blueprint
let fieldsData: AdminFieldDefinition[] = [...adminFieldCatalog];
let formulasData: FormulaDefinition[] = [...formulaDefinitions];

export interface AuditLogEntry {
    id: string;
    entityId: string;
    entityType: 'field' | 'formula';
    action: 'created' | 'updated' | 'deleted';
    timestamp: string;
    changes: Record<string, any>;
}

let auditLogs: AuditLogEntry[] = [];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const adminService = {
    // --- Fields ---
    async getFields(): Promise<AdminFieldDefinition[]> {
        await delay(200);
        return [...fieldsData];
    },

    async updateField(updatedField: AdminFieldDefinition): Promise<AdminFieldDefinition> {
        await delay(300);
        const index = fieldsData.findIndex(f => f.id === updatedField.id);
        if (index === -1) {
            // Create new
            fieldsData.push(updatedField);
            this.logAudit(updatedField.id, 'field', 'created', updatedField);
        } else {
            // Update
            const oldField = fieldsData[index];
            fieldsData[index] = updatedField;
            this.logAudit(updatedField.id, 'field', 'updated', { before: oldField, after: updatedField });
        }
        return updatedField;
    },

    // --- Formulas ---
    async getFormulas(): Promise<FormulaDefinition[]> {
        await delay(200);
        return [...formulasData];
    },

    async updateFormula(updatedFormula: FormulaDefinition): Promise<FormulaDefinition> {
        await delay(300);
        const index = formulasData.findIndex(f => f.id === updatedFormula.id);
        if (index === -1) {
            // Create new
            formulasData.push(updatedFormula);
            this.logAudit(updatedFormula.id, 'formula', 'created', updatedFormula);
        } else {
            // Update
            const oldFormula = formulasData[index];
            formulasData[index] = updatedFormula;
            this.logAudit(updatedFormula.id, 'formula', 'updated', { before: oldFormula, after: updatedFormula });
        }
        return updatedFormula;
    },

    // --- Audit ---
    logAudit(entityId: string, entityType: 'field' | 'formula', action: 'created' | 'updated' | 'deleted', changes: any) {
        const entry: AuditLogEntry = {
            id: `audit-${Date.now()}`,
            entityId,
            entityType,
            action,
            timestamp: new Date().toISOString(),
            changes,
        };
        auditLogs.unshift(entry); // Add to beginning
        console.log(`[Audit] ${entityType} ${entityId} ${action}`, entry);
    },

    async getAuditLogs(): Promise<AuditLogEntry[]> {
        return [...auditLogs];
    }
};
