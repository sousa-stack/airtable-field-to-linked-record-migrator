# 🔗 Field → Linked Record Migrator

An Airtable Scripting Extension that migrates text or single-select field values into proper linked records. This is a **one-time data migration tool** — not a reactive sync.

## What It Does

If you have a text or single-select field storing values that should really be linked records (e.g., a "Company" text field that should link to a Companies table), this script automates the conversion:

1. **Discovers** all unique values in your source field
2. **Matches** them against existing records in the target table
3. **Creates** any missing records in the target table
4. **Links** source records to the correct target records
5. **Preserves** any existing links — never overwrites

## Setup

This script uses `input.config()` for configuration. When you add it to your base, you'll configure five settings:

| Setting | Type | Description |
|---------|------|-------------|
| `source_table` | Table | The table containing the field to migrate |
| `source_field` | Field | The text or single-select field with values to migrate |
| `target_table` | Table | The table that records should be linked to |
| `target_match_field` | Field | The field in the target table to match values against |
| `linked_record_field` | Field | The linked record field in the source table to populate |

## How to Use

1. Open your Airtable base
2. Go to **Extensions → Scripting**
3. Paste the contents of `field-to-linked-record-migrator.js`
4. Configure the five settings in the script settings panel
5. Click **Run**
6. Review the migration plan and confirm
7. Review the value discovery preview and confirm
8. Wait for the migration to complete
9. Verify your data and optionally delete the original field

## Safety Features

- **Two confirmation steps** before any data is modified
- **Appends links** — never overwrites existing linked records
- **Error collection** — individual record failures don't crash the script; all errors are reported at the end
- **Every record accounted for** — the summary shows updated, skipped, already-linked, empty, and errored counts
- **Original field preserved** — the script never deletes the source field; you do that manually after verifying

## Batch Limits

Airtable's API limits create/update operations to 50 records per call. This script automatically chunks all operations into batches of 50.

## License

MIT — see [LICENSE](LICENSE) for details.
