# 🔗 Field → Linked Record Migrator

An Airtable Scripting Extension that migrates text or single-select field values into proper linked records. This is a **one-time data migration tool** — not a reactive sync.

## What It Does

If you have a text or single-select field storing values that should really be linked records (e.g., a "Company" text field that should link to a Companies table), this script automates the conversion:

1. **Discovers** all unique values in your source field
2. **Matches** them against existing records in the target table
3. **Creates** any missing records in the target table
4. **Links** source records to the correct target records
5. **Preserves** any existing links — never overwrites

## How to Use

1. Open your Airtable base
2. Go to **Extensions → Scripting**
3. Paste the contents of `field-to-linked-record-migrator.js`
4. Click **Run**
5. The script will walk you through five interactive prompts to pick your tables and fields
6. Review the migration plan and confirm
7. Review the value discovery preview and confirm
8. Wait for the migration to complete
9. Verify your data and optionally delete the original field

No pre-configuration needed — the script uses Airtable's native table and field pickers at runtime.

## Safety Features

- **Two confirmation steps** before any data is modified
- **Computed field guard** — blocks migration if the target match field is a formula, rollup, or other unwritable type
- **Appends links** — never overwrites existing linked records
- **Error collection** — individual record failures don't crash the script; all errors are reported at the end
- **Every record accounted for** — the summary shows updated, skipped, already-linked, empty, and errored counts
- **Original field preserved** — the script never deletes the source field; you do that manually after verifying
- **Clean cancellation** — cancelling at any confirmation step exits without errors or red banners

## Batch Limits

Airtable's API limits create/update operations to 50 records per call. This script automatically chunks all operations into batches of 50.

## License

MIT — see [LICENSE](LICENSE) for details.
