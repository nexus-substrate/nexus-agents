---
title: 'MCP Tool: vendor_publishing_audit'
description: 'Look up a vendor''s signing infrastructure (GPG keys, URL patterns, signature shape)'
tier: 2
keywords: [mcp, tool, reference, vendor_publishing_audit]
---

# `vendor_publishing_audit`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Look up a vendor's published-artifact signing infrastructure: GPG key fingerprints, SHA256SUMS URL pattern, signature shape (clearsigned / detached / detached-on-iso), release cadence, key rotation notes, and the vendor doc citation. Static lookup against a curated seed dataset. v1 covers ubuntu, debian, fedora.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `vendor` | string | yes | minLength 1; maxLength 50 | Vendor identifier, lowercase. e.g. "ubuntu", "debian", "fedora" |
