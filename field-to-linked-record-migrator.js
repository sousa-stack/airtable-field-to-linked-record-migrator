// ============================================================
// 🔗 Field → Linked Record Migrator
// A one-time data migration tool that converts text or single-
// select field values into linked records.
// ============================================================

// --- Helpers -------------------------------------------------

/**
 * Check if a cell value is "empty" for migration purposes.
 */
function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
}

/**
 * Chunk an array into batches of a given size (max 50 for Airtable API).
 */
function chunk(arr, size) {
    const batches = [];
    for (let i = 0; i < arr.length; i += size) {
        batches.push(arr.slice(i, i + size));
    }
    return batches;
}

/**
 * Render a progress line and re-draw the accumulated output.
 */
function renderProgress(header, progressLine) {
    output.clear();
    output.markdown(header + '\n\n' + progressLine);
}

/**
 * Build a markdown table with en-space padding for breathing room.
 * Airtable's renderer collapses normal spaces — Unicode en-spaces survive.
 */
const EN = '\u2002';
const CELL_PAD = EN + EN;

function mdTable(headers, rows) {
    const lines = [];

    const headerCells = headers.map(function (h) { return CELL_PAD + h + CELL_PAD; });
    lines.push('| ' + headerCells.join(' | ') + ' |');

    const sep = headers.map(function () { return '---'; });
    lines.push('| ' + sep.join(' | ') + ' |');

    for (const row of rows) {
        const cells = headers.map(function (_, ci) {
            var cell = ci < row.length ? row[ci] : '';
            if (cell === undefined || cell === null) cell = '';
            return CELL_PAD + cell + CELL_PAD;
        });
        lines.push('| ' + cells.join(' | ') + ' |');
    }

    return lines.join('\n');
}

/**
 * Build the persistent header shown at the top of every re-render.
 */
function buildHeader(status) {
    return '# 🔗 Field → Linked Record Migrator\n\n**Status:** ' + status + '\n\n---';
}

// --- Main Script ---------------------------------------------

const errors = []; // collect per-record errors instead of crashing

// =============================================================
// SETUP PHASE — User Configuration
// =============================================================

let header = buildHeader('⚙️ Configuring migration...');
output.clear();
output.markdown(header);

const config = input.config();
const sourceTable = base.getTable(config.source_table);
const sourceField = sourceTable.getField(config.source_field);
const targetTable = base.getTable(config.target_table);
const targetMatchField = targetTable.getField(config.target_match_field);
const linkedRecordField = sourceTable.getField(config.linked_record_field);

// Load source records to get count for confirmation
header = buildHeader('📋 Building migration plan...');
renderProgress(header, '🔍 **Loading source records...**\n\n_⏳ Large tables may take a moment._');

const sourceQuery = await sourceTable.selectRecordsAsync({ fields: [sourceField, linkedRecordField] });
const sourceRecords = sourceQuery.records;

// Count non-empty source values
let recordsToUpdate = 0;
for (const rec of sourceRecords) {
    const val = rec.getCellValue(sourceField);
    if (!isEmpty(val)) {
        recordsToUpdate++;
    }
}

// Show confirmation panel
header = buildHeader('📋 Review migration plan');
output.clear();
output.markdown(header + '\n\n' +
    '## 📋 Migration Plan\n\n' +
    '- **Source:** ' + sourceTable.name + ' → `' + sourceField.name + '`\n' +
    '- **Target:** ' + targetTable.name + ' → match on `' + targetMatchField.name + '`\n' +
    '- **Output:** `' + linkedRecordField.name + '`\n\n' +
    '⚠️ This will update up to **' + recordsToUpdate + '** records. The original field will **not** be deleted automatically — you will be asked at the end.\n'
);

const confirmStart = await input.buttonsAsync(
    'Ready to proceed?',
    [
        { label: '▶️  Run Migration', value: 'run' },
        { label: '❌  Cancel', value: 'cancel' },
    ]
);

if (confirmStart === 'cancel') {
    output.clear();
    output.markdown(buildHeader('❌ Migration cancelled') + '\n\n_No changes were made._');
    throw new Error('Migration cancelled by user.');
}

// =============================================================
// PHASE 1 — Value Discovery
// =============================================================

header = buildHeader('🔍 Phase 1 — Discovering values...');
renderProgress(header, '🔍 **Extracting unique values from source field...**\n\n_⏳ Scanning records..._');

