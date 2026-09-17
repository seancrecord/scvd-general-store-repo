### Bug Description

SCVD General Store (Base agent 86957) resolves to the correct registration URI, but the profile's Raw Agent Data disagrees with that document on x402 support, supported trust and registrations. Could you refresh the source and check the normalization? I maintain SCVD; the cause could be stale metadata, field mapping or another ingestion issue.

### Steps to Reproduce

1. Open https://trust8004.xyz/agents/8453%3A86957?tab=metadata.
2. Expand **View Complete JSON** under Raw Agent Data.
3. Compare with its Agent URI, https://scvd.store/.well-known/agent-registration.json.

Reproduced September 17, 2026, around 19:20 UTC. Using **Refresh profile** did not visibly change the expanded fields.

### Expected Behavior

The current canonical registration has:

```json
{
  "x402Support": true,
  "supportedTrust": ["reputation"],
  "registrations": [{
    "agentId": 86957,
    "agentRegistry": "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
  }]
}
```

It currently includes 14 service entries. Source metadata should be preserved accurately, or the displayed data should clearly identify an older snapshot.

### Actual Behavior

The profile's expanded Raw Agent Data reports:

```json
{
  "supportedTrusts": [],
  "x402support": false,
  "registrations": [],
  "metadataStatus": "available",
  "metadataReasonCode": "ok",
  "metadataReasonDetail": "Metadata fetched and validated successfully."
}
```

It contains nine services and a September 15 metadata-update timestamp. The name, description and canonical URI are correct. This report concerns metadata accuracy; it is not a request to change the trust score or grant verification.

### Browser

Other — Codex in-app browser

### Operating System

macOS

### Device Type

Computer

### Additional Context

The same identity is visible at https://8004scan.io/agents/base/86957. No wallet connection, transaction or on-chain metadata change was performed for this report.

### Checklist

- [x] Searched existing issues for SCVD, 86957 and x402support.
- [x] Included current source, observed fields and reproduction steps.
