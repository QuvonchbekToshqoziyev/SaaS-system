# Security boundary

- The sealed `airline-b2b/` checkout and its `DATABASE_URL` are read-only and
  never used as the extension database.
- Runtime persistence uses `ADO_EXT_DATABASE_URL` only.
- Every persisted domain record carries a tenant key; repositories require the
  tenant key on reads and state changes.
- Journal posting is idempotent and immutable after posting. Reversals are
  linked and limited to one per original entry.
- Documents store validated storage references and SHA-256 metadata; file
  bytes must be handled by a separately authenticated storage adapter.
- Tax rules require effective dates and source references; rates are not
  silently embedded in application code.
- Notification delivery has an explicit three-attempt ceiling.
- AI and autonomous external actions are not part of this package.

Before production use, deploy behind authenticated adapters, rotate database
credentials through the secret manager, restrict database network access, and
test tenant isolation with production-like roles.