// Extract unique non-empty values from source field
const uniqueValues = new Set();
for (const rec of sourceRecords) {
    const raw = rec.getCellValue(sourceField);
    let val = null;

    if (sourceField.type === 'singleSelect' && raw && raw.name) {
        val = raw.name.trim();
    } else if (typeof raw === 'string') {
        val = raw.trim();
    }

    if (val && val !== '') {
        uniqueValues.add(val);
    }
}

renderProgress(header, '🔍 **Found ' + uniqueValues.size + ' unique values. Loading target records...**\n\n_⏳ Building lookup map..._');

// Load target records and build lookup map
const targetQuery = await targetTable.selectRecordsAsync({ fields: [targetMatchField] });
const targetRecords = targetQuery.records;

const targetLookup = {}; // value → record ID
for (const rec of targetRecords) {
    const raw = rec.getCellValue(targetMatchField);
    let val = null;

    if (targetMatchField.type === 'singleSelect' && raw && raw.name) {
        val = raw.name.trim();
    } else if (typeof raw === 'string') {
        val = raw.trim();
    }

    if (val && val !== '') {
        targetLookup[val] = rec.id;
    }
}

// Classify each unique value
const willLink = [];   // { value, recordId }
const willCreate = []; // { value }

for (const val of uniqueValues) {
    if (targetLookup[val]) {
        willLink.push({ value: val, recordId: targetLookup[val] });
    } else {
        willCreate.push({ value: val });
    }
}

// Show preview table
header = buildHeader('🔍 Phase 1 — Value Discovery Complete');
output.clear();

const previewHeaders = ['Value', 'Action', 'Target Record'];
const previewRows = [];

for (const item of willLink) {
    previewRows.push([
        item.value.length > 40 ? item.value.substring(0, 37) + '...' : item.value,
        '🔗 Link existing',
        item.recordId,
    ]);
}
for (const item of willCreate) {
    previewRows.push([
        item.value.length > 40 ? item.value.substring(0, 37) + '...' : item.value,
        '🏗️ Create new',
        '_(new)_',
    ]);
}

output.markdown(header + '\n\n' +
    '**' + willLink.length + '** value(s) will be linked to existing records\n\n' +
    '**' + willCreate.length + '** value(s) will require new records in **' + targetTable.name + '**\n\n' +
    mdTable(previewHeaders, previewRows) + '\n'
);

const confirmPhase2 = await input.buttonsAsync(
    'Confirm migration actions?',
    [
        { label: '▶️  Proceed', value: 'proceed' },
        { label: '❌  Cancel', value: 'cancel' },
    ]
);

if (confirmPhase2 === 'cancel') {
    output.clear();
    output.markdown(buildHeader('❌ Migration cancelled') + '\n\n_No changes were made._');
    throw new Error('Migration cancelled by user.');
}

// =============================================================
// PHASE 2 — Create Missing Records
// =============================================================

header = buildHeader('🏗️ Phase 2 — Creating missing records...');
let newRecordsCreated = 0;

if (willCreate.length > 0) {
    const createBatches = chunk(willCreate, 50);
    let processed = 0;

    for (const batch of createBatches) {
        renderProgress(header, '🏗️ **Creating missing records... (' + processed + ' of ' + willCreate.length + ')**\n\n_⏳ Batching in groups of 50..._');

        const recordDefs = batch.map(function (item) {
            return { fields: { [targetMatchField.id]: item.value } };
        });

        try {
            const newIds = await targetTable.createRecordsAsync(recordDefs);
            // Map new IDs back to values and add to lookup
            for (let j = 0; j < batch.length; j++) {
                targetLookup[batch[j].value] = newIds[j];
                newRecordsCreated++;
            }
        } catch (e) {
            for (const item of batch) {
                errors.push({
                    phase: 'Create',
                    value: item.value,
                    error: e.message || String(e),
                });
            }
        }

        processed += batch.length;
    }

    renderProgress(header, '✅ **Created ' + newRecordsCreated + ' new record(s) in ' + targetTable.name + '**');
} else {
    renderProgress(header, '✅ **No new records needed — all values already exist in ' + targetTable.name + '**');
}

// =============================================================
// PHASE 3 — Link Source Records
// =============================================================

header = buildHeader('🔗 Phase 3 — Linking source records...');
renderProgress(header, '🔗 **Preparing link updates...**\n\n_⏳ This may take a moment for large tables._');

// Reload source records to get fresh linked record field values
const freshSourceQuery = await sourceTable.selectRecordsAsync({ fields: [sourceField, linkedRecordField] });
const freshSourceRecords = freshSourceQuery.records;

const updates = []; // { id, fields }
let alreadyLinked = 0;
let skippedEmpty = 0;

