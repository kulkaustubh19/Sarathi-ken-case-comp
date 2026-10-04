# Pine Labs rail

Owns Pine Labs-specific payment and authorization logic. Export integrations through `index.ts` and keep shared contracts in `src/lib/rail-types.ts`.

`esign.ts` integrates Pine Labs/Setu Aadhaar eSign using the documented document upload, signature request and status APIs. Sarathi signs a separate repository-sharing consent PDF, not the uploaded medical records. Access stays pending until the backend confirms `sign_complete` and the expected signer is signed. Redirect query parameters are never accepted as proof. Revocation is enforced by Sarathi and Google Drive; eSign itself is not a document ACL service. Setu Account Aggregator consent is for financial data and is not used here.