for (let ri = 0; ri < freshSourceRecords.length; ri++) {
    const rec = freshSourceRecords[ri];

    if (ri % 100 === 0) {
        renderProgress(header, '🔗 **Preparing updates... (' + ri + ' of ' + freshSourceRecords.length + ' records scanned)**\n\n_⏳ This may take a moment for large tables._');
    }

    // Get the source value
    const raw = rec.getCellValue(sourceField);
    let val = null;

    if (sourceField.type === 'singleSelect' && raw && raw.name) {
        val = raw.name.trim();
    } else if (typeof raw === 'string') {
        val = raw.trim();
    }

    if (!val || val === '') {
        skippedEmpty++;
        continue;
    }

    // Look up the target record ID
    const targetId = targetLookup[val];
    if (!targetId) {
        errors.push({
            phase: 'Link',
            value: val,
            error: 'No target record found in lookup map for value: ' + val,
        });
        continue;
    }

    // Get existing linked records and check if already linked
    const existingLinks = rec.getCellValue(linkedRecordField) || [];
    const existingIds = existingLinks.map(function (link) { return link.id; });

    if (existingIds.indexOf(targetId) !== -1) {
        alreadyLinked++;
        continue;
    }

    // Append new link to existing links
    const mergedLinks = existingLinks.map(function (link) { return { id: link.id }; });
    mergedLinks.push({ id: targetId });

    updates.push({
        id: rec.id,
        fields: { [linkedRecordField.id]: mergedLinks },
    });
}

// Batch the updates
let recordsUpdated = 0;
if (updates.length > 0) {
    const updateBatches = chunk(updates, 50);

    for (const batch of updateBatches) {
        renderProgress(header, '🔗 **Linking records... (' + recordsUpdated + ' of ' + updates.length + ')**\n\n_⏳ Batching in groups of 50..._');

        try {
            await sourceTable.updateRecordsAsync(batch);
            recordsUpdated += batch.length;
        } catch (e) {
            for (const item of batch) {
                errors.push({
                    phase: 'Link',
                    value: item.id,
                    error: e.message || String(e),
                });
            }
        }
    }
}

renderProgress(header, '✅ **Linked ' + recordsUpdated + ' record(s)**');

// =============================================================
// PHASE 4 — Cleanup & Summary
// =============================================================

header = buildHeader('✅ Migration Complete');
output.clear();

// Summary table
const summaryHeaders = ['Metric', 'Count'];
const summaryRows = [
    ['Records scanned', String(freshSourceRecords.length)],
    ['Records updated (linked)', String(recordsUpdated)],
    ['New records created in ' + targetTable.name, String(newRecordsCreated)],
    ['Already linked (skipped)', String(alreadyLinked)],
    ['Empty source values (skipped)', String(skippedEmpty)],
    ['Errors', String(errors.length)],
];

let summaryReport = header + '\n\n';
summaryReport += '## 📊 Migration Summary\n\n';
summaryReport += mdTable(summaryHeaders, summaryRows) + '\n\n';

// Error details if any
if (errors.length > 0) {
    summaryReport += '---\n\n';
    summaryReport += '### ❌ Errors\n\n';
    const errorHeaders = ['Phase', 'Value', 'Error'];
    const errorRows = errors.map(function (e) {
        return [
            e.phase,
            String(e.value).length > 30 ? String(e.value).substring(0, 27) + '...' : String(e.value),
            e.error.length > 50 ? e.error.substring(0, 47) + '...' : e.error,
        ];
    });
    summaryReport += mdTable(errorHeaders, errorRows) + '\n\n';
}

summaryReport += '---\n\n';
output.markdown(summaryReport);

// Cleanup prompt
const cleanupChoice = await input.buttonsAsync(
    'What would you like to do with the original \'' + sourceField.name + '\' field?',
    [
        { label: '🗑️  I\'ll delete it manually', value: 'delete' },
        { label: '✅  Done', value: 'done' },
    ]
);

if (cleanupChoice === 'delete') {
    output.clear();
    output.markdown(summaryReport +
        '### ⚠️ How to Delete the Original Field\n\n' +
        'Scripts cannot delete fields. To remove **' + sourceField.name + '**:\n\n' +
        '1. Right-click the **' + sourceField.name + '** column header in the ' + sourceTable.name + ' table\n' +
        '2. Select **Delete field**\n' +
        '3. Verify your linked records in the **' + linkedRecordField.name + '** column look correct first!\n\n' +
        '---\n\n' +
        '_Migration complete. No further actions required._\n'
    );
} else {
    output.clear();
    output.markdown(summaryReport + '_Migration complete. No further actions required._\n');
}
